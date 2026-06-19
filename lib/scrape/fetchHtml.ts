import * as cheerio from "cheerio";

export type FetchResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Fetch a job-posting URL and reduce it to readable text. Many boards block
 * bots or require login; on any failure we return { ok:false } so the UI can
 * fall back to a paste-the-JD textarea.
 */
export async function fetchJobText(url: string): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach the page: ${(e as Error).message}` };
  }

  if (!res.ok) {
    return { ok: false, error: `Page returned HTTP ${res.status}.` };
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();

  // Prefer the main content region if present.
  const root = $("main").length ? $("main") : $("body");
  const text = root
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  if (text.length < 200) {
    return {
      ok: false,
      error: "The page had too little readable text (likely blocked or login-gated).",
    };
  }
  return { ok: true, text };
}
