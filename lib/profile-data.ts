import { Prisma } from "@/lib/generated/prisma/client";
import { asStringArray } from "@/lib/llm/service";
import type { ProfileForLLM, ProjectGroup } from "@/lib/llm/prompts";

// Standard include used everywhere we load a "full" profile.
export const profileInclude = {
  experiences: { orderBy: { order: "asc" } },
  education: { orderBy: { order: "asc" } },
  skills: true,
  baseResume: true,
  jobs: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.ProfileInclude;

export type FullProfile = Prisma.ProfileGetPayload<{ include: typeof profileInclude }>;

/** Parse an Experience.projects JSON column into project subgroups. */
export function asProjectGroups(v: unknown): ProjectGroup[] {
  if (!Array.isArray(v)) return [];
  return v.map((g) => {
    const o = (g ?? {}) as Record<string, unknown>;
    return {
      name: typeof o.name === "string" ? o.name : "",
      type: typeof o.type === "string" ? o.type : "",
      bullets: asStringArray(o.bullets),
    };
  });
}

export function asLinks(v: unknown): Record<string, string> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => typeof val === "string")
        .map(([k, val]) => [k, val as string]),
    );
  }
  return {};
}

/** Map a loaded Prisma profile into the shape the LLM prompts expect. */
export function toProfileForLLM(p: FullProfile): ProfileForLLM {
  return {
    fullName: p.fullName,
    email: p.email,
    phone: p.phone,
    location: p.location,
    links: asLinks(p.links),
    summary: p.summary,
    experiences: p.experiences.map((e) => ({
      company: e.company,
      role: e.role,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      current: e.current,
      projects: asProjectGroups(e.projects),
    })),
    education: p.education.map((ed) => ({
      school: ed.school,
      degree: ed.degree,
      field: ed.field,
      startDate: ed.startDate,
      endDate: ed.endDate,
      gpa: ed.gpa,
    })),
    skills: p.skills.map((s) => ({ name: s.name, category: s.category })),
  };
}
