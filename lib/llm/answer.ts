// Draft plain-text answers to open-ended job-application questions, grounded in a
// candidate profile. Runs on OpenAI — a DIFFERENT rate pool from the Anthropic
// tailoring pipeline — so an interactive answer isn't throttled while a batch is
// tailoring; falls back to Claude if OpenAI errors.
import { z } from "zod";
import { generateStructuredOpenAI, OPENAI_TAILOR_MODEL } from "@/lib/llm/openai";
import { generateStructured, DEFAULT_MODEL as CLAUDE_MODEL } from "@/lib/llm/anthropic";
import { toPlainKeyboard } from "@/lib/sanitize";

export const AnswerSchema = z.object({
  answers: z.array(
    z.object({
      question: z.string().describe("The question, echoed verbatim"),
      answer: z
        .string()
        .describe("First-person, plain-text answer grounded in the candidate's real background — no markdown, no bullet points"),
    }),
  ),
});

const SYSTEM = `You help a job seeker answer the OPEN-ENDED (free-text) questions on a job application, drafting each answer from their real background.

Rules:
- Ground every answer ONLY in the candidate's provided background (resume + profile). NEVER invent employers, titles, dates, degrees, metrics, or experience they don't have.
- Write in the first person ("I"). PLAIN TEXT ONLY — no markdown, no bullet points, no headings; the text goes straight into a form field.
- These are FORM FIELDS, not a conversation. Answer as briefly as a real applicant would type — never pad an answer into a full sentence when a few words will do.
- LENGTH follows the tag before each question: [ONE LINE] → the shortest natural answer, often just a few words or a single word (e.g. "How did you hear about this role?" -> "LinkedIn", NOT a sentence about job boards). [PARAGRAPH] → 2-3 sentences (about 30-60 words). Only exceed the tag if the question explicitly demands more detail.
- LINKS / IDENTITY: if a field asks for a URL or profile (LinkedIn, GitHub, portfolio, website) or a contact detail, answer with the EXACT value from "Contact & links"; if it isn't listed there, return an empty answer.
- EXPLICIT and DIRECT: lead with the actual answer, be concrete and specific, use plain everyday words. No filler, no throat-clearing, no hedging, no fancy vocabulary.
- PLAIN KEYBOARD CHARACTERS ONLY: use a hyphen (-), never en/em dashes; straight quotes (' and ") never curly ones; three dots (...) never an ellipsis character.
- Use the job description (when provided) to make "why this role / why this company / what interests you" answers specific and relevant.
- If a question isn't supported by the background, answer briefly and honestly instead of fabricating.
- Return exactly one answer per question, in the same order, echoing each question.`;

/** Draft one plain-text answer per question, grounded in `profileText` (+ JD). */
export async function answerApplicationQuestions(args: {
  profileText: string;
  jobText?: string;
  questions: { question: string; short: boolean }[];
  customInstructions?: string;
}): Promise<{ question: string; answer: string }[]> {
  const prompt = [
    `# Candidate background\n${args.profileText}`,
    args.jobText ? `# Job description\n${args.jobText}` : "",
    args.customInstructions ? `# Extra style guidance (tone)\n${args.customInstructions}` : "",
    `# Application questions (answer each in plain text)\n${args.questions
      .map((q, i) => `${i + 1}. ${q.short ? "[ONE LINE]" : "[PARAGRAPH]"} ${q.question}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let answers: { question: string; answer: string }[];
  try {
    answers = (await generateStructuredOpenAI({ schema: AnswerSchema, schemaName: "application_answers", system: SYSTEM, prompt, model: OPENAI_TAILOR_MODEL, maxTokens: 4000 })).answers;
  } catch {
    // OpenAI errored (e.g. throttled/misconfigured) — fall back to Claude.
    answers = (await generateStructured({ schema: AnswerSchema, system: SYSTEM, prompt, model: CLAUDE_MODEL, maxTokens: 4000 })).answers;
  }
  // Guarantee plain keyboard characters (no em dashes, curly quotes, ellipsis, …).
  return answers.map((a) => ({ question: a.question, answer: toPlainKeyboard(a.answer) }));
}
