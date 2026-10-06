import { test } from "node:test";
import assert from "node:assert/strict";

import { staleIncompleteWhere } from "./retention-policy.ts";

const CUTOFF = new Date("2026-10-03T02:00:00.000Z");

test("prunes only what was created before the cutoff and never tailored", () => {
  const w = staleIncompleteWhere(CUTOFF);
  assert.deepEqual(w.createdAt, { lt: CUTOFF });
  assert.deepEqual(w.tailored, { none: {} });
});

test("a job the candidate applied to is never pruned", () => {
  // applyStatus/appliedAt live on the job row, so deleting it destroys the only
  // record of the application. Restricting the delete to applyStatus "none"
  // leaves "applied" and "not_available" rows untouched on every plan.
  assert.equal(staleIncompleteWhere(CUTOFF).applyStatus, "none");
});

test("a fetched job on a normal-plan profile counts as finished, not abandoned", () => {
  // Regression: a "normal" plan never tailors, so keying completion on the resume
  // alone deleted every such job after two app-days and those dashboards showed
  // no history at all while the pipeline was running fine.
  assert.deepEqual(staleIncompleteWhere(CUTOFF).NOT, {
    status: "fetched",
    profile: { is: { plan: "normal" } },
  });
});

test("the exclusion is narrow enough to still prune genuinely unfinished work", () => {
  // It must not widen into "keep everything on a normal plan": a failed or
  // needs_jd row is abandoned on any plan, and the NOT only spares status
  // "fetched". Guarding the pair together keeps untouched fetched rows on a
  // TAILORING profile prunable, which is the original intent of this sweep.
  const not = staleIncompleteWhere(CUTOFF).NOT as Record<string, unknown>;
  assert.equal(not.status, "fetched");
  assert.ok(not.profile, "the plan must be part of the same condition, not a separate clause");
});
