"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { extractJobFields } from "@/lib/llm/service";
import { assertOwnsProfile, assertOwnsJob } from "@/lib/owner";
import { normalizeUrl, normalizeUrls } from "@/lib/url";

export type JobActionResult = { ok: boolean; error?: string; needsPaste?: boolean };

/** Bulk-add job URLs as pending entries (no scraping yet). Duplicates — within
 *  the batch or already on this profile — are skipped, not re-added. */
export async function addJobUrls(
  profileId: string,
  formData: FormData,
): Promise<{ ok: boolean; added: number; skipped: number; error?: string }> {
  await assertOwnsProfile(profileId);
  const urls = normalizeUrls(String(formData.get("urls") ?? ""));
  if (urls.length === 0) return { ok: false, added: 0, skipped: 0, error: "Enter at least one URL." };

  // Skip any URL already on this profile (compare normalized on both sides).
  const existing = await prisma.jobPosting.findMany({ where: { profileId }, select: { url: true } });
  const have = new Set(existing.map((e) => normalizeUrl(e.url)).filter((u): u is string => !!u));
  const fresh = urls.filter((u) => !have.has(u));
  const skipped = urls.length - fresh.length;

  if (fresh.length) {
    await prisma.jobPosting.createMany({
      data: fresh.map((url) => ({ profileId, url, status: "pending" })),
    });
  }
  revalidatePath(`/profiles/${profileId}/dashboard`);
  return { ok: true, added: fresh.length, skipped };
}

/** Scrape + extract a single job. Called one-at-a-time by the queue. */
export async function fetchJob(jobId: string): Promise<JobActionResult> {
  await assertOwnsJob(jobId);
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
    const desc = (fields.description ?? "").trim();
    const company = fields.company?.trim() || "";
    const role = fields.role?.trim() || "";

    // Reached the page but no usable JD (JS-gated board / apply-only form). Keep
    // it as "needs_jd" — shown as "Fetched" so the user can paste the JD manually
    // — rather than failing. (A genuinely unreachable page already failed above.)
    if (desc.length < 200) {
      await prisma.jobPosting.update({
        where: { id: jobId },
        data: {
          company: company || null,
          role: role || null,
          location: fields.location || null,
          workplace: fields.workplace || null,
          descriptionRaw: null,
          descriptionParsed: { description: "", requirements: fields.requirements ?? [] },
          status: "needs_jd",
          error: null,
        },
      });
      revalidatePath(`/profiles/${job.profileId}/dashboard`);
      return { ok: true };
    }

    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        workplace: fields.workplace,
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
  await assertOwnsProfile(profileId);
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
  await assertOwnsJob(jobId);
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
  await assertOwnsProfile(profileId);
  // deleteMany is idempotent — no error if the row was already removed (e.g. a
  // double-click or stale view). The tailored resume is removed via DB cascade.
  await prisma.jobPosting.deleteMany({ where: { id, profileId } });
  revalidatePath(`/profiles/${profileId}/dashboard`);
  revalidatePath("/");
}

/** Bulk-delete the selected jobs (their tailored resumes cascade). */
export async function deleteJobs(ids: string[], profileId: string): Promise<{ removed: number }> {
  await assertOwnsProfile(profileId);
  const unique = [...new Set(ids ?? [])].slice(0, 1000);
  if (!unique.length) return { removed: 0 };
  const res = await prisma.jobPosting.deleteMany({ where: { id: { in: unique }, profileId } });
  revalidatePath(`/profiles/${profileId}/dashboard`);
  revalidatePath("/");
  return { removed: res.count };
}

export type ApplyStatus = "none" | "applied" | "not_available";

/**
 * Manually set a job's application status. `usedTailored` records whether the
 * application actually used the tailored resume — it is NOT inferred from a
 * tailored resume merely existing (the Apply action passes true because it
 * downloads it; a manual "applied" defaults to false and can be toggled).
 */
export async function setApplyStatus(id: string, status: ApplyStatus, usedTailored = false) {
  const clientId = await assertOwnsJob(id);
  await prisma.jobPosting.updateMany({
    where: { id, profile: { clientId } },
    data: {
      applyStatus: status,
      appliedAt: status === "applied" ? new Date() : null,
      appliedTailored: status === "applied" ? usedTailored : null,
    },
  });
  const job = await prisma.jobPosting.findUnique({ where: { id }, select: { profileId: true } });
  if (job) revalidatePath(`/profiles/${job.profileId}/dashboard`);
}
