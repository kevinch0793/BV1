import { prisma } from "@/lib/db";
import { recentAppDayKeys, appDayRange } from "@/lib/appday";

// Keep only the most recent N app-days of job activity in the database; older
// jobs (and their tailored resumes, via cascade) are pruned automatically.
export const RETENTION_DAYS = 30;

/** The UTC instant before which activity is considered "older than the window". */
export function retentionCutoff(days = RETENTION_DAYS): Date {
  return appDayRange(recentAppDayKeys(days)[0]).start;
}

/**
 * Delete activity older than the retention window: job postings (which cascade
 * to their tailored resumes) plus any job-less manual resumes. Returns the
 * counts removed. Never throws fatally for the caller — wrap at the call site.
 */
export async function pruneOldActivity(days = RETENTION_DAYS): Promise<{ jobs: number; resumes: number }> {
  const cutoff = retentionCutoff(days);
  const jobs = await prisma.jobPosting.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const resumes = await prisma.tailoredResume.deleteMany({ where: { jobPostingId: null, createdAt: { lt: cutoff } } });
  return { jobs: jobs.count, resumes: resumes.count };
}
