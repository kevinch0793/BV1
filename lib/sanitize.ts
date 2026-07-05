import type { ResumeContent } from "@/lib/llm/schema";

// Strip non-hyphen dashes from generated/displayed resume text.
//
// Humans type the plain hyphen-minus (U+002D). The "middle" en dash (U+2013)
// and "long" em dash (U+2014) — plus their rarer cousins — read as
// machine-written, so we normalize every one of them to a plain hyphen.
const FANCY_DASHES = /[‐‑‒–—―⁃−]/g;

export function stripDashes(s: string): string {
  return s.replace(FANCY_DASHES, "-");
}

// Other typographic characters an LLM emits that aren't on a physical keyboard:
// curly quotes, ellipsis, non-breaking / odd-width spaces, bullets. Normalize each
// to its plain-keyboard equivalent (dashes are handled by stripDashes).
const CURLY_SINGLE = /[‘’‚‛′]/g;
const CURLY_DOUBLE = /[“”„‟″]/g;
const ELLIPSIS = /…/g;
const ODD_SPACES = /[         　]/g;
const BULLETS = /[•‣◦⁃∙]/g;

/** Force text to plain keyboard characters: hyphen, straight quotes, "...", spaces. */
export function toPlainKeyboard(s: string): string {
  return stripDashes(s)
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"')
    .replace(ELLIPSIS, "...")
    .replace(ODD_SPACES, " ")
    .replace(BULLETS, "-");
}

/** Deep-clone a value, replacing fancy dashes in every string it contains. */
export function deepStripDashes<T>(value: T): T {
  if (typeof value === "string") return stripDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepStripDashes(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepStripDashes(v);
    return out as unknown as T;
  }
  return value;
}

// Within each experience, drop bullets that repeat across project subgroups (a
// NAMED subgroup keeps the bullet), then drop any subgroup left with no bullets.
// Guards against the tailor emitting the same bullets under both an unnamed
// default subgroup AND a named one, which the template renders as duplicated
// bullets with a title wedged between them.
export function dedupeExperienceProjects(content: ResumeContent): ResumeContent {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return {
    ...content,
    experience: content.experience.map((e) => {
      const projects = e.projects ?? [];
      // Bullets that appear in a named subgroup win — record them first.
      const claimed = new Set<string>();
      for (const p of projects) {
        if (p.name || p.type) for (const b of p.bullets) { const k = norm(b); if (k) claimed.add(k); }
      }
      const seen = new Set<string>();
      const cleaned = projects.map((p) => {
        const named = !!(p.name || p.type);
        const bullets = p.bullets.filter((b) => {
          const k = norm(b);
          if (!k) return false;
          if (!named && claimed.has(k)) return false; // duplicate of a named subgroup's bullet
          if (seen.has(k)) return false; // duplicate across subgroups (keep the first)
          seen.add(k);
          return true;
        });
        return { ...p, bullets };
      });
      return { ...e, projects: cleaned.filter((p) => p.bullets.length > 0) };
    }),
  };
}
