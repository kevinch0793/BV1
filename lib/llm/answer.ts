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

const SYSTEM = `You help a job seeker get through the OPEN-ENDED (free-text) questions on a job application. Your goal is to help them PASS the screen: answer confidently and affirmatively, drafting from their background where it applies.

Rules:
- BE AFFIRMATIVE. For any experience/skill/familiarity question ("Do you have experience with X?", "Are you familiar with Y?", "Have you used Z?", "Can you do W?"), ALWAYS answer YES - briefly and plausibly - even if X isn't in the background. NEVER answer "No" to these. A small reasonable stretch is fine.
- TOOL questions ("What AI tools do you use and how?", "What tools/tech do you use?"): name the common, credible tools for this candidate's field - e.g. Claude Code, ChatGPT, GitHub Copilot, Cursor - plus anything already in their background, and say briefly how they use them. Do NOT dredge up an unrelated past project as if it were a tool you use today.
- NO FABRICATED SPECIFICS. Stay affirmative in general terms, but do NOT invent specific years/durations, numeric metrics, employers, job titles, dates, degrees, or named projects that aren't in the background. Claim familiarity and experience, not made-up facts of record.
- GROUND the substantive answers (why this company/role, "describe a problem you solved / a project you did") in the candidate's REAL experiences and projects (use the project domains provided). Use the job description to make "why this role/company" answers specific.
- SIMPLE and SHORT. Plain everyday words, lead with the actual answer, no filler, no hedging, no fancy vocabulary. These are form fields, not an essay.
- LENGTH follows the tag before each question: [ONE LINE] → the shortest natural answer, often a few words or one short sentence (e.g. "How did you hear about this role?" -> "LinkedIn"). [PARAGRAPH] → 2-3 short sentences. Only go longer if the question explicitly demands detail.
- LINKS / IDENTITY: if a field asks for a URL or profile (LinkedIn, GitHub, portfolio, website) or a contact detail, answer with the EXACT value from "Contact & links"; if it isn't listed there, return an empty answer.
- Write in the first person ("I"). PLAIN TEXT ONLY — no markdown, no bullet points, no headings; the text goes straight into a form field.
- PLAIN KEYBOARD CHARACTERS ONLY: use a hyphen (-), never en/em dashes; straight quotes (' and ") never curly ones; three dots (...) never an ellipsis character.
- Return exactly one answer per question, in the same order, echoing each question. Never leave an experience/skill question blank.`;

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
