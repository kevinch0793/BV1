"use client";

import { useMemo, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;

// Per-profile colors (bar fill + legend swatch), assigned by profile order.
const COLORS = [
  "#0284c7", // sky-600
  "#059669", // emerald-600
  "#7c3aed", // violet-600
  "#d97706", // amber-600
  "#e11d48", // rose-600
  "#0d9488", // teal-600
  "#4f46e5", // indigo-600
  "#db2777", // pink-600
  "#65a30d", // lime-600
  "#0891b2", // cyan-600
];

type ChartProfile = { id: string; name: string };
type Event = { profileId: string; t: number };

/** Stacked daily applied-count chart, one color per profile. Click a profile in
 *  the legend to hide it (crossed out). X = day, Y = applied count. */
export function AppliedChart({ profiles, events }: { profiles: ChartProfile[]; events: Event[] }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p, i) => m.set(p.id, COLORS[i % COLORS.length]));
    return m;
  }, [profiles]);

  const { buckets, max, total } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visible = events.filter((e) => !hidden.has(e.profileId));
    const buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (days - 1 - i));
      const start = d.getTime();
      const inDay = visible.filter((e) => e.t >= start && e.t < start + DAY_MS);
      const perProfile = new Map<string, number>();
      for (const e of inDay) perProfile.set(e.profileId, (perProfile.get(e.profileId) ?? 0) + 1);
      return { date: d, perProfile, total: inDay.length };
    });
    // Grouped (side-by-side) bars: scale to the tallest single-profile day.
    const max = Math.max(1, ...buckets.flatMap((b) => [...b.perProfile.values()]));
    const total = buckets.reduce((n, b) => n + b.total, 0);
    return { buckets, max, total };
  }, [events, hidden, days]);

  const visibleProfiles = profiles.filter((p) => !hidden.has(p.id));

  const xLabel = (d: Date, i: number) => {
    if (days === 7) return d.toLocaleDateString(undefined, { weekday: "short" });
    return i % 5 === 0 || i === days - 1 ? String(d.getDate()) : "";
  };

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
              className={`rounded-md px-3 py-1 text-xs font-medium ${days === d ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {d === 7 ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Legend — click to hide/show a profile */}
      {profiles.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1.5">
          {profiles.map((p) => {
            const off = hidden.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`flex items-center gap-1.5 text-xs ${off ? "text-neutral-400 line-through" : "text-neutral-700"}`}
                title={off ? "Show" : "Hide"}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: off ? "#d4d4d4" : colorOf.get(p.id) }} />
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No applications in the past {days === 7 ? "week" : "month"}.</p>
      ) : (
        <>
          <div className="flex items-end gap-1.5 pt-5" style={{ height: 168 }}>
            {buckets.map((b, i) => (
              <div key={i} className="flex h-full flex-1 items-end justify-center gap-px">
                {visibleProfiles.map((p) => {
                  const c = b.perProfile.get(p.id) ?? 0;
                  return (
                    <div
                      key={p.id}
                      className="flex-1 rounded-t"
                      style={{ height: `${(c / max) * 100}%`, minHeight: c > 0 ? 2 : 0, backgroundColor: colorOf.get(p.id) }}
                      title={`${p.name} · ${b.date.toLocaleDateString()}: ${c}`}
                    />
                  );
                })}
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
