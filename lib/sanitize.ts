// Strip non-hyphen dashes from generated/displayed resume text.
//
// Humans type the plain hyphen-minus (U+002D). The "middle" en dash (U+2013)
// and "long" em dash (U+2014) — plus their rarer cousins — read as
// machine-written, so we normalize every one of them to a plain hyphen.
const FANCY_DASHES = /[‐‑‒–—―⁃−]/g;

export function stripDashes(s: string): string {
  return s.replace(FANCY_DASHES, "-");
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
