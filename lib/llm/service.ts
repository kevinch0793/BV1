import { generateStructured, EXTRACT_MODEL } from "@/lib/llm/anthropic";
import {
  JobFieldsSchema,
  ResumeContentSchema,
  type JobFields,
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

/** Extract structured job fields from raw page text or a pasted JD. */
export async function extractJobFields(rawText: string): Promise<JobFields> {
  const { system, prompt } = buildExtractionPrompt(rawText);
  return generateStructured({
    schema: JobFieldsSchema,
    system,
    prompt,
    model: EXTRACT_MODEL,
    maxTokens: 8000,
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
