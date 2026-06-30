import { z } from "zod";
import { generateStructuredExtract } from "@/lib/llm/balance";
import type { ResumeContent } from "@/lib/llm/schema";
import type { JobForLLM, ProfileForLLM } from "@/lib/llm/prompts";

// ATS-style keyword/skill coverage (à la Jobscan): extract the JD's skills, then
// deterministically measure how many appear in a resume. We split the JD into
// two kinds of keywords so the resume doesn't keyword-stuff:
//   - hardSkills: concrete named tech/tools — fine to LIST in a Skills section.
//   - themes: conceptual/activity phrases (multi-tenant, migration, ...) — only
//     legitimate when DEMONSTRATED in a bullet, never listed as a "skill".
// hardSkills weigh more in scoring; themes count only where genuinely present.

export type JdSkills = { hardSkills: string[]; themes: string[] };
export type FitResult = { score: number; matched: string[]; missing: string[] };

const JdSkillsSchema = z.object({
  hardSkills: z
    .array(z.string())
    .describe("Concrete, nameable technologies/tools/languages/frameworks/platforms/databases/protocols a resume can list as skills"),
  themes: z
    .array(z.string())
    .describe("Conceptual/architectural/activity/methodology phrases that are demonstrated through work, not listed as skills"),
});

/** Pull normalized JD keywords out of a job description, split into two kinds. */
export async function extractJdSkills(job: JobForLLM): Promise<JdSkills> {
  const jobText = [
    job.role && `Role: ${job.role}`,
    job.company && `Company: ${job.company}`,
    job.requirements?.length ? `Requirements:\n- ${job.requirements.join("\n- ")}` : "",
    job.description ? `Description:\n${job.description.slice(0, 30000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateStructuredExtract({
    schema: JdSkillsSchema,
    schemaName: "jd_skills",
    maxTokens: 2000,
    system:
      "Pull the ATS-relevant keywords out of a job description and sort each into exactly ONE of two buckets. " +
      "hardSkills = concrete, NAMEABLE technologies a resume can legitimately list as a skill: languages, frameworks, libraries, tools, platforms, databases, protocols, cloud services (e.g. 'Python', 'Kubernetes', 'PostgreSQL', 'React', 'AWS', 'Kafka', 'gRPC', 'Terraform'). Normalize to short canonical atomic forms; split compounds like 'modern C++' -> 'C++'. " +
      "themes = conceptual phrases, architectures, activities, methodologies, and responsibilities that are PROVEN through experience, not listed as a skill (e.g. 'multi-tenant platforms', 'migration', 'modernization', 'infrastructure assessment', 'load balancing', 'distributed systems', 'code reusability', 'scalability'). When unsure whether a term is a nameable tool vs a concept/activity, put it in themes. " +
      "EXCLUDE entirely (neither bucket): education/degrees, years-of-experience, job titles, company names, and soft/vague phrases (communication, collaboration, mentorship, 'fast-paced', 'detail-oriented', 'stakeholder management', 'emerging technologies', 'problem-solving'). " +
      "No duplicates across buckets, no sentences. Keep it tight: at most ~18 hardSkills and ~10 themes.",
    prompt: jobText || "No job text provided.",
  });
}

/** Flatten a structured profile to plain text (the "before" baseline). */
export function profileToText(p: ProfileForLLM): string {
  const parts: string[] = [p.summary ?? ""];
  parts.push(p.skills.map((s) => s.name).join(", "));
  for (const e of p.experiences) {
    parts.push(`${e.role} ${e.company}`);
    for (const g of e.projects ?? []) {
      parts.push(`${g.name} ${g.type}`);
      parts.push(...g.bullets);
    }
  }
  for (const ed of p.education) parts.push(`${ed.school} ${ed.degree ?? ""} ${ed.field ?? ""}`);
  return parts.join("\n");
}

export type FitSummary = { fitBefore: number | null; fitAfter: number | null; fitDetail: unknown };

/**
 * Compute before/after ATS coverage for a tailoring. Extracts the JD's skills
 * once, then scores the base text and the tailored resume against them. Never
 * throws — returns nulls if skill extraction fails.
 */
export async function computeFit(job: JobForLLM, beforeText: string, content: ResumeContent): Promise<FitSummary> {
  let skills: JdSkills;
  try {
    skills = await extractJdSkills(job);
  } catch {
    return { fitBefore: null, fitAfter: null, fitDetail: null };
  }
  return scoreFit(skills, job.role ?? "", beforeText, content);
}

/**
 * Deterministic before/after scoring once the JD skills are known (no LLM call).
 * Lets callers extract JD skills in parallel with tailoring, then score here.
 * Pass `skills = null` (e.g. extraction failed) to get a null fit.
 */
export function scoreFit(skills: JdSkills | null, jdTitle: string, beforeText: string, content: ResumeContent): FitSummary {
  if (!skills) return { fitBefore: null, fitAfter: null, fitDetail: null };
  const before = scoreSections(skills, jdTitle, sectionsFromFlat(beforeText));
  const after = scoreSections(skills, jdTitle, sectionsFromContent(content));
  return {
    fitBefore: before?.score ?? null,
    fitAfter: after?.score ?? null,
    fitDetail: {
      jdSkills: skills,
      matched: after?.matched ?? [],
      missing: after?.missing ?? [],
      breakdown: before && after ? { before: subScores(before), after: subScores(after) } : null,
    },
  };
}

const subScores = (b: ScoreBreakdown) => ({
  titleScore: b.titleScore,
  hardScore: b.hardScore,
  themeScore: b.themeScore,
  recency: b.recency,
});

/** Flatten a tailored resume to plain text for keyword matching. */
export function resumeToText(c: ResumeContent): string {
  const parts: string[] = [c.title, c.summary];
  for (const s of c.skills) parts.push(`${s.category}: ${s.items.join(", ")}`);
  for (const e of c.experience) {
    parts.push(`${e.role} ${e.company} ${e.location}`);
    for (const p of e.projects ?? []) {
      parts.push(`${p.name} ${p.type}`);
      parts.push(...p.bullets);
    }
  }
  for (const ed of c.education) parts.push(`${ed.school} ${ed.degree} ${ed.field} ${ed.details}`);
  return parts.join("\n");
}

// ---- Recency: down-weight a skill whose ONLY evidence is old dated experience.
// A skill listed in Skills or proven in a recent role keeps full credit; one seen
// only in long-past roles decays to a floor. Overall scores barely move.
const RECENT_YEARS = 3; // within this many years of now → full credit
const OLD_YEARS = 12; // at/after this many years ago → floor
const OLD_FLOOR = 0.8; // weight for a skill whose sole evidence is ~12y+ old

// Parse a free-text endDate ("Present", "Jan 2021", "2019") to an end year.
// Ongoing / empty / unparseable → null, i.e. treated as current (no penalty) — we
// only ever penalize a CONFIDENTLY old year.
function endYearOf(endDate: string | null | undefined): number | null {
  const s = (endDate ?? "").toLowerCase();
  if (!s || /present|current|now|ongoing|to ?date|till date/.test(s)) return null;
  const m = s.match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

// Recency weight for one experience entry. Ongoing/unknown or recent → 1; decays
// linearly to OLD_FLOOR at OLD_YEARS.
function entryRecency(endYear: number | null, nowYear: number): number {
  if (endYear == null) return 1;
  const ago = nowYear - endYear;
  if (ago <= RECENT_YEARS) return 1;
  if (ago >= OLD_YEARS) return OLD_FLOOR;
  return 1 - ((ago - RECENT_YEARS) / (OLD_YEARS - RECENT_YEARS)) * (1 - OLD_FLOOR);
}

// Section-split view of a resume, so we can score by WHERE a keyword appears
// (hard skills count anywhere; themes only count as proven inside experience).
// Experience is split per-entry, each carrying a recency weight from its end date.
export type ResumeSections = {
  title: string;
  skillsText: string;
  otherText: string;
  entries: { text: string; recency: number }[]; // one per experience entry (raw text)
};

function sectionsFromContent(c: ResumeContent): ResumeSections {
  const nowYear = new Date().getFullYear();
  const skillsText = c.skills.map((s) => `${s.category}: ${s.items.join(", ")}`).join("\n");
  const entries = c.experience.map((e) => {
    const parts = [`${e.role} ${e.company} ${e.location}`];
    for (const p of e.projects ?? []) {
      parts.push(`${p.name} ${p.type}`);
      parts.push(...p.bullets);
    }
    return { text: parts.join("\n"), recency: entryRecency(endYearOf(e.endDate), nowYear) };
  });
  const edu = c.education.map((ed) => `${ed.school} ${ed.degree} ${ed.field} ${ed.details}`);
  return { title: c.title, skillsText, otherText: [c.summary, ...edu].join("\n"), entries };
}

// Flat baseline text (a base resume / profile dump) has no structure or dates —
// treat the whole thing as one undated experience entry (full credit), so the
// before-score is never recency-penalized and stays comparable to the after-score.
function sectionsFromFlat(text: string): ResumeSections {
  return { title: "", skillsText: "", otherText: "", entries: [{ text, recency: 1 }] };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.\s/-]/g, " ").replace(/\s+/g, " ").trim();

// Common abbreviation/synonym groups — any form counts as the others, so a resume
// saying "K8s" still matches a JD skill of "Kubernetes" (and vice versa).
const SYNONYM_GROUPS: string[][] = [
  ["kubernetes", "k8s"],
  ["javascript", "js"],
  ["typescript", "ts"],
  ["postgresql", "postgres"],
  ["node.js", "nodejs", "node js"],
  ["ci/cd", "cicd", "ci cd", "continuous integration"],
  ["google cloud", "gcp", "google cloud platform"],
  ["amazon web services", "aws"],
  ["machine learning", "ml"],
  ["artificial intelligence", "ai"],
  ["natural language processing", "nlp"],
  ["infrastructure as code", "iac"],
  ["rest", "restful", "rest api", "rest apis"],
  ["large language models", "llm", "llms"],
  ["object oriented", "oop", "object-oriented"],
];
const SYN = new Map<string, string[]>();
for (const g of SYNONYM_GROUPS) {
  const forms = g.map(normalize);
  for (const w of forms) SYN.set(w, forms);
}

// Concept/theme → concrete tools that imply it (one-directional, normalized keys).
// Credits a JD concept ("containerization") when the resume names a tool that
// demonstrates it (Docker/Kubernetes), even if the literal phrase never appears.
// Conservative: only strong, unambiguous implications — loose ones (e.g.
// "distributed systems" → kafka) are omitted to protect precision. Easy to extend.
const CONCEPT_IMPLICATIONS: Record<string, string[]> = {
  containerization: ["docker", "kubernetes", "k8s", "containerd", "podman", "openshift"],
  containers: ["docker", "kubernetes", "k8s", "containerd", "podman"],
  "container orchestration": ["kubernetes", "k8s", "nomad", "ecs", "openshift"],
  orchestration: ["kubernetes", "k8s", "nomad", "airflow"],
  "ci/cd": ["github actions", "gitlab ci", "jenkins", "circleci", "travis", "teamcity", "argocd", "buildkite", "azure pipelines"],
  "continuous integration": ["github actions", "gitlab ci", "jenkins", "circleci", "travis", "teamcity"],
  "continuous delivery": ["argocd", "spinnaker", "github actions", "gitlab ci"],
  "continuous deployment": ["argocd", "spinnaker", "github actions", "gitlab ci"],
  "infrastructure as code": ["terraform", "pulumi", "cloudformation", "ansible"],
  iac: ["terraform", "pulumi", "cloudformation", "ansible"],
  observability: ["prometheus", "grafana", "datadog", "opentelemetry", "new relic", "splunk"],
  monitoring: ["prometheus", "grafana", "datadog", "new relic", "splunk", "cloudwatch"],
  "event-driven": ["kafka", "rabbitmq", "sqs", "eventbridge", "nats"],
  "event streaming": ["kafka", "kinesis", "pulsar", "flink"],
  "message queue": ["kafka", "rabbitmq", "sqs", "nats", "kinesis", "activemq"],
  caching: ["redis", "memcached"],
  "full-text search": ["elasticsearch", "opensearch", "solr", "algolia"],
  serverless: ["lambda", "cloud functions", "azure functions", "fargate", "cloudflare workers"],
  etl: ["airflow", "spark", "dbt", "dagster", "luigi"],
  "data pipeline": ["airflow", "spark", "dbt", "kafka", "dagster"],
  "relational database": ["postgres", "postgresql", "mysql", "sql server", "oracle", "mariadb"],
  rdbms: ["postgres", "postgresql", "mysql", "sql server", "oracle"],
  nosql: ["mongodb", "dynamodb", "cassandra", "couchbase", "redis"],
  cloud: ["aws", "gcp", "azure", "amazon web services", "google cloud"],
  "version control": ["git", "github", "gitlab", "bitbucket"],
};

function present(skill: string, haystack: string): boolean {
  const s = normalize(skill);
  if (!s) return false;
  // Exact substring, or any synonym/abbreviation form.
  for (const form of SYN.get(s) ?? [s]) {
    if (haystack.includes(form)) return true;
  }
  // Concept → implied concrete tech (one-directional): a JD concept is covered
  // when the resume names a tool that demonstrates it.
  const implied = CONCEPT_IMPLICATIONS[s];
  if (implied && implied.some((t) => haystack.includes(t))) return true;
  // Multi-word skills: count it covered if a strong majority of its significant
  // tokens appear (tolerates phrasing differences like "modern C++" vs "C++").
  const tokens = s.split(" ").filter((t) => t.length > 2);
  if (tokens.length >= 2) {
    const need = Math.max(2, Math.ceil(tokens.length * 0.6));
    if (tokens.filter((t) => haystack.includes(t)).length >= need) return true;
  }
  return false;
}

type ScoreBreakdown = { score: number; titleScore: number; hardScore: number; themeScore: number; recency: number; matched: string[]; missing: string[] };

// Title tokens that carry no matching value — seniority, level, employment type,
// connective words. The role NOUN (engineer/manager/designer/...) is kept.
const TITLE_STOP = new Set([
  "the", "a", "an", "of", "and", "or", "for", "with", "to", "in", "at", "on",
  "senior", "sr", "junior", "jr", "lead", "staff", "principal", "mid", "entry", "level", "associate",
  "i", "ii", "iii", "iv", "v", "1", "2", "3", "4", "5",
  "intern", "contract", "contractor", "temporary", "remote", "hybrid", "onsite", "fulltime", "parttime",
]);
// A few title abbreviations expanded before tokenizing (so "SWE" mirrors "Software Engineer").
const TITLE_ABBREV: [string, string][] = [
  [" swe ", " software engineer "],
  [" sde ", " software engineer "],
  [" sre ", " site reliability engineer "],
  [" ml engineer ", " machine learning engineer "],
  [" pm ", " product manager "],
];

function titleTokens(s: string): string[] {
  let t = ` ${normalize(s)} `;
  for (const [ab, full] of TITLE_ABBREV) t = t.split(ab).join(full);
  return t.split(" ").filter((w) => w.length > 1 && !TITLE_STOP.has(w) && !/\d{3,}/.test(w));
}

/** 0..1 how well the resume headline mirrors the JD role; null if the JD role has no signal. */
function titleMatch(jdTitle: string, resumeTitle: string): number | null {
  const want = titleTokens(jdTitle);
  if (want.length === 0) return null; // e.g. role was a pure req code / only seniority words
  const have = normalize(resumeTitle);
  if (have.includes(want.join(" "))) return 1; // verbatim contiguous mirror — full credit
  const haveToks = new Set(have.split(" "));
  return want.filter((w) => haveToks.has(w)).length / want.length;
}

/**
 * Section-aware ATS match emulating real engines (Taleo/iCIMS/Workday/...):
 * - Title match is the highest-value signal, applied as a bounded demotion
 *   factor (a total miss costs 20%, never zeroes a strong resume).
 * - Hard skills count when present ANYWHERE (binary — no frequency reward).
 * - Themes are credited 1.0 only when PROVEN in experience, 0.4 if merely
 *   mentioned elsewhere (signal: prove it in a bullet), else 0.
 */
function scoreSections(skills: JdSkills, jdTitle: string, sec: ResumeSections): ScoreBreakdown | null {
  // Dedup within buckets; a term in both buckets is treated as a hard skill only.
  const hardKeys = new Set<string>();
  const hard: string[] = [];
  for (const s of skills.hardSkills) {
    const k = normalize(s);
    if (k && !hardKeys.has(k)) { hardKeys.add(k); hard.push(s); }
  }
  const themeKeys = new Set<string>();
  const themes: string[] = [];
  for (const s of skills.themes) {
    const k = normalize(s);
    if (k && !hardKeys.has(k) && !themeKeys.has(k)) { themeKeys.add(k); themes.push(s); }
  }
  if (hard.length === 0 && themes.length === 0) return null;

  const softHay = normalize([sec.title, sec.skillsText, sec.otherText].join("\n"));
  const entries = sec.entries.map((e) => ({ text: normalize(e.text), recency: e.recency }));

  // Best recency weight for a term: 1.0 if it appears in an undated section
  // (Skills / summary / title); otherwise the max recency among experience entries
  // that contain it; null if it appears nowhere. `requireExperience` ignores the
  // soft section (themes only count as proven inside experience).
  const weightOf = (term: string, requireExperience: boolean): number | null => {
    let w: number | null = null;
    if (!requireExperience && present(term, softHay)) w = 1;
    for (const e of entries) {
      if (present(term, e.text)) w = Math.max(w ?? 0, e.recency);
    }
    return w;
  };

  const matched: string[] = [];
  const missing: string[] = [];

  let hardGot = 0;
  let hardMatched = 0;
  for (const s of hard) {
    const w = weightOf(s, false);
    if (w != null) { hardGot += w; hardMatched++; matched.push(s); } else missing.push(s);
  }
  const hardScore = hard.length ? hardGot / hard.length : null;

  let themeGot = 0;
  for (const s of themes) {
    const w = weightOf(s, true);
    if (w != null) { themeGot += w; matched.push(s); } // proven in experience (recency-weighted)
    else if (present(s, softHay)) { themeGot += 0.4; missing.push(s); } // mentioned but not proven
    else missing.push(s);
  }
  const themeScore = themes.length ? themeGot / themes.length : null;
  const recency = hardMatched ? hardGot / hardMatched : 1; // avg recency of matched hard skills

  // Coverage = weighted blend of the present buckets (renormalized if one is empty).
  const parts: { v: number; w: number }[] = [];
  if (hardScore != null) parts.push({ v: hardScore, w: 0.65 });
  if (themeScore != null) parts.push({ v: themeScore, w: 0.35 });
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const coverage = wsum ? parts.reduce((a, p) => a + p.v * p.w, 0) / wsum : 0;

  const tScore = titleMatch(jdTitle, sec.title);
  const titleFactor = tScore == null ? 1 : 0.8 + 0.2 * tScore;

  const score = Math.max(0, Math.min(100, Math.round(100 * coverage * titleFactor)));
  return { score, titleScore: tScore ?? 0, hardScore: hardScore ?? 0, themeScore: themeScore ?? 0, recency, matched, missing };
}
