"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { fetchJobText } from "@/lib/scrape/fetchHtml";
import { extractJobFields } from "@/lib/llm/service";

export type JobActionResult = { ok: boolean; error?: string; needsPaste?: boolean };

/** Scrape a URL → extract structured fields → save a JobPosting. */
export async function addJobFromUrl(
  profileId: string,
  formData: FormData,
): Promise<JobActionResult> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "Enter a URL." };

  const fetched = await fetchJobText(url);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error, needsPaste: true };
  }

  try {
    const fields = await extractJobFields(fetched.text);
    await prisma.jobPosting.create({
      data: {
        profileId,
        url,
        company: fields.company,
        role: fields.role,
        location: fields.location,
        descriptionRaw: fetched.text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements },
      },
    });
  } catch (e) {
    return { ok: false, error: `Extraction failed: ${(e as Error).message}` };
  }
  revalidatePath(`/profiles/${profileId}`);
  return { ok: true };
}

/** Fallback: extract from pasted JD text (no scraping). */
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
      },
    });
  } catch (e) {
    return { ok: false, error: `Extraction failed: ${(e as Error).message}` };
  }
  revalidatePath(`/profiles/${profileId}`);
  return { ok: true };
}

export async function deleteJob(id: string, profileId: string) {
  await prisma.jobPosting.delete({ where: { id } });
  revalidatePath(`/profiles/${profileId}`);
}
