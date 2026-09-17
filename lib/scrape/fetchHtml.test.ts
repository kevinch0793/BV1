import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { findJobDescription, locationSaysRemote } from "./fetchHtml.ts";

/**
 * Regression cover for the workplace signal.
 *
 * Boards state the workplace mode as structured metadata, not prose: a remote
 * posting's body frequently never says the word, and it usually still carries the
 * hiring office's address. The extractor classifies a posting with no remote
 * wording as "onsite", which is a terminal skip that retention then deletes within
 * two app-days -- so a scrape path that drops the flag loses the job silently and
 * erases the evidence. These fixtures assert the flag survives scraping.
 *
 * `render: false` keeps the headless renderer (and puppeteer) out of the test; the
 * static parsing is what these cases exercise.
 */

// Long enough to clear the JD-detection thresholds (200 chars for a JSON-LD
// description, 600 plus several JD phrases for the body-text path).
const JD = (
  "Responsibilities: build and operate distributed services. " +
  "Requirements: 5+ years of experience with Go and Postgres. " +
  "Qualifications: you will own systems end to end. " +
  "What you will do: design, ship, and measure. " +
  "We are looking for engineers who care about reliability. "
).repeat(4);

function page(jsonLd: Record<string, unknown>): string {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    jsonLd,
  )}</script></head><body><div>shell</div></body></html>`;
}

const FIXTURES: Record<string, string> = {
  // A fully-remote role that still lists the hiring office. Reading only
  // jobLocation yields "San Francisco, CA, US" and nothing that says remote.
  "/remote": page({
    "@type": "JobPosting",
    title: "Senior Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocationType: "TELECOMMUTE",
    jobLocation: {
      "@type": "Place",
      address: { addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" },
    },
    // A Country node carries a plain `name`, not a postal address.
    applicantLocationRequirements: { "@type": "Country", name: "USA" },
    description: `<p>${JD}</p>`,
  }),

  // The same posting without the flag: genuinely office-based.
  "/onsite": page({
    "@type": "JobPosting",
    title: "Senior Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: {
      "@type": "Place",
      address: { addressLocality: "San Francisco", addressRegion: "CA", addressCountry: "US" },
    },
    description: `<p>${JD}</p>`,
  }),

  // Boards such as Greenhouse state the mode inside the location string itself
  // rather than a structured flag, and the body may never mention it.
  "/remote-in-location": page({
    "@type": "JobPosting",
    title: "Principal Software Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: { "@type": "Place", address: { addressLocality: "Bangalore, IN ; Pune, IN; Remote" } },
    description: `<p>${JD}</p>`,
  }),

  // The body discusses remote work but the role is office-based: must NOT be
  // flagged, or the rule would tailor every job that mentions remote anything.
  "/remote-word-in-body": page({
    "@type": "JobPosting",
    title: "Senior Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: {
      "@type": "Place",
      address: { addressLocality: "New York", addressRegion: "NY", addressCountry: "US" },
    },
    description: `<p>You will support remote collaboration across time zones and mentor remote interns. ${JD}</p>`,
  }),

  // No JSON-LD: the mode is a chip rendered inside the posting's <header>.
  "/header-chip": `<!doctype html><html><body><main>
      <header><h1>Platform Engineer</h1><span>Remote</span><span>Full-time</span></header>
      <section><p>${JD}</p></section>
    </main></body></html>`,
};

const server = http.createServer((req, res) => {
  const body = FIXTURES[req.url ?? ""];
  res.writeHead(body ? 200 : 404, { "Content-Type": "text/html" });
  res.end(body ?? "not found");
});

let base = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

async function scrape(path: string): Promise<string> {
  const res = await findJobDescription(`${base}${path}`, { render: false });
  assert.ok(res.ok, `expected to scrape ${path}`);
  return res.text;
}

test("a TELECOMMUTE posting is marked remote even though it lists an office", async () => {
  const text = await scrape("/remote");
  assert.match(text, /^Workplace: Remote$/m);
  // The office address is still reported -- the mode must not replace it.
  assert.match(text, /^Location: San Francisco, CA, US$/m);
  assert.ok(text.includes("Responsibilities"), "description should survive");
});

test("applicant eligibility is read from a Country node", async () => {
  // Previously lost twice over: locText only read postal-address fields, and
  // `jobLocation || applicantLocationRequirements` short-circuited on the office.
  assert.match(await scrape("/remote"), /^Remote eligibility: USA$/m);
});

test("a posting with no remote flag is NOT marked remote", async () => {
  const text = await scrape("/onsite");
  assert.doesNotMatch(text, /Workplace: Remote/);
  assert.match(text, /^Location: San Francisco, CA, US$/m);
});

test("a Remote chip inside <header> survives and reads as its own word", async () => {
  const text = await scrape("/header-chip");
  // <header> used to be stripped wholesale, and cheerio's .text() then glued the
  // chip to its neighbours ("Platform EngineerRemoteFull-time"), so the word had
  // to survive *and* stay separable.
  assert.match(text, /(^|\s)Remote(\s|$)/);
  assert.ok(text.includes("Platform Engineer"), "title should survive");
});

test("a location that states Remote is flagged even with no structured flag", async () => {
  // Regression: a Greenhouse posting reading "Bangalore, IN ; Pune, IN; Remote"
  // whose body mentioned neither remote nor hybrid was classified "hybrid" --
  // an answer nothing in the text supported. The mode is now decided from the
  // location deterministically rather than left to prose reasoning.
  const text = await scrape("/remote-in-location");
  assert.match(text, /^Workplace: Remote$/m);
});

test("remote wording in the body alone does NOT flag the job", async () => {
  const text = await scrape("/remote-word-in-body");
  assert.doesNotMatch(text, /Workplace: Remote/);
  assert.match(text, /^Location: New York, NY, US$/m);
});

test("locationSaysRemote matches modes, not incidental words", () => {
  for (const yes of ["Remote", "Bangalore, IN ; Pune, IN; Remote", "US - Work from home", "WFH", "Anywhere"]) {
    assert.ok(locationSaysRemote(yes), `expected remote: ${yes}`);
  }
  for (const no of ["New York, NY", "Remotely-operated Vehicle Bay, TX", "", "Hybrid - Washington, DC"]) {
    assert.ok(!locationSaysRemote(no), `expected not remote: ${no}`);
  }
});
