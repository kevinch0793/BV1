import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { matchBlacklist } from "@/lib/blacklist";
import { extractJobFields, tailorResume, type TailorArgs } from "@/lib/llm/service";
import { createTailorBatch, waitForBatch, collectTailorResults, listOpenBatchIds, type TailorBatchRequest, type BatchUsage } from "@/lib/llm/batch";
import { type ResumeContent } from "@/lib/llm/schema";
import { llmProfileInclude, toProfileForLLM } from "@/lib/profile-data";
import { extractJdSkills, scoreFit, profileToText, type JdSkills } from "@/lib/llm/ats";
import { getCustomInstructions, getSettings, getGlobalModel, providerForModel, type SkillsConfig, getCompanyBlacklist } from "@/lib/settings";
import { pruneOldActivity, pruneStaleIncomplete, activeCutoff } from "@/lib/retention";
import { withUsage, withKind, recordUsage } from "@/lib/llm/usage";
import { FairLimiter } from "@/lib/fairLimiter";
import { shouldTailorWorkplace } from "@/lib/location";
import type { JobForLLM } from "@/lib/llm/prompts";

// clientId is captured at the request-context action entry (startPipeline) and
// threaded here because the loop runs detached (no cookies).
export type PipelineOpts = { templateId?: string; model?: string; instructions?: string; clientId?: string; skills?: SkillsConfig };

// Per-profile in-flight state, kept in the Node process so the pipeline keeps
// running even after the client navigates away. (Single-user local app; for a
// serverless deploy this would move to a queue/worker.)
const running = new Map<string, PipelineOpts>();

export function isPipelineRunning(profileId: string): boolean {
  return running.has(profileId);
}

/**
 * Kick off (or refresh the options of) the background pipeline for a profile.
 * Returns immediately; the work continues detached in the server process.
 */
export async function startPipeline(profileId: string, opts: PipelineOpts): Promise<void> {
  // Admin pause: never start/restart/resume a paused profile. This single guard
  // covers every entry point (dashboard kick, ensurePipelineRunning, resumeAll,
  // boot) and stops the stuck-status resets below from firing while paused.
  if (await isProfilePaused(profileId)) return;

  // Already running: just refresh options. The running loop re-gathers between
  // rounds, so any newly-pending (e.g. retried) job gets picked up on its own.
  // Crucially, do NOT touch in-flight ("fetching"/"tailoring") jobs here, or a
  // mid-run kick would reset live work.
  if (running.has(profileId)) {
    running.set(profileId, opts);
    return;
  }

  // Retention: prune activity older than the 30-day window + non-completed jobs
  // older than yesterday. Fire-and-forget so a fresh run keeps the DB bounded
  // without blocking processing.
  void pruneOldActivity().catch(() => {});
  void pruneStaleIncomplete().catch(() => {});

  // Fresh start: recover any states left mid-flight by a previous interrupted run.
  await prisma.jobPosting.updateMany({ where: { profileId, status: "fetching" }, data: { status: "pending" } });
  // In batch mode, "tailoring" jobs may be in-flight in a submitted batch that
  // outlives a restart — resumeOpenBatches() re-attaches and finishes them, so
  // resetting them here would re-tailor them in a NEW batch (double spend). Leave
  // them; a genuinely stuck "tailoring" job (crashed before submit) is clearable
  // from the dashboard via retry. In sync mode, reset as before.
  if (!BATCH_TAILOR) {
    await prisma.jobPosting.updateMany({ where: { profileId, status: "tailoring" }, data: { status: "fetched" } });
  }

  running.set(profileId, opts);
  void loop(profileId).finally(() => running.delete(profileId));
}

/**
 * Is this profile paused by an admin? Wrapped in try/catch so it stays safe even
 * before the `paused` column migration is applied (missing column → not paused).
 * A single cheap indexed read; used at every pipeline start/round/job checkpoint.
 */
export async function isProfilePaused(profileId: string): Promise<boolean> {
  try {
    const p = await prisma.profile.findUnique({ where: { id: profileId }, select: { paused: true } });
    return p?.paused ?? false;
  } catch {
    return false;
  }
}

/**
 * Load a profile's pipeline options (Settings + global model) and start its loop.
 * Shared by the boot resume and the admin resume action. The engine startPipeline
 * still no-ops if the profile is paused.
 */
export async function startProfilePipeline(profileId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { clientId: true } });
  if (!profile) return;
  const { defaultTemplate, skills } = await getSettings(profile.clientId);
  const model = await getGlobalModel();
  await startPipeline(profileId, { templateId: defaultTemplate, model, clientId: profile.clientId, skills });
}

/**
 * Reset a profile's failed jobs that already have a usable JD (description ≥ 200
 * chars) back to "fetched", so the pipeline re-tailors them. These typically
 * failed on the tailor call (e.g. a transient or usage-limit error), not the
 * fetch — the JD is in hand. Returns how many were re-queued. Deliberately invoked
 * ONLY from the explicit admin resume path (not boot/self-heal), so it can't turn
 * a persistently-failing job into an automatic retry loop. Raw UPDATE (no id IN
 * list) so it scales regardless of how many failed.
 */
export async function retryFailedWithJd(profileId: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "JobPosting" SET "status" = 'fetched', "error" = NULL
    WHERE "profileId" = ${profileId} AND "status" = 'failed'
      AND length(json_extract("descriptionParsed", '$.description')) >= 200`;
}

/**
 * On server startup, resume the pipeline for EVERY profile that still has
 * unfinished work (pending / stuck fetching|tailoring / fetched-but-untailored),
 * so a restart auto-continues without each dashboard needing to be opened.
 * startPipeline() resets the stuck statuses before looping. Per-profile errors
 * are swallowed so one bad profile can't block the rest; runs detached. Paused
 * profiles are skipped (both by this query and the startPipeline guard).
 */
export async function resumeAllPipelines(reason: "startup" | "sweep" = "startup"): Promise<number> {
  const rows = await prisma.jobPosting.findMany({
    where: {
      profile: { paused: false },
      createdAt: { gte: activeCutoff() }, // only yesterday+today; older stale work is pruned, not resumed
      OR: [
        { status: "pending" },
        { status: "fetching" },
        { status: "tailoring" },
        { status: "fetched", tailored: { none: {} } },
      ],
    },
    select: { profileId: true },
    distinct: ["profileId"],
  });
  for (const { profileId } of rows) {
    try {
      await startProfilePipeline(profileId);
    } catch (e) {
      console.error(`[pipeline] startup resume failed for profile ${profileId}:`, e instanceof Error ? e.message : e);
    }
  }
  // A sweep that found nothing is the normal case, so stay quiet unless it acted;
  // startup always logs so a boot is traceable.
  if (reason === "startup" || rows.length > 0) {
    console.log(`[pipeline] ${reason} resume: kicked ${rows.length} profile(s) with unfinished work`);
  }
  return rows.length;
}

/** How often the sweep looks for unstarted work. */
const SWEEP_MS = 3 * 60 * 1000;
let sweepStarted = false;

/**
 * Periodically pick up pipeline work nobody has kicked off.
 *
 * Adding job URLs only writes "pending" rows -- it does not start the pipeline.
 * Until this existed the pipeline ran only from a server start or from
 * ensurePipelineRunning, which fires from the dashboard component, so a user who
 * pasted URLs and closed the tab left that work untouched. It then LOOKED like
 * tailoring was broken for that person while everyone with a dashboard open was
 * served normally -- and pruneStaleIncomplete deletes untailored jobs after two
 * app-days, so the abandoned work eventually disappeared rather than running.
 *
 * Safe to run often: startPipeline returns immediately for a profile already
 * running, and paused profiles are excluded by the query and the start guard.
 * Idempotent across HMR / repeated imports, and unref'd so it never holds the
 * process open.
 */
export function startPipelineSchedule(): void {
  if (sweepStarted) return;
  sweepStarted = true;
  const t = setInterval(() => {
    void resumeAllPipelines("sweep").catch((e) =>
      console.error("[pipeline] sweep failed:", e instanceof Error ? e.message : e),
    );
  }, SWEEP_MS);
  (t as { unref?: () => void }).unref?.();
}

// GLOBAL cap on jobs processed at once — shared across ALL profiles, so submitting
// a batch to several profiles no longer multiplies the load (it used to be per
// profile: 3 profiles × 12 = 36 in flight, which saturated the LLM account and
// caused rate-limit timeouts). Tailoring on Anthropic is the rate-limited stage.
//
// Default 20: measured limits leave huge headroom (20 concurrent tailors use only
// ~6% of the Anthropic 2M OTPM budget and a sliver of OpenAI), and a single tailor
// is ~35s, so 20-wide gives ~30 jobs/min. The practical ceiling here is the box
// (RAM/CPU/sockets, and Puppeteer renders which are separately capped), not the API
// — raise this further only while watching box memory + the 429 rate.
// Override with PIPELINE_CONCURRENCY.
const GLOBAL_CONCURRENCY = Math.max(1, Number(process.env.PIPELINE_CONCURRENCY) || 20);
// Fair scheduling across profiles: the GLOBAL_CONCURRENCY slots are shared by
// giving each freed slot to the waiting profile that currently holds the FEWEST
// slots. So a profile that dumps 500 URLs can't starve a profile with 8 — every
// active profile gets a roughly equal share (max-min fairness), while a lone
// profile still uses all the slots (no waste). Keyed on profileId.
const globalLimiter = new FairLimiter(GLOBAL_CONCURRENCY);

// A SECOND, tighter fair limiter around only the Anthropic tailor call — the one
// rate-limited stage. Fetch + jd_skills (both OpenAI) finish fast and then ~15–20
// jobs used to hit Sonnet at once, bursting past the account's per-minute token
// limit; the SDK then sat in 429 back-off (turning a ~30s call into minutes). Cap
// the concurrent tailors so they stay under the tier and each finishes quickly,
// and share those scarce permits fairly across profiles (same fewest-loaded-first
// rule). Start at 3; tune via TAILOR_CONCURRENCY using the rate-limit headers now
// logged in anthropic.ts. This changes only *how many* tailor calls run at once —
// not the model, prompt, or params — so tailoring quality is unchanged.
const TAILOR_CONCURRENCY = Math.max(1, Number(process.env.TAILOR_CONCURRENCY) || 3);
const tailorLimiter = new FairLimiter(TAILOR_CONCURRENCY);

// Route BULK pipeline tailoring through the Anthropic Message Batches API (50% off
// all tokens, byte-identical output) instead of the synchronous per-job path. Off
// by default — the synchronous path is proven; flip TAILOR_BATCH=1 to enable batch
// tailoring once it's live-validated. The interactive "Tailor now" path always
// stays synchronous regardless of this flag.
const BATCH_TAILOR = process.env.TAILOR_BATCH === "1";

async function loop(profileId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { baseResume: { select: { id: true } }, _count: { select: { experiences: true } } },
  });
  const canTailor = !!profile && (!!profile.baseResume || profile._count.experiences > 0);

  const opts = running.get(profileId) ?? {};
  // Batch tailoring goes through the Anthropic Batch API, so it only applies to
  // Claude models — a GPT model would be rejected there. When an OpenAI model is
  // the global choice, always take the synchronous per-job path (which routes to
  // OpenAI in tailorViaProvider), even if TAILOR_BATCH=1.
  const useBatch = BATCH_TAILOR && canTailor && providerForModel(opts.model ?? "") !== "openai";
  // Re-gather between rounds so URLs/pastes added mid-run get picked up. Each
  // round runs its jobs concurrently. Failures move jobs to "failed", so they
  // drop out of the next gather and the loop converges.
  for (let round = 0; round < 50; round++) {
    // Admin pause: stop gathering new work. In-flight jobs from the current round
    // finish their (transactional) fetch/tailor; the per-job check in processJob
    // makes queued-but-not-started jobs bail quickly.
    if (await isProfilePaused(profileId)) break;
    if (useBatch) {
      // Batch mode: fetch pending JDs in real time (OpenAI, cheap), THEN tailor the
      // fetched-untailored jobs together through the Anthropic Batch API — 50% off,
      // byte-identical output. Fetch and tailor are separate phases because a batch
      // can only be submitted once all its JDs are in hand.
      const pending = await prisma.jobPosting.findMany({ where: { profileId, createdAt: { gte: activeCutoff() }, status: "pending" }, select: { id: true }, orderBy: { createdAt: "asc" } });
      if (pending.length) {
        await Promise.all(
          pending.map((j) =>
            globalLimiter
              .withSlot(profileId, () => withUsage({ clientId: opts.clientId ?? null, profileId, jobId: j.id, kind: "fetch" }, () => fetchJobNow(j.id)))
              .catch((e) => console.error(`[pipeline] fetch ${j.id} failed:`, e instanceof Error ? e.message : e)),
          ),
        );
      }
      const toTailor = await prisma.jobPosting.findMany({ where: { profileId, createdAt: { gte: activeCutoff() }, status: "fetched", tailored: { none: {} } }, select: { id: true }, orderBy: { createdAt: "asc" } });
      if (pending.length === 0 && toTailor.length === 0) break;
      if (toTailor.length) await batchTailorJobs(profileId, toTailor.map((j) => j.id));
    } else {
      // Synchronous mode (default, proven): fetch + tailor each job in one pass.
      const cutoff = activeCutoff(); // only process yesterday+today; older stale work is pruned
      const where = canTailor
        ? { profileId, createdAt: { gte: cutoff }, OR: [{ status: "pending" }, { status: "fetched", tailored: { none: {} } }] }
        : { profileId, createdAt: { gte: cutoff }, status: "pending" };
      const jobs = await prisma.jobPosting.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" } });
      if (jobs.length === 0) break;
      // Every job goes through the shared global slot, so all profiles' loops
      // together never exceed GLOBAL_CONCURRENCY. A per-job error (e.g. the row was
      // deleted mid-flight → P2025) is swallowed so it never crashes the loop.
      await Promise.all(
        jobs.map((j) =>
          globalLimiter.withSlot(profileId, () => processJob(profileId, j.id, canTailor)).catch((e) => {
            console.error(`[pipeline] job ${j.id} failed:`, e instanceof Error ? e.message : e);
          }),
        ),
      );
    }
  }
}

/** One job's full chain: fetch (if needed) then tailor (if possible). */
async function processJob(profileId: string, jobId: string, canTailor: boolean): Promise<void> {
  // Admin pause: a job queued into globalLimiter before the pause bails here
  // without spending a fetch/tailor (leaving its status untouched for resume).
  if (await isProfilePaused(profileId)) return;
  const opts = running.get(profileId) ?? {};
  // Attribute every LLM call in this job's chain to the client/profile/job for the
  // admin usage analytics. Sub-calls re-tag the kind (fetch / jd_skills / tailor).
  return withUsage({ clientId: opts.clientId ?? null, profileId, jobId, kind: "tailor" }, async () => {
    const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job) return;
    if (job.status === "pending") {
      const ok = await fetchJobNow(jobId);
      if (!ok) return;
    }
    if (canTailor) {
      await tailorJobNow(jobId, opts);
    }
  });
}

async function fetchJobNow(jobId: string): Promise<boolean> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job?.url) {
    await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "failed", error: "No URL on this job." } });
    return false;
  }
  await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "fetching" } });
  const ts = Date.now();
  // Render the first page with headless Chrome as the fallback (JS-rendered boards
  // build the JD client-side, so it never appears in the static HTML). Bounded by
  // MAX_RENDERS in lib/export/pdf.ts so a wide batch never overloads the box; fast
  // paths (JSON-LD / ATS API) return first and never render.
  const fetched = await findJobDescription(job.url, { render: true });
  const scrapeMs = Date.now() - ts;
  if (!fetched.ok) {
    await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "failed", error: fetched.error } });
    return false;
  }
  try {
    const te = Date.now();
    const fields = await withKind("fetch", () => extractJobFields(fetched.text));

    const desc = (fields.description ?? "").trim();
    const company = fields.company?.trim() || "";
    const role = fields.role?.trim() || "";

    // We reached the page but there isn't enough of a JD to tailor on (a JS-gated
    // board, an apply-only form, or a heavy SPA that never rendered the JD). Keep
    // it as "needs_jd" — shown as "Fetched" with a Paste JD button — instead of
    // failing, and DON'T auto-tailor a junk resume off an empty JD. A genuinely
    // unreachable page already failed above (findJobDescription ok:false). Store
    // whatever company/role we could read (possibly empty) so the row is
    // identifiable while the user pastes the JD.
    if (desc.length < 200) {
      await prisma.jobPosting.update({
        where: { id: jobId },
        data: {
          company: company || null,
          role: role || null,
          location: fields.location || null,
          workplace: fields.workplace || null,
          descriptionRaw: null,
          descriptionParsed: { description: "", requirements: fields.requirements ?? [], atsSkills: null },
          status: "needs_jd",
          error: null,
        },
      });
      return false; // don't tailor — waits for a pasted JD
    }

    if (process.env.LLM_DEBUG) console.log(`[pipeline] fetch job ${jobId} scrape=${scrapeMs}ms extract=${Date.now() - te}ms`);

    // Only fully-remote roles are worth tailoring. The classification already
    // happened during extraction above, so this costs nothing extra — it just
    // stops the (paid, ~1 minute) tailor call from running on a job that will not
    // be applied to. "skipped" is terminal: the queue gathers "fetched" rows with
    // no tailored resume, so a skipped job is never re-picked on later rounds or
    // after a restart. The JD is still stored, so the row stays searchable and can
    // be tailored by hand from the dashboard if the classification was wrong.
    // Blacklist, second pass: the company NAME the model read off the posting.
    // This is what makes an entry written as the real company catch a board whose
    // URL slug differs (Lever "nextgenfed" vs "NextGen Federal"), and covers the
    // boards that carry no company in the URL at all. Terminal, like "skipped".
    const blacklisted = matchBlacklist(fields.company, await getCompanyBlacklist());
    if (blacklisted) {
      await prisma.jobPosting.update({
        where: { id: jobId },
        data: {
          company: fields.company,
          role: fields.role,
          location: fields.location,
          workplace: fields.workplace,
          descriptionRaw: fetched.text.slice(0, 20000),
          descriptionParsed: { description: fields.description, requirements: fields.requirements, atsSkills: null },
          status: "excluded",
          error: `Blacklisted company: ${blacklisted.label}`,
        },
      });
      return false;
    }

    const tailorable = shouldTailorWorkplace(fields.workplace);

    // Show the fetched fields ASAP and move on to tailoring. The ATS keyword list
    // is extracted lazily by the tailor (tailorJobNow handles a null atsSkills),
    // so it stays off the fetch critical path.
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        workplace: fields.workplace,
        descriptionRaw: fetched.text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements, atsSkills: null },
        status: tailorable ? "fetched" : "skipped",
        error: null,
      },
    });
    return tailorable;
  } catch (e) {
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: { status: "failed", error: `Extraction failed: ${(e as Error).message}` },
    });
    return false;
  }
}

/**
 * Mark a job as deliberately not tailored. Terminal: the queue gathers "fetched"
 * rows with no tailored resume, so a skipped job is never picked up again — not on
 * a later round, not by the startup resume.
 */
async function markSkipped(jobId: string): Promise<void> {
  await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "skipped", error: null } });
}

async function tailorJobNow(jobId: string, opts: PipelineOpts): Promise<boolean> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return false;

  // The remote-only rule is enforced HERE as well as at fetch time, because this
  // is where the money is spent. A job fetched before the rule existed still sits
  // in "fetched" with its mode already classified, and the queue gathers on status
  // alone — without this check that backlog is tailored regardless of mode.
  if (!shouldTailorWorkplace(job.workplace)) {
    await markSkipped(jobId);
    return false;
  }

  // Same reasoning for the blacklist: a job fetched before a company was added to
  // the list still sits in "fetched", and the queue gathers on status alone.
  const blocked = matchBlacklist(job.company, await getCompanyBlacklist());
  if (blocked) {
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: { status: "excluded", error: `Blacklisted company: ${blocked.label}` },
    });
    return false;
  }

  const profile = await prisma.profile.findUnique({ where: { id: job.profileId }, include: llmProfileInclude });
  if (!profile) return false;

  const mode: "with_base" | "from_scratch" = profile.baseResume ? "with_base" : "from_scratch";
  if (mode === "from_scratch" && profile.experiences.length === 0) return false;

  await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "tailoring" } });
  const parsed = (job.descriptionParsed as { description?: string; requirements?: string[]; atsSkills?: JdSkills | null }) ?? {};
  const jobFields: JobForLLM = {
    company: job.company,
    role: job.role,
    location: job.location,
    description: parsed.description ?? job.descriptionRaw ?? "",
    requirements: parsed.requirements ?? [],
  };

  try {
    const profileForLLM = toProfileForLLM(profile);
    const customInstructions = opts.clientId ? await getCustomInstructions(opts.clientId) : "";
    const t0 = Date.now();
    // Use the ATS skills extracted+stored at fetch time so the tailor covers
    // exactly what it's scored on. Only reuse them if they're the current
    // {hardSkills, themes} shape; older jobs stored {mustHave, preferred} (or
    // nothing) — re-extract those so they get the new categorization.
    const stored = parsed.atsSkills && Array.isArray(parsed.atsSkills.hardSkills) ? parsed.atsSkills : null;
    const skills = stored ?? (await withKind("jd_skills", () => extractJdSkills(jobFields)).catch(() => null));
    // Only the Anthropic tailor call goes through the tailor limiter (fetch +
    // jd_skills above are OpenAI and stay outside it). Keyed on profileId so the
    // scarce tailor permits are shared fairly across profiles.
    const content = await tailorLimiter.withSlot(job.profileId, () =>
      tailorResume({
        mode,
        profile: profileForLLM,
        job: jobFields,
        baseResume: profile.baseResume?.rawText,
        instructions: opts.instructions,
        customInstructions,
        model: opts.model,
        atsSkills: skills,
        skills: opts.skills,
      }),
    );
    const beforeText = profile.baseResume?.rawText || profileToText(profileForLLM);
    const fit = scoreFit(skills, jobFields.role ?? "", beforeText, content);
    if (process.env.LLM_DEBUG) console.log(`[pipeline] tailor+ats job ${jobId} ${Date.now() - t0}ms`);
    await prisma.$transaction(async (tx) => {
      await tx.tailoredResume.deleteMany({ where: { jobPostingId: jobId } });
      await tx.tailoredResume.create({
        data: {
          profileId: job.profileId,
          jobPostingId: jobId,
          templateId: opts.templateId ?? "modern",
          mode,
          instructions: opts.instructions || null,
          content,
          fitBefore: fit.fitBefore,
          fitAfter: fit.fitAfter,
          fitDetail: fit.fitDetail as object,
        },
      });
      await tx.jobPosting.update({
        where: { id: jobId },
        // Persist freshly-extracted ATS skills back onto the job so a re-tailor or
        // retry reuses them (the `stored ??` branch above) instead of re-running
        // jd_skills every time. Only when we just extracted them (stored was null).
        data: {
          status: "fetched",
          error: null,
          ...(stored == null && skills ? { descriptionParsed: { ...parsed, atsSkills: skills } as object } : {}),
        },
      });
    });
    return true;
  } catch (e) {
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: { status: "failed", error: `Tailor failed: ${(e as Error).message}` },
    });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch tailoring (Anthropic Message Batches API) — opt-in via TAILOR_BATCH=1.
// Same request as the synchronous path (buildTailorParams → byte-identical
// output), submitted in bulk for 50% off all tokens. Three stages: prepare (build
// the request, mark "tailoring", persist skills) → submit + poll → apply (persist
// the result). applyTailorResult re-derives everything from the DB, so it also
// finishes batches recovered after a restart.
// ─────────────────────────────────────────────────────────────────────────────

/** Build one job's batch tailor request: mark it "tailoring", (re)extract + PERSIST
 *  its ATS skills (so apply-time scoreFit uses exactly the skills the tailor saw),
 *  and return the TailorArgs. Returns null if the job can't be tailored. */
async function prepareTailor(jobId: string, opts: PipelineOpts): Promise<TailorArgs | null> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return null;

  // Same remote-only rule as the synchronous path. Checked before the ATS-skills
  // extraction below, which is itself a paid call.
  if (!shouldTailorWorkplace(job.workplace)) {
    await markSkipped(jobId);
    return null;
  }

  const profile = await prisma.profile.findUnique({ where: { id: job.profileId }, include: llmProfileInclude });
  if (!profile) return null;
  const mode: "with_base" | "from_scratch" = profile.baseResume ? "with_base" : "from_scratch";
  if (mode === "from_scratch" && profile.experiences.length === 0) return null;

  const parsed = (job.descriptionParsed as { description?: string; requirements?: string[]; atsSkills?: JdSkills | null }) ?? {};
  const jobFields: JobForLLM = {
    company: job.company,
    role: job.role,
    location: job.location,
    description: parsed.description ?? job.descriptionRaw ?? "",
    requirements: parsed.requirements ?? [],
  };
  const stored = parsed.atsSkills && Array.isArray(parsed.atsSkills.hardSkills) ? parsed.atsSkills : null;
  const skills = stored ?? (await withKind("jd_skills", () => extractJdSkills(jobFields)).catch(() => null));
  const customInstructions = opts.clientId ? await getCustomInstructions(opts.clientId) : "";
  // Mark in-flight AND persist freshly-extracted skills now: the batch result is
  // applied later (possibly after a restart), and applyTailorResult re-reads
  // atsSkills from the job to score against exactly what the tailor was given.
  await prisma.jobPosting.update({
    where: { id: jobId },
    data: {
      status: "tailoring",
      ...(stored == null && skills ? { descriptionParsed: { ...parsed, atsSkills: skills } as object } : {}),
    },
  });
  return {
    mode,
    profile: toProfileForLLM(profile),
    job: jobFields,
    baseResume: profile.baseResume?.rawText,
    instructions: opts.instructions,
    customInstructions,
    model: opts.model,
    atsSkills: skills,
    skills: opts.skills,
  };
}

/** Persist a completed batched tailor. Self-contained (re-derives profile, skills,
 *  and template from the DB) so it also applies batches recovered after a restart. */
async function applyTailorResult(jobId: string, content: ResumeContent, usage?: BatchUsage): Promise<void> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return;
  const profile = await prisma.profile.findUnique({ where: { id: job.profileId }, include: llmProfileInclude });
  if (!profile) return;
  const parsed = (job.descriptionParsed as { description?: string; requirements?: string[]; atsSkills?: JdSkills | null }) ?? {};
  const skills = parsed.atsSkills && Array.isArray(parsed.atsSkills.hardSkills) ? parsed.atsSkills : null;
  const jobFields: JobForLLM = {
    company: job.company,
    role: job.role,
    location: job.location,
    description: parsed.description ?? job.descriptionRaw ?? "",
    requirements: parsed.requirements ?? [],
  };
  const profileForLLM = toProfileForLLM(profile);
  const beforeText = profile.baseResume?.rawText || profileToText(profileForLLM);
  const fit = scoreFit(skills, jobFields.role ?? "", beforeText, content);
  const mode: "with_base" | "from_scratch" = profile.baseResume ? "with_base" : "from_scratch";
  const { defaultTemplate } = await getSettings(profile.clientId);
  // Attribute the batched tailor's tokens (billed at half rate) for cost analytics.
  if (usage) {
    void withUsage({ clientId: profile.clientId, profileId: job.profileId, jobId, kind: "batch_tailor" }, async () =>
      recordUsage({ provider: "anthropic", model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ms: 0, kind: "batch_tailor" }),
    );
  }
  // Bulk pipeline carries no per-job instructions; template comes from Settings
  // (identical to the sync path's opts.templateId, which is that same setting).
  await prisma.$transaction(async (tx) => {
    await tx.tailoredResume.deleteMany({ where: { jobPostingId: jobId } });
    await tx.tailoredResume.create({
      data: {
        profileId: job.profileId,
        jobPostingId: jobId,
        templateId: defaultTemplate ?? "modern",
        mode,
        instructions: null,
        content,
        fitBefore: fit.fitBefore,
        fitAfter: fit.fitAfter,
        fitDetail: fit.fitDetail as object,
      },
    });
    await tx.jobPosting.update({ where: { id: jobId }, data: { status: "fetched", error: null } });
  });
}

async function markTailorFailed(jobId: string, error: string): Promise<void> {
  await prisma.jobPosting
    .update({ where: { id: jobId }, data: { status: "failed", error: `Tailor failed: ${error}` } })
    .catch(() => {});
}

/** Prepare a set of fetched jobs, submit them as Message Batch(es), poll to
 *  completion, and persist each result. Returns the number successfully tailored. */
async function batchTailorJobs(profileId: string, jobIds: string[]): Promise<number> {
  const opts = running.get(profileId) ?? {};
  // Prepare concurrently (each runs an OpenAI jd_skills extract), gated by the
  // shared global slot; wrap in a usage context so those extracts are attributed.
  const prepared = await Promise.all(
    jobIds.map((jobId) =>
      globalLimiter.withSlot(profileId, async () => {
        const args = await withUsage({ clientId: opts.clientId ?? null, profileId, jobId, kind: "tailor" }, () => prepareTailor(jobId, opts)).catch((e) => {
          console.error(`[pipeline] prepare ${jobId} failed:`, e instanceof Error ? e.message : e);
          return null;
        });
        return args ? ({ jobId, args } as TailorBatchRequest) : null;
      }),
    ),
  );
  const requests = prepared.filter((r): r is TailorBatchRequest => r != null);
  if (!requests.length) return 0;

  let tailored = 0;
  // Chunk defensively (Anthropic caps 100k requests / 256MB per batch; our
  // per-profile batches are ~150, far below — but keep chunks bounded).
  const CHUNK = 1000;
  for (let i = 0; i < requests.length; i += CHUNK) {
    const chunk = requests.slice(i, i + CHUNK);
    let batchId: string;
    try {
      batchId = await createTailorBatch(chunk);
    } catch (e) {
      console.error(`[pipeline] batch submit failed:`, e instanceof Error ? e.message : e);
      for (const r of chunk) await markTailorFailed(r.jobId, "batch submit failed");
      continue;
    }
    console.log(`[pipeline] batch ${batchId}: submitted ${chunk.length} tailors`);
    const ended = await waitForBatch(batchId);
    if (!ended) {
      console.error(`[pipeline] batch ${batchId} did not finish within the poll window; leaving jobs "tailoring" for restart recovery`);
      continue;
    }
    for (const res of await collectTailorResults(batchId)) {
      if (res.ok) {
        await applyTailorResult(res.jobId, res.content, res.usage).catch((e) => console.error(`[pipeline] apply ${res.jobId} failed:`, e instanceof Error ? e.message : e));
        tailored++;
      } else {
        await markTailorFailed(res.jobId, res.error);
      }
    }
    console.log(`[pipeline] batch ${batchId}: applied (${tailored}/${requests.length} tailored so far)`);
  }
  return tailored;
}

/** Restart recovery: re-attach any still-open batches and finish them, so a server
 *  restart mid-batch doesn't leave jobs stuck "tailoring" (Anthropic keeps results
 *  29 days). Runs detached; called on boot from instrumentation.ts. */
export async function resumeOpenBatches(): Promise<void> {
  if (!BATCH_TAILOR) return;
  let ids: string[];
  try {
    ids = await listOpenBatchIds();
  } catch (e) {
    console.error("[pipeline] listOpenBatchIds failed:", e instanceof Error ? e.message : e);
    return;
  }
  if (!ids.length) return;
  console.log(`[pipeline] re-attaching ${ids.length} open batch(es) after restart`);
  for (const batchId of ids) {
    void (async () => {
      if (!(await waitForBatch(batchId))) return;
      for (const res of await collectTailorResults(batchId)) {
        if (res.ok) await applyTailorResult(res.jobId, res.content, res.usage).catch(() => {});
        else await markTailorFailed(res.jobId, res.error);
      }
      console.log(`[pipeline] recovered batch ${batchId}`);
    })().catch((e) => console.error(`[pipeline] resume batch ${batchId} failed:`, e instanceof Error ? e.message : e));
  }
}
