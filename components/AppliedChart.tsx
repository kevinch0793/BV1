"use client";

import { useMemo, useState } from "react";

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
type Event = { profileId: string; day: string }; // day = app-day key "YYYY-MM-DD"

/** Grouped per-profile daily applied-count chart, one color per profile. Click a
 *  profile in the legend to hide it (crossed out). X = app day (rolls at 10pm
 *  ET), Y = applied count. `dayKeys` is the last 30 app days, ascending. */
export function AppliedChart({
  profiles,
  events,
  dayKeys,
}: {
  profiles: ChartProfile[];
  events: Event[];
  dayKeys: string[];
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p, i) => m.set(p.id, COLORS[i % COLORS.length]));
    return m;
  }, [profiles]);

  const { buckets, max, total } = useMemo(() => {
    const window = dayKeys.slice(-days);
    const visible = events.filter((e) => !hidden.has(e.profileId));
    const buckets = window.map((key) => {
      const perProfile = new Map<string, number>();
      let dayTotal = 0;
      for (const e of visible) {
        if (e.day !== key) continue;
        perProfile.set(e.profileId, (perProfile.get(e.profileId) ?? 0) + 1);
        dayTotal++;
      }
      return { key, perProfile, total: dayTotal };
    });
    const max = Math.max(1, ...buckets.flatMap((b) => [...b.perProfile.values()]));
    const total = buckets.reduce((n, b) => n + b.total, 0);
    return { buckets, max, total };
  }, [events, hidden, days, dayKeys]);

  const visibleProfiles = profiles.filter((p) => !hidden.has(p.id));

  const xLabel = (key: string, i: number) => {
    const [y, mo, d] = key.split("-").map(Number);
    const date = new Date(y, mo - 1, d);
    if (days === 7) return date.toLocaleDateString(undefined, { weekday: "short" });
    return i % 5 === 0 || i === days - 1 ? String(d) : "";
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
                  // Always draw a bar so every profile shows each day; a zero-count
                  // bar is a faint 3px stub.
                  return (
                    <div
                      key={p.id}
                      className="min-w-0 max-w-[28px] flex-1 rounded-t"
                      style={{
                        height: c > 0 ? `${(c / max) * 100}%` : "3px",
                        minHeight: 3,
                        backgroundColor: colorOf.get(p.id),
                        opacity: c > 0 ? 1 : 0.4,
                      }}
                      title={`${p.name} · ${b.key}: ${c}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 border-t border-neutral-100 pt-1">
            {buckets.map((b, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-neutral-400">{xLabel(b.key, i)}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
