"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TEMPLATES, type TemplateId } from "@/components/templates";
import { addJobUrls, fetchJob, setJobFromText, deleteJob } from "@/app/actions/jobs";
import { autoTailorJob } from "@/app/actions/tailor";

type Job = {
  id: string;
  url: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  status: string;
  error: string | null;
  tailoredId: string | null;
};

const MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
];

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

// Live overlay (in-flight / just-finished states from the running queue).
type Live = "fetching" | "fetch_failed" | "tailoring" | "tailored" | "tailor_failed";

const STAGE: Record<string, { label: string; style: string }> = {
  pending: { label: "Not fetched", style: "bg-neutral-100 text-neutral-600" },
  fetching: { label: "Fetching…", style: "bg-sky-100 text-sky-700" },
  fetched: { label: "Fetched", style: "bg-amber-100 text-amber-700" },
  tailoring: { label: "Tailoring…", style: "bg-violet-100 text-violet-700" },
  tailored: { label: "Tailored", style: "bg-emerald-100 text-emerald-700" },
  fetch_failed: { label: "Fetch failed", style: "bg-red-100 text-red-700" },
  tailor_failed: { label: "Tailor failed", style: "bg-red-100 text-red-700" },
};

function stageKey(job: Job, live?: Live): keyof typeof STAGE {
  if (live) return live;
  if (job.tailoredId) return "tailored";
  if (job.status === "failed") return "fetch_failed";
  if (job.status === "fetched") return "fetched";
  return "pending";
}

export function PipelineDashboard({
  profileId,
  jobs,
  canTailor,
}: {
  profileId: string;
  jobs: Job[];
  canTailor: boolean;
}) {
  const router = useRouter();
  const [live, setLive] = useState<Record<string, Live>>({});
  const [liveErr, setLiveErr] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [adding, startAdd] = useTransition();
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [template, setTemplate] = useState<TemplateId>("classic");
  const [model, setModel] = useState(MODELS[0].id);
  const [instructions, setInstructions] = useState("");

  const stageOf = (j: Job) => stageKey(j, live[j.id]);
  const outstanding = jobs.filter((j) => !["tailored", "fetching", "tailoring"].includes(stageOf(j)));

  async function run(targets: Job[]) {
    if (!targets.length) return;
    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const j = targets[i];
      if (j.status !== "fetched") {
        setLive((s) => ({ ...s, [j.id]: "fetching" }));
        const r = await fetchJob(j.id);
        if (!r.ok) {
          setLive((s) => ({ ...s, [j.id]: "fetch_failed" }));
          setLiveErr((e) => ({ ...e, [j.id]: r.error ?? "Fetch failed" }));
          setProgress({ done: i + 1, total: targets.length });
          continue;
        }
      }
      if (canTailor && !j.tailoredId) {
        setLive((s) => ({ ...s, [j.id]: "tailoring" }));
        const t = await autoTailorJob(j.id, { templateId: template, model, instructions });
        if (t.ok) setLive((s) => ({ ...s, [j.id]: "tailored" }));
        else {
          setLive((s) => ({ ...s, [j.id]: "tailor_failed" }));
          setLiveErr((e) => ({ ...e, [j.id]: t.error ?? "Tailor failed" }));
        }
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Add URLs */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">1 · Add job URLs</h2>
        <p className="mb-3 text-xs text-neutral-500">One URL per line.</p>
        <form
          action={(fd) => {
            setAddMsg(null);
            startAdd(async () => {
              const r = await addJobUrls(profileId, fd);
              if (!r.ok) {
                setAddMsg(r.error ?? "Failed");
                return;
              }
              setAddMsg(r.added ? `Added ${r.added} — fetching & tailoring…` : "No new URLs.");
              router.refresh();
              // Auto-run the full pipeline on the newly added jobs.
              await run(
                r.created.map((c) => ({
                  id: c.id,
                  url: c.url,
                  company: null,
                  role: null,
                  location: null,
                  status: "pending",
                  error: null,
                  tailoredId: null,
                })),
              );
              setAddMsg(r.added ? `Added ${r.added}.` : "No new URLs.");
            });
          }}
          className="space-y-2"
        >
          <textarea name="urls" rows={3} className={input} placeholder={"https://…/job/1\nhttps://…/job/2"} />
          <div className="flex items-center gap-3">
            <button disabled={adding} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
              {adding ? "Adding…" : "Add URLs"}
            </button>
            {addMsg && <span className="text-sm text-neutral-500">{addMsg}</span>}
          </div>
        </form>
      </section>

      {/* Settings + run */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">2 · Fetch &amp; tailor</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Template
            <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)} className={input}>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Tailoring model
            <select value={model} onChange={(e) => setModel(e.target.value)} className={input}>
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Instructions (optional)
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} className={input} placeholder="e.g. one page, emphasize leadership" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => run(outstanding)}
            disabled={running || outstanding.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {running && <Spinner />}
            {running
              ? `Processing ${progress?.done ?? 0}/${progress?.total ?? 0}…`
              : `Run pipeline (${outstanding.length} outstanding)`}
          </button>
          <span className="text-sm text-neutral-500">Fetches each JD, then tailors a resume — one job at a time.</span>
        </div>
      </section>

      {/* Job table */}
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Jobs ({jobs.length})</div>
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400">No jobs yet — add URLs above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {jobs.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    stage={stageOf(j)}
                    error={liveErr[j.id] ?? j.error ?? ""}
                    running={running}
                    onRun={(job) => run([job])}
                    onRemove={(id) => deleteJob(id, profileId).then(() => router.refresh())}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!canTailor && jobs.length > 0 && (
        <p className="text-xs text-neutral-400">Tailoring is disabled until the profile has a base resume or a project — fetching still works.</p>
      )}
    </div>
  );
}

function JobRow({
  job,
  stage,
  error,
  running,
  onRun,
  onRemove,
}: {
  job: Job;
  stage: keyof typeof STAGE;
  error: string;
  running: boolean;
  onRun: (job: Job) => void;
  onRemove: (id: string) => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pending, start] = useTransition();
  const [pasteErr, setPasteErr] = useState<string | null>(null);

  const st = STAGE[stage];
  const busy = stage === "fetching" || stage === "tailoring";
  const canPaste = stage === "pending" || stage === "fetch_failed";
  const isFailed = stage === "fetch_failed" || stage === "tailor_failed";
  const runLabel = stage === "fetched" ? "Tailor" : "Run";

  return (
    <>
      <tr className="align-top">
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${st.style}`}>
            {busy && <Spinner small />}
            {st.label}
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-neutral-900">
          {job.role || <span className="text-neutral-400">—</span>}
          {isFailed && error && <p className="mt-0.5 text-xs font-normal text-red-600">{error}</p>}
        </td>
        <td className="px-4 py-3 text-neutral-700">{job.company || <span className="text-neutral-400">—</span>}</td>
        <td className="px-4 py-3 text-neutral-700">{job.location || <span className="text-neutral-400">—</span>}</td>
        <td className="px-4 py-3">
          {job.url ? (
            <a href={job.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">link ↗</a>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-3">
            {job.tailoredId && (
              <Link href={`/resume/${job.tailoredId}`} className="font-medium text-sky-700 hover:underline">Resume</Link>
            )}
            {!busy && stage !== "tailored" && (
              <button onClick={() => onRun(job)} disabled={running} className="text-sky-700 hover:underline disabled:opacity-50">
                {runLabel}
              </button>
            )}
            {canPaste && (
              <button onClick={() => setShowPaste((v) => !v)} className="text-neutral-600 hover:underline">
                {showPaste ? "Cancel" : "Paste JD"}
              </button>
            )}
            <button onClick={() => onRemove(job.id)} className="text-red-600 hover:underline">Remove</button>
          </div>
        </td>
      </tr>
      {showPaste && (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <form
              action={(fd) => {
                setPasteErr(null);
                start(async () => {
                  const r = await setJobFromText(job.id, fd);
                  if (r.ok) {
                    setShowPaste(false);
                    // JD is now saved/fetched — auto-tailor it (skip the fetch step).
                    onRun({ ...job, status: "fetched", tailoredId: null });
                  } else {
                    setPasteErr(r.error ?? "Failed");
                  }
                });
              }}
              className="space-y-2"
            >
              <textarea name="text" rows={5} className={input} placeholder="Paste the full job description for this posting…" />
              <div className="flex items-center gap-3">
                <button disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50">
                  {pending ? "Saving…" : "Save JD"}
                </button>
                <span className="text-xs text-neutral-500">Saves the JD and tailors automatically.</span>
                {pasteErr && <span className="text-sm text-red-600">{pasteErr}</span>}
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const s = small ? 11 : 14;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
