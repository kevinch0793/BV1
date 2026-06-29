"use client";

import { useMemo, useState } from "react";

type CP = { id: string; name: string };
type Ev = { profileId: string; day: string }; // day = app-day key "YYYY-MM-DD"
type Granularity = "daily" | "weekly" | "monthly";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketsFor(dayKeys: string[], g: Granularity): { key: string; label: string; days: Set<string> }[] {
  if (g === "daily") {
    return dayKeys.slice(-30).map((k) => {
      const [, mo, d] = k.split("-").map(Number);
      return { key: k, label: `${mo}/${d}`, days: new Set([k]) };
    });
  }
  if (g === "weekly") {
    const out: { key: string; label: string; days: Set<string> }[] = [];
    for (let end = dayKeys.length; end > 0 && out.length < 12; end -= 7) {
      const chunk = dayKeys.slice(Math.max(0, end - 7), end);
      const [, mo, d] = chunk[0].split("-").map(Number);
      out.unshift({ key: chunk[0], label: `${mo}/${d}`, days: new Set(chunk) });
    }
    return out;
  }
  // monthly — group by YYYY-MM, last 6
  const byMonth = new Map<string, string[]>();
  for (const k of dayKeys) {
    const mo = k.slice(0, 7);
    const arr = byMonth.get(mo) ?? [];
    arr.push(k);
    byMonth.set(mo, arr);
  }
  return [...byMonth.keys()].slice(-6).map((mo) => {
    const m = Number(mo.slice(5, 7));
    return { key: mo, label: MONTHS[m - 1] ?? mo, days: new Set(byMonth.get(mo)!) };
  });
}

/** Per-profile grouped bar chart of applications over time, with a
 *  daily/weekly/monthly toggle and click-to-hide legend. Generalizes the home
 *  page's AppliedChart. */
export function TimeSeriesChart({
  profiles,
  events,
  dayKeys,
  colorOf,
}: {
  profiles: CP[];
  events: Ev[];
  dayKeys: string[];
  colorOf: (id: string) => string;
}) {
  const [g, setG] = useState<Granularity>("daily");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { cols, max, total } = useMemo(() => {
    const buckets = bucketsFor(dayKeys, g);
    const visible = events.filter((e) => !hidden.has(e.profileId));
    const cols = buckets.map((b) => {
      const per = new Map<string, number>();
      for (const e of visible) {
        if (!b.days.has(e.day)) continue;
        per.set(e.profileId, (per.get(e.profileId) ?? 0) + 1);
      }
      return { label: b.label, key: b.key, per };
    });
    const max = Math.max(1, ...cols.flatMap((c) => [...c.per.values()]));
    const total = cols.reduce((n, c) => n + [...c.per.values()].reduce((a, v) => a + v, 0), 0);
    return { cols, max, total };
  }, [events, hidden, g, dayKeys]);

  const visibleProfiles = profiles.filter((p) => !hidden.has(p.id));
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {total} application{total === 1 ? "" : "s"} · peak {max}/{g === "daily" ? "day" : g === "weekly" ? "wk" : "mo"}
        </p>
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1">
          {(["daily", "weekly", "monthly"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setG(v)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${g === v ? "bg-sky-700 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {profiles.map((p) => {
            const off = hidden.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`flex items-center gap-1.5 text-xs ${off ? "text-neutral-400 line-through" : "text-neutral-700"}`}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: off ? "#d4d4d4" : colorOf(p.id) }} />
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No applications in this window.</p>
      ) : (
        <>
          <div className="flex items-end gap-1.5 pt-3" style={{ height: 168 }}>
            {cols.map((c, i) => (
              <div key={i} className="flex h-full flex-1 items-end justify-center gap-px">
                {visibleProfiles.map((p) => {
                  const n = c.per.get(p.id) ?? 0;
                  return (
                    <div
                      key={p.id}
                      className="min-w-0 max-w-[28px] flex-1 rounded-t"
                      style={{ height: n > 0 ? `${(n / max) * 100}%` : "3px", minHeight: 3, backgroundColor: colorOf(p.id), opacity: n > 0 ? 1 : 0.35 }}
                      title={`${p.name} · ${c.key}: ${n}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 border-t border-neutral-100 pt-1">
            {cols.map((c, i) => (
              <span key={i} className="flex-1 truncate text-center text-[9px] text-neutral-400">
                {g === "daily" ? (i % 3 === 0 || i === cols.length - 1 ? c.label : "") : c.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
