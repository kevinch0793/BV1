// Collapse a free-text job title into a coarse "role family" for the role-mix
// chart, so "Senior Software Engineer", "Software Engineer II", and "Staff SWE"
// all count as one family. Deterministic; no LLM.

const REQCODES = /\(.*?\)|\[.*?\]|#\s*\w+|\breq[-\s]?\d+\b|\b[a-z]*\d{3,}[a-z]*\b/g;
const SENIORITY = /\b(senior|sr|staff|principal|lead|junior|jr|associate|entry[-\s]?level|mid[-\s]?level|intern|contract|contractor)\b/g;
const LEVELS = /\b(i{1,3}|iv|v|[1-5])\b/g;

// Ordered: more specific families first; generic "Software Engineer" LAST.
const FAMILIES: [RegExp, string][] = [
  [/machine learning|ml engineer|\bml\b|deep learning|ai engineer|\bnlp\b|computer vision/, "ML / AI Engineer"],
  [/data scientist/, "Data Scientist"],
  [/data engineer/, "Data Engineer"],
  [/data analyst|business analyst|\banalytics\b/, "Data Analyst"],
  [/devops|site reliability|\bsre\b|platform engineer|infrastructure|cloud engineer/, "DevOps / Platform"],
  [/front[-\s]?end/, "Frontend Engineer"],
  [/back[-\s]?end/, "Backend Engineer"],
  [/full[-\s]?stack/, "Full-Stack Engineer"],
  [/mobile|\bios\b|android/, "Mobile Engineer"],
  [/security|appsec|infosec/, "Security Engineer"],
  [/\bqa\b|quality assurance|test engineer|\bsdet\b/, "QA / Test"],
  [/product manager|\bpm\b|product owner/, "Product Manager"],
  [/designer|\bux\b|\bui\b|user experience/, "Designer"],
  [/engineering manager|\bem\b|director|head of|vp of|tech lead/, "Engineering / Tech Lead"],
  [/software engineer|software developer|\bswe\b|\bsde\b|developer|programmer/, "Software Engineer"],
];

export function normalizeRole(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .toLowerCase()
    .replace(REQCODES, " ")
    .replace(SENIORITY, " ")
    .replace(LEVELS, " ")
    .replace(/[^a-z0-9+/#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Unknown";
  for (const [re, fam] of FAMILIES) if (re.test(cleaned)) return fam;
  // No family match: Title-Case the cleaned string (capped to a few words).
  return cleaned
    .split(" ")
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Roll a list of {family,count} up to the top-N + an aggregated "Other". */
export function topFamilies(families: { family: string; count: number }[], n: number): { family: string; count: number }[] {
  const sorted = [...families].sort((a, b) => b.count - a.count);
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const other = sorted.slice(n).reduce((sum, f) => sum + f.count, 0);
  return other > 0 ? [...head, { family: "Other", count: other }] : head;
}
