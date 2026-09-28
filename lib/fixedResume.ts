// The one fixed resume a "normal"-plan candidate attaches to every application.
// Validation lives here (pure, testable) rather than inline in the Server Action.

/** What a candidate may upload. Anything else is rejected by extension AND by
 *  the file's own magic bytes, because a browser-reported MIME type is just a
 *  hint and an extension is only a label. */
export const ALLOWED = [
  { ext: "pdf", mime: "application/pdf" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
] as const;

/** 5 MB. A resume is well under this; the cap exists so a mis-drop can't put a
 *  large blob in the database, which is also what the nightly backup copies. */
export const MAX_BYTES = 5 * 1024 * 1024;

export type FixedResumeCheck =
  | { ok: true; ext: string; mimeType: string }
  | { ok: false; error: string };

/** The extension of an uploaded name, lowercased and without the dot. */
export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec((filename ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Does the file's leading bytes match what its extension claims?
 *
 * PDFs start "%PDF-"; .docx is a ZIP container, so "PK". This is not a security
 * boundary — the file is only ever served back to the same account — but it
 * catches the common real mistake of a renamed or half-exported file, which
 * would otherwise be discovered only when an application rejects it.
 */
export function looksLikeType(ext: string, head: Uint8Array): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (ext === "pdf") return starts([0x25, 0x50, 0x44, 0x46]); // %PDF
  if (ext === "docx") return starts([0x50, 0x4b]); // PK (zip)
  return false;
}

/** Validate an upload. `head` is the first few bytes of the file. */
export function checkFixedResume(input: { filename: string; size: number; head: Uint8Array }): FixedResumeCheck {
  const name = (input.filename ?? "").trim();
  if (!name) return { ok: false, error: "Choose a file to upload." };
  if (input.size <= 0) return { ok: false, error: "That file is empty." };
  if (input.size > MAX_BYTES) {
    return { ok: false, error: `That file is ${(input.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.` };
  }
  const ext = extensionOf(name);
  const allowed = ALLOWED.find((a) => a.ext === ext);
  if (!allowed) return { ok: false, error: "Upload a PDF or DOCX." };
  if (!looksLikeType(ext, input.head)) {
    return { ok: false, error: `That file is named .${ext} but isn't a valid ${ext.toUpperCase()}.` };
  }
  return { ok: true, ext, mimeType: allowed.mime };
}
