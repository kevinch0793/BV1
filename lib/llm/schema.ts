import { z } from "zod";

// ResumeContent is the single contract shared across the app: Claude returns it,
// the resume templates render it, and the PDF route consumes it. All fields are
// required (structured outputs are happiest without optionals) — the model fills
// empty strings / arrays when a section doesn't apply.

export const LinkSchema = z.object({
  label: z.string().describe("e.g. LinkedIn, GitHub, Portfolio"),
  url: z.string(),
});

// A project subgroup within one company's experience (the theme of work there).
const ProjectGroupSchema = z.object({
  name: z.string().describe("SHORT project name or acronym ONLY (e.g. 'PMax') — never the expanded form or a phrase; empty if the company has a single unnamed group"),
  type: z.string().describe("Concise kind, a few words (e.g. 'Ads automation') — NOT a full sentence"),
  bullets: z.array(z.string()).describe("Achievement-oriented, JD-aligned"),
});

export const ResumeContentSchema = z.object({
  name: z.string(),
  title: z.string().describe("Target role / headline, tailored to the JD"),
  contact: z.object({
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(LinkSchema),
  }),
  summary: z.string().describe("2-4 sentence professional summary aimed at the JD"),
  skills: z.array(
    z.object({
      category: z.string().describe("e.g. Languages, ML, Infrastructure"),
      items: z.array(z.string()),
    }),
  ),
  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      location: z.string(),
      startDate: z.string().describe("e.g. Jan 2021"),
      endDate: z.string().describe("e.g. Present"),
      // Bullets live in project subgroups. One subgroup → render bullets only.
      projects: z.array(ProjectGroupSchema).describe("≥1 project subgroup; bullets belong here"),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string(),
      field: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      details: z.string().describe("GPA, honors, relevant coursework — may be empty"),
    }),
  ),
});

export type ResumeContent = z.infer<typeof ResumeContentSchema>;

// Parsed from an uploaded/pasted resume → used to auto-fill a profile's
// structured sections. All fields required (structured outputs prefer no
// optionals); the model returns empty strings/arrays when something is absent.
export const ParsedProfileSchema = z.object({
  fullName: z.string(),
  headline: z.string().describe("Current/most-recent title or professional headline"),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.object({
    linkedin: z.string(),
    github: z.string(),
    portfolio: z.string(),
  }),
  summary: z.string(),
  experiences: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      location: z.string(),
      startDate: z.string().describe("e.g. Jan 2021"),
      endDate: z.string().describe("e.g. Present or Mar 2023"),
      current: z.boolean(),
      // Group this company's bullets into project subgroups (the themes worked
      // on). If the resume has no named projects under a company, emit ONE group
      // with empty name/type holding all its bullets.
      projects: z.array(
        z.object({
          name: z.string().describe("Project name, or empty if unnamed"),
          type: z.string().describe("Kind of project; infer a short label"),
          bullets: z.array(z.string()),
        }),
      ),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string(),
      field: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      gpa: z.string(),
    }),
  ),
  skills: z.array(
    z.object({
      category: z.string(),
      items: z.array(z.string()),
    }),
  ),
});

export type ParsedProfile = z.infer<typeof ParsedProfileSchema>;

// Extracted from a scraped or pasted job posting.
export const JobFieldsSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string(),
  // No .catch() fallback. The value decides whether the job is tailored at all
  // (see shouldTailorWorkplace), so silently substituting a real-looking mode for
  // an unparseable one would skip the job for a reason that never happened,
  // leaving nothing to notice. Strict-mode structured outputs constrain the model
  // to these values, so an off-grammar value means the response is untrustworthy
  // generally: let it throw, and the caller marks the job "failed" with the error,
  // which is visible and retryable from the dashboard.
  //
  // "unknown" exists so the model can report that the text gave it no basis to
  // judge, rather than being forced to guess. Without it the only way to say
  // "nothing here mentions a workplace" was "onsite" -- a terminal skip -- so a
  // posting whose remote flag went missing upstream was indistinguishable from
  // one genuinely tied to an office. Skipping should follow evidence of
  // non-remote work, not the absence of evidence.
  workplace: z
    .enum(["remote", "hybrid", "in-person", "onsite", "unknown"])
    .describe("Workplace mode stated by the posting; 'unknown' when it states none"),
  description: z.string().describe("Full cleaned job description text"),
  requirements: z.array(z.string()).describe("Key requirements / qualifications"),
});

export type JobFields = z.infer<typeof JobFieldsSchema>;
