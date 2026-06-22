import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PipelineDashboard } from "./PipelineDashboard";

export const dynamic = "force-dynamic";

export default async function ProfileDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: {
      baseResume: { select: { id: true } },
      jobs: { orderBy: { createdAt: "desc" } },
      tailored: { select: { id: true, jobPostingId: true, fitAfter: true } },
      _count: { select: { experiences: true } },
    },
  });
  if (!profile) notFound();

  const tailoredByJob = new Map<string, { id: string; fitAfter: number | null }>();
  for (const t of profile.tailored) if (t.jobPostingId) tailoredByJob.set(t.jobPostingId, { id: t.id, fitAfter: t.fitAfter });

  const canTailor = !!profile.baseResume || profile._count.experiences > 0;

  const jobs = profile.jobs.map((j) => ({
    id: j.id,
    url: j.url,
    company: j.company,
    role: j.role,
    location: j.location,
    status: j.status,
    error: j.error,
    tailoredId: tailoredByJob.get(j.id)?.id ?? null,
    fitAfter: tailoredByJob.get(j.id)?.fitAfter ?? null,
    appliedAt: j.appliedAt ? j.appliedAt.toISOString() : null,
    appliedTailored: j.appliedTailored,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/profiles/${profile.id}`} className="text-sm text-sky-700 hover:underline">
            ← {profile.fullName}
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-900">Tailoring dashboard</h1>
          <p className="text-sm text-neutral-500">
            Add job URLs, fetch the descriptions, then auto-tailor a resume for each — all in one queue.
          </p>
        </div>
      </div>

      {!canTailor && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Add a base resume or at least one project on the{" "}
          <Link href={`/profiles/${profile.id}`} className="underline">profile</Link> before tailoring.
        </p>
      )}

      <PipelineDashboard profileId={profile.id} jobs={jobs} canTailor={canTailor} />
    </div>
  );
}
