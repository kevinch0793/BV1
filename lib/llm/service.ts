import { generateStructuredOpenAI } from "@/lib/llm/openai";
import { generateStructured, DEFAULT_MODEL as CLAUDE_TAILOR_MODEL } from "@/lib/llm/anthropic";
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

/** Tailor a resume to a job, with or without a base resume. */
export async function tailorResume(args: {
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
}): Promise<ResumeContent> {
  // The client's global custom instructions apply to every tailoring, layered
  // with any per-job instructions.
  const instructions =
    [args.customInstructions, args.instructions].map((s) => s?.trim()).filter(Boolean).join("\n\n") || undefined;

  const built =
    args.mode === "with_base" && args.baseResume?.trim()
      ? buildTailorWithBasePrompt({
          profile: args.profile,
          job: args.job,
          baseResume: args.baseResume,
          instructions,
          atsSkills: args.atsSkills,
          skills: args.skills,
        })
      : buildFromScratchPrompt({
          profile: args.profile,
          job: args.job,
          instructions,
          atsSkills: args.atsSkills,
          skills: args.skills,
        });

  // Tailoring runs on Claude (extraction stays on OpenAI). Claude follows the
  // volume/format guidelines (4-7 bullets/subgroup, no cliché openers) reliably.
  const content = await tailorViaProvider(built, args.model);
  // Normalize en/em dashes to plain hyphens (humans don't type the long ones),
  // then drop any bullets duplicated across a company's subgroups.
  return dedupeExperienceProjects(deepStripDashes(content));
}

// Tailoring runs on Anthropic (Claude). A tailored resume is ~1.2-2k output
// tokens (measured); the 4000 cap stays tight so many calls fit the per-minute
// budget. The Anthropic SDK retries transient 429s (maxRetries in anthropic.ts).
// userStatic (profile + base resume) is passed as cachePrefix so all of one
// profile's jobs reuse it as a cache read instead of re-billing it every time.
async function tailorViaProvider(
  built: { system: string; userStatic: string; userDynamic: string },
  model?: string,
): Promise<ResumeContent> {
  return generateStructured({
    schema: ResumeContentSchema,
    system: built.system,
    cachePrefix: built.userStatic,
    prompt: built.userDynamic,
    model: model ?? CLAUDE_TAILOR_MODEL,
    maxTokens: 4000,
  });
}
