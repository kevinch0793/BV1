"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addJobUrls } from "@/app/actions/jobs";
import { startPipeline } from "@/app/actions/pipeline";

/** A "+" on a profile card that opens a popover to paste job URLs and run the
 *  fetch+tailor pipeline — without leaving the page. */
export function AddUrlsButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  function submit(fd: FormData) {
    setMsg(null);
    start(async () => {
      const r = await addJobUrls(profileId, fd);
      if (!r.ok) {
        setMsg(r.error ?? "Failed");
        return;
      }
      if (r.added) {
        await startPipeline(profileId);
        setMsg(`Added ${r.added}, tailoring in background…`);
        router.refresh();
        setTimeout(() => setOpen(false), 1200);
      } else {
        setMsg("No new URLs.");
      }
    });
  }

  return (
    <div className="absolute right-2 top-2 z-10">
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((o) => !o);
        }}
        title="Add job URLs"
        aria-label="Add job URLs"
        className="grid h-7 w-7 place-items-center rounded-md border border-neutral-200 bg-white text-lg leading-none text-neutral-500 hover:bg-sky-50 hover:text-sky-700"
      >
        {open ? "×" : "+"}
      </button>
      {open && (
        <div onClick={stop} className="absolute right-0 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
          <form action={submit} className="space-y-2">
            <textarea
              name="urls"
              rows={3}
              autoFocus
              placeholder={"One job URL per line"}
              className="w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <div className="flex items-center gap-2">
              <button disabled={pending} className="rounded-md bg-sky-700 px-3 py-1 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">
                {pending ? "Adding…" : "Add & run"}
              </button>
              <button type="button" onClick={(e) => { stop(e); setOpen(false); }} className="text-xs text-neutral-500 hover:underline">
                Cancel
              </button>
              {msg && <span className="text-[11px] text-neutral-500">{msg}</span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
