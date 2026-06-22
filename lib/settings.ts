import { prisma } from "@/lib/db";
import { parseSectionOrder, type SectionKey } from "@/lib/sections";

export type { SectionKey } from "@/lib/sections";
export { SECTION_KEYS, SECTION_LABELS, parseSectionOrder } from "@/lib/sections";

const ID = "global";

export type AppSettings = {
  customInstructions: string;
  sectionOrder: SectionKey[];
  defaultTemplate: string;
};

/** Load the singleton settings (returns defaults if not yet created). */
export async function getSettings(): Promise<AppSettings> {
  const s = await prisma.settings.findUnique({ where: { id: ID } });
  return {
    customInstructions: s?.customInstructions ?? "",
    sectionOrder: parseSectionOrder(s?.sectionOrder),
    defaultTemplate: s?.defaultTemplate ?? "modern",
  };
}

/** Global custom instructions appended to every tailoring (empty string if none). */
export async function getCustomInstructions(): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: ID } });
  return s?.customInstructions?.trim() ?? "";
}
