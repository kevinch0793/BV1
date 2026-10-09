import { test } from "node:test";
import assert from "node:assert/strict";

import { isVisibleJobStatus, visibleJobWhere } from "./jobVisibility.ts";

test("blacklisted rows are hidden, every other status is shown", () => {
  assert.equal(isVisibleJobStatus("excluded"), false);
  for (const s of ["pending", "fetching", "fetched", "tailoring", "needs_jd", "skipped", "failed"]) {
    assert.ok(isVisibleJobStatus(s), `${s} must stay visible`);
  }
});

test("a missing status is shown, not hidden", () => {
  // A row mid-write or a live poll that has not answered yet must not blink out
  // of the list; only an explicit "excluded" hides it.
  assert.ok(isVisibleJobStatus(null));
  assert.ok(isVisibleJobStatus(undefined));
  assert.ok(isVisibleJobStatus(""));
});

test("the query fragment excludes rather than selects", () => {
  // Written as "not excluded" so a new status added later is visible by default:
  // an allow-list would silently hide anything it had not been taught about.
  assert.deepEqual(visibleJobWhere, { status: { not: "excluded" } });
});
