"use client";

import { useMemo, useState } from "react";
import { normalizeCompany } from "@/lib/blacklist";

/**
 * The company-blacklist textarea plus a lookup box.
 *
 * The list is matched on a normalized key, not the literal text, so "Google",
 * "google" and "Google LLC" are one entry — which makes duplicates invisible by
 * eye once the list is more than a screen long. Both the search and the
 * duplicate notice use `normalizeCompany`, the same function the filter and the
 * pipeline match on, so what this reports is exactly what will be blocked.
 *
 * Everything is computed from the text as currently typed rather than from the
 * saved value, so it answers "am I about to add a duplicate?" before saving.
 * The search field is deliberately unnamed: FormData ignores it, so typing here
 * cannot mark the form dirty or reach the server.
 */
export function BlacklistEditor({ defaultValue, className }: { defaultValue: string; className?: string }) {
  const [text, setText] = useState(defaultValue);
  const [query, setQuery] = useState("");

  const { entries, duplicates } = useMemo(() => {
    const firstSeen = new Map<string, { label: string; line: number }>();
    const dups: { label: string; line: number; sameAs: string }[] = [];
    text.split(/\r?\n/).forEach((raw, i) => {
      const label = raw.trim();
      if (!label || label.startsWith("#")) return;
      const key = normalizeCompany(label);
      if (!key) return;
      const prior = firstSeen.get(key);
      if (prior) dups.push({ label, line: i + 1, sameAs: prior.label });
      else firstSeen.set(key, { label, line: i + 1 });
    });
    return { entries: firstSeen, duplicates: dups };
  }, [text]);

  const q = normalizeCompany(query);
  const hit = q ? entries.get(q) : undefined;

  return (
    <div className={className}>
      <label className="mb-1 flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Check a company
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Google LLC"
          className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>
      <p className="mb-3 min-h-[1.25rem] text-xs">
        {!query.trim() ? (
          <span className="text-neutral-500">
            Type a name to see whether it is already blocked — matching ignores case, punctuation and suffixes like
            &quot;Inc&quot;, so &quot;Google LLC&quot; finds &quot;Google&quot;.
          </span>
        ) : !q ? (
          <span className="text-neutral-500">Nothing to match on.</span>
        ) : hit ? (
          <span className="text-emerald-700">
            Already blocked — <strong>{hit.label}</strong> on line {hit.line}
            {normalizeCompany(hit.label) === q && hit.label.trim() !== query.trim() && <> (same company, different spelling)</>}
          </span>
        ) : (
          <span className="text-neutral-600">
            Not in the list — add <strong>{query.trim()}</strong> on its own line below.
          </span>
        )}
      </p>

      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Blocked companies <span className="font-normal text-neutral-500">({entries.size} {entries.size === 1 ? "company" : "companies"})</span>
        <textarea
          name="companyBlacklist"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"# one company per line\nAcme Corp\nWispr Flow"}
          className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 font-mono text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          spellCheck={false}
        />
      </label>

      {duplicates.length > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          {duplicates.length} duplicate {duplicates.length === 1 ? "entry" : "entries"} (ignored, harmless):{" "}
          {duplicates
            .slice(0, 4)
            .map((d) => `line ${d.line} "${d.label}" = "${d.sameAs}"`)
            .join(", ")}
          {duplicates.length > 4 && ` and ${duplicates.length - 4} more`}
        </p>
      )}
    </div>
  );
}
