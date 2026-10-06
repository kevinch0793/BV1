import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyProbe, isUsable, looksLikeOpenAIKey, maskKey } from "./apiKeyStatus.ts";

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
