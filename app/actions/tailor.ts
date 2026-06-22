"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { profileInclude, toProfileForLLM } from "@/lib/profile-data";
import { tailorResume } from "@/lib/llm/service";
import { computeFit, profileToText } from "@/lib/llm/ats";
import { getSettings } from "@/lib/settings";
import type { ResumeContent } from "@/lib/llm/schema";
import type { JobForLLM } from "@/lib/llm/prompts";
import type { SectionKey } from "@/lib/sections";

export type TailorResult =
  | { ok: true; content: ResumeContent }
  | { ok: false; error: string };

export async function generateTailored(args: {
  profileId: string;
  jobId?: string;
  mode: "with_base" | "from_scratch";
  instructions?: string;
  model?: string;
}): Promise<TailorResult> {
  const profile = await prisma.profile.findUnique({
    where: { id: args.profileId },
    include: profileInclude,
  });
  if (!profile) return { ok: false, error: "Profile not found." };

  let job: JobForLLM = {};
  if (args.jobId) {
    const j = await prisma.jobPosting.findUnique({ where: { id: args.jobId } });
    if (j) {
      const parsed = (j.descriptionParsed as { description?: string; requirements?: string[] }) ?? {};
      job = {
        company: j.company,
        role: j.role,
        location: j.location,
        description: parsed.description ?? j.descriptionRaw ?? "",
        requirements: parsed.requirements ?? [],
      };
    }
  }

  if (args.mode === "from_scratch" && profile.experiences.length === 0) {
    return {
      ok: false,
      error: "From-scratch mode needs at least one project (name + type) on the profile.",
    };
  }

  try {
    const content = await tailorResume({
      mode: args.mode,
      profile: toProfileForLLM(profile),
      job,
      baseResume: profile.baseResume?.rawText,
      instructions: args.instructions,
      model: args.model,
    });
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Fetch a saved tailored resume for the in-table preview modal. */
export async function previewTailored(
  tailoredId: string,
): Promise<{ content: ResumeContent; template: string; order: SectionKey[] } | null> {
  const t = await prisma.tailoredResume.findUnique({ where: { id: tailoredId } });
  if (!t) return null;
  // Render with the global Settings template/order so a Settings change is
  // reflected immediately (not the per-resume template saved at tailor time).
  const { sectionOrder, defaultTemplate } = await getSettings();
  return { content: t.content as ResumeContent, template: defaultTemplate, order: sectionOrder };
}

export async function saveTailored(args: {
  profileId: string;
  jobId?: string;
  mode: "with_base" | "from_scratch";
  templateId: string;
  instructions?: string;
  content: ResumeContent;
}) {
  const saved = await prisma.tailoredResume.create({
    data: {
      profileId: args.profileId,
      jobPostingId: args.jobId || null,
      templateId: args.templateId,
      mode: args.mode,
      instructions: args.instructions || null,
      content: args.content,
    },
  });
  revalidatePath("/");
  revalidatePath(`/profiles/${args.profileId}`);
  return saved.id;
}

export async function deleteTailored(id: string) {
  await prisma.tailoredResume.deleteMany({ where: { id } });
  revalidatePath("/");
}

export type AutoTailorResult = { ok: boolean; error?: string; tailoredId?: string };

/**
 * Pipeline step: generate + save a tailored resume for one already-fetched job.
 * Mode is chosen automatically (base resume if present, else from-scratch).
 * Replaces any prior tailored resume for that job so there's one per job.
 */
export async function autoTailorJob(
  jobId: string,
  opts?: { templateId?: string; model?: string; instructions?: string },
): Promise<AutoTailorResult> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Job not found." };
  if (job.status !== "fetched") return { ok: false, error: "Job description not fetched yet." };

  const profile = await prisma.profile.findUnique({
    where: { id: job.profileId },
    include: profileInclude,
  });
  if (!profile) return { ok: false, error: "Profile not found." };

  const mode: "with_base" | "from_scratch" = profile.baseResume ? "with_base" : "from_scratch";
  if (mode === "from_scratch" && profile.experiences.length === 0) {
    return { ok: false, error: "Needs a base resume or at least one project to tailor." };
  }

  const parsed = (job.descriptionParsed as { description?: string; requirements?: string[] }) ?? {};
  const jobFields: JobForLLM = {
    company: job.company,
    role: job.role,
    location: job.location,
    description: parsed.description ?? job.descriptionRaw ?? "",
    requirements: parsed.requirements ?? [],
  };

  const profileForLLM = toProfileForLLM(profile);
  let content: ResumeContent;
  try {
    content = await tailorResume({
      mode,
      profile: profileForLLM,
      job: jobFields,
      baseResume: profile.baseResume?.rawText,
      instructions: opts?.instructions,
      model: opts?.model,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const beforeText = profile.baseResume?.rawText || profileToText(profileForLLM);
  const fit = await computeFit(jobFields, beforeText, content);

  const saved = await prisma.$transaction(async (tx) => {
    await tx.tailoredResume.deleteMany({ where: { jobPostingId: jobId } });
    return tx.tailoredResume.create({
      data: {
        profileId: job.profileId,
        jobPostingId: jobId,
        templateId: opts?.templateId ?? "modern",
        mode,
        instructions: opts?.instructions || null,
        content,
        fitBefore: fit.fitBefore,
        fitAfter: fit.fitAfter,
        fitDetail: fit.fitDetail as object,
      },
    });
  });

  revalidatePath(`/profiles/${job.profileId}/dashboard`);
  return { ok: true, tailoredId: saved.id };
}
