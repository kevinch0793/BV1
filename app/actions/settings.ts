"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  parseSectionOrder,
  setGlobalModel,
  setNotice,
  setCompanyBlacklist,
  isNoticeKind,
  DEFAULT_NOTICE_KIND,
  TAILORING_MODELS,
  DEFAULT_TAILORING_MODEL,
} from "@/lib/settings";
import { requireClient, requireAdmin } from "@/lib/auth";

/**
 * Set the GLOBAL tailoring model — ADMIN ONLY. One app-wide value that governs
 * every client's tailoring (sync, batch, and interactive), not a per-client setting.
 */
export async function updateTailoringModel(formData: FormData) {
  await requireAdmin();
  const raw = String(formData.get("tailoringModel") ?? DEFAULT_TAILORING_MODEL);
  // Only allow known model ids (a crafted POST can't inject an arbitrary model).
  const tailoringModel = TAILORING_MODELS.some((m) => m.id === raw) ? raw : DEFAULT_TAILORING_MODEL;
  await setGlobalModel(tailoringModel);
  revalidatePath("/settings");
}

/**
 * Save the app-wide notice — ADMIN ONLY. One message shown to every signed-in
 * client, independent of who owns which profile.
 */
export async function updateNotice(formData: FormData) {
  await requireAdmin();
  const rawKind = String(formData.get("noticeKind") ?? DEFAULT_NOTICE_KIND);
  // Only known kinds — a crafted POST can't inject arbitrary text into the class
  // names the banner renders.
  const kind = isNoticeKind(rawKind) ? rawKind : DEFAULT_NOTICE_KIND;
  const text = String(formData.get("noticeText") ?? "").slice(0, 2000);
  await setNotice({ text, kind, active: formData.get("noticeActive") === "on" });
  // The banner lives in the root layout, so every route renders it.
  revalidatePath("/", "layout");
}

/**
 * Save the global company blacklist — ADMIN ONLY. One list for the whole
 * platform: every profile's pasted URLs are checked against it, so this is
 * deliberately not per-client.
 */
export async function updateCompanyBlacklist(formData: FormData) {
  await requireAdmin();
  // Generous cap: a few thousand companies still parse in well under a
  // millisecond, and truncating an admin's list silently would be worse.
  const text = String(formData.get("companyBlacklist") ?? "").slice(0, 100_000);
  await setCompanyBlacklist(text);
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
