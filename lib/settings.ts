import { prisma } from "@/lib/db";
import { parseSectionOrder, type SectionKey } from "@/lib/sections";

export type { SectionKey } from "@/lib/sections";
export { SECTION_KEYS, SECTION_LABELS, parseSectionOrder } from "@/lib/sections";

// The OpenAI entries are deliberately limited to models that spend ~no reasoning
// tokens. Tailoring calls cap output at max_completion_tokens 4000 (see
// buildStructuredParams / generateStructuredOpenAI), and on OpenAI a reasoning
// model's hidden reasoning tokens are drawn from that SAME budget — a tailored
// resume is already ~1.2-2k output tokens, so a heavy reasoner can exhaust the cap
// and return NO structured output (the job then fails with "OpenAI returned no
// structured output"). Measured on the tailoring call shape: gpt-5 burned 1856
// reasoning tokens (35s) and gpt-5-mini 576 on a trivial prompt, while every model
// listed below used ~0. Before adding a reasoning model here (gpt-5, o3, o4-mini),
// raise maxTokens for it in lib/llm/service.ts first.
export const TAILORING_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)", provider: "anthropic" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (highest quality)", provider: "anthropic" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (OpenAI, newest)", provider: "openai" },
  { id: "gpt-5.4", label: "GPT-5.4 (OpenAI)", provider: "openai" },
  { id: "gpt-5.2", label: "GPT-5.2 (OpenAI)", provider: "openai" },
  { id: "gpt-5.1", label: "GPT-5.1 (OpenAI)", provider: "openai" },
  { id: "gpt-4.1", label: "GPT-4.1 (OpenAI)", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI, fastest)", provider: "openai" },
] as const;

export const DEFAULT_TAILORING_MODEL = "claude-sonnet-4-6";

export type TailoringProvider = "anthropic" | "openai";

/** Which LLM provider a tailoring model id runs on. Looks the id up in
 *  TAILORING_MODELS; for any unlisted/legacy id, falls back to a "gpt" prefix
 *  check (so non-GPT strings default to Anthropic, preserving prior behavior). */
export function providerForModel(model: string): TailoringProvider {
  const known = TAILORING_MODELS.find((m) => m.id === model);
  if (known) return known.provider;
  return model.startsWith("gpt") ? "openai" : "anthropic";
}

// The tailoring model is a GLOBAL, admin-controlled setting (one row in AppConfig,
// id = "global") that governs EVERY client's tailoring — not a per-client setting.
const APP_CONFIG_ID = "global";

/** The single, admin-set model used for ALL tailoring (sync + batch + interactive).
 *  Defaults to Sonnet 4.6 when unset. Never throws — falls back to the default if
 *  the AppConfig row/table isn't there yet (e.g. before the migration is applied). */
export async function getGlobalModel(): Promise<string> {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });
    return cfg?.tailoringModel ?? DEFAULT_TAILORING_MODEL;
  } catch {
    return DEFAULT_TAILORING_MODEL;
  }
}

/** Set the global tailoring model (admin only — the caller must enforce that). */
export async function setGlobalModel(tailoringModel: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    create: { id: APP_CONFIG_ID, tailoringModel },
    update: { tailoringModel },
  });
}

/** Target size of the Skills section (filled from profile + role-relevant defaults). */
export type SkillsConfig = { minCategories: number; maxCategories: number; minItems: number; maxItems: number };

export const SKILLS_DEFAULTS: SkillsConfig = { minCategories: 4, maxCategories: 6, minItems: 6, maxItems: 9 };

export type AppSettings = {
  customInstructions: string;
  sectionOrder: SectionKey[];
  defaultTemplate: string;
  resumeFont: string;
  resumeAccent: string;
  skills: SkillsConfig;
};

// Keep the range sane regardless of stored values (min<=max, within bounds).
function cleanSkills(s: { skillsMinCategories?: number; skillsMaxCategories?: number; skillsMinItems?: number; skillsMaxItems?: number } | null): SkillsConfig {
  const clamp = (v: number | undefined, lo: number, hi: number, dflt: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.round(v as number) : dflt));
  const minCategories = clamp(s?.skillsMinCategories, 1, 10, SKILLS_DEFAULTS.minCategories);
  const maxCategories = Math.max(minCategories, clamp(s?.skillsMaxCategories, 1, 10, SKILLS_DEFAULTS.maxCategories));
  const minItems = clamp(s?.skillsMinItems, 1, 20, SKILLS_DEFAULTS.minItems);
  const maxItems = Math.max(minItems, clamp(s?.skillsMaxItems, 1, 20, SKILLS_DEFAULTS.maxItems));
  return { minCategories, maxCategories, minItems, maxItems };
}

/** Load a client's settings (returns defaults if no row yet). */
export async function getSettings(clientId: string): Promise<AppSettings> {
  const s = await prisma.settings.findUnique({ where: { clientId } });
  return {
    customInstructions: s?.customInstructions ?? "",
    sectionOrder: parseSectionOrder(s?.sectionOrder),
    defaultTemplate: s?.defaultTemplate ?? "modern",
    resumeFont: s?.resumeFont ?? "default",
    resumeAccent: s?.resumeAccent ?? "default",
    skills: cleanSkills(s),
  };
}

/** A client's custom instructions appended to every tailoring (empty if none). */
export async function getCustomInstructions(clientId: string): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { clientId } });
  return s?.customInstructions?.trim() ?? "";
}
