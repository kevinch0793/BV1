import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { extractJobFields, tailorResume } from "@/lib/llm/service";
import { llmProfileInclude, toProfileForLLM } from "@/lib/profile-data";
import { extractJdSkills, scoreFit, profileToText, type JdSkills } from "@/lib/llm/ats";
import { getCustomInstructions, getSettings, type SkillsConfig } from "@/lib/settings";
import { pruneOldActivity } from "@/lib/retention";
import { withUsage, withKind } from "@/lib/llm/usage";
import { FairLimiter } from "@/lib/fairLimiter";
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

/**
 * On server startup, resume the pipeline for EVERY profile that still has
 * unfinished work (pending / stuck fetching|tailoring / fetched-but-untailored),
 * so a restart auto-continues without each dashboard needing to be opened.
 * startPipeline() resets the stuck statuses before looping. Per-profile errors
 * are swallowed so one bad profile can't block the rest; runs detached.
 */
export async function resumeAllPipelines(): Promise<void> {
  const rows = await prisma.jobPosting.findMany({
    where: {
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
      const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { clientId: true } });
      if (!profile) continue;
      const { defaultTemplate, tailoringModel, skills } = await getSettings(profile.clientId);
      await startPipeline(profileId, { templateId: defaultTemplate, model: tailoringModel, clientId: profile.clientId, skills });
    } catch (e) {
      console.error(`[pipeline] startup resume failed for profile ${profileId}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[pipeline] startup resume: kicked ${rows.length} profile(s) with unfinished work`);
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
        globalLimiter.withSlot(profileId, () => processJob(profileId, j.id, canTailor)).catch((e) => {
          console.error(`[pipeline] job ${j.id} failed:`, e instanceof Error ? e.message : e);
        }),
      ),
    );
  }
}

/** One job's full chain: fetch (if needed) then tailor (if possible). */
async function processJob(profileId: string, jobId: string, canTailor: boolean): Promise<void> {
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
