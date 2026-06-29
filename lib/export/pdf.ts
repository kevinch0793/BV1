import puppeteer, { type Browser, type Page } from "puppeteer";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * The origin headless Chrome should fetch the /print page from. Always a LOCAL
 * address (not the public/tunnel host), so PDF rendering never loops back out
 * through a reverse proxy / ngrok (which would show an interstitial). Override
 * with INTERNAL_BASE_URL if the app runs on a non-default port/host.
 */
export function internalOrigin(): string {
  return process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

// Keep ONE headless Chrome warm and reuse it across renders (each render gets a
// fresh page/tab). Launching Chrome per request is the slow, memory-heavy part —
// reusing it makes downloads fast and stops repeated exports from thrashing the
// box. The browser relaunches automatically if it disconnects/crashes.
let browserP: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const b = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  b.on("disconnected", () => {
    browserP = null;
  });
  return b;
}

async function getBrowser(): Promise<Browser> {
  if (!browserP) browserP = launch().catch((e) => ((browserP = null), Promise.reject(e)));
  return browserP;
}

/**
 * Render a print page to PDF via headless Chrome. page.pdf() emulates print
 * media (so the app's `@media print` rules isolate the resume sheet), and we
 * force the exact options the user asked for:
 *   - printBackground: true      → background graphics (colored bars, accents)
 *   - displayHeaderFooter: false → no browser header/footer
 *   - preferCSSPageSize: true    → honor the `@page { size: letter; margin }`
 */
export async function renderResumePdf(url: string): Promise<Buffer> {
  let browser = await getBrowser();
  let page;
  try {
    page = await browser.newPage();
  } catch {
    browserP = null; // stale handle — relaunch once
    browser = await getBrowser();
    page = await browser.newPage();
  }
  try {
    // networkidle2 tolerates the dev server's HMR websocket (1 long-lived conn).
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await page.evaluateHandle("document.fonts.ready");
    const pdf = await page.pdf({
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

// On-disk cache of rendered PDFs. A tailored resume's content is immutable for a
// given (template, order, updatedAt), so the same key always yields the same
// bytes — serve them from disk instead of re-rendering on every download.
const CACHE_DIR = path.join(os.tmpdir(), "bv1-resume-pdf-cache");

export async function renderResumePdfCached(url: string, cacheKey: string): Promise<Buffer> {
  const file = path.join(CACHE_DIR, `${crypto.createHash("sha1").update(cacheKey).digest("hex")}.pdf`);
  try {
    return await fs.readFile(file);
  } catch {
    // not cached yet — render and store
  }
  const buf = await renderResumePdf(url);
  fs.mkdir(CACHE_DIR, { recursive: true })
    .then(() => fs.writeFile(file, buf))
    .catch(() => {});
  return buf;
}

// ---- Render a JS-only job page to text -------------------------------------
// Some boards (e.g. Zoho Recruit) build the JD client-side, so it isn't in the
// static HTML. We load the page in the warm headless Chrome, let its JS run, and
// read the rendered text back. Bounded concurrency so a batch can't spawn a tab
// per job; images/media/fonts are blocked for speed.

const RENDER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_RENDERS = 4;
let activeRenders = 0;
const renderQueue: (() => void)[] = [];
function acquireRender(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRenders < MAX_RENDERS) { activeRenders++; resolve(); }
    else renderQueue.push(() => { activeRenders++; resolve(); });
  });
}
function releaseRender(): void {
  activeRenders = Math.max(0, activeRenders - 1);
  renderQueue.shift()?.();
}

/**
 * Load `url` in headless Chrome (running its JS) and return the job text: a
 * schema.org JobPosting from the rendered DOM if present, else the visible body
 * text. Returns null on failure or if nothing substantial rendered.
 */
export async function renderPageText(url: string): Promise<string | null> {
  await acquireRender();
  let page: Page | undefined;
  try {
    let browser = await getBrowser();
    try {
      page = await browser.newPage();
    } catch {
      browserP = null;
      browser = await getBrowser();
      page = await browser.newPage();
    }
    await page.setUserAgent(RENDER_UA);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "image" || t === "media" || t === "font") req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });
    const text: string = await page.evaluate(() => {
      const tidy = (s: string) => (s || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
      for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const raw = JSON.parse(el.textContent || "null");
          const items = Array.isArray(raw) ? raw : raw && raw["@graph"] ? raw["@graph"] : [raw];
          for (const it of items) {
            const type = it && it["@type"];
            const isJob = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
            if (isJob && it.description) {
              const d = document.createElement("div");
              d.innerHTML = String(it.description);
              return tidy((it.title ? `Title: ${it.title}\n\n` : "") + (d.textContent || ""));
            }
          }
        } catch {
          /* ignore */
        }
      }
      return tidy((document.body as HTMLElement | null)?.innerText || "");
    });
    const out = (text || "").trim();
    return out.length >= 200 ? out : null;
  } catch {
    return null;
  } finally {
    await page?.close().catch(() => {});
    releaseRender();
  }
}
