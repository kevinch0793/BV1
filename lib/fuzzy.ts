// Typo- and synonym-tolerant token matching for the job search. Pure functions,
// run server-side over the candidate rows. Each query token must match SOMETHING
// in the target (exactly, as a synonym, as a substring, as a compound word, or
// within a small edit distance) for a non-zero score.

const SYNONYM_GROUPS: string[][] = [
  ["engineer", "developer", "dev", "programmer", "engineering", "swe", "sde"],
  ["manager", "mgr", "management"],
  ["senior", "sr"],
  ["junior", "jr"],
  ["administrator", "admin"],
  ["lead", "leader"],
  ["architect", "architecture"],
];
const SYN = new Map<string, Set<string>>();
for (const g of SYNONYM_GROUPS) for (const w of g) SYN.set(w, new Set(g));

const normalize = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function tokenize(s: string | null | undefined): string[] {
  const n = normalize(s ?? "");
  return n ? n.split(" ") : [];
}

// Optimal string alignment distance (Levenshtein + adjacent transposition, so
// "googel" -> "google" is distance 1).
function osa(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// How well one query token matches one candidate token. 0 = no match.
function tokenScore(q: string, c: string): number {
  if (q === c) return 3;
  const syn = SYN.get(q);
  if (syn && syn.has(c)) return 3; // engineer ~ developer
  if (q.length >= 4 && c.length >= 4 && (q.includes(c) || c.includes(q))) return 2; // substring
  const max = q.length <= 3 ? 0 : q.length <= 6 ? 1 : 2; // allowed typos scale with length
  if (max > 0) {
    const d = osa(q, c);
    if (d <= max) return d === 1 ? 1.5 : 1;
  }
  return 0;
}

/** 0 = no match. Higher = better. Empty query matches everything. Every query
 *  token must match for a non-zero score (each fuzzily / via synonym / compound). */
export function fuzzyScore(query: string, text: string | null | undefined): number {
  const qts = tokenize(query);
  if (qts.length === 0) return 1;
  const tts = tokenize(text);
  if (tts.length === 0) return 0;
  // Candidate tokens include adjacent concatenations so "fullstack" matches
  // "full stack" (and "fullstackengineer"-style runs across up to 3 words).
  const cands = [...tts];
  for (let i = 0; i < tts.length - 1; i++) {
    cands.push(tts[i] + tts[i + 1]);
    if (i < tts.length - 2) cands.push(tts[i] + tts[i + 1] + tts[i + 2]);
  }
  let total = 0;
  for (const qt of qts) {
    let best = 0;
    for (const ct of cands) {
      const s = tokenScore(qt, ct);
      if (s > best) best = s;
      if (best >= 3) break;
    }
    if (best === 0) return 0; // a query token matched nothing -> reject
    total += best;
  }
  return total;
}
