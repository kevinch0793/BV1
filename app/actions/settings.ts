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

// ---- Application-answer API token (for the browser extension) ----

/** Mint a fresh API token, store only its SHA-256, and return the raw token ONCE. */
export async function generateApiToken(): Promise<{ token: string }> {
  const { id: clientId } = await requireClient();
  const token = randomBytes(32).toString("base64url");
  const apiTokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.settings.upsert({ where: { clientId }, create: { clientId, apiTokenHash }, update: { apiTokenHash } });
  revalidatePath("/settings");
  return { token };
}

export async function revokeApiToken() {
  const { id: clientId } = await requireClient();
  await prisma.settings.upsert({ where: { clientId }, create: { clientId, apiTokenHash: null }, update: { apiTokenHash: null } });
  revalidatePath("/settings");
}

/** Set which profile the API token answers application questions as. */
export async function setAnswerProfile(formData: FormData) {
  const { id: clientId } = await requireClient();
  const raw = String(formData.get("answerProfileId") ?? "").trim();
  // Only accept a profile the caller owns; empty clears it.
  const answerProfileId = raw ? (await prisma.profile.findFirst({ where: { id: raw, clientId }, select: { id: true } }))?.id ?? null : null;
  await prisma.settings.upsert({ where: { clientId }, create: { clientId, answerProfileId }, update: { answerProfileId } });
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
