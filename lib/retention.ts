import { prisma } from "@/lib/db";
import { recentAppDayKeys, appDayRange } from "@/lib/appday";

// Keep only the most recent N app-days of job activity in the database; older
// jobs (and their tailored resumes, via cascade) are pruned automatically and
// the freed pages are physically reclaimed (incremental vacuum) so searches stay fast.
export const RETENTION_DAYS = 30;
// Usage events are tiny and feed the admin analytics trend, so keep a longer
// window than raw job activity (survives the 30-day job prune).
export const USAGE_RETENTION_DAYS = 90;

/** The UTC instant before which activity is considered "older than the window". */
export function retentionCutoff(days = RETENTION_DAYS): Date {
  return appDayRange(recentAppDayKeys(days)[0]).start;
}

// Pages reclaimed per compaction pass. At the 4KB page size that is ~80MB, which is well
// above a day's churn, so the freelist does not accumulate between daily runs.
const COMPACT_PAGES = 20_000;

/**
 * Return freed pages to the filesystem.
 *
 * The database runs with `auto_vacuum=INCREMENTAL`, so deleted pages go onto a freelist
 * and this reclaims at most COMPACT_PAGES of them, holding the write lock only for that
 * batch. A full `VACUUM` would instead rewrite the ENTIRE file under an exclusive lock —
 * ~35s on a 400MB database, during which every request blocks and anything proxying in
 * front returns a gateway error. Whatever is not reclaimed this pass stays on the
 * freelist for the next one.
 */
let compactModeChecked = false;

async function compact(): Promise<void> {
  try {
    // auto_vacuum is a property of the FILE, not the connection, and can only be turned
    // on for an empty database or by a full VACUUM — so a file created before this was
    // adopted stays in NONE mode, where incremental_vacuum is a silent no-op rather than
    // an error. Say so once instead of letting the file grow unexplained.
    if (!compactModeChecked) {
      compactModeChecked = true;
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>("PRAGMA auto_vacuum");
      if (Number(Object.values(rows?.[0] ?? {})[0]) !== 2) {
        console.warn(
          "[retention] auto_vacuum is not INCREMENTAL — freed pages will not be reclaimed. " +
            "Convert the database once with: PRAGMA auto_vacuum=INCREMENTAL; VACUUM;"
        );
      }
    }
    await prisma.$executeRawUnsafe(`PRAGMA incremental_vacuum(${COMPACT_PAGES})`);
  } catch {
    // Busy — the freelist simply carries over to the next run.
  }
}

/**
 * Delete activity older than the retention window: job postings (which cascade
 * to their tailored resumes) plus any job-less manual resumes. With
 * `vacuum: true`, physically reclaims the freed file space afterwards (only when
 * something was actually deleted) — see compact() for why that is now bounded
 * rather than a full rewrite.
 */
export async function pruneOldActivity(opts?: { vacuum?: boolean }): Promise<{ jobs: number; resumes: number }> {
  const cutoff = retentionCutoff();
  const jobs = await prisma.jobPosting.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const resumes = await prisma.tailoredResume.deleteMany({ where: { jobPostingId: null, createdAt: { lt: cutoff } } });
  // Prune usage events on their own (longer) window so the analytics trend survives.
  await prisma.usageEvent.deleteMany({ where: { createdAt: { lt: retentionCutoff(USAGE_RETENTION_DAYS) } } }).catch(() => {});
  if (opts?.vacuum && jobs.count + resumes.count > 0) {
    await compact();
  }
  return { jobs: jobs.count, resumes: resumes.count };
}

// Incomplete work only matters for the current + previous app-day ("yesterday and
// today"). Older jobs that never completed are stale: the pipeline ignores them
// (its gather is scoped to this window) and they're removed on the retention run.
export const INCOMPLETE_KEEP_DAYS = 2;

/** Start of yesterday's app-day. Jobs created before this are 2+ app-days old. */
export function activeCutoff(): Date {
  return retentionCutoff(INCOMPLETE_KEEP_DAYS);
}

/**
 * Remove NON-COMPLETED jobs older than yesterday (created before activeCutoff()).
 * "Completed" = has a tailored resume — those are kept as history (up to the 30-day
 * window). So stale pending / fetching / tailoring / fetched-but-untailored /
 * failed / needs_jd rows are deleted; a job that ever produced a resume is never
 * touched. Safe to fire-and-forget.
 */
export async function pruneStaleIncomplete(): Promise<{ jobs: number }> {
  const res = await prisma.jobPosting.deleteMany({
    where: { createdAt: { lt: activeCutoff() }, tailored: { none: {} } },
  });
  return { jobs: res.count };
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
      const stale = await pruneStaleIncomplete(); // non-completed jobs older than yesterday
      const r = await pruneOldActivity({ vacuum: false }); // everything older than 30 days
      const removed = stale.jobs + r.jobs + r.resumes;
      if (removed > 0) {
        await compact();
        console.log(`[retention] pruned ${stale.jobs} stale-incomplete + ${r.jobs} old jobs + ${r.resumes} orphan resumes; compacted`);
      }
    } catch (e) {
      console.error("[retention] prune failed:", (e as Error).message);
    }
  };
  // Defer the first run a little so startup isn't competing with first requests.
  setTimeout(run, 15_000);
  const t = setInterval(run, DAY_MS);
  (t as { unref?: () => void }).unref?.();
}
