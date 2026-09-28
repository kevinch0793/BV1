// Per-profile plan: what the pipeline is allowed to do for a candidate.
//
//   "tailor"  jobs are fetched AND tailored (the original behaviour)
//   "normal"  jobs are fetched only; the candidate applies with one fixed
//             resume, so the expensive tailor call is never made
//
// Pure logic, no imports — usable from the pipeline, Server Actions, pages and
// tests alike.

export const PLANS = [
  { id: "tailor", label: "Tailor", hint: "Fetches each job and writes a resume tailored to it." },
  { id: "normal", label: "Normal", hint: "Fetches each job for tracking and answers, but applies with one fixed resume." },
] as const;

export type Plan = (typeof PLANS)[number]["id"];

export const DEFAULT_PLAN: Plan = "tailor";

/** Narrow an arbitrary stored string to a known plan. */
export function isPlan(v: string | null | undefined): v is Plan {
  return v === "tailor" || v === "normal";
}

/**
 * The plan to act on. Anything unrecognised — null, empty, a value written
 * before this column existed, or a typo — reads as "tailor".
 *
 * Defaulting to the MORE capable plan is deliberate: a profile wrongly treated
 * as "normal" silently stops producing resumes, which looks exactly like the
 * pipeline being broken and is what a user reports days later. A profile wrongly
 * treated as "tailor" merely does the work it already did.
 */
export function planOf(raw: string | null | undefined): Plan {
  return isPlan(raw) ? raw : DEFAULT_PLAN;
}

/** Does this plan permit tailoring at all? */
export function planAllowsTailoring(raw: string | null | undefined): boolean {
  return planOf(raw) === "tailor";
}

/**
 * Whether a profile should be tailored: the plan must permit it AND the profile
 * must have something to tailor from.
 *
 * Both halves already existed separately — the data check has always gated the
 * queue — so this only adds the permission half, keeping one definition of
 * "tailorable" instead of two that can drift.
 */
export function canTailorProfile(input: { plan?: string | null; hasBaseResume: boolean; experienceCount: number }): boolean {
  if (!planAllowsTailoring(input.plan)) return false;
  return input.hasBaseResume || input.experienceCount > 0;
}
