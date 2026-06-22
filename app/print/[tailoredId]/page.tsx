import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { parseSectionOrder } from "@/lib/sections";
import { ResumePreview, normalizeTemplate } from "@/components/templates";
import type { ResumeContent } from "@/lib/llm/schema";

export const dynamic = "force-dynamic";

// Bare resume sheet for headless-Chrome PDF rendering. The app's `@media print`
// rules (in globals.css) isolate `.print-sheet`, so the sidebar never appears.
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ tailoredId: string }>;
  searchParams: Promise<{ template?: string; order?: string }>;
}) {
  const { tailoredId } = await params;
  const sp = await searchParams;
  const t = await prisma.tailoredResume.findUnique({ where: { id: tailoredId } });
  if (!t) notFound();

  const template = normalizeTemplate(sp.template ?? t.templateId);
  const order = sp.order ? parseSectionOrder(sp.order) : (await getSettings()).sectionOrder;

  return (
    <div className="print-sheet mx-auto">
      <ResumePreview content={t.content as ResumeContent} template={template} order={order} />
    </div>
  );
}
