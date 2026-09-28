"use client";

import { useTransition } from "react";
import { PLANS, type Plan } from "@/lib/plan";

/**
 * Change a plan from the admin table. Saves on change — there is no Save button
 * because a half-set plan is not a meaningful state, and an admin working down a
 * list of profiles should not have to confirm each one.
 */
export function PlanSelect({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (plan: Plan) => Promise<void>;
  title?: string;
}) {
  const [busy, start] = useTransition();
  return (
    <select
      value={value}
      disabled={busy}
      title={title}
      onChange={(e) => {
        const next = e.target.value as Plan;
        start(async () => {
          await onChange(next);
        });
      }}
      className={`rounded-md border px-1.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
        value === "tailor"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-neutral-300 bg-neutral-50 text-neutral-600"
      }`}
    >
      {PLANS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
