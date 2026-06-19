"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseResumeIntoProfile, type ParseResult } from "@/app/actions/profiles";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function ResumeParser({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        setResult(null);
        start(async () => {
          const r = await parseResumeIntoProfile(profileId, fd);
          setResult(r);
          if (r.ok) router.refresh();
        });
      }}
      className="space-y-3"
    >
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Parsing <strong>replaces</strong> this profile&apos;s basics, experience, education,
        projects, and skills with what it extracts. Best on an empty or new profile.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          Upload a resume (PDF or .txt)
          <input
            type="file"
            name="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-sky-800"
          />
          {fileName && <span className="text-[11px] text-neutral-500">{fileName}</span>}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
          …or paste resume text
          <textarea name="text" rows={4} className={input} placeholder="Paste the full resume here…" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {pending ? "Parsing…" : "Parse & fill profile"}
        </button>
        {result?.ok && result.summary && (
          <span className="text-sm text-emerald-600">
            Imported {result.summary.experiences} roles, {result.summary.projects} projects,{" "}
            {result.summary.education} education, {result.summary.skills} skills.
          </span>
        )}
        {result && !result.ok && <span className="text-sm text-red-600">{result.error}</span>}
      </div>
    </form>
  );
}
