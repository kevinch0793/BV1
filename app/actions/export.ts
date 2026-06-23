"use server";

import { headers } from "next/headers";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getSettings, parseSectionOrder } from "@/lib/settings";
import { getCurrentClient } from "@/lib/auth";
import { normalizeTemplate } from "@/components/templates";
import { buildResumeDocx } from "@/lib/export/docx";
import { renderResumePdf } from "@/lib/export/pdf";
import { resumeFileName } from "@/lib/export/filename";
import type { ResumeContent } from "@/lib/llm/schema";

type SaveResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Generate the resume and write it into the local ~/Downloads folder, REMOVING
 * any existing file of the same name first so the new file lands with the same
 * name and no "(1)" / save dialog. This is a server-side filesystem write, so it
 * only does the overwrite when the server runs on the same machine as the user
 * (the local app); deployed clients fall back to a browser download.
 */
export async function saveResumeToDownloads(
  tailoredId: string,
  format: "pdf" | "docx",
  override?: { template?: string; order?: string },
): Promise<SaveResult> {
  const client = await getCurrentClient();
  if (!client) return { ok: false, error: "Not signed in." };
  // Admins can export any resume; clients only their own.
  const t = await prisma.tailoredResume.findFirst({
    where: client.role === "admin" ? { id: tailoredId } : { id: tailoredId, profile: { clientId: client.id } },
    include: { profile: { select: { clientId: true } } },
  });
  if (!t) return { ok: false, error: "Resume not found." };

  const settings = await getSettings(t.profile.clientId);
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
    await fs.rm(dest, { force: true }); // remove the old resume first
    await fs.writeFile(dest, buf); // write the new one with the same name
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not write to Downloads." };
  }
}
