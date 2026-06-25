import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { extractJobFields, tailorResume } from "@/lib/llm/service";
import { profileInclude, toProfileForLLM } from "@/lib/profile-data";
import { extractJdSkills, scoreFit, profileToText, type JdSkills } from "@/lib/llm/ats";
import { getCustomInstructions } from "@/lib/settings";
import type { JobForLLM } from "@/lib/llm/prompts";

// clientId is captured at the request-context action entry (startPipeline) and
// threaded here because the loop runs detached (no cookies).
export type PipelineOpts = { templateId?: string; model?: string; instructions?: string; clientId?: string };

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

  // Fresh start: recover any states left mid-flight by a previous interrupted run.
  await prisma.jobPosting.updateMany({ where: { profileId, status: "fetching" }, data: { status: "pending" } });
  await prisma.jobPosting.updateMany({ where: { profileId, status: "tailoring" }, data: { status: "fetched" } });

  running.set(profileId, opts);
  void loop(profileId).finally(() => running.delete(profileId));
}

// Max jobs processed at once. Each runs its full fetch→tailor chain in parallel.
// Tailoring is the rate-limited stage; when both Anthropic and OpenRouter keys
// are set, tailor calls are load-balanced across the two pools, so we can run
// more in parallel. Override with PIPELINE_CONCURRENCY.
const TWO_TAILOR_POOLS = !!process.env.ANTHROPIC_API_KEY && !!process.env.OPENROUTER_API_KEY;
const CONCURRENCY = Math.max(1, Number(process.env.PIPELINE_CONCURRENCY) || (TWO_TAILOR_POOLS ? 12 : 7));

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
    await runBounded(
      jobs.map((j) => () => processJob(profileId, j.id, canTailor)),
      CONCURRENCY,
    );
  }
}

/** Run thunks with at most `limit` in flight at once. */
async function runBounded(thunks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < thunks.length) {
      const idx = next++;
      await thunks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
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
  const fetched = await findJobDescription(job.url);
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

    // Extract the ATS keyword list now and store it, so the tailor can be handed
    // the exact list it will be graded on (see tailorJobNow).
    const jobForSkills: JobForLLM = {
      company: fields.company,
      role: fields.role,
      location: fields.location,
      description: fields.description,
      requirements: fields.requirements,
    };
    const atsSkills = await extractJdSkills(jobForSkills).catch(() => null);
    if (process.env.LLM_DEBUG) console.log(`[pipeline] fetch job ${jobId} scrape=${scrapeMs}ms extract+skills=${Date.now() - te}ms`);

    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        workplace: fields.workplace,
        descriptionRaw: fetched.text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements, atsSkills },
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
  const profile = await prisma.profile.findUnique({ where: { id: job.profileId }, include: profileInclude });
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
    // exactly what it's scored on; fall back to extracting now for older jobs.
    const skills = parsed.atsSkills ?? (await extractJdSkills(jobFields).catch(() => null));
    const content = await tailorResume({
      mode,
      profile: profileForLLM,
      job: jobFields,
      baseResume: profile.baseResume?.rawText,
      instructions: opts.instructions,
      customInstructions,
      model: opts.model,
      atsSkills: skills,
    });
    const beforeText = profile.baseResume?.rawText || profileToText(profileForLLM);
    const fit = scoreFit(skills, beforeText, content);
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
