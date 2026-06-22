// Client-side helper: fetch an export from /api/export and save it directly to
// disk (no print dialog). Used by the resume viewer, the dashboard preview
// modal, and the "Apply" action.

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
  URL.revokeObjectURL(url);
}
