import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyProbe, classifyThrown, isUsable, looksLikeOpenAIKey, maskKey, shouldRotate } from "./apiKeyStatus.ts";

const QUOTA_BODY = '{"error":{"message":"You have no credits remaining.","type":"insufficient_quota","code":"credit_balance_exhausted"}}';

test("a 200 is the only usable state", () => {
  assert.equal(classifyProbe(200, "").status, "ok");
  assert.ok(isUsable("ok"));
  for (const s of ["revoked", "no_credit", "rate_limited", "error", "unknown"] as const) assert.equal(isUsable(s), false);
});

test("an exhausted balance is not a dead key", () => {
  // The key is valid; only the billing account is empty. Reporting this as
  // "rejected" sent two separate investigations after key rotation when the
  // actual fix was topping up, so it gets a status of its own.
  const r = classifyProbe(429, QUOTA_BODY);
  assert.equal(r.status, "no_credit");
  assert.match(r.detail, /credit/i);
});

test("a 429 without a quota marker stays a rate limit", () => {
  assert.equal(classifyProbe(429, '{"error":{"message":"Rate limit reached","type":"requests"}}').status, "rate_limited");
});

test("a 401 is a rejected key", () => {
  assert.equal(classifyProbe(401, '{"error":{"code":"invalid_api_key"}}').status, "revoked");
});

test("anything else is a plain error, carrying the status code", () => {
  assert.equal(classifyProbe(500, "upstream boom").status, "error");
  assert.match(classifyProbe(503, "").detail, /503/);
});

test("only the last 6 characters are ever exposed", () => {
  assert.equal(maskKey("sk-proj-abcdefghijklmnopQ8OIYA"), "Q8OIYA");
  assert.equal(maskKey("short"), "short");
  assert.equal(maskKey(""), "");
});

test("obvious non-keys are refused before storage", () => {
  assert.ok(looksLikeOpenAIKey("sk-proj-" + "a".repeat(40)));
  assert.equal(looksLikeOpenAIKey("hello"), false);
  assert.equal(looksLikeOpenAIKey("sk-short"), false);
  assert.equal(looksLikeOpenAIKey("sk-proj-" + "a".repeat(40) + " trailing"), false);
});

test("a thrown SDK error classifies the same way a probe does", () => {
  // The SDK folds the upstream message into `message`, so the quota marker that
  // separates an empty account from a rate limit is still present.
  assert.equal(classifyThrown({ status: 429, message: "429 You have no credits remaining." }), "no_credit");
  assert.equal(classifyThrown({ status: 429, message: "429 Rate limit reached for gpt-4o" }), "rate_limited");
  assert.equal(classifyThrown({ status: 401, message: "401 Incorrect API key provided" }), "revoked");
});

test("a transport failure is not blamed on the key", () => {
  // No status: the request never got a verdict, so it says nothing about the key
  // and must not trigger a rotation.
  assert.equal(classifyThrown(new Error("socket hang up")), "error");
  assert.equal(classifyThrown(null), "error");
  assert.equal(shouldRotate("error"), false);
});

test("only another key can fix an exhausted or rejected key", () => {
  assert.ok(shouldRotate("no_credit"));
  assert.ok(shouldRotate("revoked"));
  // Rate limits are transient and account-wide; rotating would spend a healthy
  // spare for nothing.
  assert.equal(shouldRotate("rate_limited"), false);
  assert.equal(shouldRotate("ok"), false);
  assert.equal(shouldRotate("unknown"), false);
});
