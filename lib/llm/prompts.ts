// Prompt builders for the three LLM tasks: extract a job posting, tailor from a
// base resume, and generate a resume from scratch. Each returns { system, prompt }.

/** A project subgroup inside one company: the theme of work there. */
export type ProjectGroup = { name: string; type: string; bullets: string[] };

export type ProfileForLLM = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: Record<string, string> | null;
  summary?: string | null;
  experiences: {
    company: string;
    role: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    current: boolean;
    // Each company has ≥1 project subgroup; bullets live inside them.
    projects: ProjectGroup[];
  }[];
  education: {
    school: string;
    degree?: string | null;
    field?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    gpa?: string | null;
  }[];
  skills: { name: string; category?: string | null }[];
};

export type JobForLLM = {
  company?: string | null;
  role?: string | null;
  location?: string | null;
  description?: string | null;
  requirements?: string[];
};

function serializeProfile(p: ProfileForLLM): string {
  const lines: string[] = [];
  lines.push(`Full name: ${p.fullName}`);
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.phone) lines.push(`Phone: ${p.phone}`);
  if (p.location) lines.push(`Location: ${p.location}`);
  if (p.links) {
    const links = Object.entries(p.links).filter(([, v]) => v && v.trim());
    if (links.length) lines.push(`Links: ${links.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  }
  if (p.summary) lines.push(`\nSummary: ${p.summary}`);

  if (p.experiences.length) {
    lines.push(
      `\n## Work experience (each company's bullets are grouped into project subgroups — the theme of work there. Project names + types are authoritative; do not invent them.)`,
    );
    for (const e of p.experiences) {
      const dates = `${e.startDate ?? "?"} – ${e.current ? "Present" : e.endDate ?? "?"}`;
      lines.push(`- ${e.role} at ${e.company} (${e.location ?? ""}) [${dates}]`);
      for (const pr of e.projects ?? []) {
        if (pr.name || pr.type) lines.push(`  ▸ Project: ${pr.name}${pr.type ? ` — ${pr.type}` : ""}`);
        for (const b of pr.bullets) lines.push(`    • ${b}`);
      }
    }
  }

  if (p.education.length) {
    lines.push(`\n## Education`);
    for (const ed of p.education) {
      lines.push(
        `- ${ed.degree ?? ""} ${ed.field ? `in ${ed.field}` : ""} — ${ed.school}` +
          `${ed.gpa ? ` (GPA ${ed.gpa})` : ""} [${ed.startDate ?? "?"} – ${ed.endDate ?? "?"}]`,
      );
    }
  }

  if (p.skills.length) {
    lines.push(`\n## Skills`);
    lines.push(p.skills.map((s) => (s.category ? `${s.name} (${s.category})` : s.name)).join(", "));
  }

  return lines.join("\n");
}

function serializeJob(j: JobForLLM): string {
  const lines: string[] = [];
  if (j.company) lines.push(`Company: ${j.company}`);
  if (j.role) lines.push(`Role: ${j.role}`);
  if (j.location) lines.push(`Location: ${j.location}`);
  if (j.requirements?.length) {
    lines.push(`\nKey requirements:`);
    for (const r of j.requirements) lines.push(`- ${r}`);
  }
  if (j.description) lines.push(`\nFull description:\n${j.description}`);
  return lines.join("\n");
}

const TAILORING_RULES = `Rules:
- Tailor STRONGLY to the job description. First identify the JD's MUST-HAVE and PREFERRED skills/keywords (from its requirements and description). Mirror that exact terminology and lead with the most JD-relevant content.
- Rely on the JD's skills: weave its must-have and preferred skills/keywords into the resume — into the SKILLS section AND into the bullets of the company/project where each skill most plausibly fits — even when they are missing from the source material. Assign each skill to the right company/project context, never randomly.
- Output structure: every work-experience entry contains one or more PROJECT SUBGROUPS (the theme of work at that company: official name + kind). Put each bullet inside the relevant subgroup. Preserve the candidate's given project names/types — do NOT invent or rename projects. If a company has a single unnamed subgroup, keep its name/type empty and just place bullets there.
- Rewrite bullets to be achievement-oriented and quantified where the source supports it; start with strong action verbs.
- NEVER fabricate employers, job titles, dates, degrees, or specific numeric metrics that aren't supported. You MAY add JD skills/keywords and rephrase; you may NOT invent facts of record.
- Keep it truthful, concise, and ATS-friendly. Fill every schema field; use empty strings/arrays where a section genuinely has no content.`;

// Default resume best-practices (2026). Applied to every tailoring on top of the
// rules above; the user's Settings custom instructions and any per-job
// instructions layer on after these.
const RESUME_GUIDELINES = `Resume best-practices (apply by default):
- HEADLINE (the resume "title"): keep it simple — just the role, e.g. "Software Engineer", "AI Software Engineer", or "AI Engineer". Choose the one that best fits the JD. No long pipe-delimited taglines.
- CONTACT: include the contact details that are provided (email, phone, location). Only include LinkedIn / GitHub / portfolio links that actually exist in the source — never invent URLs, and omit any link that isn't provided.
- SUMMARY: a focused paragraph, neither one terse line nor a wall of text (about 2-4 sentences). Do NOT open with a generic self-adjective such as "Results-oriented", "Detail-oriented", "Dedicated", "Passionate", "Motivated", "Hardworking", or "Seasoned" — start directly with the concrete role/specialty (e.g. "Machine Learning Engineer with…"). You MUST explicitly mention working in Agile teams and using AI development tools (name them, e.g. Claude / Copilot) — include these every time regardless of the JD — and align the rest tightly with what the JD requires.
- SKILLS: group into categories; each category lists 5-8 concrete, JD-relevant skills. ALWAYS include Agile/collaboration skills and AI dev tools (e.g. Claude, GitHub Copilot CLI). Pinpoint specific stacks/tools — not vague umbrella terms.
- BULLETS — minimum counts are mandatory, not suggestions:
  • The most recent / most JD-relevant roles: each subgroup MUST have AT LEAST 4 bullets (aim 4-7). Do NOT stop at 2-3.
  • Older / less-relevant roles: AT LEAST 2 bullets each (3 preferred). Never zero.
  • EVERY company must show bullets. If a company has no subgroups, or a subgroup with no source bullets, create one subgroup and write role-appropriate bullets grounded in that job's title, seniority, and the JD's skills — an empty company is unacceptable.
  Expand thin source into concrete, JD-aligned bullets (elaborate plausibly on the real role; never invent employers, titles, dates, degrees, or fabricated numeric metrics). Put specific numbers/metrics in only ONE bullet per subgroup; keep the rest concrete but unquantified. Strong, varied action verbs. Keep the whole resume to 1-2 pages.
- AI DEV TOOLS: mention AI coding tools (Claude Code / Copilot CLI) ONLY in the MOST RECENT (top) company — these tools are new, so they don't belong in older roles. You MUST include a bullet there stating you "Used Claude Code / Copilot CLI in <specific work>". Do NOT reference these tools in any earlier company/project.
- AGILE: Agile / team collaboration has existed for a long time — weave it in naturally wherever it fits across companies and projects, not just the most recent one.
- REMOTE READINESS: it's enough to show remote / distributed-work evidence in the most recent company.
- LANGUAGE: never use AI-sounding words or patterns, and never use filler opener adjectives like "Results-oriented", "Detail-oriented", "Dedicated", "Passionate", "Hardworking", "Seasoned", "leveraged cutting-edge solutions", "passionate about innovation", "results-driven professional", or "transformed workflows through synergy". Keep it specific and human while staying ATS-friendly (mirror real JD keywords).
- PUNCTUATION: use ONLY the plain hyphen "-". NEVER use an en dash "–" or em dash "—" anywhere (not in sentences, ranges, or separators) — they read as machine-written. Rewrite the sentence or use a hyphen, comma, or parentheses instead.
- Keep it ATS-friendly, 1-2 pages.`;

// 1) Extraction — raw page text/HTML → JobFields
export function buildExtractionPrompt(rawText: string) {
  const clipped = rawText.slice(0, 60000);
  return {
    system: [
      "You extract structured job-posting data from raw web page text. Return only what the page supports; leave fields empty if absent. Clean boilerplate (nav, cookie banners, footers) out of the description.",
      "Workplace rule: set 'workplace' to exactly one of 'remote', 'hybrid', 'in-person', 'onsite'. Decide strictly in this order and stop at the first match: (1) 'remote' if the role can be done fully remotely / is remote-eligible, even if an office also exists; (2) 'hybrid' if it describes a regular office+remote split, e.g. it says 'hybrid' or '2-3 days onsite per week'; (3) 'in-person' ONLY if the posting explicitly uses the words 'in-person' or 'in person' for required attendance/sessions and it is neither remote-eligible nor a fixed hybrid; (4) 'onsite' otherwise — the default for any normal office/site-based role tied to a specific location that does not say remote, hybrid, or in-person. A job that simply lists a work location (office, lab, store, site) with no remote/hybrid/in-person wording is 'onsite', NOT 'in-person'.",
      "Location rule: set 'location' to the office/work place only — city and state/region (and country when given), e.g. 'San Francisco, CA, US' or 'London, UK'. For multiple offices give a short comma/slash list of cities. If the role is fully remote with no office, give the eligible region (e.g. 'US') or leave it empty. Do NOT put the workplace mode (remote/hybrid/onsite) in 'location'. Never output placeholder commas like ', ,'.",
    ].join(" "),
    prompt: `Extract the company, role/title, location, workplace mode, the full job description, and a list of key requirements from this job posting page text:\n\n"""\n${clipped}\n"""`,
  };
}

// 2) Tailor from an existing base resume
export function buildTailorWithBasePrompt(args: {
  profile: ProfileForLLM;
  baseResume: string;
  job: JobForLLM;
  instructions?: string;
}) {
  return {
    system: `You are an expert resume writer. You tailor an existing resume to a specific job description, producing a structured resume. ${TAILORING_RULES}\n\n${RESUME_GUIDELINES}`,
    prompt: [
      `# Job description\n${serializeJob(args.job)}`,
      `# Candidate profile (supplementary facts)\n${serializeProfile(args.profile)}`,
      `# Candidate's existing base resume (primary source of truth)\n"""\n${args.baseResume.slice(0, 40000)}\n"""`,
      args.instructions ? `# Extra user instructions (follow these)\n${args.instructions}` : "",
      `# Task\nRewrite and reorganize the base resume into a tailored resume strongly aligned with the job description. Group each company's bullets under its project subgroups (use the profile's project names/types as the authoritative themes). Weave the JD's must-have/preferred skills into the right company/project and the skills section. Honor the extra user instructions.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

// 3) Generate from scratch (no base resume) — projects are required inputs
export function buildFromScratchPrompt(args: {
  profile: ProfileForLLM;
  job: JobForLLM;
  instructions?: string;
}) {
  return {
    system: `You are an expert resume writer. You build a tailored resume from a candidate's structured profile when no base resume exists. ${TAILORING_RULES}\n- Each company's project subgroups (name + kind) are authoritative anchors — keep them, and expand each subgroup's bullets into JD-aligned, achievement-oriented points without inventing the underlying facts.\n\n${RESUME_GUIDELINES}`,
    prompt: [
      `# Job description\n${serializeJob(args.job)}`,
      `# Candidate profile\n${serializeProfile(args.profile)}`,
      args.instructions ? `# Extra user instructions (follow these)\n${args.instructions}` : "",
      `# Task\nGenerate a complete, tailored resume strongly aligned with the job description, built from the profile. Keep each company's project subgroups and expand their bullets into compelling, JD-relevant points. Weave the JD's must-have/preferred skills into the right company/project and the skills section. Write a summary aimed squarely at this role.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
