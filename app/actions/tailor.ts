"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { llmProfileInclude, toProfileForLLM } from "@/lib/profile-data";
import { tailorResume } from "@/lib/llm/service";
import { computeFit, profileToText } from "@/lib/llm/ats";
import { getSettings } from "@/lib/settings";
import { assertOwnsProfile, assertOwnsJob, assertOwnsTailored, ownedByProfileWhere } from "@/lib/owner";
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
  const clientId = await assertOwnsProfile(args.profileId);
  const profile = await prisma.profile.findFirst({
    where: { id: args.profileId, clientId },
    include: llmProfileInclude,
  });
  if (!profile) return { ok: false, error: "Profile not found." };

  let job: JobForLLM = {};
  if (args.jobId) {
    const j = await prisma.jobPosting.findFirst({ where: { id: args.jobId, profile: { clientId } } });
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

  const { customInstructions, skills } = await getSettings(clientId);
  try {
    const content = await tailorResume({
      mode: args.mode,
      profile: toProfileForLLM(profile),
      job,
      baseResume: profile.baseResume?.rawText,
      instructions: args.instructions,
      customInstructions,
      model: args.model,
      skills,
    });
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type TailoredPreview = {
  content: ResumeContent;
  template: string;
  order: SectionKey[];
  resumeFont: string;
  resumeFontScale: number;
  fitBefore: number | null;
  fitAfter: number | null;
  fitDetail: { matched?: string[]; missing?: string[] } | null;
};

/** Fetch a saved tailored resume (+ its ATS fit) for the in-table preview modal. */
export async function previewTailored(tailoredId: string): Promise<TailoredPreview | null> {
  const t = await prisma.tailoredResume.findFirst({
    where: { id: tailoredId, ...(await ownedByProfileWhere()) },
    include: { profile: { select: { clientId: true, templateId: true } } },
  });
  if (!t) return null;
  // Render with the profile's template (or the owner's Settings default) so a
  // change is reflected immediately — not the per-resume template saved at
  // tailor time.
  const { sectionOrder, defaultTemplate, resumeFont, resumeFontScale } = await getSettings(t.profile.clientId);
  return {
    content: t.content as ResumeContent,
    template: t.profile.templateId ?? defaultTemplate,
    order: sectionOrder,
    resumeFont,
    resumeFontScale,
    fitBefore: t.fitBefore,
    fitAfter: t.fitAfter,
    fitDetail: t.fitDetail as { matched?: string[]; missing?: string[] } | null,
  };
}

export async function saveTailored(args: {
  profileId: string;
  jobId?: string;
  mode: "with_base" | "from_scratch";
  templateId: string;
  instructions?: string;
  content: ResumeContent;
}) {
  await assertOwnsProfile(args.profileId);
  if (args.jobId) await assertOwnsJob(args.jobId);
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
  const clientId = await assertOwnsTailored(id);
  await prisma.tailoredResume.deleteMany({ where: { id, profile: { clientId } } });
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
  const clientId = await assertOwnsJob(jobId);
  const job = await prisma.jobPosting.findFirst({ where: { id: jobId, profile: { clientId } } });
  if (!job) return { ok: false, error: "Job not found." };
  if (job.status !== "fetched") return { ok: false, error: "Job description not fetched yet." };

  const profile = await prisma.profile.findFirst({
    where: { id: job.profileId, clientId },
    include: llmProfileInclude,
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
  const { customInstructions, skills } = await getSettings(clientId);
  let content: ResumeContent;
  try {
    content = await tailorResume({
      mode,
      profile: profileForLLM,
      job: jobFields,
      baseResume: profile.baseResume?.rawText,
      instructions: opts?.instructions,
      customInstructions,
      model: opts?.model,
      skills,
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
