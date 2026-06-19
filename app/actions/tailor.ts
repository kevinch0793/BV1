"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { profileInclude, toProfileForLLM } from "@/lib/profile-data";
import { tailorResume } from "@/lib/llm/service";
import type { ResumeContent } from "@/lib/llm/schema";
import type { JobForLLM } from "@/lib/llm/prompts";

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

  if (args.mode === "from_scratch" && profile.projects.length === 0) {
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
  await prisma.tailoredResume.delete({ where: { id } });
  revalidatePath("/");
}
