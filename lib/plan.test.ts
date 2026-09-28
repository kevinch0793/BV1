import { test } from "node:test";
import assert from "node:assert/strict";

import { canTailorProfile, isPlan, planAllowsTailoring, planOf } from "./plan.ts";

test("an unknown or missing plan reads as tailor", () => {
  // Existing rows predate the column, and a profile wrongly treated as "normal"
  // stops producing resumes silently — so the safe default is the capable plan.
  for (const v of [null, undefined, "", "  ", "premium", "TAILOR"]) {
    assert.equal(planOf(v), "tailor", String(v));
  }
  assert.equal(planOf("normal"), "normal");
  assert.equal(planOf("tailor"), "tailor");
});

test("isPlan accepts only the two known values", () => {
  assert.ok(isPlan("tailor"));
  assert.ok(isPlan("normal"));
  for (const v of ["Normal", "free", "", null, undefined]) assert.ok(!isPlan(v as string));
});

test("only the tailor plan permits tailoring", () => {
  assert.ok(planAllowsTailoring("tailor"));
  assert.ok(!planAllowsTailoring("normal"));
  assert.ok(planAllowsTailoring(null), "unknown falls back to tailor");
});

test("the normal plan never tailors, however complete the profile", () => {
  assert.ok(!canTailorProfile({ plan: "normal", hasBaseResume: true, experienceCount: 9 }));
});

test("the tailor plan still needs something to tailor from", () => {
  // The pre-existing data check must survive the new permission check.
  assert.ok(!canTailorProfile({ plan: "tailor", hasBaseResume: false, experienceCount: 0 }));
  assert.ok(canTailorProfile({ plan: "tailor", hasBaseResume: true, experienceCount: 0 }));
  assert.ok(canTailorProfile({ plan: "tailor", hasBaseResume: false, experienceCount: 1 }));
});

test("a profile with no plan set behaves exactly as before this feature", () => {
  // The deploy must be behaviour-neutral: every existing profile has no plan
  // column value until it is set, and must keep tailoring.
  assert.ok(canTailorProfile({ plan: null, hasBaseResume: true, experienceCount: 0 }));
  assert.ok(canTailorProfile({ plan: undefined, hasBaseResume: false, experienceCount: 3 }));
  assert.ok(!canTailorProfile({ plan: null, hasBaseResume: false, experienceCount: 0 }));
});
