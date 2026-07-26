import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ownedByProfileWhere } from "@/lib/owner";
import { SavedResumeView } from "./SavedResumeView";
import type { ResumeContent } from "@/lib/llm/schema";
import { normalizeTemplate, templatesFor, DEFAULT_TEMPLATE } from "@/components/templates";

export const dynamic = "force-dynamic";

export default async function ResumeViewer({ params }: { params: Promise<{ tailoredId: string }> }) {
  const { tailoredId } = await params;
  const t = await prisma.tailoredResume.findFirst({
    where: { id: tailoredId, ...(await ownedByProfileWhere()) },
    include: { job: true, profile: { select: { clientId: true, templateId: true, resumeFont: true, resumeAccent: true, client: { select: { email: true } } } } },
  });
  if (!t) notFound();

  const { sectionOrder } = await getSettings(t.profile.clientId);

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
      <SavedResumeView
        tailoredId={t.id}
        content={t.content as ResumeContent}
        templateId={normalizeTemplate(t.profile.templateId ?? DEFAULT_TEMPLATE)}
        order={sectionOrder}
        fontId={t.profile.resumeFont ?? "sans"}
        accentId={t.profile.resumeAccent ?? "sky"}
        fitBefore={t.fitBefore}
        fitAfter={t.fitAfter}
        fitDetail={t.fitDetail as FitDetail | null}
        templates={templatesFor(t.profile.client.email)}
      />
    </div>
  );
}

type FitDetail = { matched?: string[]; missing?: string[] };
