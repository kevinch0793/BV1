"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseSectionOrder } from "@/lib/settings";

export async function updateDefaultTemplate(formData: FormData) {
  const defaultTemplate = String(formData.get("defaultTemplate") ?? "modern");
  await prisma.settings.upsert({
    where: { id: "global" },
    create: { id: "global", defaultTemplate },
    update: { defaultTemplate },
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
