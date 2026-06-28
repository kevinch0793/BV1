"use server";

import { revalidatePath } from "next/cache";
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
