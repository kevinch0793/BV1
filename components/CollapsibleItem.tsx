"use client";

import { useState } from "react";

/** A single collapsible record (one experience / project / education entry). */
export function CollapsibleItem({
  summary,
  meta,
  defaultOpen = false,
  children,
}: {
  summary: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="flex-1 truncate text-sm font-medium text-neutral-800">{summary}</span>
        {meta && <span className="shrink-0 text-xs text-neutral-400">{meta}</span>}
      </button>
      {open && <div className="border-t border-neutral-200 p-3">{children}</div>}
    </div>
  );
}
