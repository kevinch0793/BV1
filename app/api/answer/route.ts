import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { profileInclude, toProfileForLLM } from "@/lib/profile-data";
import { profileToText } from "@/lib/llm/ats";
import { answerApplicationQuestions } from "@/lib/llm/answer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called cross-origin by the browser extension with a Bearer token (no cookies),
// so a wildcard CORS origin is safe.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "Missing bearer token." }, 401);

  const hash = createHash("sha256").update(token).digest("hex");
  const settings = await prisma.settings.findFirst({
    where: { apiTokenHash: hash },
    select: { clientId: true, answerProfileId: true, customInstructions: true, client: { select: { status: true } } },
  });
  if (!settings || settings.client.status !== "approved") return json({ error: "Invalid token." }, 401);
  if (!settings.answerProfileId) return json({ error: "No answering profile configured — pick one in Settings." }, 400);

  const profile = await prisma.profile.findFirst({
    where: { id: settings.answerProfileId, clientId: settings.clientId },
    include: profileInclude,
  });
  if (!profile) return json({ error: "Answering profile not found." }, 400);

  let body: { questions?: unknown; jobUrl?: unknown; jobText?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const questions = (Array.isArray(body.questions) ? body.questions : [])
    .map((q) => String(q ?? "").trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((q) => q.slice(0, 2000));
  if (!questions.length) return json({ error: "No questions provided." }, 400);
  const jobText = typeof body.jobText === "string" ? body.jobText.slice(0, 8000) : undefined;

  const profileText = [profile.baseResume?.rawText, profileToText(toProfileForLLM(profile))].filter(Boolean).join("\n\n");

  try {
    const answers = await answerApplicationQuestions({
      profileText,
      jobText,
      questions,
      customInstructions: settings.customInstructions ?? undefined,
    });
    return json({ answers });
  } catch (e) {
    return json({ error: `Answer generation failed: ${e instanceof Error ? e.message : "unknown"}` }, 500);
  }
}
