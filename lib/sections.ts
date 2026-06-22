// Pure section-ordering helpers — safe to import from client components
// (no Prisma/server dependencies).

export type SectionKey = "summary" | "experience" | "skills" | "education";

export const SECTION_KEYS: SectionKey[] = ["summary", "experience", "skills", "education"];

export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Work Experience",
  skills: "Skills",
  education: "Education",
};

/** Parse a stored "a,b,c" order into a complete, de-duplicated, valid permutation. */
export function parseSectionOrder(raw?: string | null): SectionKey[] {
  const seen = new Set<SectionKey>();
  const out: SectionKey[] = [];
  for (const part of (raw ?? "").split(",").map((s) => s.trim())) {
    if ((SECTION_KEYS as string[]).includes(part) && !seen.has(part as SectionKey)) {
      seen.add(part as SectionKey);
      out.push(part as SectionKey);
    }
  }
  for (const k of SECTION_KEYS) if (!seen.has(k)) out.push(k);
  return out;
}
