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
