import { prisma } from "@/lib/db";
import { parseSectionOrder, type SectionKey } from "@/lib/sections";

export type { SectionKey } from "@/lib/sections";
export { SECTION_KEYS, SECTION_LABELS, parseSectionOrder } from "@/lib/sections";

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

/** Load a client's settings (returns defaults if no row yet). */
export async function getSettings(clientId: string): Promise<AppSettings> {
  const s = await prisma.settings.findUnique({ where: { clientId } });
  return {
    customInstructions: s?.customInstructions ?? "",
    sectionOrder: parseSectionOrder(s?.sectionOrder),
    defaultTemplate: s?.defaultTemplate ?? "modern",
    tailoringModel: s?.tailoringModel ?? "claude-sonnet-4-6",
  };
}

/** A client's custom instructions appended to every tailoring (empty if none). */
export async function getCustomInstructions(clientId: string): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { clientId } });
  return s?.customInstructions?.trim() ?? "";
}
