"use server";

import { headers } from "next/headers";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getSettings, parseSectionOrder } from "@/lib/settings";
import { normalizeTemplate } from "@/components/templates";
import { buildResumeDocx } from "@/lib/export/docx";
import { renderResumePdf } from "@/lib/export/pdf";
import { resumeFileName } from "@/lib/export/filename";
import type { ResumeContent } from "@/lib/llm/schema";

type SaveResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Generate the resume and write it straight into the local ~/Downloads folder,
 * overwriting any file of the same name. This is a local single-user app, so
 * the Node server has filesystem access — no browser download (and therefore no
 * "(1)" rename) is involved.
 */
export async function saveResumeToDownloads(
  tailoredId: string,
  format: "pdf" | "docx",
  override?: { template?: string; order?: string },
): Promise<SaveResult> {
  const t = await prisma.tailoredResume.findUnique({ where: { id: tailoredId } });
  if (!t) return { ok: false, error: "Resume not found." };

  const settings = await getSettings();
  const template = normalizeTemplate(override?.template ?? settings.defaultTemplate);
  const order = override?.order ? parseSectionOrder(override.order) : settings.sectionOrder;
  const content = t.content as ResumeContent;
  const filename = resumeFileName(content.name, format);

  let buf: Buffer;
  try {
    if (format === "docx") {
      buf = await buildResumeDocx(content, order);
    } else {
      const h = await headers();
      const host = h.get("host") ?? "localhost:3000";
      const proto = h.get("x-forwarded-proto") ?? "http";
      const printUrl = `${proto}://${host}/print/${tailoredId}?template=${encodeURIComponent(template)}&order=${encodeURIComponent(order.join(","))}`;
      buf = await renderResumePdf(printUrl);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Export failed." };
  }

  try {
    const dir = path.join(os.homedir(), "Downloads");
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, filename);
    await fs.writeFile(dest, buf); // overwrites in place
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not write to Downloads." };
  }
}
