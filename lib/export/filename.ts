// Export filename: "<FirstLast>_Resume_<role>_<company>_<yy>.<ext>",
// e.g. "BrukeMammo_Resume_Software_Google_26.pdf". Kept brief: name is
// first+last joined, role is the first ~8 letters, company is its first word,
// and the year is 2 digits. Missing role/company are simply omitted.
function alnum(s: string): string {
  return s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "");
}

export function resumeFileName(
  name: string,
  format: string,
  opts?: { role?: string | null; company?: string | null; year?: number },
): string {
  const tokens = (name || "").trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? "";
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : "";
  const who = alnum(first + last) || "Resume"; // firstlast

  const parts = [who, "Resume"];

  const role = opts?.role ? alnum(opts.role).slice(0, 8) : ""; // first ~8 letters
  if (role) parts.push(role);

  // Company you're applying to: first word only.
  const firstWord = (opts?.company ?? "").trim().split(/\s+/)[0] ?? "";
  const company = alnum(firstWord);
  if (company) parts.push(company);

  const yy = String((opts?.year ?? new Date().getFullYear()) % 100).padStart(2, "0");

  return `${parts.join("_")}_${yy}.${format}`;
}
