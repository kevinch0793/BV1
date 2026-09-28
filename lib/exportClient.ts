// Client-side helper: fetch an export from /api/export and save it directly to
// disk (no print dialog). Used by the resume viewer, the dashboard preview
// modal, and the "Apply" action.

// Native, gesture-tied download: click a real <a> straight to /api/export (which
// replies with Content-Disposition: attachment). Unlike the blob path below,
// this runs synchronously inside the click handler, so the browser treats every
// click as user-initiated — repeated downloads (e.g. applying to several jobs in
// a row) don't trip Chrome's "multiple automatic downloads" block.
export function downloadResumeNative(
  tailoredId: string,
  format: "pdf" | "docx",
  params?: Record<string, string>,
): void {
  const qs = new URLSearchParams({ format, ...(params ?? {}) });
  const a = document.createElement("a");
  a.href = `/api/export/${tailoredId}?${qs}`;
  // `download` makes the click a background download instead of navigating the
  // current tab (which would block the job-posting window.open). The actual
  // filename still comes from the response's Content-Disposition header.
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * The same gesture-tied download for a profile's FIXED resume — the one file a
 * "normal"-plan candidate attaches to every application.
 *
 * Shares the /api/export/ prefix with the tailored route on purpose: the browser
 * extension only renames-and-overwrites downloads under that path, so both plans
 * end up with one clean "First Last.pdf" rather than a pile of copies.
 */
export function downloadFixedResumeNative(profileId: string): void {
  const a = document.createElement("a");
  a.href = `/api/export/fixed/${profileId}`;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadResume(
  tailoredId: string,
  format: "pdf" | "docx",
  params?: Record<string, string>,
): Promise<void> {
  const qs = new URLSearchParams({ format, ...(params ?? {}) });
  const res = await fetch(`/api/export/${tailoredId}?${qs}`);
  if (!res.ok) throw new Error((await res.text()) || "Export failed");
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] || `resume.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so the download has time to start (revoking immediately can
  // cancel it in some browsers).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
