import puppeteer from "puppeteer";

/**
 * Render a print page to PDF via headless Chrome. page.pdf() emulates print
 * media (so the app's `@media print` rules isolate the resume sheet), and we
 * force the exact options the user asked for:
 *   - printBackground: true      → background graphics (colored bars, accents)
 *   - displayHeaderFooter: false → no browser header/footer
 *   - preferCSSPageSize: true    → honor the `@page { size: letter; margin }`
 */
export async function renderResumePdf(url: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
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
    await browser.close();
  }
}
