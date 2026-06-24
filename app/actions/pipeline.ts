"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { requireClient } from "@/lib/auth";
import { assertOwnsProfile, assertOwnsJob } from "@/lib/owner";
import { startPipeline as start, isPipelineRunning } from "@/lib/pipeline";

/**
 * Start the background fetch+tailor pipeline. Template/model/instructions come
 * from the client's Settings; the clientId is captured here at the request entry
 * and threaded into the (detached, cookieless) pipeline loop.
 */
export async function startPipeline(profileId: string): Promise<{ ok: true }> {
  const clientId = await assertOwnsProfile(profileId);
  const { defaultTemplate, tailoringModel } = await getSettings(clientId);
  await start(profileId, { templateId: defaultTemplate, model: tailoringModel, clientId });
  return { ok: true };
}

/** Lightweight poll: is the pipeline still working for this profile? */
export async function pipelineRunning(profileId: string): Promise<boolean> {
  await requireClient();
  return isPipelineRunning(profileId);
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

  const { defaultTemplate, tailoringModel } = await getSettings(clientId);
  await start(profileId, { templateId: defaultTemplate, model: tailoringModel, clientId });
  return { running: true };
}

/** Re-queue a failed job for another fetch+tailor pass. */
export async function retryJob(jobId: string): Promise<void> {
  const clientId = await assertOwnsJob(jobId);
  await prisma.jobPosting.updateMany({
    where: { id: jobId, profile: { clientId } },
    data: { status: "pending", error: null },
  });
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { profileId: true } });
  if (job) revalidatePath(`/profiles/${job.profileId}/dashboard`);
}
