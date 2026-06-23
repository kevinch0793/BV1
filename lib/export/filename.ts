// Export filename: "<first>_<last>_Resume.<ext>", e.g. "Bruke_Mammo_Resume.pdf".
// Same name every time (no company/JD), so a fresh download overwrites the old.
function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function resumeFileName(name: string, format: string): string {
  const tokens = (name || "Resume").trim().split(/\s+/).filter(Boolean);
  const first = safe(tokens[0] ?? "Resume");
  const last = tokens.length > 1 ? safe(tokens[tokens.length - 1]) : "";
  const base = [first, last, "Resume"].filter(Boolean).join("_") || "Resume";
  return `${base}.${format}`;
}
