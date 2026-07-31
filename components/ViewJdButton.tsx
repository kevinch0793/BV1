"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getJobJd, type JobJd } from "@/app/actions/jobs";

/** "View JD" trigger for the search table — shows the stored plain-text job
 *  description in a modal, so a saved posting stays readable even when its
 *  original URL has expired. The modal still links out to the live URL if present. */
export function ViewJdButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="whitespace-nowrap text-xs font-medium text-sky-700 hover:underline">
        View&nbsp;JD
      </button>
      {open && <JdModal jobId={jobId} onClose={() => setOpen(false)} />}
    </>
  );
}

function JdModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [data, setData] = useState<JobJd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getJobJd(jobId)
      .then((r) => active && (r ? setData(r) : setError("Job not found.")))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load."));
    return () => {
      active = false;
    };
  }, [jobId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    if (!data?.jd) return;
    try {
      await navigator.clipboard.writeText(data.jd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (e.g. insecure context) — ignore
    }
  }

  if (typeof document === "undefined") return null;

  const title = data ? `${data.company || "—"}${data.role ? ` · ${data.role}` : ""}` : "Job description";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-neutral-900">{title}</h3>
            {data?.url && (
              <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 hover:underline">
                Open original&nbsp;↗
              </a>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={copy}
              disabled={!data?.jd}
              title={copied ? "Copied" : "Copy JD"}
              aria-label="Copy JD"
              className={`rounded-md p-1.5 hover:bg-neutral-100 disabled:opacity-40 ${copied ? "text-emerald-600" : "text-neutral-500"}`}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100" aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto px-4 py-3">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !data ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : data.jd ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-neutral-800">{data.jd}</pre>
          ) : (
            <p className="text-sm text-neutral-400">No JD text stored for this job.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v7A1.5 1.5 0 0 0 4 12.5h1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
