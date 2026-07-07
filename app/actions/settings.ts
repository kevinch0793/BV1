"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { parseSectionOrder } from "@/lib/settings";
import { requireClient } from "@/lib/auth";

export async function updateDefaultTemplate(template: string) {
  const { id: clientId } = await requireClient();
  await prisma.settings.upsert({
    where: { clientId },
    create: { clientId, defaultTemplate: template },
    update: { defaultTemplate: template },
  });
  revalidatePath("/settings");
  revalidatePath("/resume", "layout");
}

export async function updateTailoringModel(formData: FormData) {
  const { id: clientId } = await requireClient();
  const tailoringModel = String(formData.get("tailoringModel") ?? "claude-sonnet-4-6");
  await prisma.settings.upsert({
    where: { clientId },
    create: { clientId, tailoringModel },
    update: { tailoringModel },
  });
  revalidatePath("/settings");
}

export async function updateSkillsConfig(formData: FormData) {
  const { id: clientId } = await requireClient();
  const num = (k: string, lo: number, hi: number, dflt: number) => {
    const n = Math.round(Number(formData.get(k)));
    return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : dflt));
  };
  const minCategories = num("skillsMinCategories", 1, 10, 4);
  const maxCategories = Math.max(minCategories, num("skillsMaxCategories", 1, 10, 6));
  const minItems = num("skillsMinItems", 1, 20, 6);
  const maxItems = Math.max(minItems, num("skillsMaxItems", 1, 20, 9));
  const data = { skillsMinCategories: minCategories, skillsMaxCategories: maxCategories, skillsMinItems: minItems, skillsMaxItems: maxItems };
  await prisma.settings.upsert({ where: { clientId }, create: { clientId, ...data }, update: data });
  revalidatePath("/settings");
}

export async function updateSettings(formData: FormData) {
  const { id: clientId } = await requireClient();
  const customInstructions = String(formData.get("customInstructions") ?? "").trim() || null;
  await prisma.settings.upsert({
    where: { clientId },
    create: { clientId, customInstructions },
    update: { customInstructions },
  });
  revalidatePath("/settings");
}

// ---- Application-answer extension tokens (one per candidate profile) ----

/**
 * Mint a fresh token bound to ONE profile, store only its SHA-256, return the raw
 * token ONCE. A client can have a token per profile (so two candidates use the
 * extension at once); regenerating for a profile rotates it (drops the old one).
 */
export async function generateAnswerToken(profileId: string): Promise<{ token: string }> {
  const { id: clientId } = await requireClient();
  // Only mint for a profile the caller owns.
  const owned = await prisma.profile.findFirst({ where: { id: profileId, clientId }, select: { id: true } });
  if (!owned) throw new Error("Profile not found.");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.answerToken.deleteMany({ where: { clientId, profileId } }),
    prisma.answerToken.create({ data: { clientId, profileId, tokenHash } }),
  ]);
  revalidatePath("/settings");
  return { token };
}

/** Revoke a single token by id (scoped to the caller's client). */
export async function revokeAnswerToken(tokenId: string) {
  const { id: clientId } = await requireClient();
  await prisma.answerToken.deleteMany({ where: { id: tokenId, clientId } });
  revalidatePath("/settings");
}

/** Layout-only update (kept separate so it never clobbers customInstructions). */
export async function updateSectionOrder(order: string[]) {
  const { id: clientId } = await requireClient();
  const sectionOrder = parseSectionOrder(order.join(",")).join(",");
  await prisma.settings.upsert({
    where: { clientId },
    create: { clientId, sectionOrder },
    update: { sectionOrder },
  });
  revalidatePath("/settings");
  revalidatePath("/resume", "layout");
}
