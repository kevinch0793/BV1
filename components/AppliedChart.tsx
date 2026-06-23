"use client";

import { useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily applied-count column chart. X = day (over the past week/month), Y = count. */
export function AppliedChart({ applied }: { applied: number[] }) {
  const [days, setDays] = useState<7 | 30>(7);

  // Build local-day buckets ending today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    const start = d.getTime();
    const count = applied.filter((t) => t >= start && t < start + DAY_MS).length;
    return { date: d, count };
  });

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const xLabel = (d: Date, i: number) => {
    if (days === 7) return d.toLocaleDateString(undefined, { weekday: "short" });
    return i % 5 === 0 || i === days - 1 ? String(d.getDate()) : "";
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {total} application{total === 1 ? "" : "s"} · peak {max}/day
        </p>
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                days === d ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {d === 7 ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No applications in the past {days === 7 ? "week" : "month"}.</p>
      ) : (
        <>
          <div className="flex items-end gap-1 pt-5" style={{ height: 168 }}>
            {buckets.map((b, i) => (
              <div
                key={i}
                className="relative flex-1"
                style={{ height: `${(b.count / max) * 100}%` }}
                title={`${b.date.toLocaleDateString()}: ${b.count}`}
              >
                <div className="h-full w-full rounded-t bg-sky-600" style={{ minHeight: b.count > 0 ? 3 : 0 }} />
                {b.count > 0 && days === 7 && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-medium text-neutral-500">{b.count}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 border-t border-neutral-100 pt-1">
            {buckets.map((b, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-neutral-400">{xLabel(b.date, i)}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
