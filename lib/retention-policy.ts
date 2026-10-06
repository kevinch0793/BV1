import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Which jobs count as abandoned work, as a plain where-clause.
 *
 * Kept in its own module, free of runtime imports, so the policy can be asserted
 * without constructing a Prisma client or touching a database.
 *
 * A tailored resume proves a job finished, but it is NOT the only proof, and
 * treating it as the only proof silently destroyed real history:
 *
 *  - A "normal" plan profile never tailors, by design, so for it a successful
 *    fetch IS the terminal state. Keyed on the resume alone, every job such a
 *    profile added was deleted two app-days later, leaving its dashboard
 *    permanently empty while the pipeline ran normally.
 *  - applyStatus / appliedAt / appliedTailored live on the job row, so deleting
 *    the row destroys the only record that the candidate applied at all. Any job
 *    the candidate has acted on is kept, whatever its plan or resume state.
 *
 * Genuinely unfinished rows are still pruned: pending / fetching / tailoring /
 * failed / needs_jd, and untouched fetched rows belonging to a tailoring profile
 * (which should have produced a resume and did not).
 */
export function staleIncompleteWhere(cutoff: Date): Prisma.JobPostingWhereInput {
  return {
    createdAt: { lt: cutoff },
    tailored: { none: {} },
    applyStatus: "none",
    NOT: { status: "fetched", profile: { is: { plan: "normal" } } },
  };
}
