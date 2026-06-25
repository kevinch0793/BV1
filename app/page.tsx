import Link from "next/link";
import { prisma } from "@/lib/db";
import { profileWhere, ownedByProfileWhere } from "@/lib/owner";
import { appDayKey, appDayRange, currentAppDayKey, recentAppDayKeys } from "@/lib/appday";
import { AppliedChart } from "@/components/AppliedChart";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const today = appDayRange(currentAppDayKey()); // current app day (rolls at 10pm ET)
  const dayKeys = recentAppDayKeys(30); // last 30 app days, ascending
  const chartStart = appDayRange(dayKeys[0]).start;

  const jobScope = await ownedByProfileWhere();
  const [profiles, todayJobs, tailored, appliedJobs] = await Promise.all([
    prisma.profile.findMany({
      where: await profileWhere(),
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { email: true } } },
    }),
    // Today's jobs (scalars) + the set of tailored job ids, joined in memory for
    // the card counts — avoids a relation load that builds a huge IN(...) over
    // every job on a busy day (libSQL bound-parameter limit, P2029).
    prisma.jobPosting.findMany({
      where: { ...jobScope, createdAt: { gte: today.start } },
      select: { id: true, profileId: true, applyStatus: true },
    }),
    prisma.tailoredResume.findMany({ where: { ...jobScope, jobPostingId: { not: null } }, select: { jobPostingId: true } }),
    // Applied events (last 30 app days) for the "applications per day" chart.
    prisma.jobPosting.findMany({
      where: { ...jobScope, applyStatus: "applied", appliedAt: { gte: chartStart } },
      select: { profileId: true, appliedAt: true },
    }),
  ]);

  const tailoredJobIds = new Set(tailored.map((t) => t.jobPostingId));
  const todayByProfile = new Map<string, { applied: number; tailored: number }>();
  for (const j of todayJobs) {
    const e = todayByProfile.get(j.profileId) ?? { applied: 0, tailored: 0 };
    if (j.applyStatus === "applied") e.applied++;
    if (tailoredJobIds.has(j.id)) e.tailored++;
    todayByProfile.set(j.profileId, e);
  }

  const events = appliedJobs.map((j) => ({ profileId: j.profileId, day: appDayKey(j.appliedAt!) }));
  const chartProfiles = profiles.map((p) => ({ id: p.id, name: p.fullName || p.label }));

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">Profiles</h1>
          <Link
            href="/profiles"
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
          >
            Manage profiles
          </Link>
        </div>
        {profiles.length === 0 ? (
          <EmptyCard
            title="No profiles yet"
            body="A profile is one identity — name, contact, work history, projects. Create one to start tailoring resumes."
            href="/profiles"
            cta="Create your first profile"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <div key={p.id} className="rounded-xl border border-neutral-200 bg-white transition hover:border-sky-300 hover:shadow-sm">
                <Link href={`/profiles/${p.id}`} className="block p-4">
                  <div className="text-sm font-medium text-sky-700">{p.label}</div>
                  <div className="text-lg font-semibold text-neutral-900">{p.fullName}</div>
                  <div className="mt-1 truncate text-xs text-neutral-400" title={p.client.email}>{p.client.email}</div>
                </Link>
                <Link
                  href={`/profiles/${p.id}/dashboard`}
                  className="block rounded-b-xl border-t border-neutral-100 px-4 py-2 text-xs font-medium text-neutral-500 hover:bg-sky-50 hover:text-sky-700"
                >
                  Today: {todayByProfile.get(p.id)?.applied ?? 0} applied ·{" "}
                  {todayByProfile.get(p.id)?.tailored ?? 0} tailored →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Applications per day</h2>
        <AppliedChart profiles={chartProfiles} events={events} dayKeys={dayKeys} />
      </section>
    </div>
  );
}

function EmptyCard({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
      <h3 className="text-lg font-medium text-neutral-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">{body}</p>
      <Link href={href} className="mt-4 inline-block rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800">
        {cta}
      </Link>
    </div>
  );
}
