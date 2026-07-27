// Export filename: a fixed "First Last.pdf" per candidate (first + last name token
// only — middle names dropped). Deliberately excludes role/company/date so it's the
// same name every time, letting a re-download overwrite the previous file instead of
// piling up "… (1).pdf" copies. Only OS-illegal filename characters are stripped;
// spaces and letters are kept.
function sanitize(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "") // characters illegal in file names
    .replace(/\s+/g, " ")
    .trim();
}

export function resumeFileName(name: string, format: string): string {
  const tokens = (name || "").trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? "";
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : "";
  const who = sanitize([first, last].filter(Boolean).join(" ")) || "Resume";
  return `${who}.${format}`;
}
