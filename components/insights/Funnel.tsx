"use client";

/** Fetched -> Tailored -> Applied with per-stage conversion %. */
export function Funnel({ fetched, tailored, applied, color }: { fetched: number; tailored: number; applied: number; color: string }) {
  const stages = [
    { label: "Fetched", value: fetched },
    { label: "Tailored", value: tailored },
    { label: "Applied", value: applied },
  ];
  const max = Math.max(1, fetched, tailored, applied);
  if (fetched === 0) return <p className="py-10 text-center text-sm text-neutral-400">No jobs yet.</p>;
  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label}>
            <div className="flex justify-between text-[11px] text-neutral-600">
              <span className="font-medium">{s.label}</span>
              <span>
                {s.value}
                {conv != null && <span className="text-neutral-400"> · {conv}% of prev</span>}
              </span>
            </div>
            <div className="mt-0.5 h-4 overflow-hidden rounded bg-neutral-100">
              <div className="h-full rounded" style={{ width: `${(s.value / max) * 100}%`, backgroundColor: color, opacity: 1 - i * 0.22 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
