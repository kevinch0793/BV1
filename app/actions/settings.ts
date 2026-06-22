"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseSectionOrder } from "@/lib/settings";

export async function updateDefaultTemplate(template: string) {
  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global", defaultTemplate: template },
    update: { defaultTemplate: template },
  });
  revalidatePath("/settings");
  revalidatePath("/resume", "layout");
}

export async function updateTailoringModel(formData: FormData) {
  const tailoringModel = String(formData.get("tailoringModel") ?? "claude-sonnet-4-6");
  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global", tailoringModel },
    update: { tailoringModel },
  });
  revalidatePath("/settings");
}

export async function updateSettings(formData: FormData) {
  const customInstructions = String(formData.get("customInstructions") ?? "").trim() || null;
  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global", customInstructions },
    update: { customInstructions },
  });
  revalidatePath("/settings");
}

/** Layout-only update (kept separate so it never clobbers customInstructions). */
export async function updateSectionOrder(order: string[]) {
  const sectionOrder = parseSectionOrder(order.join(",")).join(",");
  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global", sectionOrder },
    update: { sectionOrder },
  });
  revalidatePath("/settings");
  revalidatePath("/resume", "layout");
}
