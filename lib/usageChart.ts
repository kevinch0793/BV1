// Pure helpers for the interactive usage timeline (client + server safe, no deps).
// The chart's visible window is the source of truth; the bucket interval is derived
// from it so the X-axis time range changes automatically as you zoom.

export const MIN = 60_000; // ms per minute

/** Nice zoom intervals, in minutes — 1 min (finest) … 1 day (coarsest). */
export const INTERVAL_LADDER = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440] as const;

/** Snap windowMs/target up to the nearest ladder interval (minutes). */
export function deriveInterval(windowMs: number, target = 72): number {
  const wantMin = windowMs / MIN / target;
  for (const v of INTERVAL_LADDER) if (v >= wantMin) return v;
  return INTERVAL_LADDER[INTERVAL_LADDER.length - 1];
}

/** Number of buckets spanning [startMs, endMs) at the given interval. */
export function bucketCountFor(startMs: number, endMs: number, intervalMin: number): number {
  return Math.max(1, Math.round((endMs - startMs) / (intervalMin * MIN)));
}

/**
 * Aggregate a user's sparse [minuteIndex, count] bins into a dense per-bucket
 * count array for [startMs, endMs). startMs/endMs should be interval-aligned.
 */
export function bucketize(bins: [number, number][], startMs: number, endMs: number, intervalMin: number): number[] {
  const intervalMs = intervalMin * MIN;
  const n = bucketCountFor(startMs, endMs, intervalMin);
  const out = new Array<number>(n).fill(0);
  for (const [minute, count] of bins) {
    const t = minute * MIN;
    if (t < startMs || t >= endMs) continue;
    const i = Math.floor((t - startMs) / intervalMs);
    if (i >= 0 && i < n) out[i] += count;
  }
  return out;
}

/** Clamp a window to [minWin, min(maxWin, span)] and keep it inside the [minMs, maxMs] range. */
export function clampWindow(
  startMs: number,
  windowMs: number,
  minMs: number,
  maxMs: number,
  minWin: number,
  maxWin: number,
): { startMs: number; endMs: number } {
  let w = Math.min(maxWin, Math.max(minWin, windowMs));
  const span = maxMs - minMs;
  if (span > minWin) w = Math.min(w, span);
  let s = startMs;
  let e = s + w;
  if (e > maxMs) { e = maxMs; s = e - w; }
  if (s < minMs) { s = minMs; e = Math.min(maxMs, s + w); }
  return { startMs: s, endMs: e };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Adaptive X-axis tick label for a bucket start, chosen by interval size. */
export function fmtTick(bucketStartMs: number, intervalMin: number): string {
  const d = new Date(bucketStartMs);
  if (intervalMin < 60) return `${d.getHours()}:${pad(d.getMinutes())}`;
  if (intervalMin < 1440) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const round1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** "5 min" | "2 h" | "1 d" — the current derived interval. */
export function fmtInterval(intervalMin: number): string {
  if (intervalMin < 60) return `${intervalMin} min`;
  if (intervalMin < 1440) return `${round1(intervalMin / 60)} h`;
  return `${round1(intervalMin / 1440)} d`;
}

/** "45 min" | "6 h" | "3.5 d" — the visible window span. */
export function fmtSpan(windowMs: number): string {
  const min = windowMs / MIN;
  if (min < 90) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 48) return `${round1(h)} h`;
  return `${round1(h / 24)} d`;
}
