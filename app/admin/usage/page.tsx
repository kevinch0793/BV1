import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { costOf } from "@/lib/llm/pricing";
import { fmtTokens, fmtCost, fmtMs } from "@/lib/usageFormat";
import { UsageTable, type UsageRow } from "@/components/admin/UsageTable";
import { UsageLineChart, type Series } from "@/components/admin/UsageLineChart";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
// Summary window for the KPI tiles + table (the chart has its own zoomable window).
const RANGES = [
  { id: 1, label: "Daily" },
  { id: 7, label: "7d" },
  { id: 30, label: "30d" },
] as const;
const LINE_PALETTE = ["#0284c7", "#059669", "#d946ef", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6", "#ec4899"];

export default async function AdminUsagePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin();
  const { range: rangeRaw } = await searchParams;
  const range = RANGES.some((r) => r.id === Number(rangeRaw)) ? Number(rangeRaw) : 1;
  const isDaily = range === 1;

  // Summary window (KPI tiles + table): today's local midnight (daily), else N-1 days back.
  const startD = new Date();
  startD.setHours(0, 0, 0, 0);
  if (!isDaily) startD.setDate(startD.getDate() - (range - 1));
  const start = startD;

  // The interactive timeline chart owns its own zoomable window over the last 30 days,
  // independent of the range buttons above.
  const nowMs = Date.now();
  const chartStart = new Date(nowMs - 30 * DAY);

  const [byGroup, lastAct, events, clients, profiles, jobStatus, applyRows, tailoredRows] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["clientId", "kind", "model"],
      where: { createdAt: { gte: start } },
      _sum: { inputTokens: true, outputTokens: true, ms: true },
      _count: { _all: true },
    }),
    prisma.usageEvent.groupBy({ by: ["clientId"], where: { createdAt: { gte: start } }, _max: { createdAt: true } }),
    prisma.usageEvent.findMany({ where: { createdAt: { gte: chartStart } }, select: { clientId: true, createdAt: true } }),
    prisma.client.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], select: { id: true, email: true, status: true, role: true, _count: { select: { profiles: true } } } }),
    prisma.profile.findMany({ select: { id: true, clientId: true } }),
    prisma.jobPosting.groupBy({ by: ["profileId"], _count: { _all: true } }),
    prisma.jobPosting.groupBy({ by: ["profileId", "applyStatus"], _count: { _all: true } }),
    prisma.tailoredResume.groupBy({ by: ["profileId"], where: { jobPostingId: { not: null } }, _count: { _all: true } }),
  ]);

  const emailOf = new Map(clients.map((c) => [c.id, c.email]));
  const isAdminClient = new Set(clients.filter((c) => c.role === "admin").map((c) => c.id));

  // --- Per-user activity for the interactive timeline: sparse 1-min buckets (last 30d) ---
  const perUserMin = new Map<string, Map<number, number>>();
  const totalPerUser = new Map<string, number>();
  let dataStartMin = Infinity;
  for (const e of events) {
    if (isAdminClient.has(e.clientId)) continue;
    const minute = Math.floor(e.createdAt.getTime() / 60_000);
    if (minute < dataStartMin) dataStartMin = minute;
    let m = perUserMin.get(e.clientId);
    if (!m) { m = new Map(); perUserMin.set(e.clientId, m); }
    m.set(minute, (m.get(minute) ?? 0) + 1);
    totalPerUser.set(e.clientId, (totalPerUser.get(e.clientId) ?? 0) + 1);
  }
  const series: Series[] = [...totalPerUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LINE_PALETTE.length)
    .map(([cid], i) => ({
      clientId: cid,
      email: emailOf.get(cid) ?? cid,
      color: LINE_PALETTE[i],
      bins: [...perUserMin.get(cid)!.entries()].sort((a, b) => a[0] - b[0]),
    }));
  const dataStartMs = Number.isFinite(dataStartMin) ? dataStartMin * 60_000 : nowMs - 30 * DAY;

  // --- Workload (last ~30d, retention-bounded) rolled up to the client ---
  const clientFor = new Map(profiles.map((p) => [p.id, p.clientId]));
  const jobs = new Map<string, number>();
  const applied = new Map<string, number>();
  const tailored = new Map<string, number>();
  const add = (m: Map<string, number>, cid: string | undefined, n: number) => { if (cid) m.set(cid, (m.get(cid) ?? 0) + n); };
  for (const r of jobStatus) add(jobs, clientFor.get(r.profileId), r._count._all);
  for (const r of applyRows) if (r.applyStatus === "applied") add(applied, clientFor.get(r.profileId), r._count._all);
  for (const r of tailoredRows) add(tailored, clientFor.get(r.profileId), r._count._all);

  // --- Per-client usage rows (tokens/cost/time) from the (client,kind,model) groups ---
  type Acc = Omit<UsageRow, "email" | "status" | "profiles" | "jobs" | "tailored" | "applied"> & { tailorMs: number; tailorCount: number };
  const accs = new Map<string, Acc>();
  const getAcc = (cid: string): Acc => {
    let a = accs.get(cid);
    if (!a) { a = { clientId: cid, inTok: 0, outTok: 0, cost: 0, kinds: {}, tailorMs: 0, tailorCount: 0, avgTailorMs: 0, lastActivity: null, models: [] }; accs.set(cid, a); }
    return a;
  };
  const modelAgg = new Map<string, Map<string, { inTok: number; outTok: number }>>();
  for (const g of byGroup) {
    const a = getAcc(g.clientId);
    const inTok = g._sum.inputTokens ?? 0;
    const outTok = g._sum.outputTokens ?? 0;
    a.inTok += inTok;
    a.outTok += outTok;
    a.cost += costOf(g.model, inTok, outTok);
    a.kinds[g.kind] = (a.kinds[g.kind] ?? 0) + g._count._all;
    if (g.kind === "tailor") { a.tailorMs += g._sum.ms ?? 0; a.tailorCount += g._count._all; }
    const mm = modelAgg.get(g.clientId) ?? new Map();
    const cur = mm.get(g.model) ?? { inTok: 0, outTok: 0 };
    cur.inTok += inTok; cur.outTok += outTok;
    mm.set(g.model, cur); modelAgg.set(g.clientId, mm);
  }
  for (const r of lastAct) { const a = accs.get(r.clientId); if (a && r._max.createdAt) a.lastActivity = r._max.createdAt.toISOString(); }
  for (const [cid, mm] of modelAgg) {
    accs.get(cid)!.models = [...mm.entries()]
      .map(([model, v]) => ({ model, inTok: v.inTok, outTok: v.outTok, cost: costOf(model, v.inTok, v.outTok) }))
      .sort((x, y) => y.cost - x.cost || y.outTok - x.outTok);
  }
  for (const a of accs.values()) a.avgTailorMs = a.tailorCount ? Math.round(a.tailorMs / a.tailorCount) : 0;

  const rows: UsageRow[] = clients
    .filter((c) => c.role !== "admin")
    .map((c) => {
      const a = accs.get(c.id);
      return {
        clientId: c.id, email: c.email, status: c.status, profiles: c._count.profiles,
        inTok: a?.inTok ?? 0, outTok: a?.outTok ?? 0, cost: a?.cost ?? 0, kinds: a?.kinds ?? {},
        avgTailorMs: a?.avgTailorMs ?? 0, lastActivity: a?.lastActivity ?? null,
        jobs: jobs.get(c.id) ?? 0, tailored: tailored.get(c.id) ?? 0, applied: applied.get(c.id) ?? 0,
        models: a?.models ?? [],
      };
    })
    .sort((x, y) => y.cost - x.cost || y.outTok - x.outTok);

  const totals = rows.reduce(
    (t, r) => {
      t.inTok += r.inTok; t.outTok += r.outTok; t.cost += r.cost;
      t.tailor += r.kinds["tailor"] ?? 0; t.answer += r.kinds["answer"] ?? 0;
      if (r.avgTailorMs) { t.tailorMsSum += r.avgTailorMs * (r.kinds["tailor"] ?? 0); t.tailorN += r.kinds["tailor"] ?? 0; }
      if (r.inTok + r.outTok > 0) t.active += 1;
      return t;
    },
    { inTok: 0, outTok: 0, cost: 0, tailor: 0, answer: 0, tailorMsSum: 0, tailorN: 0, active: 0 },
  );
  const avgTailorMs = totals.tailorN ? Math.round(totals.tailorMsSum / totals.tailorN) : 0;

  const windowLabel = isDaily ? "today" : `the last ${range} days`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Usage</h1>
          <p className="text-sm text-neutral-500">Who&apos;s using the platform, and when — {windowLabel}. Token/cost/time tracked since this shipped; jobs reflect the last ~30 days.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1">
          {RANGES.map((r) => (
            <a key={r.id} href={`/admin/usage?range=${r.id}`} className={`rounded-md px-3 py-1 text-xs font-medium ${r.id === range ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              {r.label}
            </a>
          ))}
        </div>
      </div>

      {/* When each user is active — scroll to zoom, drag to pan */}
      <UsageLineChart series={series} nowMs={nowMs} dataStartMs={dataStartMs} metricLabel="LLM calls" />

      {/* Overall summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Input tokens" value={fmtTokens(totals.inTok)} />
        <Kpi label="Output tokens" value={fmtTokens(totals.outTok)} />
        <Kpi label="Est. cost" value={fmtCost(totals.cost)} accent />
        <Kpi label="Tailors" value={String(totals.tailor)} />
        <Kpi label="Answers" value={String(totals.answer)} />
        <Kpi label="Avg tailor" value={fmtMs(avgTailorMs)} />
      </div>

      {/* Overall per-user statistics */}
      <UsageTable rows={rows} />
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className={`text-xl font-bold ${accent ? "text-emerald-700" : "text-neutral-900"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}
