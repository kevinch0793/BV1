"use client";

import { Fragment, useMemo, useState } from "react";
import { fmtTokens, fmtCost, fmtMs } from "@/lib/usageFormat";

export type UsageRow = {
  clientId: string;
  email: string;
  status: string;
  profiles: number;
  inTok: number;
  outTok: number;
  cost: number;
  kinds: Record<string, number>;
  avgTailorMs: number;
  lastActivity: string | null;
  jobs: number;
  tailored: number;
  applied: number;
  models: { model: string; inTok: number; outTok: number; cost: number }[];
};

type SortKey = "email" | "cost" | "outTok" | "inTok" | "tailor" | "answer" | "avgTailorMs" | "jobs" | "tailored" | "applied" | "lastActivity";

const STATUS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

function relDay(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

export function UsageTable({ rows }: { rows: UsageRow[] }) {
  const [sort, setSort] = useState<SortKey>("cost");
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const val = (r: UsageRow, k: SortKey): number | string => {
    switch (k) {
      case "email": return r.email;
      case "tailor": return r.kinds["tailor"] ?? 0;
      case "answer": return r.kinds["answer"] ?? 0;
      case "lastActivity": return r.lastActivity ? new Date(r.lastActivity).getTime() : 0;
      default: return r[k];
    }
  };
  const sorted = useMemo(() => {
    const s = [...rows].sort((a, b) => {
      const va = val(a, sort), vb = val(b, sort);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? c : -c;
    });
    return s;
  }, [rows, sort, asc]);

  function th(label: string, key: SortKey, right = false) {
    const active = sort === key;
    return (
      <th className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
        <button
          onClick={() => (active ? setAsc((v) => !v) : (setSort(key), setAsc(false)))}
          className={`inline-flex items-center gap-1 hover:text-neutral-900 ${active ? "text-neutral-900" : ""}`}
        >
          {label}
          {active && <span className="text-[9px]">{asc ? "▲" : "▼"}</span>}
        </button>
      </th>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Users ({rows.length})</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              {th("User", "email")}
              <th className="px-3 py-2 text-right font-medium">Profiles</th>
              {th("In", "inTok", true)}
              {th("Out", "outTok", true)}
              {th("Est. $", "cost", true)}
              {th("Tailors", "tailor", true)}
              {th("Answers", "answer", true)}
              {th("Avg tailor", "avgTailorMs", true)}
              {th("Jobs", "jobs", true)}
              {th("Tailored", "tailored", true)}
              {th("Applied", "applied", true)}
              {th("Last use", "lastActivity", true)}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((r) => (
              <Fragment key={r.clientId}>
                <tr
                  className="cursor-pointer align-middle hover:bg-neutral-50"
                  onClick={() => setOpen((o) => (o === r.clientId ? null : r.clientId))}
                >
                  <td className="px-3 py-2 font-medium text-neutral-900">
                    <span className="mr-1 inline-block w-3 text-neutral-400">{open === r.clientId ? "▾" : "▸"}</span>
                    {r.email}
                    <span className={`ml-2 rounded px-1 py-0.5 text-[10px] font-medium ${STATUS[r.status] ?? "bg-neutral-100 text-neutral-600"}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">{r.profiles}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{fmtTokens(r.inTok)}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{fmtTokens(r.outTok)}</td>
                  <td className="px-3 py-2 text-right font-medium text-emerald-700">{fmtCost(r.cost)}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{r.kinds["tailor"] ?? 0}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{r.kinds["answer"] ?? 0}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{fmtMs(r.avgTailorMs)}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{r.jobs}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{r.tailored}</td>
                  <td className="px-3 py-2 text-right text-neutral-600">{r.applied}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">{relDay(r.lastActivity)}</td>
                </tr>
                {open === r.clientId && (
                  <tr className="bg-neutral-50/60">
                    <td colSpan={12} className="px-6 py-3">
                      {r.models.length === 0 ? (
                        <span className="text-xs text-neutral-400">No LLM usage in this window.</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">By model · fetches {r.kinds["fetch"] ?? 0} · jd-skills {r.kinds["jd_skills"] ?? 0} · parses {r.kinds["parse"] ?? 0}</div>
                          <table className="text-xs">
                            <tbody>
                              {r.models.map((m) => (
                                <tr key={m.model}>
                                  <td className="py-0.5 pr-6 font-mono text-neutral-700">{m.model}</td>
                                  <td className="py-0.5 pr-6 text-right text-neutral-500">in {fmtTokens(m.inTok)}</td>
                                  <td className="py-0.5 pr-6 text-right text-neutral-500">out {fmtTokens(m.outTok)}</td>
                                  <td className="py-0.5 text-right font-medium text-emerald-700">{fmtCost(m.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
