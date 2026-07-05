import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { extractJobFields, tailorResume } from "@/lib/llm/service";
import { llmProfileInclude, toProfileForLLM } from "@/lib/profile-data";
import { extractJdSkills, scoreFit, profileToText, type JdSkills } from "@/lib/llm/ats";
import { getCustomInstructions, type SkillsConfig } from "@/lib/settings";
import { pruneOldActivity } from "@/lib/retention";
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
  // Already running: just refresh options. The running loop re-gathers between
  // rounds, so any newly-pending (e.g. retried) job gets picked up on its own.
  // Crucially, do NOT touch in-flight ("fetching"/"tailoring") jobs here, or a
  // mid-run kick would reset live work.
  if (running.has(profileId)) {
    running.set(profileId, opts);
    return;
  }

  // Retention: prune activity older than the 30-day window. Fire-and-forget so a
  // fresh pipeline run keeps the database bounded without blocking processing.
  void pruneOldActivity().catch(() => {});

  // Fresh start: recover any states left mid-flight by a previous interrupted run.
  await prisma.jobPosting.updateMany({ where: { profileId, status: "fetching" }, data: { status: "pending" } });
  await prisma.jobPosting.updateMany({ where: { profileId, status: "tailoring" }, data: { status: "fetched" } });

  running.set(profileId, opts);
  void loop(profileId).finally(() => running.delete(profileId));
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
let activeJobs = 0;
const jobWaiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeJobs >= GLOBAL_CONCURRENCY) await new Promise<void>((resolve) => jobWaiters.push(resolve));
  activeJobs++;
  try {
    return await fn();
  } finally {
    activeJobs--;
    jobWaiters.shift()?.();
  }
}

// Jobs whose NEXT fetch should try the (slow) headless-Chrome render — set only on
// a manual retry, so batch runs stay fast and un-fetchable JS pages fail quickly.
const renderHints = new Set<string>();
export function markRenderRetry(jobId: string): void {
  renderHints.add(jobId);
}

async function loop(profileId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: { baseResume: { select: { id: true } }, _count: { select: { experiences: true } } },
  });
  const canTailor = !!profile && (!!profile.baseResume || profile._count.experiences > 0);

  // Re-gather between rounds so URLs/pastes added mid-run get picked up. Each
  // round runs its jobs concurrently. Failures move jobs to "failed", so they
  // drop out of the next gather and the loop converges.
  for (let round = 0; round < 50; round++) {
    const where = canTailor
      ? { profileId, OR: [{ status: "pending" }, { status: "fetched", tailored: { none: {} } }] }
      : { profileId, status: "pending" };
    const jobs = await prisma.jobPosting.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (jobs.length === 0) break;
    // Every job goes through the shared global slot, so all profiles' loops
    // together never exceed GLOBAL_CONCURRENCY. A per-job error (e.g. the row was
    // deleted mid-flight → P2025) is swallowed so it never crashes the loop.
    await Promise.all(
      jobs.map((j) =>
        withSlot(() => processJob(profileId, j.id, canTailor)).catch((e) => {
          console.error(`[pipeline] job ${j.id} failed:`, e instanceof Error ? e.message : e);
        }),
      ),
    );
  }
}

/** One job's full chain: fetch (if needed) then tailor (if possible). */
async function processJob(profileId: string, jobId: string, canTailor: boolean): Promise<void> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job) return;
  if (job.status === "pending") {
    const ok = await fetchJobNow(jobId);
    if (!ok) return;
  }
  if (canTailor) {
    await tailorJobNow(jobId, running.get(profileId) ?? {});
  }
}

async function fetchJobNow(jobId: string): Promise<boolean> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job?.url) {
    await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "failed", error: "No URL on this job." } });
    return false;
  }
  await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "fetching" } });
  const ts = Date.now();
  // Only attempt the slow headless-Chrome render fallback when this job was just
  // retried (`renderHints`); batch fetches skip it so they stay fast.
  const render = renderHints.delete(jobId);
  const fetched = await findJobDescription(job.url, { render });
  const scrapeMs = Date.now() - ts;
  if (!fetched.ok) {
    await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "failed", error: fetched.error } });
    return false;
  }
  try {
    const te = Date.now();
    const fields = await extractJobFields(fetched.text);

    // Guard: a stub / login-gated / JS-rendered page yields empty fields. Don't
    // mark it "fetched" and tailor a junk resume off no real JD — fail it so the
    // user can paste the description instead.
    const desc = (fields.description ?? "").trim();
    if (!fields.company?.trim() || !fields.role?.trim() || desc.length < 200) {
      await prisma.jobPosting.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: "Couldn't read the job description on that page (it may be login-gated or JavaScript-rendered). Paste it instead.",
        },
      });
      return false;
    }

    if (process.env.LLM_DEBUG) console.log(`[pipeline] fetch job ${jobId} scrape=${scrapeMs}ms extract=${Date.now() - te}ms`);

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
        status: "fetched",
        error: null,
      },
    });
    return true;
  } catch (e) {
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: { status: "failed", error: `Extraction failed: ${(e as Error).message}` },
    });
    return false;
  }
}

async function tailorJobNow(jobId: string, opts: PipelineOpts): Promise<boolean> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return false;
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
    const skills = stored ?? (await extractJdSkills(jobFields).catch(() => null));
    const content = await tailorResume({
      mode,
      profile: profileForLLM,
      job: jobFields,
      baseResume: profile.baseResume?.rawText,
      instructions: opts.instructions,
      customInstructions,
      model: opts.model,
      atsSkills: skills,
      skills: opts.skills,
    });
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
      await tx.jobPosting.update({ where: { id: jobId }, data: { status: "fetched", error: null } });
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
