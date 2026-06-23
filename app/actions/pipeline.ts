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
