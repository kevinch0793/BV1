"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { startPipeline as start, isPipelineRunning } from "@/lib/pipeline";

/**
 * Start the background fetch+tailor pipeline. Template + model come from global
 * Settings (custom instructions are applied inside tailoring), so the dashboard
 * no longer carries per-run options.
 */
export async function startPipeline(profileId: string): Promise<{ ok: true }> {
  const { defaultTemplate, tailoringModel } = await getSettings();
  await start(profileId, { templateId: defaultTemplate, model: tailoringModel });
  return { ok: true };
}

/** Lightweight poll: is the pipeline still working for this profile? */
export async function pipelineRunning(profileId: string): Promise<boolean> {
  return isPipelineRunning(profileId);
}

/** Re-queue a failed job for another fetch+tailor pass. */
export async function retryJob(jobId: string): Promise<void> {
  const job = await prisma.jobPosting.update({
    where: { id: jobId },
    data: { status: "pending", error: null },
  });
  revalidatePath(`/profiles/${job.profileId}/dashboard`);
}
