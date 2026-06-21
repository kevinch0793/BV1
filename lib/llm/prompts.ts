// Prompt builders for the three LLM tasks: extract a job posting, tailor from a
// base resume, and generate a resume from scratch. Each returns { system, prompt }.

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
    bullets: string[];
  }[];
  education: {
    school: string;
    degree?: string | null;
    field?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    gpa?: string | null;
  }[];
  projects: {
    name: string;
    type: string;
    company?: string | null;
    description?: string | null;
    bullets: string[];
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
    lines.push(`\n## Work experience`);
    for (const e of p.experiences) {
      const dates = `${e.startDate ?? "?"} – ${e.current ? "Present" : e.endDate ?? "?"}`;
      lines.push(`- ${e.role} at ${e.company} (${e.location ?? ""}) [${dates}]`);
      for (const b of e.bullets) lines.push(`  • ${b}`);
    }
  }

  if (p.projects.length) {
    lines.push(`\n## Projects (name + type are authoritative — do not invent project names)`);
    for (const pr of p.projects) {
      lines.push(`- ${pr.name} — ${pr.type}${pr.company ? ` @ ${pr.company}` : ""}`);
      if (pr.description) lines.push(`  ${pr.description}`);
      for (const b of pr.bullets) lines.push(`  • ${b}`);
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
- Tailor STRONGLY to the job description: mirror its keywords, terminology, and priorities; reorder and reweight content so the most JD-relevant experience leads.
- Rewrite bullets to be achievement-oriented and quantified where the source supports it. Start bullets with strong action verbs.
- NEVER fabricate employers, titles, dates, degrees, or metrics that aren't supported by the provided material. You may rephrase and emphasize, not invent facts.
- Keep it truthful, concise, and ATS-friendly. Prefer concrete over generic.
- Fill every schema field; use empty strings/arrays when a section genuinely has no content.`;

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
      `# Task\nRewrite and reorganize the base resume into a tailored resume strongly aligned with the job description above. Use the profile facts to fill gaps. Honor the extra user instructions.`,
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
    system: `You are an expert resume writer. You build a tailored resume from a candidate's structured profile when no base resume exists. ${TAILORING_RULES}\n- The candidate's projects (name + type) are authoritative anchors — feature them and expand them into JD-aligned, achievement-oriented bullets without inventing the underlying facts.`,
    prompt: [
      `# Job description\n${serializeJob(args.job)}`,
      `# Candidate profile\n${serializeProfile(args.profile)}`,
      args.instructions ? `# Extra user instructions (follow these)\n${args.instructions}` : "",
      `# Task\nGenerate a complete, tailored resume strongly aligned with the job description above, built from the profile. Expand the listed projects and experience into compelling, JD-relevant bullets. Write a summary and skills section aimed squarely at this role.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
