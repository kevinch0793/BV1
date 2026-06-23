import puppeteer, { type Browser } from "puppeteer";
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
