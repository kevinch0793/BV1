"use client";

import { useEffect, useRef, useState } from "react";

type Group = { name: string; type: string; domain: string; bullets: string }; // bullets edited as text

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

/**
 * Editor for a company's project subgroups (the themes of work there). One
 * subgroup → just bullets (the title is hidden on the resume); two or more →
 * each gets a Name — Kind title. Serializes to a hidden `projects` field that
 * `updateExperience` reads. Dispatches an input event on change so the
 * surrounding DirtyForm enables its Save button.
 */
export function ExperienceProjects({
  defaultProjects,
}: {
  defaultProjects: { name: string; type: string; domain: string; bullets: string[] }[];
}) {
  const init: Group[] = (defaultProjects.length ? defaultProjects : [{ name: "", type: "", domain: "", bullets: [] }]).map((g) => ({
    name: g.name,
    type: g.type,
    domain: g.domain,
    bullets: g.bullets.join("\n"),
  }));
  const [groups, setGroups] = useState<Group[]>(init);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const firstRun = useRef(true);

  const serialized = JSON.stringify(
    groups.map((g) => ({
      name: g.name.trim(),
      type: g.type.trim(),
      domain: g.domain.trim(),
      bullets: g.bullets.split("\n").map((b) => b.trim()).filter(Boolean),
    })),
  );

  // After any structural change, tell the parent DirtyForm something changed.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [serialized]);

  function set(i: number, patch: Partial<Group>) {
    setGroups((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }
  function add() {
    setGroups((gs) => [...gs, { name: "", type: "", domain: "", bullets: "" }]);
  }
  function remove(i: number) {
    setGroups((gs) => (gs.length <= 1 ? gs : gs.filter((_, idx) => idx !== i)));
  }

  const multi = groups.length > 1;

  return (
    <div className="space-y-3">
      <input ref={hiddenRef} type="hidden" name="projects" value={serialized} readOnly />
      <div className="text-xs font-medium text-neutral-600">
        Projects at this company {multi ? "(each gets a title)" : "(single — title hidden on resume)"}
      </div>
      {groups.map((g, i) => (
        <div key={i} className="rounded-md border border-neutral-200 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Name — short and/or expanded (e.g. PMax; Google Ads Performance Max)"
              value={g.name}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <input
              className={input}
              placeholder="Kind (e.g. Ads foundation model)"
              value={g.type}
              onChange={(e) => set(i, { type: e.target.value })}
            />
          </div>
          <textarea
            className={`${input} mt-2`}
            rows={2}
            placeholder="Domains / industries it can cover (e.g. Ads, retail, e-commerce, ML ranking, bidding, recommendations)"
            value={g.domain}
            onChange={(e) => set(i, { domain: e.target.value })}
          />
          <textarea
            className={`${input} mt-2`}
            rows={3}
            placeholder="Bullets (one per line)"
            value={g.bullets}
            onChange={(e) => set(i, { bullets: e.target.value })}
          />
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="mt-1 text-xs text-red-600 hover:underline"
            >
              Remove project
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
      >
        + Add project subgroup
      </button>
    </div>
  );
}
