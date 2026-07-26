"use server";

import { headers } from "next/headers";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getSettings, parseSectionOrder } from "@/lib/settings";
import { getCurrentClient } from "@/lib/auth";
import { normalizeTemplate, DEFAULT_TEMPLATE } from "@/components/templates";
import { buildResumeDocx } from "@/lib/export/docx";
import { renderResumePdfCached, internalOrigin } from "@/lib/export/pdf";
import { resumeFileName } from "@/lib/export/filename";
import type { ResumeContent } from "@/lib/llm/schema";

type SaveResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Generate the resume and write it straight into the local ~/Downloads folder
 * (no save dialog). The filename is derived from the job (role/company/year), so
 * re-downloading the same job overwrites it in place. This is a server-side
 * filesystem write, so it only runs when the server is the same machine as the
 * user (the local app); remote/tunneled clients fall back to a browser download.
 */
export async function saveResumeToDownloads(
  tailoredId: string,
  format: "pdf" | "docx",
  override?: { template?: string; order?: string },
): Promise<SaveResult> {
  // The direct ~/Downloads write only makes sense when the browser and server
  // are the same machine (local use). For a tunneled/remote request (e.g.
  // ngrok), bail so the client falls back to a normal browser download.
  const host = (await headers()).get("host")?.toLowerCase() ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return { ok: false, error: "remote" };
  }

  const client = await getCurrentClient();
  if (!client) return { ok: false, error: "Not signed in." };
  // Admins can export any resume; clients only their own.
  const t = await prisma.tailoredResume.findFirst({
    where: client.role === "admin" ? { id: tailoredId } : { id: tailoredId, profile: { clientId: client.id } },
    include: { profile: { select: { clientId: true, templateId: true, resumeFont: true, resumeAccent: true } }, job: { select: { role: true, company: true } } },
  });
  if (!t) return { ok: false, error: "Resume not found." };

  const settings = await getSettings(t.profile.clientId);
  const template = normalizeTemplate(override?.template ?? t.profile.templateId ?? DEFAULT_TEMPLATE);
  const order = override?.order ? parseSectionOrder(override.order) : settings.sectionOrder;
  const content = t.content as ResumeContent;
  const filename = resumeFileName(content.name, format, { role: t.job?.role, company: t.job?.company });

  let buf: Buffer;
  try {
    if (format === "docx") {
      buf = await buildResumeDocx(content, order);
    } else {
      // Font family + size come from client-wide Settings (like template/order) and
      // are part of the cache key so a Settings change re-renders the PDF.
      const font = t.profile.resumeFont ?? "sans";
      const accent = t.profile.resumeAccent ?? "sky";
      const printUrl = `${internalOrigin()}/print/${tailoredId}?template=${encodeURIComponent(template)}&order=${encodeURIComponent(order.join(","))}&font=${encodeURIComponent(font)}&accent=${encodeURIComponent(accent)}`;
      buf = await renderResumePdfCached(printUrl, `${tailoredId}|${template}|${order.join(",")}|${font}|${accent}|${JSON.stringify(content)}`);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Export failed." };
  }

  try {
    const dir = path.join(os.homedir(), "Downloads");
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, filename);
    await fs.writeFile(dest, buf); // overwrites in place if the same job was downloaded before
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not write to Downloads." };
  }
}
