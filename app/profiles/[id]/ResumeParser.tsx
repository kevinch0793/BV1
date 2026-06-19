"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseResumeIntoProfile, type ParseResult } from "@/app/actions/profiles";

export function ResumeParser({ profileId }: { profileId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ParseResult | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setResult(null);
    start(async () => {
      const r = await parseResumeIntoProfile(profileId, fd);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain"
        className="hidden"
        onChange={onFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
        {pending ? "Parsing…" : "Upload & parse resume"}
      </button>

      {pending ? (
        <span className="inline-flex items-center gap-2 text-sm text-neutral-500">
          Reading your resume and extracting fields — this can take a few seconds…
        </span>
      ) : result?.ok && result.summary ? (
        <span className="text-sm text-emerald-600">
          Imported {result.summary.experiences} roles, {result.summary.projects} projects,{" "}
          {result.summary.education} education, {result.summary.skills} skills.
        </span>
      ) : result && !result.ok ? (
        <span className="text-sm text-red-600">{result.error}</span>
      ) : (
        <span className="text-xs text-neutral-400">PDF or text — replaces the sections below.</span>
      )}
    </div>
  );
}
