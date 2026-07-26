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
// fresh page/tab). Launching Chrome per request is the slow, memory-heavy part.
//
// The handle is cached on globalThis (like lib/db.ts caches Prisma) so Next.js
// dev hot-reload REUSES the same Chrome instead of orphaning it and launching a
// new one on every module reload — historically the main source of leaked Chrome
// processes. We keep the resolved Browser too, so shutdown can reap it.
const g = globalThis as unknown as {
  __bv1_browserP?: Promise<Browser> | null;
  __bv1_browser?: Browser | null;
  __bv1_exitHooked?: boolean;
};

// Hard-kill a browser's Chrome process tree so its child processes are reaped.
// Safe on an already-dead browser.
function killBrowser(b: Browser | null | undefined): void {
  try {
    b?.process()?.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}

async function launch(): Promise<Browser> {
  const b = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  g.__bv1_browser = b;
  // If Chrome dies/disconnects, drop the handle AND reap any straggler processes
  // so a crashed browser never lingers; the next render lazily launches a fresh one.
  b.on("disconnected", () => {
    if (g.__bv1_browser === b) g.__bv1_browser = null;
    g.__bv1_browserP = null;
    killBrowser(b);
  });
  // Belt-and-suspenders: reap the warm browser on clean process exit so shutdown
  // never orphans Chrome. Registered once. (Puppeteer already handles the
  // SIGINT/SIGTERM/SIGHUP signals itself.)
  if (!g.__bv1_exitHooked) {
    g.__bv1_exitHooked = true;
    process.on("exit", () => killBrowser(g.__bv1_browser));
  }
  return b;
}

async function getBrowser(): Promise<Browser> {
  if (!g.__bv1_browserP) {
    g.__bv1_browserP = launch().catch((e) => ((g.__bv1_browserP = null), Promise.reject(e)));
  }
  return g.__bv1_browserP;
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
  let page: Page;
  try {
    page = await browser.newPage();
  } catch {
    // The cached browser may have just died (its `disconnected` handler clears +
    // reaps it); getBrowser() relaunches when that happened, else returns the same
    // live browser. Either way, only the page leaks are our concern — closed below.
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
// Max concurrent JD renders (headless Chrome tabs). Env-tunable; keep modest —
// each open tab holds ~80-200 MB. Pairs with PIPELINE_CONCURRENCY (lib/pipeline.ts).
const MAX_RENDERS = Math.max(1, Number(process.env.MAX_RENDERS) || 4);
// Hard ceiling on a single render's wall time; a hung page is force-closed so it
// can't wedge a render slot. Internal goto/wait timeouts (~15s+14s) sit under this.
const RENDER_TIMEOUT_MS = Math.max(5000, Number(process.env.RENDER_TIMEOUT_MS) || 40000);
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
      browser = await getBrowser(); // browser may have died + been reaped — relaunch
      page = await browser.newPage();
    }
    const pageRef = page; // for the timeout closer
    // Hard outer timeout: if the render hangs past the internal timeouts, force the
    // tab closed so it releases its slot instead of wedging the pool.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        pageRef.close().catch(() => {});
        reject(new Error("render timeout"));
      }, RENDER_TIMEOUT_MS),
    );
    return await Promise.race([renderInPage(page, url), timeout]);
  } catch {
    return null;
  } finally {
    await page?.close().catch(() => {});
    releaseRender();
  }
}

// The actual page render: navigate, wait for the JD to populate, read it back.
async function renderInPage(page: Page, url: string): Promise<string | null> {
  {
    await page.setUserAgent(RENDER_UA);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const t = req.resourceType();
      if (t === "image" || t === "media" || t === "font") req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
    // domcontentloaded is fast and (unlike networkidle2) won't hang for the full
    // timeout on pages with long-lived connections; then wait for the client-
    // rendered JD to actually populate. Heavy SPA communities (Salesforce Aura,
    // etc.) boot a shell first and load the JD by XHR a few seconds later, so we
    // wait for JD-ish content (keywords or a body well past the shell), not just
    // "some text". Resolves fast when the JD is already there; up to ~14s for the
    // slow ones. Bounded by MAX_RENDERS, so a wide batch never stacks these up.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page
      .waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          if (t.length < 600) return false;
          const l = t.toLowerCase();
          const kw = ["responsibilit", "qualificat", "requirement", "what you", "you will", "experience", "about the role", "who you"].filter(
            (w) => l.includes(w),
          ).length;
          return t.length > 1500 || kw >= 2;
        },
        { timeout: 14000 },
      )
      .catch(() => {});
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
  }
}
