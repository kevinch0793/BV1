import { test } from "node:test";
import assert from "node:assert/strict";

import { companySlugFromUrl, matchBlacklist, normalizeCompany, parseBlacklist } from "./blacklist.ts";

// The URLs below are real shapes taken from the job table, so the slug rules are
// tested against what the boards actually send rather than an idealized form.

test("normalizeCompany reduces a name and its URL slug to the same key", () => {
  assert.equal(normalizeCompany("Wispr Flow"), normalizeCompany("wispr-flow"));
  assert.equal(normalizeCompany("Victory Live"), normalizeCompany("victory-live"));
  assert.equal(normalizeCompany("  PubMatic  "), "pubmatic");
});

test("normalizeCompany drops legal suffixes but not real name parts", () => {
  assert.equal(normalizeCompany("Google LLC"), normalizeCompany("Google"));
  assert.equal(normalizeCompany("Charger Logistics Inc."), "chargerlogistics");
  // "co" and "group" are legal suffixes only as trailing words.
  assert.equal(normalizeCompany("Coinbase"), "coinbase");
  assert.equal(normalizeCompany("Groupon"), "groupon");
});

test("matching is exact, so a short name cannot swallow a longer one", () => {
  const list = parseBlacklist("Meta");
  assert.ok(matchBlacklist("Meta", list), "Meta should match itself");
  // The reason matching is exact: these are different companies.
  assert.equal(matchBlacklist("Metabase", list), null);
  assert.equal(matchBlacklist("Metagenomi", list), null);
});

test("companySlugFromUrl reads the company each board carries", () => {
  const cases: [string, string][] = [
    ["https://job-boards.greenhouse.io/embed/job_app?for=pubmatic&token=5341476008", "pubmatic"],
    ["https://job-boards.greenhouse.io/embed/job_app?for=beyondtrust&jr_id=abc&token=8161719", "beyondtrust"],
    ["https://jobs.ashbyhq.com/wispr-flow/a093f7f3-d472-4f5e-bf88-96493915960a/application", "wispr-flow"],
    ["https://jobs.lever.co/nextgenfed/c14f66a4-f978-40c2-a3b7-a69669722437/apply", "nextgenfed"],
    ["https://jobs.smartrecruiters.com/oneclick-ui/company/prosidianconsulting/publication/ad5d5ffb", "prosidianconsulting"],
    ["https://prometheusfederalservices.applytojob.com/apply/OHKh8LG7pL/Senior-Data-Scientist", "prometheusfederalservices"],
    ["https://jorieai.bamboohr.com/careers/151", "jorieai"],
    ["https://timberlinegrp.catsone.com/careers/7276/jobs/1", "timberlinegrp"],
    ["https://pulserisetechnologies.freshteam.com/jobs/7", "pulserisetechnologies"],
    ["https://confluence.pinpointhq.com/en/postings/c7fe", "confluence"],
    // careers-page suffixes the company on the path; the suffix must come off.
    ["https://careers-page.com/5centscdn-careers/job/987", "5centscdn"],
    ["https://www.careers-page.com/alivio-search-partners-2/job/8XY4734R", "alivio-search-partners-2"],
    // ...and it ALSO ships a subdomain form, where the path is just "jobs".
    ["https://yoailabs.careers-page.com/jobs/73cf7592-dad8-442b-995d-720", "yoailabs"],
    ["https://careers.kula.ai/phaidra/54052", "phaidra"],
  ];
  for (const [url, expected] of cases) {
    assert.equal(companySlugFromUrl(url), expected, url);
  }
});

test("a board that hides the company yields no slug rather than a guess", () => {
  // These carry an opaque id, not a company. Guessing would block jobs the admin
  // never listed; returning "" instead routes them to the "unverified" bucket in
  // the paste filter, and to the post-extraction check once the page is read.
  const opaque = [
    "https://www1.jobdiva.com/portal/?a=svjdnwzkulao5hqo7t0ifgvj8s71sf01",
    "https://recruiting.paylocity.com/Recruiting/Jobs/Details/4501753",
    "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch/job/337042",
    "https://recruiterflow.com/HR/jobs/725",
  ];
  for (const url of opaque) assert.equal(companySlugFromUrl(url), "", url);
  assert.equal(companySlugFromUrl("not a url"), "");
  assert.equal(companySlugFromUrl(""), "");
  assert.equal(companySlugFromUrl(null), "");
});

test("a URL slug blocks a pasted job before it is ever fetched", () => {
  const list = parseBlacklist("Wispr Flow\nPubMatic");
  const url = "https://jobs.ashbyhq.com/wispr-flow/a093f7f3-d472-4f5e-bf88-96493915960a/application";
  const hit = matchBlacklist(companySlugFromUrl(url), list);
  assert.equal(hit?.label, "Wispr Flow");
});

test("a slug that differs from the name is caught later by the extracted name", () => {
  // Lever's slug is "nextgenfed" but the company is "NextGen Federal" -- exactly
  // why the post-extraction layer exists.
  const list = parseBlacklist("NextGen Federal");
  const url = "https://jobs.lever.co/nextgenfed/c14f66a4-f978-40c2-a3b7-a69669722437/apply";
  assert.equal(matchBlacklist(companySlugFromUrl(url), list), null, "slug alone cannot match");
  assert.ok(matchBlacklist("NextGen Federal", list), "the extracted name does");
});

test("parseBlacklist ignores blanks, comments and duplicates", () => {
  const list = parseBlacklist("Meta\n\n  \n# agencies below\nGoogle LLC\ngoogle\n#\nAffirm");
  assert.deepEqual(
    list.map((e) => e.label),
    ["Meta", "Google LLC", "Affirm"],
  );
});

test("board furniture is never treated as a company name", () => {
  // Regression: <company>.careers-page.com/jobs/<id> was read via the path rule
  // and yielded "jobs". Had anyone blacklisted a company normalizing to "jobs",
  // every job on that board would have been excluded.
  const list = parseBlacklist("Jobs\nCareers");
  for (const url of [
    "https://yoailabs.careers-page.com/jobs/73cf7592",
    "https://careers-page.com/jobs/abc",
  ]) {
    const slug = companySlugFromUrl(url);
    assert.notEqual(slug, "jobs", url);
    assert.equal(matchBlacklist(slug, list), null, `must not block on furniture: ${url}`);
  }
});

test("a differently-spelled query finds the entry already in the list", () => {
  // What the Settings search box relies on: the admin types the company however
  // they think of it, and it must find the existing entry rather than report
  // "not in the list" and invite a duplicate.
  const list = parseBlacklist("Google\nCharger Logistics Inc.\nWispr Flow");
  for (const [query, expected] of [
    ["google llc", "Google"],
    ["  GOOGLE  ", "Google"],
    ["charger logistics", "Charger Logistics Inc."],
    ["wispr-flow", "Wispr Flow"],
  ] as const) {
    assert.equal(matchBlacklist(query, list)?.label, expected, query);
  }
  assert.equal(matchBlacklist("Googly", list), null, "a different company is not a match");
});

test("an empty list matches nothing", () => {
  assert.deepEqual(parseBlacklist(""), []);
  assert.equal(matchBlacklist("Anything", parseBlacklist("")), null);
});
