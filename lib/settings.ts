import { prisma } from "@/lib/db";
import { parseSectionOrder, type SectionKey } from "@/lib/sections";

export type { SectionKey } from "@/lib/sections";
export { SECTION_KEYS, SECTION_LABELS, parseSectionOrder } from "@/lib/sections";

const ID = "global";

export const TAILORING_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (highest quality)" },
] as const;

export type AppSettings = {
  customInstructions: string;
  sectionOrder: SectionKey[];
  defaultTemplate: string;
  tailoringModel: string;
};

/** Load the singleton settings (returns defaults if not yet created). */
export async function getSettings(): Promise<AppSettings> {
  const s = await prisma.settings.findUnique({ where: { id: ID } });
  return {
    customInstructions: s?.customInstructions ?? "",
    sectionOrder: parseSectionOrder(s?.sectionOrder),
    defaultTemplate: s?.defaultTemplate ?? "modern",
    tailoringModel: s?.tailoringModel ?? "claude-sonnet-4-6",
  };
}

/** Global custom instructions appended to every tailoring (empty string if none). */
export async function getCustomInstructions(): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: ID } });
  return s?.customInstructions?.trim() ?? "";
}
