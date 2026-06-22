"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { extractJobFields } from "@/lib/llm/service";

export type JobActionResult = { ok: boolean; error?: string; needsPaste?: boolean };

function normalizeUrls(raw: string): string[] {
  const seen = new Set<string>();
  for (const line of raw.split(/[\n,]/).map((l) => l.trim())) {
    if (!line) continue;
    const url = /^https?:\/\//i.test(line) ? line : `https://${line}`;
    seen.add(url);
  }
  return [...seen];
}

/** Bulk-add job URLs as pending entries (no scraping yet). */
export async function addJobUrls(
  profileId: string,
  formData: FormData,
): Promise<{ ok: boolean; added: number; created: { id: string; url: string | null }[]; error?: string }> {
  const urls = normalizeUrls(String(formData.get("urls") ?? ""));
  if (urls.length === 0) return { ok: false, added: 0, created: [], error: "Enter at least one URL." };

  // Skip URLs already saved for this profile.
  const existing = await prisma.jobPosting.findMany({
    where: { profileId, url: { in: urls } },
    select: { url: true },
  });
  const have = new Set(existing.map((e) => e.url));
  const fresh = urls.filter((u) => !have.has(u));

  let created: { id: string; url: string | null }[] = [];
  if (fresh.length) {
    await prisma.jobPosting.createMany({
      data: fresh.map((url) => ({ profileId, url, status: "pending" })),
    });
    created = await prisma.jobPosting.findMany({
      where: { profileId, url: { in: fresh } },
      select: { id: true, url: true },
    });
  }
  revalidatePath(`/profiles/${profileId}/dashboard`);
  return { ok: true, added: fresh.length, created };
}

/** Scrape + extract a single job. Called one-at-a-time by the queue. */
export async function fetchJob(jobId: string): Promise<JobActionResult> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Job not found." };
  if (!job.url) return { ok: false, error: "No URL on this job." };

  const fetched = await findJobDescription(job.url);
  if (!fetched.ok) {
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: { status: "failed", error: fetched.error },
    });
    return { ok: false, error: fetched.error, needsPaste: true };
  }

  try {
    const fields = await extractJobFields(fetched.text);
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        descriptionRaw: fetched.text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements },
        status: "fetched",
        error: null,
      },
    });
  } catch (e) {
    const error = `Extraction failed: ${(e as Error).message}`;
    await prisma.jobPosting.update({ where: { id: jobId }, data: { status: "failed", error } });
    return { ok: false, error };
  }
  revalidatePath(`/profiles/${job.profileId}/dashboard`);
  return { ok: true };
}

/** Paste-the-JD fallback: create a fetched job from pasted text. */
export async function addJobFromText(
  profileId: string,
  formData: FormData,
): Promise<JobActionResult> {
  const text = String(formData.get("text") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim() || null;
  if (text.length < 50) return { ok: false, error: "Paste the full job description." };

  try {
    const fields = await extractJobFields(text);
    await prisma.jobPosting.create({
      data: {
        profileId,
        url,
        company: fields.company,
        role: fields.role,
        location: fields.location,
        descriptionRaw: text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements },
        status: "fetched",
      },
    });
  } catch (e) {
    return { ok: false, error: `Extraction failed: ${(e as Error).message}` };
  }
  revalidatePath(`/profiles/${profileId}/dashboard`);
  return { ok: true };
}

/** Fill an existing job from pasted JD text (paste fallback for closed sites). */
export async function setJobFromText(
  jobId: string,
  formData: FormData,
): Promise<JobActionResult> {
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 50) return { ok: false, error: "Paste the full job description." };
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, error: "Job not found." };

  try {
    const fields = await extractJobFields(text);
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        descriptionRaw: text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements },
        status: "fetched",
        error: null,
      },
    });
  } catch (e) {
    return { ok: false, error: `Extraction failed: ${(e as Error).message}` };
  }
  revalidatePath(`/profiles/${job.profileId}/dashboard`);
  return { ok: true };
}

export async function deleteJob(id: string, profileId: string) {
  // deleteMany is idempotent — no error if the row was already removed (e.g. a
  // double-click or stale view). The tailored resume is removed via DB cascade.
  await prisma.jobPosting.deleteMany({ where: { id } });
  revalidatePath(`/profiles/${profileId}/dashboard`);
  revalidatePath("/");
}
