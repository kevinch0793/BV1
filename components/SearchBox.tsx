"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Debounced live search — updates the URL ?q= so the server page re-renders
 *  the results table. Stays mounted across those re-renders, so focus is kept. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const skip = useRef(true);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = setTimeout(() => {
      const v = q.trim();
      router.replace(v ? `/search?q=${encodeURIComponent(v)}` : "/search");
    }, 300);
    return () => clearTimeout(t);
  }, [q, router]);

  return (
    <div className="relative max-w-xl">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by company, role, or profile name…"
        className="w-full rounded-lg border border-neutral-300 py-2.5 pl-10 pr-9 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {q && (
        <button
          onClick={() => setQ("")}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}
