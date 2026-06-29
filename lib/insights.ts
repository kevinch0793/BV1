// Deterministic per-profile tailoring health + actionable insights. Pure
// functions over pre-aggregated ProfileMetrics (no DB, no LLM) so the badge and
// the insight cards always agree (they share the same rule predicates).

export type ProfileMetrics = {
  profileId: string;
  name: string;
  totalJobs: number;
  fetched: number; // status "fetched" — has a usable JD
  failedFetches: number; // status "failed"
  pending: number; // pending / fetching / tailoring (in-flight)
  applied: number;
  notAvailable: number;
  distinctTailored: number; // distinct jobs with a tailored resume
  tailoredCount: number; // tailored-resume rows (incl. manual)
  tailoredWithFit: number; // tailored resumes that have a fitAfter score
  applyRate: number; // applied / max(1, distinctTailored)
  tailorRate: number; // distinctTailored / max(1, fetched)
  avgFit: number | null;
  avgLift: number | null;
  fitBuckets: number[]; // aligned to FIT_BUCKETS
  workplace: { remote: number; hybrid: number; onsite: number; inPerson: number; unknown: number };
  appliedTailored: { yes: number; no: number; unknown: number };
  nonTailoredShare: number; // applied-without-tailoring / max(1, applied)
  roleFamilies: { family: string; count: number }[]; // all families, sorted desc
  topMissing: string[]; // most-common missing JD skills among red resumes
  lastActivityDayKey: string | null; // app-day of latest apply or tailoring
};

export const FIT_BUCKETS = [
  { label: "<50", min: 0, max: 49, mid: 45 },
  { label: "50-59", min: 50, max: 59, mid: 55 },
  { label: "60-69", min: 60, max: 69, mid: 65 },
  { label: "70-79", min: 70, max: 79, mid: 75 },
  { label: "80-89", min: 80, max: 89, mid: 85 },
  { label: "90-100", min: 90, max: 100, mid: 95 },
];

export function fitBucketIndex(score: number): number {
  const i = FIT_BUCKETS.findIndex((b) => score >= b.min && score <= b.max);
  return i < 0 ? 0 : i;
}

export const THRESHOLDS = {
  newFetched: 3,
  minTailoredForFit: 3,
  lowAvgFit: 60,
  watchAvgFit: 70,
  failedProblem: 5, // strictly greater than
  failedWatch: 3, // >=
  minTailoredNotApplied: 3,
  minTailoredForApplyRate: 5,
  lowApplyRate: 0.3,
  watchApplyRate: 0.5,
  minAppliedForShare: 5,
  highNonTailoredShare: 0.4,
  minFetchedForBacklog: 10,
  lowTailorRate: 0.5,
  staleDays: 7,
  deadDays: 14,
};

export type Severity = "problem" | "watch";
export type Health = Severity | "good" | "new";
export type Insight = { profileId: string; profileName: string; severity: Severity; code: string; title: string; detail: string; action: string };

/** Whole-day difference between two app-day keys ("YYYY-MM-DD"). */
function dayDiff(fromKey: string, toKey: string): number {
  const a = fromKey.split("-").map(Number);
  const b = toKey.split("-").map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

const redCount = (m: ProfileMetrics) => (m.fitBuckets[0] ?? 0) + (m.fitBuckets[1] ?? 0);

/** All insight cards for one profile (a profile can have several distinct ones). */
function profileInsights(m: ProfileMetrics, todayKey: string): Insight[] {
  const T = THRESHOLDS;
  const out: Insight[] = [];
  const base = { profileId: m.profileId, profileName: m.name };

  // 1. Tailored a batch but applied to none.
  if (m.distinctTailored >= T.minTailoredNotApplied && m.applied === 0) {
    out.push({ ...base, severity: "problem", code: "not_applied", title: "Tailored, but nothing applied", detail: `${m.distinctTailored} resumes tailored, 0 applications submitted.`, action: "Submit applications with these resumes (or mark unavailable ones)." });
  }

  // 2/3. ATS match quality.
  if (m.tailoredWithFit >= T.minTailoredForFit && m.avgFit != null) {
    const miss = m.topMissing.length ? ` Most-missing JD skills: ${m.topMissing.join(", ")}.` : "";
    if (m.avgFit < T.lowAvgFit) {
      out.push({ ...base, severity: "problem", code: "low_fit", title: `Low ATS match (avg ${m.avgFit})`, detail: `${redCount(m)} resume(s) below ${T.lowAvgFit}.${miss}`, action: "Add genuinely-held skills to the base resume / profile, then re-tailor the low scorers." });
    } else if (m.avgFit < T.watchAvgFit) {
      out.push({ ...base, severity: "watch", code: "mid_fit", title: `ATS match could improve (avg ${m.avgFit})`, detail: `Averaging under ${T.watchAvgFit}.${miss}`, action: "Strengthen the profile's skills/experience for these roles and re-tailor." });
    }
  }

  // 4. Failed fetches piling up.
  if (m.failedFetches > T.failedProblem) {
    out.push({ ...base, severity: "problem", code: "failed_fetch", title: `${m.failedFetches} job fetches failed`, detail: "These pages couldn't be read (login-gated / JS-rendered).", action: "Open each failed job and paste the description, or re-add a clean URL." });
  } else if (m.failedFetches >= T.failedWatch) {
    out.push({ ...base, severity: "watch", code: "failed_fetch", title: `${m.failedFetches} job fetches failed`, detail: "A few pages couldn't be read automatically.", action: "Paste the description for the failed jobs." });
  }

  // 5. Low apply-rate (only once some applications exist — rule 1 covers zero).
  if (m.applied > 0 && m.distinctTailored >= T.minTailoredForApplyRate) {
    const pct = Math.round(m.applyRate * 100);
    const remaining = Math.max(0, m.distinctTailored - m.applied);
    if (m.applyRate < T.lowApplyRate) {
      out.push({ ...base, severity: "problem", code: "low_apply", title: `Low apply-rate (${pct}%)`, detail: `${remaining} tailored resume(s) not yet applied.`, action: "Apply to the remaining tailored jobs." });
    } else if (m.applyRate < T.watchApplyRate) {
      out.push({ ...base, severity: "watch", code: "low_apply", title: `Apply-rate ${pct}%`, detail: `${remaining} tailored resume(s) not yet applied.`, action: "Keep applying to the tailored backlog." });
    }
  }

  // 6. Applying without tailoring.
  if (m.applied >= T.minAppliedForShare && m.nonTailoredShare > T.highNonTailoredShare) {
    out.push({ ...base, severity: "problem", code: "untailored_apply", title: `${Math.round(m.nonTailoredShare * 100)}% of applies were untailored`, detail: `${m.appliedTailored.no} application(s) sent without a tailored resume.`, action: "Tailor before applying — it's the whole point of the ATS match." });
  }

  // 7. Tailoring backlog.
  if (m.fetched >= T.minFetchedForBacklog && m.tailorRate < T.lowTailorRate) {
    const untailored = Math.max(0, m.fetched - m.distinctTailored);
    out.push({ ...base, severity: "watch", code: "backlog", title: `${untailored} fetched jobs not tailored`, detail: `Only ${Math.round(m.tailorRate * 100)}% of fetched jobs have a tailored resume.`, action: "Tailor the backlog, or prune jobs you won't pursue." });
  }

  // 8. Stale / dead.
  if (m.lastActivityDayKey) {
    const d = dayDiff(m.lastActivityDayKey, todayKey);
    if (d > T.deadDays) {
      out.push({ ...base, severity: "problem", code: "dead", title: `No activity in ${d} days`, detail: "No tailoring or applications recently.", action: "Add fresh jobs and resume tailoring, or archive this profile." });
    } else if (d > T.staleDays) {
      out.push({ ...base, severity: "watch", code: "stale", title: `Quiet for ${d} days`, detail: "No recent tailoring or applications.", action: "Add new jobs to keep momentum." });
    }
  }

  return out;
}

/** Health badge for a profile — derived from the same rules as the cards. */
export function profileHealth(m: ProfileMetrics, todayKey: string): Health {
  const ins = profileInsights(m, todayKey);
  if (ins.some((i) => i.severity === "problem")) return "problem";
  if (m.fetched < THRESHOLDS.newFetched && m.distinctTailored < 3 && m.applied === 0) return "new";
  if (ins.some((i) => i.severity === "watch")) return "watch";
  return "good";
}

/** All insight cards across profiles, problems first then in profile order. */
export function buildInsights(metrics: ProfileMetrics[], todayKey: string): Insight[] {
  const order = new Map(metrics.map((m, i) => [m.profileId, i]));
  const rank: Record<Severity, number> = { problem: 0, watch: 1 };
  return metrics
    .flatMap((m) => profileInsights(m, todayKey))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || (order.get(a.profileId) ?? 0) - (order.get(b.profileId) ?? 0));
}
