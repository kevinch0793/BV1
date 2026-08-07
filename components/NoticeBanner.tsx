"use client";

import { useSyncExternalStore } from "react";
// `import type` is erased at compile time, so this client component does NOT pull
// lib/settings (and its prisma import) into the browser bundle.
import type { NoticeKind } from "@/lib/settings";

// Per-kind styling. Keyed by the SAME ids validated in lib/settings.ts, so an
// unknown kind can never reach this map (the server action falls back to "info").
const STYLES: Record<NoticeKind, { box: string; dot: string; close: string }> = {
  info: {
    box: "border-sky-200 bg-sky-50 text-sky-900",
    dot: "bg-sky-500",
    close: "text-sky-700 hover:bg-sky-100",
  },
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-500",
    close: "text-emerald-700 hover:bg-emerald-100",
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    dot: "bg-amber-500",
    close: "text-amber-700 hover:bg-amber-100",
  },
  critical: {
    box: "border-red-200 bg-red-50 text-red-900",
    dot: "bg-red-500",
    close: "text-red-700 hover:bg-red-100",
  },
};

const KEY = "bv1:notice-dismissed";

// localStorage is an external store, so it's read through useSyncExternalStore
// rather than an effect: that keeps the server render (nothing dismissed) and the
// post-hydration client render consistent, with no setState-in-effect cascade.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // "storage" fires only in OTHER tabs, so dismissing syncs across a user's tabs;
  // the local Set covers the tab that did the dismissing.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getDismissedVersion(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // private mode / storage disabled — just show the notice
  }
}

// Server render: nothing is dismissed yet.
const getServerSnapshot = (): string | null => null;

/**
 * The app-wide admin notice. Dismissal is remembered in localStorage against the
 * notice's `version` (its last-edited timestamp), so dismissing hides only THAT
 * message — the moment an admin edits it, the version changes and the new notice
 * shows again for everyone.
 *
 * Critical notices are deliberately NOT dismissible: the one kind meant for
 * "the pipeline is down" shouldn't be clickable-away.
 */
export function NoticeBanner({ text, kind, version }: { text: string; kind: NoticeKind; version: string }) {
  const dismissedVersion = useSyncExternalStore(subscribe, getDismissedVersion, getServerSnapshot);

  const dismissible = kind !== "critical";
  if (dismissible && dismissedVersion === version) return null;

  const s = STYLES[kind] ?? STYLES.info;

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, version);
    } catch {
      /* not persistable — nothing to do */
    }
    // Same-tab notification; the storage event only reaches other tabs.
    listeners.forEach((cb) => cb());
  }

  return (
    <div role="status" className={`mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 ${s.box}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {/* whitespace-pre-line so an admin can use line breaks. Plain text only —
          never dangerouslySetInnerHTML, or the notice becomes a stored-XSS vector
          reaching every client. */}
      <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{text}</p>
      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notice"
          className={`-mr-1 -mt-1 shrink-0 rounded px-2 py-1 text-lg leading-none ${s.close}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
