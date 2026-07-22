import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings, parseSectionOrder } from "@/lib/settings";
import { getCurrentClient } from "@/lib/auth";
import { normalizeTemplate } from "@/components/templates";
import { buildResumeDocx } from "@/lib/export/docx";
import { renderResumePdfCached, internalOrigin } from "@/lib/export/pdf";
import { resumeFileName } from "@/lib/export/filename";
import type { ResumeContent } from "@/lib/llm/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tailoredId: string }> },
) {
  const { tailoredId } = await params;
  // Authoritative auth check — the browser fetch sends same-origin cookies.
  const client = await getCurrentClient();
  if (!client) return new NextResponse("Unauthorized", { status: 401 });
  // Admins can export any resume; clients only their own.
  const t = await prisma.tailoredResume.findFirst({
    where: client.role === "admin" ? { id: tailoredId } : { id: tailoredId, profile: { clientId: client.id } },
    include: { profile: { select: { clientId: true, templateId: true } }, job: { select: { role: true, company: true } } },
  });
  if (!t) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const settings = await getSettings(t.profile.clientId);
  // Template/order come from global Settings unless explicitly overridden (the
  // viewer's live picker passes them); the saved templateId is not used so a
  // Settings change applies to every existing resume too.
  const template = normalizeTemplate(url.searchParams.get("template") ?? t.profile.templateId ?? settings.defaultTemplate);
  const orderParam = url.searchParams.get("order");
  const order = orderParam ? parseSectionOrder(orderParam) : settings.sectionOrder;

  const content = t.content as ResumeContent;
  const filename = resumeFileName(content.name, format, { role: t.job?.role, company: t.job?.company });

  try {
    if (format === "docx") {
      const buf = await buildResumeDocx(content, order);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Font family + size come from client-wide Settings (like template/order) and
    // are part of the cache key so a Settings change re-renders the PDF.
    const font = settings.resumeFont;
    const size = settings.resumeFontScale;
    const printUrl = `${internalOrigin()}/print/${tailoredId}?template=${encodeURIComponent(template)}&order=${encodeURIComponent(order.join(","))}&font=${encodeURIComponent(font)}&size=${size}`;
    const buf = await renderResumePdfCached(printUrl, `${tailoredId}|${template}|${order.join(",")}|${font}|${size}|${JSON.stringify(content)}`);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new NextResponse(`Export failed: ${e instanceof Error ? e.message : "unknown"}`, { status: 500 });
  }
}
