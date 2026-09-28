"use client";

import { useRef, useState, useTransition } from "react";
import { uploadFixedResume, deleteFixedResume } from "@/app/actions/profiles";

/**
 * Upload / replace / download the one fixed resume a "normal"-plan candidate
 * attaches to every application.
 *
 * The download deliberately points at /api/export/fixed/<id> — the browser
 * extension only tidies filenames for URLs under /api/export/, so this keeps the
 * same "one clean First Last.pdf that overwrites the previous copy" behaviour
 * tailored users get.
 */
export function FixedResumeBox({
  profileId,
  current,
}: {
  profileId: string;
  current: { filename: string; size: number; updatedAt: string } | null;
}) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <span className="font-medium text-neutral-800">{current.filename}</span>
          <span className="text-xs text-neutral-500">
            {kb(current.size)} · uploaded {current.updatedAt}
          </span>
          <a
            href={`/api/export/fixed/${profileId}`}
            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Download
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMsg(null);
              start(async () => {
                await deleteFixedResume(profileId);
                setMsg("Removed.");
              });
            }}
            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No fixed resume uploaded yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700"
          onChange={() => setMsg(null)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const f = fileRef.current?.files?.[0];
            if (!f) {
              setMsg("Choose a file first.");
              return;
            }
            setMsg(null);
            const fd = new FormData();
            fd.set("file", f);
            start(async () => {
              const r = await uploadFixedResume(profileId, fd);
              setMsg(r.ok ? `Saved ${r.filename}.` : (r.error ?? "Upload failed."));
              if (r.ok && fileRef.current) fileRef.current.value = "";
            });
          }}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "Uploading…" : current ? "Replace" : "Upload"}
        </button>
        {msg && <span className="text-sm text-neutral-600">{msg}</span>}
      </div>
    </div>
  );
}
