import { test } from "node:test";
import assert from "node:assert/strict";

import { checkFixedResume, extensionOf, looksLikeType, MAX_BYTES } from "./fixedResume.ts";

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK..

test("extensionOf reads the trailing extension only", () => {
  assert.equal(extensionOf("Andrew Tran.pdf"), "pdf");
  assert.equal(extensionOf("resume.final.DOCX"), "docx");
  assert.equal(extensionOf("no-extension"), "");
  assert.equal(extensionOf(""), "");
});

test("a valid PDF and DOCX are accepted", () => {
  const pdf = checkFixedResume({ filename: "Andrew Tran.pdf", size: 120_000, head: PDF_HEAD });
  assert.deepEqual(pdf, { ok: true, ext: "pdf", mimeType: "application/pdf" });

  const docx = checkFixedResume({ filename: "resume.docx", size: 40_000, head: ZIP_HEAD });
  assert.equal(docx.ok, true);
  assert.match((docx as { mimeType: string }).mimeType, /wordprocessingml/);
});

test("content is checked, not just the extension", () => {
  // The common real mistake: a file renamed to .pdf, or a half-finished export.
  const r = checkFixedResume({ filename: "resume.pdf", size: 1000, head: ZIP_HEAD });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /isn't a valid PDF/);
});

test("other file types are rejected", () => {
  for (const name of ["resume.doc", "resume.txt", "resume.png", "resume"]) {
    const r = checkFixedResume({ filename: name, size: 1000, head: PDF_HEAD });
    assert.equal(r.ok, false, name);
    assert.match((r as { error: string }).error, /PDF or DOCX/);
  }
});

test("empty and oversized files are rejected with a useful message", () => {
  assert.match(
    (checkFixedResume({ filename: "a.pdf", size: 0, head: PDF_HEAD }) as { error: string }).error,
    /empty/,
  );
  const big = checkFixedResume({ filename: "a.pdf", size: MAX_BYTES + 1, head: PDF_HEAD }) as { error: string };
  assert.match(big.error, /limit is 5 MB/);
  // The message names the actual size, so the user knows by how much.
  assert.match(big.error, /5\.0 MB/);
});

test("a file exactly at the limit is allowed", () => {
  assert.equal(checkFixedResume({ filename: "a.pdf", size: MAX_BYTES, head: PDF_HEAD }).ok, true);
});

test("looksLikeType needs the real signature", () => {
  assert.ok(looksLikeType("pdf", PDF_HEAD));
  assert.ok(looksLikeType("docx", ZIP_HEAD));
  assert.ok(!looksLikeType("pdf", new Uint8Array([0, 0, 0, 0])));
  assert.ok(!looksLikeType("exe", PDF_HEAD));
  assert.ok(!looksLikeType("pdf", new Uint8Array([])), "a truncated file is not valid");
});
