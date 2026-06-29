"use client";

import type { Insight } from "@/lib/insights";

/** Severity-sorted "problem -> action" cards. Empty => everything is healthy. */
export function AutoInsightsPanel({ insights, colorOf }: { insights: Insight[]; colorOf: (id: string) => string }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
        All profiles look healthy — nothing needs attention right now.
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {insights.map((ins, i) => {
        const problem = ins.severity === "problem";
        return (
          <div key={i} className={`rounded-xl border p-3 ${problem ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: colorOf(ins.profileId) }} />
              <span className="font-medium text-neutral-700">{ins.profileName}</span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${problem ? "bg-rose-200 text-rose-800" : "bg-amber-200 text-amber-800"}`}>
                {ins.severity}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold text-neutral-900">{ins.title}</div>
            {ins.detail && <div className="text-xs text-neutral-600">{ins.detail}</div>}
            <div className={`mt-1 text-xs font-medium ${problem ? "text-rose-700" : "text-amber-700"}`}>→ {ins.action}</div>
          </div>
        );
      })}
    </div>
  );
}
