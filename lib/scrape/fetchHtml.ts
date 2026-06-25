import * as cheerio from "cheerio";

export type FetchResult =
  | { ok: true; text: string; sourceUrl: string }
  | { ok: false; error: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const JD_WORDS = [
  "responsibilit",
  "requirement",
  "qualificat",
  "what you",
  "who you",
  "you will",
  "you'll",
  "experience",
  "we are looking",
  "about the role",
  "the role",
];

const GOOD_LINK = ["job", "jobs", "career", "careers", "position", "opening", "vacancy", "role", "description", "posting", "requisition", "/req", "detail", "listing"];
const BAD_LINK = ["login", "signin", "sign-in", "privacy", "cookie", "terms", "blog", "press", "contact", "facebook", "twitter", "linkedin.com", "instagram"];

function htmlToText(html: string): string {
  if (!html) return "";
  return cheerio
    .load(`<div>${html}</div>`)("div")
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function locText(loc: unknown): string {
  if (!loc) return "";
  const arr = Array.isArray(loc) ? loc : [loc];
  return arr
    .map((l) => {
      const a = (l && typeof l === "object" ? ((l as Record<string, unknown>).address ?? l) : {}) as Record<string, unknown>;
      return [a.addressLocality, a.addressRegion, a.addressCountry]
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .join(", ");
    })
    .filter(Boolean)
    .join(" / ");
}

/** Pull a schema.org JobPosting out of any <script type="application/ld+json">. */
function jsonLdJobText($: cheerio.CheerioAPI): string | null {
  const blocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get();

  for (const raw of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    // Flatten arrays and @graph containers into candidate objects.
    const queue: unknown[] = Array.isArray(data) ? [...data] : [data];
    const items: Record<string, unknown>[] = [];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) queue.push(...(obj["@graph"] as unknown[]));
      items.push(obj);
    }
    for (const item of items) {
      const types = ([] as unknown[]).concat(item["@type"] ?? []).map(String);
      if (!types.includes("JobPosting")) continue;
      const description = htmlToText(String(item.description ?? ""));
      if (description.length < 200) continue;
      const title = typeof item.title === "string" ? item.title : "";
      const company =
        item.hiringOrganization && typeof item.hiringOrganization === "object"
          ? String((item.hiringOrganization as Record<string, unknown>).name ?? "")
          : "";
      const location = locText(item.jobLocation) || locText(item.applicantLocationRequirements);
      const header = [
        title && `Title: ${title}`,
        company && `Company: ${company}`,
        location && `Location: ${location}`,
      ]
        .filter(Boolean)
        .join("\n");
      return (header ? `${header}\n\n` : "") + description;
    }
  }
  return null;
}

function bodyText($: cheerio.CheerioAPI): string {
  const clone = cheerio.load($.html());
  clone("script, style, noscript, svg, nav, footer, header, form, iframe").remove();
  const root = clone("main").length ? clone("main") : clone("body");
  return root.text().replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

function looksLikeJD(text: string): boolean {
  if (text.length < 600) return false;
  const lower = text.toLowerCase();
  return JD_WORDS.filter((w) => lower.includes(w)).length >= 3;
}

function scoreLink(href: string, text: string): number {
  const s = `${href} ${text}`.toLowerCase();
  if (BAD_LINK.some((b) => s.includes(b))) return -1;
  let score = 0;
  for (const g of GOOD_LINK) if (s.includes(g)) score += 2;
  if (/\/[0-9a-f-]{16,}/i.test(href)) score += 2; // long id (uuid etc.)
  if (/\/\d{4,}/.test(href)) score += 2;
  return score;
}

function collectLinks($: cheerio.CheerioAPI, baseUrl: string): { href: string; text: string }[] {
  const origin = new URL(baseUrl).origin;
  const out: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, a) => {
    const raw = $(a).attr("href");
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
    let abs: string;
    try {
      abs = new URL(raw, baseUrl).toString();
    } catch {
      return;
    }
    if (new URL(abs).origin !== origin || seen.has(abs) || abs === baseUrl) return;
    seen.add(abs);
    out.push({ href: abs, text: $(a).text().trim().slice(0, 100) });
  });
  return out.slice(0, 300);
}

type Page = { ok: true; jd: string | null; text: string; links: { href: string; text: string }[] } | { ok: false; error: string };

async function fetchPage(url: string): Promise<Page> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const $ = cheerio.load(await res.text());
    return { ok: true, jd: jsonLdJobText($), text: bodyText($), links: collectLinks($, url) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---- Site-specific handlers (JS-only boards with a reachable public API) ----

function adpLocation(locs: unknown): string {
  if (!Array.isArray(locs)) return "";
  return locs
    .map((l) => {
      const a = (l && typeof l === "object" ? ((l as Record<string, unknown>).address ?? l) : {}) as Record<string, unknown>;
      const pick = (v: unknown): string =>
        typeof v === "string"
          ? v
          : v && typeof v === "object"
            ? String((v as Record<string, unknown>).codeValue ?? (v as Record<string, unknown>).shortName ?? "")
            : "";
      return [pick(a.cityName), pick(a.countrySubdivisionLevel1), pick(a.countryCode)]
        .filter((x) => x.trim().length > 0)
        .join(", ");
    })
    .filter(Boolean)
    .join(" / ");
}

/**
 * Greenhouse powers many career sites (often embedded, marked by a `gh_jid`
 * query param) and exposes an open board API. We derive candidate board tokens
 * from the host and query until one resolves the job.
 */
async function tryGreenhouse(url: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const candidates: { token: string; jid: string }[] = [];
  const onGh = /(^|\.)(boards|job-boards)\.greenhouse\.io$/i.test(u.hostname);
  const segs = u.pathname.split("/").filter(Boolean);
  const ghJid = u.searchParams.get("gh_jid");

  if (onGh && segs[0] === "embed") {
    // Embed widget: job-boards.greenhouse.io/embed/job_app?for=<board_token>&token=<job_id>
    const token = u.searchParams.get("for");
    const jid = ghJid || u.searchParams.get("token");
    if (token && jid) candidates.push({ token, jid });
  } else if (onGh && segs[0]) {
    const id = ghJid || (segs[1] === "jobs" ? segs[2] : segs.find((s) => /^\d+$/.test(s)));
    if (id) candidates.push({ token: segs[0], jid: id });
  } else if (ghJid) {
    // Embedded board (e.g. pinterestcareers.com) — guess the token from the host.
    const sld = u.hostname.replace(/^www\./, "").split(".")[0];
    for (const token of new Set([
      sld,
      sld.replace(/(careers|jobs|recruiting|talent)$/i, ""),
      sld.replace(/[-_]/g, ""),
    ])) {
      if (token) candidates.push({ token, jid: ghJid });
    }
  }
  if (!candidates.length) return null;

  for (const { token, jid } of candidates) {
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(jid)}`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) },
      );
      if (!res.ok) continue;
      const j = (await res.json()) as Record<string, unknown>;
      const description = htmlToText(String(j.content ?? ""));
      if (description.length < 100) continue;
      const title = typeof j.title === "string" ? j.title : "";
      const location =
        j.location && typeof j.location === "object" ? String((j.location as Record<string, unknown>).name ?? "") : "";
      const header = [title && `Title: ${title}`, location && `Location: ${location}`].filter(Boolean).join("\n");
      return (header ? `${header}\n\n` : "") + description;
    } catch {
      continue;
    }
  }
  return null;
}

/** ADP WorkforceNow recruitment pages are JS-only but expose a public JSON API. */
async function tryAdpWorkforceNow(url: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)workforcenow\.adp\.com$/i.test(u.hostname)) return null;
  const cid = u.searchParams.get("cid");
  const ccId = u.searchParams.get("ccId");
  const jobId = u.searchParams.get("jobId");
  const lang = u.searchParams.get("lang") || "en_US";
  if (!cid || !ccId || !jobId) return null;

  const api =
    `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions/${jobId}` +
    `?cid=${encodeURIComponent(cid)}&ccId=${encodeURIComponent(ccId)}&lang=${encodeURIComponent(lang)}&timeZoneId=America/New_York`;
  try {
    const res = await fetch(api, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const description = htmlToText(String(j.requisitionDescription ?? ""));
    if (description.length < 100) return null;
    const title = typeof j.requisitionTitle === "string" ? j.requisitionTitle : "";
    const location = adpLocation(j.requisitionLocations);
    const header = [title && `Title: ${title}`, location && `Location: ${location}`].filter(Boolean).join("\n");
    return (header ? `${header}\n\n` : "") + description;
  } catch {
    return null;
  }
}

/** Build extra URLs to try: drop an /application or /apply suffix segment. */
function siblingUrls(url: string): string[] {
  try {
    const u = new URL(url);
    const trimmed = u.pathname.replace(/\/(application|apply)\/?$/i, "");
    if (trimmed !== u.pathname) {
      const v = new URL(url);
      v.pathname = trimmed;
      return [v.toString()];
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Resolve a job URL to its description text. Priority:
 *  1. schema.org JSON-LD JobPosting on the page (works for JS-rendered ATS like
 *     Ashby/Greenhouse/Lever even when the body is empty).
 *  2. The page body text, if it reads like a JD.
 *  3. Sibling URLs (e.g. strip /application) and the best same-site links, one hop.
 *  4. Landing body text as a last resort.
 */
export async function findJobDescription(url: string): Promise<FetchResult> {
  // Site-specific handlers first (JS-only / bot-blocked boards with a public API).
  for (const handler of [tryGreenhouse, tryAdpWorkforceNow]) {
    const text = await handler(url);
    if (text) return { ok: true, text, sourceUrl: url };
  }

  const page = await fetchPage(url);
  if (!page.ok) return { ok: false, error: `Could not reach the page: ${page.error}` };

  if (page.jd) return { ok: true, text: page.jd, sourceUrl: url };
  if (looksLikeJD(page.text)) return { ok: true, text: page.text, sourceUrl: url };

  // Try sibling URLs first (apply → posting), then ranked same-site links.
  const ranked = collectLinksToTry(page, url);
  const results = await Promise.allSettled(ranked.map((u) => fetchPage(u)));

  let best: { text: string; sourceUrl: string } | null = null;
  let bestRank = -1;
  ranked.forEach((u, i) => {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value.ok) return;
    const candidate = r.value.jd ?? r.value.text;
    if (!candidate) return;
    const rank = (r.value.jd || looksLikeJD(candidate) ? 1_000_000 : 0) + candidate.length;
    if (rank > bestRank) {
      bestRank = rank;
      best = { text: candidate, sourceUrl: u };
    }
  });

  if (best) {
    const b = best as { text: string; sourceUrl: string };
    if (looksLikeJD(b.text) || b.text.length > page.text.length * 1.2) return { ok: true, ...b };
  }

  // Last resort: accept a reasonably-sized page. A tiny page (~200 chars) is a
  // stub/login/JS shell, not a JD — fail it so the user pastes the text.
  if (page.text.length >= 400) return { ok: true, text: page.text, sourceUrl: url };
  return {
    ok: false,
    error: "Couldn't find a job description on that page (it may be login-gated or JavaScript-rendered). Paste the text instead.",
  };
}

function collectLinksToTry(page: Extract<Page, { ok: true }>, url: string): string[] {
  const siblings = siblingUrls(url);
  const links = page.links
    .map((l) => ({ ...l, score: scoreLink(l.href, l.text) }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((l) => l.href);
  return [...new Set([...siblings, ...links])];
}
