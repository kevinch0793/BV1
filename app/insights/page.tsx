import { prisma } from "@/lib/db";
import { profileWhere, ownedByProfileWhere } from "@/lib/owner";
import { visibleJobWhere } from "@/lib/jobVisibility";
import { appDayKey, appDayRange, currentAppDayKey, recentAppDayKeys } from "@/lib/appday";
import { normalizeRole } from "@/lib/roleFamily";
import { fitBucketIndex, type ProfileMetrics } from "@/lib/insights";
import { InsightsDashboard } from "@/components/insights/InsightsDashboard";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const profScope = await profileWhere();
  const jobScope = await ownedByProfileWhere();
  const todayKey = currentAppDayKey();
  const dayKeys = recentAppDayKeys(180); // ~6 months — enough for the monthly view
  const chartStart = appDayRange(dayKeys[0]).start;
  // Blacklisted rows are not results. They also skewed "pending", which is
  // derived as total-minus-fetched and so counted every excluded row.
  const visibleJobScope = { ...jobScope, ...visibleJobWhere };
  const appliedJobScope = { ...jobScope, applyStatus: "applied" };
  const tailoredLinked = { ...jobScope, jobPostingId: { not: null } };

  const [profiles, statusCounts, applyCounts, workplaceCounts, applyTailoredCounts, roleCounts, tailoredLinks, tailoredMax, fitRows, missingRows, appliedRows] =
    await Promise.all([
      prisma.profile.findMany({ where: profScope, orderBy: { createdAt: "asc" }, select: { id: true, label: true, fullName: true } }),
      prisma.jobPosting.groupBy({ by: ["profileId", "status"], where: visibleJobScope, _count: { _all: true } }),
      prisma.jobPosting.groupBy({ by: ["profileId", "applyStatus"], where: visibleJobScope, _count: { _all: true } }),
      prisma.jobPosting.groupBy({ by: ["profileId", "workplace"], where: appliedJobScope, _count: { _all: true } }),
      prisma.jobPosting.groupBy({ by: ["profileId", "appliedTailored"], where: appliedJobScope, _count: { _all: true } }),
      prisma.jobPosting.groupBy({ by: ["profileId", "role"], where: visibleJobScope, _count: { _all: true } }),
      prisma.tailoredResume.findMany({ where: tailoredLinked, select: { profileId: true, jobPostingId: true } }),
      prisma.tailoredResume.groupBy({ by: ["profileId"], where: tailoredLinked, _max: { createdAt: true } }),
      prisma.tailoredResume.findMany({ where: { ...tailoredLinked, fitAfter: { not: null } }, select: { profileId: true, fitAfter: true, fitBefore: true } }),
      prisma.tailoredResume.findMany({ where: { ...tailoredLinked, fitAfter: { lt: 60 } }, select: { profileId: true, fitDetail: true }, orderBy: { fitAfter: "asc" }, take: 200 }),
      prisma.jobPosting.findMany({ where: { ...appliedJobScope, appliedAt: { gte: chartStart } }, select: { profileId: true, appliedAt: true } }),
    ]);

  // --- fold per-profile accumulators ---
  type Acc = {
    status: Record<string, number>;
    apply: Record<string, number>;
    workplace: { remote: number; hybrid: number; onsite: number; inPerson: number; unknown: number };
    appliedTailored: { yes: number; no: number; unknown: number };
    roles: Map<string, number>;
    tailoredJobs: Set<string>;
    tailoredCount: number;
    fitSum: number;
    fitN: number;
    liftSum: number;
    liftN: number;
    fitBuckets: number[];
    missing: Map<string, number>;
    lastTailored: string | null;
    lastApplied: string | null;
  };
  const acc = new Map<string, Acc>();
  const blank = (): Acc => ({
    status: {}, apply: {},
    workplace: { remote: 0, hybrid: 0, onsite: 0, inPerson: 0, unknown: 0 },
    appliedTailored: { yes: 0, no: 0, unknown: 0 },
    roles: new Map(), tailoredJobs: new Set(), tailoredCount: 0,
    fitSum: 0, fitN: 0, liftSum: 0, liftN: 0, fitBuckets: [0, 0, 0, 0, 0, 0],
    missing: new Map(), lastTailored: null, lastApplied: null,
  });
  const get = (id: string) => { let a = acc.get(id); if (!a) { a = blank(); acc.set(id, a); } return a; };

  for (const r of statusCounts) get(r.profileId).status[r.status] = r._count._all;
  for (const r of applyCounts) get(r.profileId).apply[r.applyStatus] = r._count._all;
  for (const r of workplaceCounts) {
    const w = get(r.profileId).workplace;
    const k = r.workplace === "remote" ? "remote" : r.workplace === "hybrid" ? "hybrid" : r.workplace === "onsite" ? "onsite" : r.workplace === "in-person" ? "inPerson" : "unknown";
    w[k as keyof typeof w] += r._count._all;
  }
  for (const r of applyTailoredCounts) {
    const a = get(r.profileId).appliedTailored;
    if (r.appliedTailored === true) a.yes += r._count._all;
    else if (r.appliedTailored === false) a.no += r._count._all;
    else a.unknown += r._count._all;
  }
  for (const r of roleCounts) {
    const fam = normalizeRole(r.role);
    const m = get(r.profileId).roles;
    m.set(fam, (m.get(fam) ?? 0) + r._count._all);
  }
  for (const t of tailoredLinks) { const a = get(t.profileId); a.tailoredCount++; if (t.jobPostingId) a.tailoredJobs.add(t.jobPostingId); }
  for (const r of tailoredMax) if (r._max.createdAt) get(r.profileId).lastTailored = appDayKey(r._max.createdAt);
  for (const r of fitRows) {
    const a = get(r.profileId);
    if (r.fitAfter == null) continue;
    a.fitSum += r.fitAfter; a.fitN++;
    a.fitBuckets[fitBucketIndex(r.fitAfter)]++;
    if (r.fitBefore != null) { a.liftSum += r.fitAfter - r.fitBefore; a.liftN++; }
  }
  for (const r of missingRows) {
    const md = (r.fitDetail as { missing?: unknown } | null)?.missing;
    if (!Array.isArray(md)) continue;
    const m = get(r.profileId).missing;
    for (const s of md) if (typeof s === "string") m.set(s, (m.get(s) ?? 0) + 1);
  }
  const events: { profileId: string; day: string }[] = [];
  for (const r of appliedRows) {
    if (!r.appliedAt) continue;
    const day = appDayKey(r.appliedAt);
    events.push({ profileId: r.profileId, day });
    const a = get(r.profileId);
    if (!a.lastApplied || day > a.lastApplied) a.lastApplied = day;
  }

  const metrics: ProfileMetrics[] = profiles.map((p) => {
    const a = acc.get(p.id) ?? blank();
    const fetched = a.status["fetched"] ?? 0;
    const failedFetches = a.status["failed"] ?? 0;
    const totalJobs = Object.values(a.status).reduce((n, v) => n + v, 0);
    const pending = totalJobs - fetched - failedFetches;
    const applied = a.apply["applied"] ?? 0;
    const distinctTailored = a.tailoredJobs.size;
    const lastTailored = a.lastTailored;
    const lastApplied = a.lastApplied;
    const lastActivityDayKey = [lastTailored, lastApplied].filter(Boolean).sort().pop() ?? null;
    return {
      profileId: p.id,
      name: p.fullName || p.label,
      totalJobs,
      fetched,
      failedFetches,
      pending,
      applied,
      notAvailable: a.apply["not_available"] ?? 0,
      distinctTailored,
      tailoredCount: a.tailoredCount,
      tailoredWithFit: a.fitN,
      applyRate: applied / Math.max(1, distinctTailored),
      tailorRate: distinctTailored / Math.max(1, fetched),
      avgFit: a.fitN ? Math.round(a.fitSum / a.fitN) : null,
      avgLift: a.liftN ? Math.round(a.liftSum / a.liftN) : null,
      fitBuckets: a.fitBuckets,
      workplace: a.workplace,
      appliedTailored: a.appliedTailored,
      nonTailoredShare: a.appliedTailored.no / Math.max(1, applied),
      roleFamilies: [...a.roles.entries()].map(([family, count]) => ({ family, count })).sort((x, y) => y.count - x.count),
      topMissing: [...a.missing.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([s]) => s),
      lastActivityDayKey,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Insights</h1>
        <p className="text-sm text-neutral-500">How each profile&apos;s tailoring is going — and what to do next.</p>
      </div>
      <InsightsDashboard metrics={metrics} events={events} dayKeys={dayKeys} todayKey={todayKey} />
    </div>
  );
}
