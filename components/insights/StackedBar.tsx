"use client";

export type Segment = { label: string; value: number; color: string };

/** One horizontal 100%-stacked bar + a compact percentage legend. */
export function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  if (total === 0) return <p className="py-1 text-xs text-neutral-400">No data yet.</p>;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100">
        {shown.map((s, i) => (
          <div
            key={i}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.value} (${pct(s.value)}%)`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-600">
        {shown.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label} {pct(s.value)}%
          </span>
        ))}
      </div>
    </div>
  );
}
