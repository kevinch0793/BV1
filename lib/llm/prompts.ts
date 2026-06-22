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
  if (p.links && Object.keys(p.links).length) {
    lines.push(`Links: ${Object.entries(p.links).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
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

// 1) Extraction — raw page text/HTML → JobFields
export function buildExtractionPrompt(rawText: string) {
  const clipped = rawText.slice(0, 60000);
  return {
    system: [
      "You extract structured job-posting data from raw web page text. Return only what the page supports; leave fields empty if absent. Clean boilerplate (nav, cookie banners, footers) out of the description.",
      "Location rule: if the role is remote in any form (fully remote, work-from-anywhere, or remote-within-a-region), output exactly the single word 'Remote' — nothing else. Only when the role is onsite or hybrid (has a real office) output the exact office location as city and state/region (and country when given), e.g. 'San Francisco, CA, US' or 'London, UK'. For hybrid, use the office city, not 'Remote'. If multiple offices, give a short comma/slash list of the actual cities. Never output empty parts or placeholder commas like ', ,'.",
    ].join(" "),
    prompt: `Extract the company, role/title, location, the full job description, and a list of key requirements from this job posting page text:\n\n"""\n${clipped}\n"""`,
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
    system: `You are an expert resume writer. You tailor an existing resume to a specific job description, producing a structured resume. ${TAILORING_RULES}`,
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
    system: `You are an expert resume writer. You build a tailored resume from a candidate's structured profile when no base resume exists. ${TAILORING_RULES}\n- Each company's project subgroups (name + kind) are authoritative anchors — keep them, and expand each subgroup's bullets into JD-aligned, achievement-oriented points without inventing the underlying facts.`,
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
