"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { requireClient } from "@/lib/auth";
import { assertOwnsProfile, assertOwnsJob } from "@/lib/owner";
import { startPipeline as start, isPipelineRunning } from "@/lib/pipeline";
import { normalizeUrl } from "@/lib/url";

/**
 * Start the background fetch+tailor pipeline. Template/model/instructions come
 * from the client's Settings; the clientId is captured here at the request entry
 * and threaded into the (detached, cookieless) pipeline loop.
 */
export async function startPipeline(profileId: string): Promise<{ ok: true }> {
  const clientId = await assertOwnsProfile(profileId);
  const { defaultTemplate, tailoringModel, skills } = await getSettings(clientId);
  await start(profileId, { templateId: defaultTemplate, model: tailoringModel, clientId, skills });
  return { ok: true };
}

/** Lightweight poll: is the pipeline still working for this profile? */
export async function pipelineRunning(profileId: string): Promise<boolean> {
  await requireClient();
  return isPipelineRunning(profileId);
}

export type LiveJob = {
  id: string;
  status: string;
  company: string | null;
  role: string | null;
  location: string | null;
  workplace: string | null;
  error: string | null;
  tailoredId: string | null;
  fitAfter: number | null;
};

/**
 * Cheap per-job snapshot for live progress — scoped to the rows the dashboard is
 * showing (`jobIds`), so the query stays small (avoids the libSQL IN-parameter
 * limit) and light over a tunnel. Carries the fetched fields + tailored info so a
 * job shows its company/role/location the moment it's fetched and flips through
 * fetching → tailoring → done. Two scalar queries joined in memory (no relation
 * load, so no P2029).
 */
export async function jobStatuses(profileId: string, jobIds: string[]): Promise<{ running: boolean; jobs: LiveJob[] }> {
  await assertOwnsProfile(profileId);
  const ids = (jobIds ?? []).slice(0, 400);
  if (ids.length === 0) return { running: isPipelineRunning(profileId), jobs: [] };
  const [jobs, tailored] = await Promise.all([
    prisma.jobPosting.findMany({
      where: { profileId, id: { in: ids } },
      select: { id: true, status: true, company: true, role: true, location: true, workplace: true, error: true },
    }),
    prisma.tailoredResume.findMany({
      where: { profileId, jobPostingId: { in: ids } },
      select: { id: true, jobPostingId: true, fitAfter: true },
    }),
  ]);
  const tmap = new Map(
    tailored.filter((t) => t.jobPostingId).map((t) => [t.jobPostingId as string, { id: t.id, fitAfter: t.fitAfter }]),
  );
  return {
    running: isPipelineRunning(profileId),
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      company: j.company,
      role: j.role,
      location: j.location,
      workplace: j.workplace,
      error: j.error,
      tailoredId: tmap.get(j.id)?.id ?? null,
      fitAfter: tmap.get(j.id)?.fitAfter ?? null,
    })),
  };
}

/**
 * Self-heal: if the pipeline isn't running but there's unfinished work — jobs
 * still pending, or stuck in fetching/tailoring after a server restart, or
 * fetched but not yet tailored — (re)start it. start() resets the stuck statuses
 * before looping, so a frozen run resumes just by loading the dashboard.
 */
export async function ensurePipelineRunning(profileId: string): Promise<{ running: boolean }> {
  const clientId = await assertOwnsProfile(profileId);
  if (isPipelineRunning(profileId)) return { running: true };

  const work = await prisma.jobPosting.count({
    where: {
      profileId,
      OR: [
        { status: "pending" },
        { status: "fetching" },
        { status: "tailoring" },
        { status: "fetched", tailored: { none: {} } },
      ],
    },
  });
  if (work === 0) return { running: false };

  const { defaultTemplate, tailoringModel, skills } = await getSettings(clientId);
  await start(profileId, { templateId: defaultTemplate, model: tailoringModel, clientId, skills });
  return { running: true };
}

/** Re-queue a failed job for another fetch+tailor pass. */
export async function retryJob(jobId: string): Promise<void> {
  const clientId = await assertOwnsJob(jobId);
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { profileId: true, descriptionParsed: true } });
  if (!job) return;
  // Retry from "fetched" (re-tailor only) when the job already has a usable fetched
  // JD, so we don't re-pay the scrape + fetch-extract + jd_skills; fall back to
  // "pending" (full re-fetch) when there's no real JD to work from.
  const desc = (job.descriptionParsed as { description?: string } | null)?.description ?? "";
  const status = desc.length >= 200 ? "fetched" : "pending";
  await prisma.jobPosting.updateMany({
    where: { id: jobId, profile: { clientId } },
    data: { status, error: null },
  });
  revalidatePath(`/profiles/${job.profileId}/dashboard`);
}

/**
 * Bulk re-fetch: re-queue the selected jobs for another fetch+tailor pass. Also
 * REPAIRS a mangled URL (e.g. a pasted "Company<TAB>Role<TAB>URL" row that got
 * jammed together) by extracting the real URL, so a retry actually succeeds
 * instead of failing on the same broken URL. The dashboard kicks the pipeline
 * after this resolves.
 */
export async function retryJobs(jobIds: string[]): Promise<{ retried: number }> {
  const { id: clientId } = await requireClient();
  const ids = [...new Set(jobIds ?? [])].slice(0, 500);
  if (!ids.length) return { retried: 0 };
  const jobs = await prisma.jobPosting.findMany({
    where: { id: { in: ids }, profile: { clientId } },
    select: { id: true, url: true, profileId: true, descriptionParsed: true },
  });
  for (const j of jobs) {
    const fixed = j.url ? normalizeUrl(j.url) : null; // repair a mangled URL if we can
    const repaired = !!(fixed && fixed !== j.url);
    // Re-tailor only (from "fetched") when the JD is already fetched and the URL
    // wasn't repaired; otherwise re-fetch from "pending" (a repaired URL must be
    // re-scraped). Saves the scrape + OpenAI extracts when only the tailor failed.
    const desc = (j.descriptionParsed as { description?: string } | null)?.description ?? "";
    const status = !repaired && desc.length >= 200 ? "fetched" : "pending";
    await prisma.jobPosting.update({
      where: { id: j.id },
      data: { status, error: null, ...(repaired ? { url: fixed! } : {}) },
    });
  }
  for (const pid of new Set(jobs.map((j) => j.profileId))) revalidatePath(`/profiles/${pid}/dashboard`);
  return { retried: jobs.length };
}
