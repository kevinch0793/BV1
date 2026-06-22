// "Bereket Abraham" + "pdf" -> "Bereket Abraham Resume.pdf".
// Keeps spaces, drops filesystem-illegal chars, no company/JD — so every export
// has the same name and overwrites the previous one.
export function resumeFileName(name: string, format: string): string {
  const cleaned = (name || "Resume").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Resume";
  return `${cleaned} Resume.${format}`;
}
