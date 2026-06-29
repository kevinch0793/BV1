"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** A per-column filter input. Debounced; writes only its own URL param and
 *  preserves the others (read live from the URL at write time), so the column
 *  filters combine. Stays mounted across the server re-render, keeping focus. */
export function ColumnSearch({ param, placeholder, initial }: { param: string; placeholder: string; initial: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const skip = useRef(true);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      const val = v.trim();
      if (val) next.set(param, val);
      else next.delete(param);
      const qs = next.toString();
      router.replace(qs ? `/search?${qs}` : "/search");
    }, 300);
    return () => clearTimeout(t);
  }, [v, param, router]);

  return (
    <div className="relative">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs font-normal normal-case text-neutral-700 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {v && (
        <button
          onClick={() => setV("")}
          aria-label="Clear"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-600"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}
