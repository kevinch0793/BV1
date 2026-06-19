import { generateStructured } from "@/lib/llm/anthropic";
import { generateStructuredOpenAI } from "@/lib/llm/openai";
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
  type JobForLLM,
  type ProfileForLLM,
} from "@/lib/llm/prompts";

// Coerce a Json column that should hold string[] into a real string[].
export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const PARSE_SYSTEM =
  "You parse a candidate's resume into structured profile data. Extract faithfully — never invent employers, dates, degrees, or metrics. Keep bullet wording close to the source. For each project, infer a short category for its 'type' (e.g. 'Web app', 'ML model', 'Internal platform'). Leave any field empty when the resume doesn't provide it.";

const PARSE_INSTRUCTION =
  "Parse this resume into the structured profile schema (basics, work experience, education, projects, skills).";

// Resume + job parsing run on OpenAI (cheap, schema-filling). PDF→text happens
// upstream, so this takes plain text.
export async function parseResume(input: { text: string }): Promise<ParsedProfile> {
  const text = (input.text ?? "").trim();
  if (text.length < 30) throw new Error("Resume text is too short to parse.");
  return generateStructuredOpenAI({
    schema: ParsedProfileSchema,
    schemaName: "parsed_profile",
    system: PARSE_SYSTEM,
    maxTokens: 6000,
    prompt: `${PARSE_INSTRUCTION}\n\n"""\n${text.slice(0, 60000)}\n"""`,
  });
}

/** Extract structured job fields from raw page text or a pasted JD (OpenAI). */
export async function extractJobFields(rawText: string): Promise<JobFields> {
  const { system, prompt } = buildExtractionPrompt(rawText);
  return generateStructuredOpenAI({
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
  instructions?: string;
  model?: string;
}): Promise<ResumeContent> {
  const built =
    args.mode === "with_base" && args.baseResume?.trim()
      ? buildTailorWithBasePrompt({
          profile: args.profile,
          job: args.job,
          baseResume: args.baseResume,
          instructions: args.instructions,
        })
      : buildFromScratchPrompt({
          profile: args.profile,
          job: args.job,
          instructions: args.instructions,
        });

  return generateStructured({
    schema: ResumeContentSchema,
    system: built.system,
    prompt: built.prompt,
    model: args.model,
    maxTokens: 16000,
  });
}
