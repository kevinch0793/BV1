"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addJobUrls, setJobFromText, deleteJob, setApplyStatus, type ApplyStatus } from "@/app/actions/jobs";
import { startPipeline, pipelineRunning, retryJob } from "@/app/actions/pipeline";
import { ResumePreviewModal } from "@/components/ResumePreviewModal";
import { downloadResume } from "@/lib/exportClient";
import { saveResumeToDownloads } from "@/app/actions/export";
import { fitColor } from "@/lib/fit";

type Job = {
  id: string;
  url: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  status: string;
  error: string | null;
  tailoredId: string | null;
  fitAfter: number | null;
  applyStatus: string;
  appliedTailored: boolean | null;
};

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

const STAGE: Record<string, { label: string; style: string }> = {
  pending: { label: "Not fetched", style: "bg-neutral-100 text-neutral-600" },
  fetching: { label: "Fetching…", style: "bg-sky-100 text-sky-700" },
  fetched: { label: "Fetched", style: "bg-amber-100 text-amber-700" },
  tailoring: { label: "Tailoring…", style: "bg-violet-100 text-violet-700" },
  tailored: { label: "Tailored", style: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", style: "bg-red-100 text-red-700" },
};

function stageKey(job: Job): keyof typeof STAGE {
  if (job.tailoredId) return "tailored";
  if (["fetching", "tailoring", "fetched", "failed"].includes(job.status)) return job.status;
  return "pending";
}

function isRemote(job: Job): boolean {
  return (job.location ?? "").trim().toLowerCase() === "remote";
}

// Display order: Fetchable+Remote first, then Fetchable+Onsite, then Unfetchable.
// (Unfetchable = a job that failed to fetch its description.)
function sortRank(job: Job): number {
  if (stageKey(job) === "failed") return 2;
  return isRemote(job) ? 0 : 1;
}

export function PipelineDashboard({
  profileId,
  jobs,
  canTailor,
  isToday,
  dayLabel,
}: {
  profileId: string;
  jobs: Job[];
  canTailor: boolean;
  isToday: boolean;
  dayLabel: string;
}) {
  const router = useRouter();
  const [polling, setPolling] = useState(false);
  const [adding, startAdd] = useTransition();
  const [addMsg, setAddMsg] = useState<string | null>(null);

  // Re-sort whenever job data changes (incl. after tailoring status updates from
  // polling): Fetchable+Remote → Fetchable+Onsite → Unfetchable. Stable within a
  // group (preserves the server's reverse-chronological order).
  const sortedJobs = useMemo(
    () => jobs.map((j, i) => [j, i] as const).sort(([a, ai], [b, bi]) => sortRank(a) - sortRank(b) || ai - bi).map(([j]) => j),
    [jobs],
  );

  // Resume the progress view if the pipeline is already running server-side
  // (e.g. after navigating back to this page).
  useEffect(() => {
    pipelineRunning(profileId).then((r) => {
      if (r) setPolling(true);
    });
  }, [profileId]);

  // While polling, refresh the table and stop once the server reports idle.
  useEffect(() => {
    if (!polling) return;
    let active = true;
    const id = setInterval(async () => {
      router.refresh();
      const still = await pipelineRunning(profileId);
      if (active && !still) {
        setPolling(false);
        router.refresh();
      }
    }, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [polling, profileId, router]);

  async function kick() {
    await startPipeline(profileId);
    setPolling(true);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Add URLs (auto-runs the pipeline) — only on today's view, since new jobs
          are stamped with today's date. */}
      {isToday && (
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-neutral-900">Add job URLs</h2>
        <p className="mb-3 text-xs text-neutral-500">
          One URL per line. On add, each is fetched and tailored automatically — it keeps running in the background even if you leave this page.
        </p>
        <form
          action={(fd) => {
            setAddMsg(null);
            startAdd(async () => {
              const r = await addJobUrls(profileId, fd);
              if (!r.ok) {
                setAddMsg(r.error ?? "Failed");
                return;
              }
              const parts: string[] = [];
              if (r.added) parts.push(`Added ${r.added}`);
              if (r.skipped) parts.push(`skipped ${r.skipped} duplicate${r.skipped === 1 ? "" : "s"}`);
              setAddMsg(parts.length ? `${parts.join(", ")}.` : "No new URLs.");
              if (r.added) await kick();
            });
          }}
          className="space-y-2"
        >
          <textarea name="urls" rows={3} className={input} placeholder={"https://…/job/1\nhttps://…/job/2"} />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={adding} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
              {adding ? "Adding…" : "Add & run"}
            </button>
            {polling && (
              <span className="inline-flex items-center gap-2 text-sm text-sky-700">
                <Spinner /> Working in background…
              </span>
            )}
            {addMsg && !polling && <span className="text-sm text-neutral-500">{addMsg}</span>}
          </div>
        </form>

        <p className="mt-3 text-xs text-neutral-400">
          Template, tailoring model, and custom instructions are configured in{" "}
          <a href="/settings" className="text-sky-700 hover:underline">Settings</a>.
        </p>
        {!canTailor && (
          <p className="mt-3 text-xs text-amber-600">Tailoring needs a base resume or a project on the profile — until then jobs will only be fetched.</p>
        )}
      </section>
      )}

      {/* Job table */}
      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700">Jobs ({jobs.length})</div>
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400">
            {isToday ? "No jobs yet — add URLs above." : `No jobs from ${dayLabel}.`}
          </p>
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
                  <th className="px-4 py-2 font-medium">Applied</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sortedJobs.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    onRemove={(id) => deleteJob(id, profileId).then(() => router.refresh())}
                    onRetry={(id) => retryJob(id).then(kick)}
                    onPasted={kick}
                    onRefresh={() => router.refresh()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function JobRow({
  job,
  onRemove,
  onRetry,
  onPasted,
  onRefresh,
}: {
  job: Job;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPasted: () => void;
  onRefresh: () => void;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<ApplyStatus>(job.applyStatus as ApplyStatus);
  const [tailored, setTailored] = useState<boolean>(!!job.appliedTailored);
  const [pending, start] = useTransition();
  const [pasteErr, setPasteErr] = useState<string | null>(null);

  // Keep the local controls in sync after a server refresh.
  useEffect(() => {
    setStatus(job.applyStatus as ApplyStatus);
    setTailored(!!job.appliedTailored);
  }, [job.applyStatus, job.appliedTailored]);

  const stage = stageKey(job);
  const st = STAGE[stage];
  const busy = stage === "fetching" || stage === "tailoring";
  const canPaste = stage === "pending" || stage === "failed";

  // Manual status change from the dropdown: a manual "applied" defaults to
  // generic (we don't assume the tailored resume was used).
  async function changeStatus(next: ApplyStatus) {
    setStatus(next);
    if (next !== "applied") setTailored(false);
    await setApplyStatus(job.id, next);
    onRefresh();
  }

  // Toggle whether the application actually used the tailored resume.
  async function setUsedTailored(next: boolean) {
    setStatus("applied");
    setTailored(next);
    await setApplyStatus(job.id, "applied", next);
    onRefresh();
  }

  // "Apply": open the job posting and download the tailored resume so you can
  // submit it on the site. It does NOT touch the applied status — a download
  // can't prove the resume was used, so you confirm that yourself afterward via
  // the dropdown + tailored/generic toggle.
  async function apply() {
    if (job.url) window.open(job.url, "_blank", "noopener,noreferrer");
    if (!job.tailoredId) return;
    setApplying(true);
    try {
      const r = await saveResumeToDownloads(job.tailoredId, "pdf");
      if (!r.ok) await downloadResume(job.tailoredId, "pdf");
    } catch (e) {
      alert(`Resume download failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setApplying(false);
    }
  }

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
          {stage === "failed" && job.error && <p className="mt-0.5 text-xs font-normal text-red-600">{job.error}</p>}
        </td>
        <td className="px-4 py-3 text-neutral-700">{job.company || <span className="text-neutral-400">—</span>}</td>
        <td className="px-4 py-3 text-neutral-700">{job.location || <span className="text-neutral-400">—</span>}</td>
        <td className="px-4 py-3">
          {job.url ? (
            <button
              onClick={apply}
              disabled={applying}
              title={job.tailoredId ? "Open the job posting and download your tailored resume" : "Open the job posting"}
              className="font-medium text-sky-700 hover:underline disabled:opacity-50"
            >
              {applying ? "Opening…" : "Apply ↗"}
            </button>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex flex-col gap-0.5">
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as ApplyStatus)}
              className={`rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-sky-500 focus:outline-none ${
                status === "applied" ? "bg-emerald-50 text-emerald-700" : status === "not_available" ? "bg-neutral-100 text-neutral-500" : "text-neutral-600"
              }`}
            >
              <option value="none">-</option>
              <option value="applied">Applied</option>
              <option value="not_available">Not available</option>
            </select>
            {status === "applied" && (
              <button
                onClick={() => setUsedTailored(!tailored)}
                title="Click to toggle whether you applied with the tailored resume"
                className={`w-fit text-[10px] hover:underline ${tailored ? "text-emerald-600" : "text-amber-600"}`}
              >
                {tailored ? "tailored resume ✓" : "generic resume"}
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-3">
            {job.fitAfter != null && (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: fitColor(job.fitAfter).bg, color: fitColor(job.fitAfter).text }}
                title="ATS match after tailoring"
              >
                {job.fitAfter}%
              </span>
            )}
            {job.tailoredId && (
              <button onClick={() => setShowPreview(true)} className="font-medium text-sky-700 hover:underline">Resume</button>
            )}
            {stage === "failed" && job.url && (
              <button onClick={() => onRetry(job.id)} className="text-sky-700 hover:underline">Retry</button>
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
          <td colSpan={7} className="px-4 pb-3">
            <form
              action={(fd) => {
                setPasteErr(null);
                start(async () => {
                  const r = await setJobFromText(job.id, fd);
                  if (r.ok) {
                    setShowPaste(false);
                    onPasted(); // kicks the background pipeline → auto-tailors this job
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
      {showPreview && job.tailoredId && (
        <ResumePreviewModal tailoredId={job.tailoredId} onClose={() => setShowPreview(false)} />
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
