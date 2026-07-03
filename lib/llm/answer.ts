// Draft plain-text answers to open-ended job-application questions, grounded in a
// candidate profile. Structured output (the LLM layer is structured-only) on
// Anthropic (Claude), like tailoring (lib/llm/service.ts).
import { z } from "zod";
import { generateStructured, DEFAULT_MODEL as CLAUDE_MODEL } from "@/lib/llm/anthropic";

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
- SHORT and SIMPLE: usually 2-3 sentences (about 30-60 words); a single sentence for a simple question. Go longer ONLY if the question explicitly asks for detail.
- EXPLICIT and DIRECT: lead with the actual answer, be concrete and specific, use plain everyday words. No filler, no throat-clearing, no hedging, no fancy vocabulary.
- Use the job description (when provided) to make "why this role / why this company / what interests you" answers specific and relevant.
- If a question isn't supported by the background, answer briefly and honestly instead of fabricating.
- Return exactly one answer per question, in the same order, echoing each question.`;

/** Draft one plain-text answer per question, grounded in `profileText` (+ JD). */
export async function answerApplicationQuestions(args: {
  profileText: string;
  jobText?: string;
  questions: string[];
  customInstructions?: string;
}): Promise<{ question: string; answer: string }[]> {
  const prompt = [
    `# Candidate background\n${args.profileText}`,
    args.jobText ? `# Job description\n${args.jobText}` : "",
    args.customInstructions ? `# Extra style guidance (tone)\n${args.customInstructions}` : "",
    `# Application questions (answer each in plain text)\n${args.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await generateStructured({ schema: AnswerSchema, system: SYSTEM, prompt, model: CLAUDE_MODEL, maxTokens: 4000 });
  return res.answers;
}
