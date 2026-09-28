// URL parsing/normalization for pasted job links. Kept in a plain module (not a
// "use server" file) so both actions and the retry path can reuse it.

/**
 * Canonicalize a URL so trailing slashes, fragments and host casing don't sneak in
 * duplicates (query strings are kept — job ids often live there, e.g. gh_jid).
 *
 * Also REPAIRS a mangled value: if the string contains explicit http(s) URLs — e.g.
 * a pasted spreadsheet row "Company<TAB>Role<TAB>https://real-url" that got jammed
 * together — the LAST http(s) token is the actual URL (it trails the text columns),
 * so we extract that. Returns null if nothing parseable is found.
 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  const found = s.match(/https?:\/\/[^\s]+/gi);
  if (found && found.length) s = found[found.length - 1];
  else if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let out = u.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

/**
 * Query parameters that identify the REFERRAL, not the job. Aggregators mint a
 * fresh one every time they re-list a posting, so leaving them in makes the same
 * job look new: two Jobright links to one Greenhouse posting differ only in
 * `jr_id` while carrying an identical `token`.
 *
 * Deliberately a short allow-list of known-tracking names rather than a guess.
 * Board parameters that DO identify the job — `token`, `gh_jid`, `for`, `cid`,
 * `ccId`, `jobId` — must survive, or two different postings would collapse into
 * one and the second would be silently discarded as a duplicate.
 */
const TRACKING_PARAMS = new Set(["jr_id", "lever-source", "gh_src", "gclid", "fbclid", "mc_cid", "mc_eid"]);

/**
 * A URL reduced to what identifies the JOB, for duplicate comparison only.
 *
 * Never stored: `addJobUrls` keeps the URL as pasted, so the referral link the
 * user actually clicked is preserved. This is purely the key the duplicate check
 * compares on.
 *
 * Returns null for anything unparseable, matching normalizeUrl.
 */
export function jobIdentityKey(raw: string | null | undefined): string | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    const keep = [...u.searchParams].filter(
      ([k]) => !TRACKING_PARAMS.has(k.toLowerCase()) && !k.toLowerCase().startsWith("utm_"),
    );
    // Sort so a board that reorders its own query string can't look like a
    // different job.
    keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    u.search = "";
    for (const [k, v] of keep) u.searchParams.append(k, v);
    let out = u.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

/**
 * Parse a textarea of pasted job links into normalized URLs. Robust to pasting a
 * spreadsheet: pull out EVERY explicit http(s) URL (one per row even when each row
 * is "Company<TAB>Role<TAB>URL", plus comma/space lists and one-per-line). Falls
 * back to line/comma splitting only when the paste has no scheme at all (bare
 * domains). De-dupes within the batch.
 */
export function normalizeUrls(raw: string): string[] {
  const seen = new Set<string>();
  const push = (candidate: string | null | undefined) => {
    const u = normalizeUrl(candidate);
    if (u) seen.add(u);
  };
  const urls = raw.match(/https?:\/\/[^\s]+/gi);
  if (urls && urls.length) {
    for (const u of urls) push(u);
  } else {
    for (const line of raw.split(/[\n,]/)) push(line);
  }
  return [...seen];
}
