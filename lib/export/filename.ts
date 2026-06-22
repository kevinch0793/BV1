// Export filename: "<first name>_<company>.<ext>", e.g. "Bereket_Dabble.pdf".
// Falls back to "<first name>_Resume.<ext>" when there's no associated company.
function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Resume";
}

export function resumeFileName(name: string, company: string | null | undefined, format: string): string {
  const first = safe((name || "Resume").trim().split(/\s+/)[0] || "Resume");
  const co = company && company.trim() ? safe(company) : "Resume";
  return `${first}_${co}.${format}`;
}
