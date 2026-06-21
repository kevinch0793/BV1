import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SavedResumeView } from "./SavedResumeView";
import type { ResumeContent } from "@/lib/llm/schema";
import type { TemplateId } from "@/components/templates";

export const dynamic = "force-dynamic";

export default async function ResumeViewer({ params }: { params: Promise<{ tailoredId: string }> }) {
  const { tailoredId } = await params;
  const t = await prisma.tailoredResume.findUnique({
    where: { id: tailoredId },
    include: { job: true },
  });
  if (!t) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/profiles/${t.profileId}/dashboard`} className="text-sm text-sky-700 hover:underline">
          ← Dashboard
        </Link>
        {t.job && (
          <span className="text-sm text-neutral-500">
            {t.job.role || "Role"} · {t.job.company || "Company"}
          </span>
        )}
      </div>
      <SavedResumeView content={t.content as ResumeContent} templateId={t.templateId as TemplateId} />
    </div>
  );
}
