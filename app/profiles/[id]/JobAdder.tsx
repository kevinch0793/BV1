"use client";

import { useState, useTransition } from "react";
import { addJobFromUrl, addJobFromText, type JobActionResult } from "@/app/actions/jobs";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function JobAdder({ profileId }: { profileId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [lastUrl, setLastUrl] = useState("");

  function handle(result: Promise<JobActionResult>) {
    start(async () => {
      const r = await result;
      if (r.ok) {
        setError(null);
        setShowPaste(false);
      } else {
        setError(r.error ?? "Something went wrong.");
        if (r.needsPaste) setShowPaste(true);
      }
    });
  }

  return (
    <div className="space-y-3">
      <form
        action={(fd) => {
          setLastUrl(String(fd.get("url") ?? ""));
          handle(addJobFromUrl(profileId, fd));
        }}
        className="flex gap-2"
      >
        <input name="url" placeholder="https://… job posting URL" className={input} />
        <button
          disabled={pending}
          className="shrink-0 rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {pending ? "Working…" : "Scrape & add"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {(showPaste || error) && (
        <details open={showPaste} className="rounded-lg border border-neutral-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-700">
            Paste the job description instead
          </summary>
          <form
            action={(fd) => {
              if (lastUrl) fd.set("url", lastUrl);
              handle(addJobFromText(profileId, fd));
            }}
            className="mt-2 space-y-2"
          >
            <textarea name="text" rows={6} className={input} placeholder="Paste the full job description here…" />
            <button
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {pending ? "Extracting…" : "Extract & add"}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
