// Company blacklist: companies this platform never applies to. One global,
// admin-maintained list (AppConfig.companyBlacklist), matched at two points:
//
//  1. When URLs are pasted, against the company SLUG carried in the job board's
//     URL (greenhouse "?for=", ashby/lever path, workday/icims subdomain, ...).
//     Free, and the job is never fetched at all.
//  2. After extraction, against the real company NAME the model read off the
//     posting. This is what makes an entry written as "NextGen Federal" catch a
//     posting whose URL slug is only "nextgenfed" -- and it covers the ~quarter
//     of boards that carry no company in the URL.
//
// Pure string logic (no imports), so it is usable from Server Actions, the
// pipeline, and tests alike.

/** Trailing words that are legal form, not identity: "Google LLC" is "Google". */
const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "plc",
  "sa",
  "bv",
  "ag",
  "srl",
  "pty",
  "llp",
  "holdings",
  "group",
]);

/**
 * Reduce a company name or URL slug to a comparable key: lowercase, legal
 * suffixes dropped, everything non-alphanumeric removed.
 *
 *   "Wispr Flow" -> wisprflow      "wispr-flow" -> wisprflow
 *   "Google LLC" -> google         "Google"     -> google
 *
 * Note "co"/"group" are only dropped as TRAILING words, so "Coinbase" and
 * "Groupon" survive intact.
 */
export function normalizeCompany(raw: string | null | undefined): string {
  const words = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join("");
}

/**
 * The company slug a job-board URL carries, or "" when the board hides it.
 *
 * Deliberately conservative: a wrong guess here blocks a job the admin never
 * listed, which is invisible to them. Anything unrecognized returns "" and is
 * left to the post-extraction check instead.
 */
export function companySlugFromUrl(rawUrl: string | null | undefined): string {
  let u: URL;
  try {
    u = new URL(String(rawUrl ?? ""));
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segs = u.pathname.split("/").filter(Boolean);

  // Greenhouse: the embed form carries ?for=<token>; the hosted board puts the
  // token first in the path (boards.greenhouse.io/<token>/jobs/123).
  if (/(^|\.)(boards|job-boards)\.greenhouse\.io$/.test(host)) {
    const forParam = u.searchParams.get("for");
    if (forParam) return forParam;
    if (segs[0] && segs[0] !== "embed") return segs[0];
    return "";
  }
  // Ashby / Lever / SmartRecruiters: first path segment is the company.
  if (/(^|\.)jobs\.ashbyhq\.com$/.test(host) || /(^|\.)jobs\.lever\.co$/.test(host)) return segs[0] ?? "";
  if (/(^|\.)smartrecruiters\.com$/.test(host)) {
    const ci = segs.indexOf("company");
    return (ci !== -1 ? segs[ci + 1] : segs[0]) ?? "";
  }
  // Subdomain boards: <company>.applytojob.com, <company>.bamboohr.com,
  // <company>.wd1.myworkdayjobs.com, careers-<company>.icims.com.
  const sub = (suffix: RegExp): string => {
    if (!suffix.test(host)) return "";
    const first = host.split(".")[0];
    return first.replace(/^(careers|jobs|apply|recruiting)[-_]/, "");
  };
  return (
    sub(/\.applytojob\.com$/) ||
    sub(/\.bamboohr\.com$/) ||
    sub(/\.myworkdayjobs\.com$/) ||
    sub(/\.icims\.com$/) ||
    ""
  );
}

/** One admin-listed company: what was typed, plus its comparison key. */
export type BlacklistEntry = { label: string; key: string };

/** Parse the admin textarea (one company per line) into comparable entries. */
export function parseBlacklist(raw: string | null | undefined): BlacklistEntry[] {
  const seen = new Set<string>();
  const out: BlacklistEntry[] = [];
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const label = line.trim();
    if (!label || label.startsWith("#")) continue; // "#" allows comments in the list
    const key = normalizeCompany(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, key });
  }
  return out;
}

/**
 * The blacklist entry matching this company name or slug, else null.
 *
 * Matching is EXACT on the normalized key, never substring: "Meta" must not
 * silently swallow Metabase or Metagenomi, because a wrongly-excluded job looks
 * identical to one that was never pasted.
 */
export function matchBlacklist(candidate: string | null | undefined, entries: BlacklistEntry[]): BlacklistEntry | null {
  const key = normalizeCompany(candidate);
  if (!key) return null;
  return entries.find((e) => e.key === key) ?? null;
}
