import type Anthropic from "@anthropic-ai/sdk";
import { generateStructuredOpenAI } from "@/lib/llm/openai";
import { generateStructured, buildStructuredParams, DEFAULT_MODEL as CLAUDE_TAILOR_MODEL } from "@/lib/llm/anthropic";
import { providerForModel } from "@/lib/settings";
import { generateStructuredExtract } from "@/lib/llm/balance";
import { deepStripDashes, dedupeExperienceProjects } from "@/lib/sanitize";
import {
  JobFieldsSchema,
  ParsedProfileSchema,
  ResumeContentSchema,
  type JobFields,
  type ParsedProfile,
  type ResumeContent,
} from "@/lib/llm/schema";
import {
  buildExtractionPrompt,
  buildFromScratchPrompt,
  buildTailorWithBasePrompt,
  type AtsSkills,
  type JobForLLM,
  type ProfileForLLM,
  type SkillsSize,
} from "@/lib/llm/prompts";

// Coerce a Json column that should hold string[] into a real string[].
export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const PARSE_SYSTEM = [
  "You parse a candidate's resume into structured profile data. Extract faithfully — never invent employers, dates, degrees, or metrics. Keep bullet wording close to the source.",
  "Completeness is critical: extract EVERY work-experience entry as its own object — one per role/company — in reverse-chronological order. Do not merge multiple roles into one, do not summarize the list, and never drop earlier or older positions. If the same company appears with multiple titles, output one entry per title. Apply the same completeness rule to education.",
  "Each work-experience entry has a 'projects' array: the project SUBGROUPS within that job — the themes of work there. If the resume groups a job's bullets under named projects/initiatives/products/systems (e.g. 'GEM', 'MetaMate', a platform or service), emit one subgroup per project with its name, a short inferred 'type' (e.g. 'Ads foundation model', 'Internal platform'), and that project's bullets. If a job's bullets are NOT grouped under named projects, emit exactly ONE subgroup with empty name and empty type holding all of that job's bullets. Every experience must have at least one subgroup. Never invent project names that aren't in the resume.",
  "Leave any field empty when the resume doesn't provide it.",
].join(" ");

const PARSE_INSTRUCTION =
  "Parse this resume into the structured profile schema (basics; work experience with per-company project subgroups; education; skills).";

// Resume + job parsing run on OpenAI (cheap, schema-filling). PDF→text happens
// upstream, so this takes plain text.
export async function parseResume(input: { text: string }): Promise<ParsedProfile> {
  const text = (input.text ?? "").trim();
  if (text.length < 30) throw new Error("Resume text is too short to parse.");
  return generateStructuredOpenAI({
    schema: ParsedProfileSchema,
    schemaName: "parsed_profile",
    system: PARSE_SYSTEM,
    maxTokens: 16000,
    prompt: `${PARSE_INSTRUCTION}\n\n"""\n${text.slice(0, 60000)}\n"""`,
  });
}

/** Extract structured job fields from raw page text or a pasted JD (OpenAI). */
export async function extractJobFields(rawText: string): Promise<JobFields> {
  const { system, prompt } = buildExtractionPrompt(rawText);
  return generateStructuredExtract({
    schema: JobFieldsSchema,
    schemaName: "job_fields",
    system,
    prompt,
    maxTokens: 4000,
  });
}

/** Inputs to tailor one resume (shared by the synchronous and Batch API paths). */
export type TailorArgs = {
  mode: "with_base" | "from_scratch";
  profile: ProfileForLLM;
  job: JobForLLM;
  baseResume?: string;
  /** Per-job instructions (from the tailor UI). */
  instructions?: string;
  /** The client's global custom instructions (resolved by the caller). */
  customInstructions?: string;
  model?: string;
  /** The JD's ATS keyword list (so the tailor covers exactly what it's scored on). */
  atsSkills?: AtsSkills | null;
  /** Target Skills-section size (from Settings). */
  skills?: SkillsSize;
};

// Merge global + per-job instructions and pick the with-base vs from-scratch
// prompt builder. Returns the { system, userStatic, userDynamic } blocks.
function buildTailorPrompt(args: TailorArgs): { system: string; userStatic: string; userDynamic: string } {
  const instructions =
    [args.customInstructions, args.instructions].map((s) => s?.trim()).filter(Boolean).join("\n\n") || undefined;
  return args.mode === "with_base" && args.baseResume?.trim()
    ? buildTailorWithBasePrompt({ profile: args.profile, job: args.job, baseResume: args.baseResume, instructions, atsSkills: args.atsSkills, skills: args.skills })
    : buildFromScratchPrompt({ profile: args.profile, job: args.job, instructions, atsSkills: args.atsSkills, skills: args.skills });
}

/**
 * The exact Anthropic Messages request for one tailor — used by both the sync
 * path and the Batch API, so a batched tailor is byte-identical to a live one.
 * userStatic (profile + base resume) is the cachePrefix; max_tokens 4000.
 */
export function buildTailorParams(args: TailorArgs): Anthropic.MessageCreateParamsNonStreaming {
  const built = buildTailorPrompt(args);
  return buildStructuredParams({
    schema: ResumeContentSchema,
    system: built.system,
    cachePrefix: built.userStatic,
    prompt: built.userDynamic,
    model: args.model,
    maxTokens: 4000,
  });
}

/** Post-process a raw tailored resume: normalize en/em dashes to plain hyphens,
 *  then drop any bullets duplicated across a company's subgroups. Shared by both paths. */
export function finalizeTailored(content: ResumeContent): ResumeContent {
  return dedupeExperienceProjects(deepStripDashes(content));
}

/** Tailor a resume to a job synchronously (interactive UI + fallback). */
export async function tailorResume(args: TailorArgs): Promise<ResumeContent> {
  const built = buildTailorPrompt(args);
  const content = await tailorViaProvider(built, args.model);
  return finalizeTailored(content);
}

// Tailoring runs on the globally-selected model — Claude (Anthropic) by default,
// or GPT (OpenAI) when an OpenAI model is chosen. A tailored resume is ~1.2-2k
// output tokens (measured); the 4000 cap stays tight so many calls fit the
// per-minute budget. On Claude, userStatic (profile + base resume) is passed as a
// cachePrefix so a profile's jobs reuse it as a cache read; the Anthropic SDK
// retries transient 429s. OpenAI has no cache-prefix param, so its two user blocks
// are concatenated (static first, so OpenAI's automatic prefix caching still helps).
async function tailorViaProvider(
  built: { system: string; userStatic: string; userDynamic: string },
  model?: string,
): Promise<ResumeContent> {
  const chosen = model ?? CLAUDE_TAILOR_MODEL;
  if (providerForModel(chosen) === "openai") {
    return generateStructuredOpenAI({
      schema: ResumeContentSchema,
      schemaName: "resume_content",
      system: built.system,
      prompt: `${built.userStatic}\n\n${built.userDynamic}`,
      model: chosen,
      maxTokens: 4000,
      // Bill tailoring to the dedicated tailoring key when one is configured.
      keyPurpose: "tailor",
    });
  }
  return generateStructured({
    schema: ResumeContentSchema,
    system: built.system,
    cachePrefix: built.userStatic,
    prompt: built.userDynamic,
    model: chosen,
    maxTokens: 4000,
  });
}
