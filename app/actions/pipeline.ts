"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { startPipeline as start, isPipelineRunning, type PipelineOpts } from "@/lib/pipeline";

/** Start (or refresh options of) the background fetch+tailor pipeline. */
export async function startPipeline(profileId: string, opts: PipelineOpts): Promise<{ ok: true }> {
  await start(profileId, opts);
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
