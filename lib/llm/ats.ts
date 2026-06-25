import { z } from "zod";
import { generateStructuredExtract } from "@/lib/llm/balance";
import type { ResumeContent } from "@/lib/llm/schema";
import type { JobForLLM, ProfileForLLM } from "@/lib/llm/prompts";

// ATS-style keyword/skill coverage (à la Jobscan): extract the JD's skills, then
// deterministically measure how many appear in a resume. Must-haves weigh more.

export type JdSkills = { mustHave: string[]; preferred: string[] };
export type FitResult = { score: number; matched: string[]; missing: string[] };

const JdSkillsSchema = z.object({
  mustHave: z.array(z.string()).describe("Required hard skills/tools/technologies/keywords"),
  preferred: z.array(z.string()).describe("Nice-to-have skills/keywords"),
});

/** Pull normalized skill keywords out of a job description (one OpenAI call). */
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
      "Extract the concrete, ATS-relevant skills from a job description: hard skills, tools, technologies, methods, and domain keywords a resume parser would scan for. Normalize to short canonical forms (e.g. 'Python', 'Kubernetes', 'distributed systems', 'A/B testing'). Split into mustHave (clearly required) and preferred (nice-to-have). No soft-skill fluff, no duplicates, no sentences.",
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
  return scoreFit(skills, beforeText, content);
}

/**
 * Deterministic before/after scoring once the JD skills are known (no LLM call).
 * Lets callers extract JD skills in parallel with tailoring, then score here.
 * Pass `skills = null` (e.g. extraction failed) to get a null fit.
 */
export function scoreFit(skills: JdSkills | null, beforeText: string, content: ResumeContent): FitSummary {
  if (!skills) return { fitBefore: null, fitAfter: null, fitDetail: null };
  const before = scoreCoverage(skills, beforeText);
  const after = scoreCoverage(skills, resumeToText(content));
  return {
    fitBefore: before?.score ?? null,
    fitAfter: after?.score ?? null,
    fitDetail: { jdSkills: skills, matched: after?.matched ?? [], missing: after?.missing ?? [] },
  };
}

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

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.\s/-]/g, " ").replace(/\s+/g, " ").trim();

function present(skill: string, haystack: string): boolean {
  const s = normalize(skill);
  if (!s) return false;
  if (haystack.includes(s)) return true;
  // Fallback: all word-tokens of the skill appear somewhere in the resume.
  const tokens = s.split(" ").filter((t) => t.length > 1);
  return tokens.length > 1 && tokens.every((t) => haystack.includes(t));
}

/** Weighted coverage of JD skills in a resume. Must-have skills weigh double. */
export function scoreCoverage(skills: JdSkills, resumeText: string): FitResult | null {
  const haystack = normalize(resumeText);
  const entries = [
    ...skills.mustHave.map((s) => ({ s, w: 2 })),
    ...skills.preferred.map((s) => ({ s, w: 1 })),
  ];
  // Dedup by normalized form, keeping the highest weight.
  const byKey = new Map<string, { s: string; w: number }>();
  for (const e of entries) {
    const k = normalize(e.s);
    if (!k) continue;
    const cur = byKey.get(k);
    if (!cur || e.w > cur.w) byKey.set(k, e);
  }
  const all = [...byKey.values()];
  if (all.length === 0) return null;

  const matched: string[] = [];
  const missing: string[] = [];
  let got = 0;
  let total = 0;
  for (const { s, w } of all) {
    total += w;
    if (present(s, haystack)) {
      got += w;
      matched.push(s);
    } else {
      missing.push(s);
    }
  }
  return { score: Math.round((got / total) * 100), matched, missing };
}
