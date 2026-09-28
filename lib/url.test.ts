import { test } from "node:test";
import assert from "node:assert/strict";

import { jobIdentityKey, normalizeUrl } from "./url.ts";

// The pairs below are real URLs from the job table.

test("the same job re-listed with a new tracking id is one job", () => {
  // Two Jobright links to ONE Greenhouse posting: jr_id differs, token (the
  // Greenhouse job id) is identical. Comparing raw URLs made these two rows.
  const a = "https://job-boards.greenhouse.io/embed/job_app?for=beyondtrust&jr_id=6a91b7e68e596854533771d6&token=8161719&utm_source=jobright";
  const b = "https://job-boards.greenhouse.io/embed/job_app?for=beyondtrust&jr_id=6a91b79aa27a2d3c98489698&token=8161719&utm_source=jobright";
  assert.notEqual(normalizeUrl(a), normalizeUrl(b), "raw URLs differ — this is why duplicates got through");
  assert.equal(jobIdentityKey(a), jobIdentityKey(b));
});

test("different jobs at the same company stay different", () => {
  // The guard that matters: collapsing these would silently discard real jobs.
  const a = "https://job-boards.greenhouse.io/embed/job_app?for=affirm&jr_id=aaa&token=1111";
  const b = "https://job-boards.greenhouse.io/embed/job_app?for=affirm&jr_id=bbb&token=2222";
  assert.notEqual(jobIdentityKey(a), jobIdentityKey(b));
});

test("identity params survive, tracking params do not", () => {
  const key = jobIdentityKey("https://job-boards.greenhouse.io/embed/job_app?for=acme&token=999&jr_id=x&utm_source=jobright&gh_src=abc");
  assert.ok(key);
  assert.match(key, /for=acme/);
  assert.match(key, /token=999/);
  assert.doesNotMatch(key, /jr_id/);
  assert.doesNotMatch(key, /utm_source/);
  assert.doesNotMatch(key, /gh_src/);
});

test("query order does not change identity", () => {
  const a = "https://jobs.example.com/x?b=2&a=1";
  const b = "https://jobs.example.com/x?a=1&b=2";
  assert.equal(jobIdentityKey(a), jobIdentityKey(b));
});

test("lever-source is tracking, and path-identified jobs still differ", () => {
  const a = "https://jobs.lever.co/nextgenfed/c14f66a4-f978-40c2-a3b7-a69669722437/apply?lever-source=jobright&jr_id=1";
  const b = "https://jobs.lever.co/nextgenfed/c14f66a4-f978-40c2-a3b7-a69669722437/apply?lever-source=linkedin&jr_id=2";
  assert.equal(jobIdentityKey(a), jobIdentityKey(b), "same posting, different referrer");
  const other = "https://jobs.lever.co/nextgenfed/99999999-0000-0000-0000-000000000000/apply?jr_id=3";
  assert.notEqual(jobIdentityKey(a), jobIdentityKey(other), "different posting");
});

test("unparseable input yields null, like normalizeUrl", () => {
  assert.equal(jobIdentityKey("not a url at all"), null);
  assert.equal(jobIdentityKey(""), null);
  assert.equal(jobIdentityKey(null), null);
});
