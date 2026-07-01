// Prompt builders for the three LLM tasks: extract a job posting, tailor from a
// base resume, and generate a resume from scratch. Each returns { system, prompt }.

/** A project subgroup inside one company: the theme of work there. */
export type ProjectGroup = { name: string; type: string; domain: string; bullets: string[] };

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
      `\n## Work experience (each company's bullets are grouped into project subgroups — the theme of work there. For each subgroup output a SHORT name/acronym (the short form of a "short; expanded" name — authoritative, never invent or rename) + a concise KIND of a few words (the kind may be lightly re-worded to mirror the JD, staying truthful); the title renders as "name - kind" and must stay compact and ATS-clean. "Can cover" lists the domains a subgroup can speak to — pick the ONE that best fits THIS JD and frame that subgroup's bullets around only it; do NOT cover several/all listed domains (a single project can't credibly span every industry), and never claim a domain it can't cover.)`,
    );
    for (const e of p.experiences) {
      const dates = `${e.startDate ?? "?"} – ${e.current ? "Present" : e.endDate ?? "?"}`;
      lines.push(`- ${e.role} at ${e.company} (${e.location ?? ""}) [${dates}]`);
      for (const pr of e.projects ?? []) {
        if (pr.name || pr.type) lines.push(`  ▸ Project: ${pr.name}${pr.type ? ` — ${pr.type}` : ""}`);
        if (pr.domain) lines.push(`    ↳ Can cover: ${pr.domain}`);
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
- Mirror the JD's keywords, but distinguish two kinds. CONCRETE skills (named tools/tech/languages/frameworks/platforms) may go in the SKILLS section and bullets where the candidate plausibly has them. CONCEPTUAL phrases (architectures, activities, qualities — e.g. multi-tenant, modernization, migration, infrastructure assessment, code reusability, maintainability) must NEVER be listed in the SKILLS section; reflect them only inside a bullet/summary where the candidate's real work genuinely demonstrates them. Do not blindly paste JD wording to inflate keyword match, and never invent experience.
- PROOF OVER REPETITION: for each key JD requirement/theme, write ONE bullet that proves it in the JD's exact wording, ideally with a measurable result (a number) — e.g. JD wants "Customer Success" -> "Led migration to a new Customer Success platform, lifting renewal rate 23%". That one line does double duty: it matches the algorithm AND proves it to a human. Use each JD keyword ONCE, in its single strongest place (a hard skill in SKILLS; a theme in its proof-bullet). Do NOT restate the same keyword across the summary, skills, and several bullets — repetition adds zero ATS value and a human instantly reads repeated buzzwords as a red flag. It's about the RIGHT keywords, not many. (Agile and the AI dev tools are the only deliberate always-include items, per the guidelines below.)
- Output structure: every work-experience entry contains one or more PROJECT SUBGROUPS (the theme of work at that company). Put each bullet inside the relevant subgroup. Output a SHORT name/acronym (the short form of a "short; expanded" name — NEVER invent or rename) and a concise KIND of a few words (kind may be lightly re-worded to mirror the JD, staying truthful); the title renders as "name - kind" and must stay compact and ATS-clean — no long expanded names or sentence-length kinds. When a subgroup lists "Can cover" domains, pick the SINGLE domain that best fits THIS JD and frame that subgroup's bullets around only it — do NOT try to cover several/all listed domains (one project can't credibly span every industry; listing them reads as noise), and never claim a domain it can't cover. If a company has a single unnamed subgroup, keep its name/type empty and just place bullets there.
- Rewrite bullets to be achievement-oriented and quantified where the source supports it; start with strong action verbs.
- NEVER fabricate employers, job titles, dates, degrees, or specific numeric metrics that aren't supported. You MAY add JD skills/keywords and rephrase; you may NOT invent facts of record.
- Keep it truthful, concise, and ATS-friendly. Fill every schema field; use empty strings/arrays where a section genuinely has no content.`;

// Target size of the Skills section (from Settings). Kept local (structurally
// matches SkillsConfig in lib/settings) so prompts.ts stays free of the db dep.
export type SkillsSize = { minCategories: number; maxCategories: number; minItems: number; maxItems: number };
const SKILLS_SIZE_DEFAULT: SkillsSize = { minCategories: 4, maxCategories: 6, minItems: 6, maxItems: 9 };

// Default resume best-practices (2026). Applied to every tailoring on top of the
// rules above; the user's Settings custom instructions and any per-job
// instructions layer on after these.
function resumeGuidelines(skills: SkillsSize): string {
  return `Resume best-practices (apply by default):
- HEADLINE (the resume "title"): MIRROR THE JD'S EXACT ROLE TITLE here — this one line is the single highest-value ATS signal. Use the JD's wording (e.g. JD "Staff Backend Engineer, Growth" -> "Staff Backend Engineer"; JD "Customer Success Manager" -> "Customer Success Manager", not "Account Manager"). Strip requisition IDs, locations, and employment-type words; keep it a clean role title, no pipe-delimited taglines. The headline is the target role, so it need not equal a past job title — but keep the candidate's ACTUAL past titles in Work Experience truthful and unchanged. Only mirror a title the candidate can plausibly hold.
- CONTACT: include the contact details that are provided (email, phone, location). Only include LinkedIn / GitHub / portfolio links that actually exist in the source — never invent URLs, and omit any link that isn't provided.
- SUMMARY: a focused paragraph, neither one terse line nor a wall of text (about 2-4 sentences). Do NOT open with a generic self-adjective such as "Results-oriented", "Detail-oriented", "Dedicated", "Passionate", "Motivated", "Hardworking", or "Seasoned" — start directly with the concrete role/specialty (e.g. "Machine Learning Engineer with…"). You MUST explicitly mention working in Agile teams and using AI development tools (name them, e.g. Claude / Copilot) — include these every time regardless of the JD — and align the rest tightly with what the JD requires.
- SKILLS: produce ${skills.minCategories}-${skills.maxCategories} categories, each with ${skills.minItems}-${skills.maxItems} concrete skills. FILL the section to this size even when the JD lists only a few: draw on the candidate's OWN profile skills plus standard skills for this kind of role that the candidate plausibly has — do NOT restrict to only JD-mentioned skills, and never leave it sparse. Only concrete, NAMEABLE technologies/tools/methods belong here (languages, frameworks, libraries, platforms, databases). NEVER list conceptual phrases, activities, or qualities as a skill (e.g. "multi-tenant platforms", "maintainability", "code reusability", "infrastructure assessment", "modernization", "migration", "scalability") — those are proven in bullets, not listed. Only list skills the candidate genuinely has — never invent. ALWAYS include Agile/collaboration skills and AI dev tools (e.g. Claude, GitHub Copilot CLI). Pinpoint specific stacks/tools — not vague umbrella terms.
- BULLETS — minimum counts are mandatory, not suggestions, and depend on how many project subgroups a company has:
  • A company with ONE project/subgroup, for a regular/full-time role: that single subgroup MUST have AT LEAST 6 bullets (a one-project full role with only 4 reads thin). Aim 6-8. EXCEPTION: internships (and similarly brief/junior stints — judge from the role title) are NOT held to 6; about 3-4 bullets is fine for them.
  • A company with TWO OR MORE project/subgroups: EACH subgroup MUST have AT LEAST 4 bullets (aim 4-7). Do NOT stop at 2-3.
  • EVERY company must show bullets. If a company has no subgroups, or a subgroup with no source bullets, create one subgroup and write role-appropriate bullets grounded in that job's title, seniority, and the JD's skills — an empty company is unacceptable.
  Expand thin source into concrete, JD-aligned bullets (elaborate plausibly on the real role; never invent employers, titles, dates, degrees, or fabricated numeric metrics). Put specific numbers/metrics in only ONE bullet per subgroup; keep the rest concrete but unquantified. Strong, varied action verbs. Keep the whole resume to 1-2 pages.
- AI DEV TOOLS: mention AI coding tools (Claude Code / Copilot CLI) ONLY in the MOST RECENT (top) company — these tools are new, so they don't belong in older roles. You MUST include a bullet there stating you "Used Claude Code / Copilot CLI in <specific work>". Do NOT reference these tools in any earlier company/project.
- AGILE: Agile / team collaboration has existed for a long time — weave it in naturally wherever it fits across companies and projects, not just the most recent one.
- REMOTE READINESS: it's enough to show remote / distributed-work evidence in the most recent company.
- LANGUAGE: never use AI-sounding words or patterns, and never use filler opener adjectives like "Results-oriented", "Detail-oriented", "Dedicated", "Passionate", "Hardworking", "Seasoned", "leveraged cutting-edge solutions", "passionate about innovation", "results-driven professional", or "transformed workflows through synergy". Keep it specific and human while staying ATS-friendly (mirror real JD keywords).
- PUNCTUATION: use ONLY the plain hyphen "-". NEVER use an en dash "–" or em dash "—" anywhere (not in sentences, ranges, or separators) — they read as machine-written. Rewrite the sentence or use a hyphen, comma, or parentheses instead.
- Keep it ATS-friendly, 1-2 pages.`;
}

// 1) Extraction — raw page text/HTML → JobFields
export function buildExtractionPrompt(rawText: string) {
  const clipped = rawText.slice(0, 60000);
  return {
    system: [
      "You extract structured job-posting data from raw web page text. Return only what the page supports; leave fields empty if absent. Clean boilerplate (nav, cookie banners, footers) out of the description.",
      "Workplace rule: set 'workplace' to exactly one of 'remote', 'hybrid', 'in-person', 'onsite'. Decide strictly in this order and stop at the first match: (1) 'remote' if a fully-remote arrangement is available in ANY form — fully remote, work-from-anywhere, remote-eligible, OR the posting offers a CHOICE of remote vs hybrid/onsite, OR it is remote in some states/locations and hybrid/onsite in others. If remote is an option at all, choose 'remote' — do NOT downgrade to 'hybrid' just because an office or a hybrid option also exists. (2) 'hybrid' ONLY for a fixed office+remote split with NO fully-remote option, e.g. it says 'hybrid' or '2-3 days onsite per week' and remote is not separately offered; (3) 'in-person' ONLY if the posting explicitly uses the words 'in-person' or 'in person' for required attendance/sessions and it is neither remote-eligible nor a fixed hybrid; (4) 'onsite' otherwise — the default for any normal office/site-based role tied to a specific location that does not say remote, hybrid, or in-person. A job that simply lists a work location (office, lab, store, site) with no remote/hybrid/in-person wording is 'onsite', NOT 'in-person'.",
      "Location rule: set 'location' to the office/work place only — city and state/region (and country when given), e.g. 'San Francisco, CA, US' or 'London, UK'. For multiple offices give a short comma/slash list of cities. If the role is fully remote with no office, give the eligible region (e.g. 'US') or leave it empty. Do NOT put the workplace mode (remote/hybrid/onsite) in 'location'. Never output placeholder commas like ', ,'.",
    ].join(" "),
    prompt: `Extract the company, role/title, location, workplace mode, the full job description, and a list of key requirements from this job posting page text:\n\n"""\n${clipped}\n"""`,
  };
}

export type AtsSkills = { hardSkills: string[]; themes: string[] };

// The JD's ATS keywords, split so the resume covers them WITHOUT keyword-stuffing:
// concrete tech is listable in Skills; conceptual themes are only legitimate when
// demonstrated in a real bullet. Handed to the tailor so it covers what it's
// scored on while still reading like a human wrote it.
function atsSkillsBlock(skills?: AtsSkills | null): string {
  if (!skills || (!skills.hardSkills?.length && !skills.themes?.length)) return "";
  const lines = ["# ATS keywords (cover these so the resume reads like a real fit, never by stuffing)"];
  if (skills.hardSkills?.length) {
    lines.push(`Hard skills (concrete tech): ${skills.hardSkills.join(", ")}`);
    lines.push(
      "- For hard skills: list the ones the candidate plausibly has in the SKILLS section (once each). Only mention a skill again in a bullet when that bullet genuinely describes using it - do not echo every skill into prose. Do NOT list a tool the candidate has no basis for.",
    );
  }
  if (skills.themes?.length) {
    lines.push(`Themes (concepts/activities - NOT skills to list): ${skills.themes.join(", ")}`);
    lines.push(
      "- For themes: do NOT put these in the SKILLS section. Prove each one the candidate genuinely did with ONE bullet that uses this exact wording and, where possible, a measurable result/number (e.g. 'Customer Success' -> 'Led migration to a new Customer Success platform, lifting renewal rate 23%'). Put it in the experience bullet where it truly happened (not the summary alone, and not repeated). If the background does not support a theme, LEAVE IT OUT - never fabricate experience.",
    );
  }
  lines.push("Mirror the JD's role title in the resume headline. Never invent employers, job titles, dates, degrees, or numeric metrics.");
  return lines.join("\n");
}

// 2) Tailor from an existing base resume
export function buildTailorWithBasePrompt(args: {
  profile: ProfileForLLM;
  baseResume: string;
  job: JobForLLM;
  instructions?: string;
  atsSkills?: AtsSkills | null;
  skills?: SkillsSize;
}) {
  return {
    system: `You are an expert resume writer. You tailor an existing resume to a specific job description, producing a structured resume. ${TAILORING_RULES}\n\n${resumeGuidelines(args.skills ?? SKILLS_SIZE_DEFAULT)}`,
    prompt: [
      `# Job description\n${serializeJob(args.job)}`,
      atsSkillsBlock(args.atsSkills),
      `# Candidate profile (supplementary facts)\n${serializeProfile(args.profile)}`,
      `# Candidate's existing base resume (primary source of truth)\n"""\n${args.baseResume.slice(0, 40000)}\n"""`,
      args.instructions ? `# Extra user instructions (follow these)\n${args.instructions}` : "",
      `# Task\nRewrite and reorganize the base resume into a tailored resume strongly aligned with the job description. Group each company's bullets under its project subgroups. Use each subgroup's SHORT name/acronym (never invent or rename); you MAY lightly re-word its KIND (keep it a few words) to mirror the JD — the title renders as "name - kind" and must stay short and ATS-clean. From a subgroup's "Can cover" domains pick the ONE that best fits this JD and frame that subgroup's bullets around only it (not several/all). Cover the ATS keywords listed above. Honor the extra user instructions.`,
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
  atsSkills?: AtsSkills | null;
  skills?: SkillsSize;
}) {
  return {
    system: `You are an expert resume writer. You build a tailored resume from a candidate's structured profile when no base resume exists. ${TAILORING_RULES}\n- Each company's project subgroups are anchors: output a SHORT name/acronym (never invent/rename) and a concise KIND of a few words (kind may be lightly re-worded to mirror the JD) — the title renders as "name - kind" and must stay compact and ATS-clean. Expand each subgroup's bullets into JD-aligned, achievement-oriented points without inventing facts, and frame them around the SINGLE "Can cover" domain that best fits this JD — not several/all (one project can't span every industry; never claim a domain it can't cover).\n\n${resumeGuidelines(args.skills ?? SKILLS_SIZE_DEFAULT)}`,
    prompt: [
      `# Job description\n${serializeJob(args.job)}`,
      atsSkillsBlock(args.atsSkills),
      `# Candidate profile\n${serializeProfile(args.profile)}`,
      args.instructions ? `# Extra user instructions (follow these)\n${args.instructions}` : "",
      `# Task\nGenerate a complete, tailored resume strongly aligned with the job description, built from the profile. Keep each company's project subgroups and expand their bullets into compelling, JD-relevant points. Cover the ATS keywords listed above (skills section + relevant bullets). Write a summary aimed squarely at this role.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
