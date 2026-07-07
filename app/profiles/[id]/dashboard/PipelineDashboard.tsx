"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addJobUrls, setJobFromText, deleteJob, deleteJobs, setApplyStatus, type ApplyStatus } from "@/app/actions/jobs";
import { startPipeline, jobStatuses, ensurePipelineRunning, retryJob, retryJobs, type LiveJob } from "@/app/actions/pipeline";
import { ResumePreviewModal } from "@/components/ResumePreviewModal";
import { downloadResumeNative } from "@/lib/exportClient";
import { saveResumeToDownloads } from "@/app/actions/export";
import { fitColor } from "@/lib/fit";
import { workplaceOf, briefState, type Workplace } from "@/lib/location";

type Job = {
  id: string;
  url: string | null;
  company: string | null;
  role: string | null;
  location: string | null;
  workplace: string | null;
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

const WORKPLACE_STYLE: Record<Workplace, string> = {
  Remote: "bg-emerald-100 text-emerald-700",
  Hybrid: "bg-amber-100 text-amber-700",
  "In-Person": "bg-orange-100 text-orange-700",
  Onsite: "bg-neutral-100 text-neutral-600",
};

// Location cell: explicit workplace mode (Remote / Hybrid / In-Person / Onsite)
// + a brief state for non-remote roles, e.g. "Onsite CA".
function LocationCell({ workplace, location }: { workplace: string | null; location: string | null }) {
  if (!workplace && !location) return <span className="text-neutral-400">—</span>;
  const kind = workplaceOf(workplace, location);
  const where = kind === "Remote" ? "" : briefState(location);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${WORKPLACE_STYLE[kind]}`}>{kind}</span>
      {where && <span className="text-neutral-500">{where}</span>}
    </span>
  );
}

// Display order: Remote → Hybrid → In-Person → Onsite → Unfetchable.
const RANK: Record<Workplace, number> = { Remote: 0, Hybrid: 1, "In-Person": 2, Onsite: 3 };
function sortRank(job: Job): number {
  if (stageKey(job) === "failed") return 4;
  return RANK[workplaceOf(job.workplace, job.location)];
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
  // Live per-job fields from the cheap poll, overlaid on the server-rendered rows
  // so status + company/role/location update in ~real time (fetching → tailoring → done).
  const [live, setLive] = useState<Map<string, LiveJob>>(new Map());
  // Latest displayed job ids, read by the poll without re-subscribing the interval.
  const jobIdsRef = useRef<string[]>([]);
  jobIdsRef.current = jobs.map((j) => j.id);
  const [adding, startAdd] = useTransition();
  const [addMsg, setAddMsg] = useState<string | null>(null);
  // Row selection for bulk "Retry fetch".
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const lastClickedRef = useRef<string | null>(null); // anchor for shift-click range

  // Re-sort whenever job data changes (incl. after tailoring status updates from
  // polling): Fetchable+Remote → Fetchable+Onsite → Unfetchable. Stable within a
  // group (preserves the server's reverse-chronological order).
  const sortedJobs = useMemo(
    () => jobs.map((j, i) => [j, i] as const).sort(([a, ai], [b, bi]) => sortRank(a) - sortRank(b) || ai - bi).map(([j]) => j),
    [jobs],
  );

  // On load, self-heal: resume the pipeline if it's already running, or restart
  // it if there's unfinished work (pending jobs, or jobs left stuck in
  // fetching/tailoring by a server restart). So just opening the dashboard gets
  // a frozen run moving again.
  useEffect(() => {
    ensurePipelineRunning(profileId).then((r) => {
      if (r.running) setPolling(true);
    });
  }, [profileId]);

  // Poll a CHEAP per-job status snapshot every 2.5s and update the badges live, so
  // progress flows one-by-one. The full table (company/role/ATS — heavy over a
  // tunnel) is refetched only every ~10s and once when the run finishes.
  useEffect(() => {
    if (!polling) return;
    let active = true;
    let ticks = 0;
    const id = setInterval(async () => {
      let data: Awaited<ReturnType<typeof jobStatuses>>;
      try {
        data = await jobStatuses(profileId, jobIdsRef.current);
      } catch {
        return;
      }
      if (!active) return;
      setLive(new Map(data.jobs.map((j) => [j.id, j])));
      ticks += 1;
      if (!data.running) {
        setPolling(false);
        router.refresh();
        return;
      }
      if (ticks % 4 === 0) router.refresh();
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

  function toggleSelect(id: string, shift = false) {
    const order = sortedJobs.map((j) => j.id);
    // Capture the anchor NOW — the setSelected updater runs after this function
    // returns, by which point we've already moved the anchor to `id`.
    const anchor = lastClickedRef.current;
    setSelected((s) => {
      const n = new Set(s);
      // Shift-click selects the whole range from the last-clicked row to this one.
      if (shift && anchor && anchor !== id) {
        const a = order.indexOf(anchor);
        const b = order.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) n.add(order[i]);
          return n;
        }
      }
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    lastClickedRef.current = id;
  }
  const allSelected = sortedJobs.length > 0 && sortedJobs.every((j) => selected.has(j.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sortedJobs.map((j) => j.id)));
  }
  async function retrySelected() {
    if (!selected.size) return;
    setRetrying(true);
    try {
      await retryJobs([...selected]);
      setSelected(new Set());
      await kick(); // re-fetches the reset jobs
    } finally {
      setRetrying(false);
    }
  }
  async function removeSelected() {
    if (!selected.size) return;
    if (!confirm(`Remove ${selected.size} selected job${selected.size === 1 ? "" : "s"}? This can't be undone.`)) return;
    setRemoving(true);
    try {
      await deleteJobs([...selected], profileId);
      setSelected(new Set());
      router.refresh();
    } finally {
      setRemoving(false);
    }
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2">
          <span className="text-sm font-medium text-neutral-700">Jobs ({jobs.length})</span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">{selected.size} selected</span>
              <button
                onClick={retrySelected}
                disabled={retrying || removing}
                className="rounded-md bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry fetch"}
              </button>
              <button
                onClick={removeSelected}
                disabled={retrying || removing}
                className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-neutral-500 hover:underline">
                Clear
              </button>
            </div>
          )}
        </div>
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400">
            {isToday ? "No jobs yet — add URLs above." : `No jobs from ${dayLabel}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all jobs"
                      className="h-4 w-4 rounded border-neutral-300 align-middle"
                    />
                  </th>
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
                {sortedJobs.map((j) => {
                  // Overlay the live fields (fresher than the ~10s table refetch).
                  const o = live.get(j.id);
                  const jm = o ? { ...j, ...o } : j;
                  return (
                    <JobRow
                      key={j.id}
                      job={jm}
                      selected={selected.has(j.id)}
                      onToggleSelect={toggleSelect}
                      onRemove={(id) => deleteJob(id, profileId).then(() => router.refresh())}
                      onRetry={(id) => retryJob(id).then(kick)}
                      onPasted={kick}
                      onRefresh={() => router.refresh()}
                    />
                  );
                })}
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
  selected,
  onToggleSelect,
  onRemove,
  onRetry,
  onPasted,
  onRefresh,
}: {
  job: Job;
  selected: boolean;
  onToggleSelect: (id: string, shift?: boolean) => void;
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
  const shiftRef = useRef(false); // shift-key state at click time, for range select

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
  function apply() {
    const tid = job.tailoredId;
    if (tid) {
      const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
      if (isLocal) {
        // Same machine as the server → overwrite straight into ~/Downloads.
        setApplying(true);
        saveResumeToDownloads(tid, "pdf")
          .then((r) => {
            if (!r.ok) downloadResumeNative(tid, "pdf");
          })
          .catch(() => downloadResumeNative(tid, "pdf"))
          .finally(() => setApplying(false));
      } else {
        // Remote (e.g. ngrok): trigger a native browser download synchronously
        // in the click handler so repeated Applies aren't blocked.
        downloadResumeNative(tid, "pdf");
      }
    }
    // Open the job posting last so it doesn't consume the click's user gesture
    // before the download starts.
    if (job.url) window.open(job.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            // onMouseDown fires before change and carries the shift-key state.
            onMouseDown={(e) => (shiftRef.current = e.shiftKey)}
            onChange={() => onToggleSelect(job.id, shiftRef.current)}
            aria-label="Select job"
            className="h-4 w-4 rounded border-neutral-300 align-middle"
          />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${st.style}`}>
            {busy && <Spinner small />}
            {st.label}
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-neutral-900">
          <div className="max-w-[16rem] break-words">{job.role || <span className="text-neutral-400">—</span>}</div>
          {stage === "failed" && job.error && <p className="mt-0.5 max-w-[16rem] text-xs font-normal break-words text-red-600">{job.error}</p>}
        </td>
        <td className="px-4 py-3 text-neutral-700"><div className="max-w-[12rem] break-words">{job.company || <span className="text-neutral-400">—</span>}</div></td>
        <td className="px-4 py-3 text-neutral-700"><LocationCell workplace={job.workplace} location={job.location} /></td>
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
          <td colSpan={8} className="px-4 pb-3">
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
