import * as cheerio from "cheerio";
import { renderPageText } from "@/lib/export/pdf";

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

type Page = { ok: true; jd: string | null; text: string } | { ok: false; error: string };

async function fetchPage(url: string): Promise<Page> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const $ = cheerio.load(await res.text());
    return { ok: true, jd: jsonLdJobText($), text: bodyText($) };
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

/**
 * SmartRecruiters powers many boards and exposes a public postings API that
 * returns the full JD as JSON even when the public page is bot-blocked (HTTP 403)
 * or a JS-only apply form. The posting id is the UUID in the URL
 * (…/publication/<uuid>) or the leading numeric id of a standard "<id>-slug" path.
 */
async function trySmartRecruiters(url: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)smartrecruiters\.com$/i.test(u.hostname)) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  // Company: the segment after "company", else the first path segment.
  const ci = segs.indexOf("company");
  const company = ci !== -1 ? segs[ci + 1] : segs[0];
  // Posting id: a UUID anywhere in the path, else a leading long numeric id.
  const uuid = segs.map((s) => s.match(/[0-9a-f]{8}-[0-9a-f-]{20,}/i)?.[0]).find(Boolean);
  const numeric = segs.map((s) => s.match(/^(\d{6,})/)?.[1]).find(Boolean);
  const id = uuid || numeric;
  if (!company || !id) return null;

  try {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(id)}`,
      { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const sections = ((j.jobAd as Record<string, unknown> | undefined)?.sections ?? {}) as Record<string, { text?: string }>;
    const body = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
      .map((k) => htmlToText(String(sections[k]?.text ?? "")))
      .filter(Boolean)
      .join("\n\n");
    if (body.length < 100) return null;
    const title = typeof j.name === "string" ? j.name : "";
    const companyName = (j.company as Record<string, unknown> | undefined)?.name;
    const location = (j.location as Record<string, unknown> | undefined)?.fullLocation;
    const header = [
      title && `Title: ${title}`,
      typeof companyName === "string" && companyName ? `Company: ${companyName}` : "",
      typeof location === "string" && location ? `Location: ${location}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return (header ? `${header}\n\n` : "") + body;
  } catch {
    return null;
  }
}

/**
 * iCIMS job pages serve a tiny JS shell at the public URL, but the SAME URL with
 * `in_iframe=1` returns the fully-populated posting HTML the iframe renders (the
 * JD, in schema.org JSON-LD or plain body text). One request, same job.
 */
async function tryIcims(url: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)icims\.com$/i.test(u.hostname)) return null;
  if (u.searchParams.get("in_iframe") === "1") return null; // already the iframe URL — let the normal flow read it
  u.searchParams.set("in_iframe", "1");
  const page = await fetchPage(u.toString());
  if (!page.ok) return null;
  if (page.jd) return page.jd;
  if (looksLikeJD(page.text)) return page.text;
  return null;
}

/**
 * Resolve a job URL to its description text — the given page only, no crawling.
 * Priority:
 *  1. Site-specific handlers (canonical public API / iframe endpoint for the SAME
 *     job) — fast and precise for bot-blocked / JS-only ATS boards.
 *  2. schema.org JSON-LD JobPosting on the page.
 *  3. The page body text, if it reads like a JD.
 *  4. Headless render of the FIRST page (runs JS) — reads exactly what a browser
 *     shows, so JS-rendered boards (Ashby/Phenom/etc.) resolve. Bounded by
 *     MAX_RENDERS in lib/export/pdf.ts so wide batches don't overload the box.
 *  5. If the page was reached but has no JD, return its best text anyway so the
 *     caller can still extract company/role (→ "needs JD", a manual paste) instead
 *     of failing. Only a genuinely unreachable page is a hard failure.
 */
export async function findJobDescription(url: string, opts: { render?: boolean } = {}): Promise<FetchResult> {
  // Site-specific handlers first (JS-only / bot-blocked boards with a public API
  // or iframe endpoint). Each resolves the SAME job from its canonical source — a
  // single request, not a crawl to other pages.
  for (const handler of [tryGreenhouse, tryAdpWorkforceNow, trySmartRecruiters, tryIcims]) {
    const text = await handler(url);
    if (text) return { ok: true, text, sourceUrl: url };
  }

  const page = await fetchPage(url);
  if (page.ok) {
    if (page.jd) return { ok: true, text: page.jd, sourceUrl: url };
    if (looksLikeJD(page.text)) return { ok: true, text: page.text, sourceUrl: url };
  }

  // Static HTML had no JD (common for JS-rendered ATS). Render the FIRST page with
  // headless Chrome and read the JD back. Only this URL is loaded — no link
  // following. Bounded by MAX_RENDERS (lib/export/pdf.ts).
  let rendered: string | null = null;
  if (opts.render !== false) rendered = await renderPageText(url).catch(() => null);
  if (rendered && (looksLikeJD(rendered) || rendered.length >= 600)) return { ok: true, text: rendered, sourceUrl: url };

  // Still no recognizable JD. If we at least REACHED a page, hand back its best
  // text so the extractor can still pull company/role — the caller marks such a
  // job "needs JD" (manual paste) rather than failing it. Only a page we couldn't
  // reach at all (network/HTTP error, nothing rendered) is a genuine failure.
  const candidates = [rendered ?? "", page.ok ? page.text : ""].filter((t) => t.length > 0);
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  if (best) return { ok: true, text: best, sourceUrl: url };

  return {
    ok: false,
    error: page.ok
      ? "Couldn't find a job description on that page (it may be login-gated or JavaScript-rendered). Paste the text instead."
      : `Could not reach the page: ${page.error}`,
  };
}
