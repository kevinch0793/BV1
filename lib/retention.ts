import { prisma } from "@/lib/db";
import { recentAppDayKeys, appDayRange } from "@/lib/appday";

// Keep only the most recent N app-days of job activity in the database; older
// jobs (and their tailored resumes, via cascade) are pruned automatically and
// the freed pages are physically reclaimed (VACUUM) so searches stay fast.
export const RETENTION_DAYS = 30;

/** The UTC instant before which activity is considered "older than the window". */
export function retentionCutoff(days = RETENTION_DAYS): Date {
  return appDayRange(recentAppDayKeys(days)[0]).start;
}

/**
 * Delete activity older than the retention window: job postings (which cascade
 * to their tailored resumes) plus any job-less manual resumes. With
 * `vacuum: true`, physically reclaims the freed file space afterwards (only when
 * something was actually deleted). VACUUM takes an exclusive lock, so callers in
 * a hot path (the pipeline) should leave it off and let the scheduler compact.
 */
export async function pruneOldActivity(opts?: { vacuum?: boolean }): Promise<{ jobs: number; resumes: number }> {
  const cutoff = retentionCutoff();
  const jobs = await prisma.jobPosting.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const resumes = await prisma.tailoredResume.deleteMany({ where: { jobPostingId: null, createdAt: { lt: cutoff } } });
  if (opts?.vacuum && jobs.count + resumes.count > 0) {
    try {
      await prisma.$executeRawUnsafe("VACUUM");
    } catch {
      // VACUUM needs an exclusive lock; if the DB is busy, skip — the next run compacts.
    }
  }
  return { jobs: jobs.count, resumes: resumes.count };
}

const DAY_MS = 24 * 60 * 60 * 1000;
let started = false;

/**
 * Start the automatic retention schedule: prune+compact once on server startup,
 * then once a day. Idempotent (safe across dev HMR / multiple imports). Called
 * from instrumentation.ts so it runs regardless of pipeline activity.
 */
export function startRetentionSchedule(): void {
  if (started) return;
  started = true;
  const run = async () => {
    try {
      const r = await pruneOldActivity({ vacuum: true });
      if (r.jobs + r.resumes > 0) console.log(`[retention] pruned ${r.jobs} jobs, ${r.resumes} orphan resumes (>30d) and compacted the database`);
    } catch (e) {
      console.error("[retention] prune failed:", (e as Error).message);
    }
  };
  // Defer the first run a little so startup isn't competing with first requests.
  setTimeout(run, 15_000);
  const t = setInterval(run, DAY_MS);
  (t as { unref?: () => void }).unref?.();
}
