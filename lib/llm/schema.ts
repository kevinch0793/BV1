import { z } from "zod";

// ResumeContent is the single contract shared across the app: Claude returns it,
// the resume templates render it, and the PDF route consumes it. All fields are
// required (structured outputs are happiest without optionals) — the model fills
// empty strings / arrays when a section doesn't apply.

export const LinkSchema = z.object({
  label: z.string().describe("e.g. LinkedIn, GitHub, Portfolio"),
  url: z.string(),
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
      bullets: z.array(z.string()).describe("Achievement-oriented, JD-aligned"),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      type: z.string().describe("e.g. Ads foundation model, Internal platform"),
      company: z.string(),
      bullets: z.array(z.string()),
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

// Extracted from a scraped or pasted job posting.
export const JobFieldsSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string(),
  description: z.string().describe("Full cleaned job description text"),
  requirements: z.array(z.string()).describe("Key requirements / qualifications"),
});

export type JobFields = z.infer<typeof JobFieldsSchema>;
