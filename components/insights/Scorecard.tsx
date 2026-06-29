"use client";

import { fitColor } from "@/lib/fit";
import type { ProfileMetrics, Health } from "@/lib/insights";

const BADGE: Record<Health, { label: string; cls: string }> = {
  problem: { label: "Problem", cls: "bg-rose-100 text-rose-700" },
  watch: { label: "Watch", cls: "bg-amber-100 text-amber-700" },
  good: { label: "Good", cls: "bg-emerald-100 text-emerald-700" },
  new: { label: "New", cls: "bg-neutral-100 text-neutral-500" },
};

export function Scorecard({
  m,
  health,
  color,
  selected,
  onSelect,
}: {
  m: ProfileMetrics;
  health: Health;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const b = BADGE[health];
  const fit = m.avgFit != null ? fitColor(m.avgFit) : null;
  return (
    <button
      onClick={onSelect}
      className={`rounded-xl border bg-white p-4 text-left transition ${selected ? "border-sky-400 ring-1 ring-sky-300" : "border-neutral-200 hover:border-sky-300"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-900">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <span className="truncate">{m.name}</span>
        </span>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.label}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2.5 text-center">
        <Kpi label="Jobs" value={m.fetched} />
        <Kpi label="Tailored" value={m.distinctTailored} />
        <Kpi label="Applied" value={m.applied} />
        <div>
          {m.avgFit != null && fit ? (
            <span className="inline-block rounded px-1.5 py-0.5 text-sm font-semibold" style={{ backgroundColor: fit.bg, color: fit.text }}>
              {m.avgFit}
            </span>
          ) : (
            <span className="text-sm font-semibold text-neutral-400">—</span>
          )}
          <div className="mt-0.5 text-[10px] text-neutral-400">avg ATS</div>
        </div>
        <Kpi label="Apply %" value={m.distinctTailored ? `${Math.round(m.applyRate * 100)}%` : "—"} />
        <Kpi label="Failed" value={m.failedFetches} danger={m.failedFetches > 0} />
      </div>
    </button>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <div>
      <div className={`text-sm font-semibold ${danger ? "text-rose-600" : "text-neutral-900"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-neutral-400">{label}</div>
    </div>
  );
}
