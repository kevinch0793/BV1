import Link from "next/link";
import { notFound } from "next/navigation";
import { canTailorProfile, planAllowsTailoring } from "@/lib/plan";
import { prisma } from "@/lib/db";
import { profileWhere } from "@/lib/owner";
import { visibleJobWhere } from "@/lib/jobVisibility";
import { appDayRange, currentAppDayKey, isValidDayKey } from "@/lib/appday";
import { PipelineDashboard } from "./PipelineDashboard";

export const dynamic = "force-dynamic";

export default async function ProfileDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { id } = await params;
  const { d } = await searchParams;
  // The "day" rolls over at 10pm ET (see lib/appday). Default = current app day.
  const key = isValidDayKey(d) ? d : currentAppDayKey();
  const isToday = key === currentAppDayKey();
  const { start, end } = appDayRange(key);
  const [ky, km, kd] = key.split("-").map(Number);
  const label = isToday
    ? "Today"
    : new Date(ky, km - 1, kd).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });

  const profile = await prisma.profile.findFirst({
    where: { id, ...(await profileWhere()) },
    include: {
      baseResume: { select: { id: true } },
      // Existence only — never the blob, which can be 5MB and is loaded solely
      // by the download route.
      fixedResume: { select: { id: true } },
      // Only the selected day's jobs (default today).
      jobs: { where: { createdAt: { gte: start, lt: end }, ...visibleJobWhere }, orderBy: { createdAt: "desc" } },
      tailored: { select: { id: true, jobPostingId: true, fitAfter: true } },
      _count: { select: { experiences: true } },
    },
  });
  if (!profile) notFound();

  const tailoredByJob = new Map<string, { id: string; fitAfter: number | null }>();
  for (const t of profile.tailored) if (t.jobPostingId) tailoredByJob.set(t.jobPostingId, { id: t.id, fitAfter: t.fitAfter });

  const canTailor = canTailorProfile({
    plan: profile.plan,
    hasBaseResume: !!profile.baseResume,
    experienceCount: profile._count.experiences,
  });

  const jobs = profile.jobs.map((j) => ({
    id: j.id,
    url: j.url,
    company: j.company,
    role: j.role,
    location: j.location,
    workplace: j.workplace,
    status: j.status,
    error: j.error,
    tailoredId: tailoredByJob.get(j.id)?.id ?? null,
    fitAfter: tailoredByJob.get(j.id)?.fitAfter ?? null,
    applyStatus: j.applyStatus,
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
            {isToday ? "Today's jobs." : `Jobs from ${label}.`} See other days on the{" "}
            <Link href="/calendar" className="text-sky-700 hover:underline">calendar</Link>.
          </p>
        </div>
        {!isToday && (
          <Link
            href={`/profiles/${profile.id}/dashboard`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ← Today
          </Link>
        )}
      </div>

      {!canTailor && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Add a base resume or at least one project on the{" "}
          <Link href={`/profiles/${profile.id}`} className="underline">profile</Link> before tailoring.
        </p>
      )}

      <PipelineDashboard
        profileId={profile.id}
        jobs={jobs}
        canTailor={canTailor}
        isNormalPlan={!planAllowsTailoring(profile.plan)}
        hasFixedResume={!!profile.fixedResume}
        isToday={isToday}
        dayLabel={label}
        paused={profile.paused}
      />
    </div>
  );
}
