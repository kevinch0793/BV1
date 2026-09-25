"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { findJobDescription } from "@/lib/scrape/fetchHtml";
import { companySlugFromUrl, matchBlacklist } from "@/lib/blacklist";
import { getCompanyBlacklist } from "@/lib/settings";
import { extractJobFields } from "@/lib/llm/service";
import { assertOwnsProfile, assertOwnsJob } from "@/lib/owner";
import { isProfilePaused } from "@/lib/pipeline";
import { shouldTailorWorkplace } from "@/lib/location";
import { normalizeUrl, normalizeUrls } from "@/lib/url";

const PAUSED_MSG = "This profile is paused by an admin — resume it to add or fetch jobs.";

export type JobActionResult = { ok: boolean; error?: string; needsPaste?: boolean };

export type JobJd = { company: string | null; role: string | null; location: string | null; url: string | null; jd: string };

/**
 * Load a job's stored plain-text JD — for the search "View JD" modal, so a saved
 * posting stays readable even after its original URL expires. Prefers the parsed
 * description, falling back to the raw fetched page text.
 */
export async function getJobJd(jobId: string): Promise<JobJd | null> {
  await assertOwnsJob(jobId);
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: { company: true, role: true, location: true, url: true, descriptionParsed: true, descriptionRaw: true },
  });
  if (!job) return null;
  const parsed = (job.descriptionParsed as { description?: string } | null) ?? {};
  const jd = parsed.description?.trim() || job.descriptionRaw?.trim() || "";
  return { company: job.company, role: job.role, location: job.location, url: job.url, jd };
}

/** Inline-edit a job's company / role — manual correction, e.g. for rows the
 *  fetcher couldn't read (needs_jd). Only the provided fields are touched. */
export async function updateJobFields(
  jobId: string,
  fields: { company?: string | null; role?: string | null },
): Promise<{ ok: boolean }> {
  await assertOwnsJob(jobId);
  const data: { company?: string | null; role?: string | null } = {};
  if ("company" in fields) data.company = (fields.company ?? "").trim().slice(0, 200) || null;
  if ("role" in fields) data.role = (fields.role ?? "").trim().slice(0, 200) || null;
  if (!Object.keys(data).length) return { ok: false };
  const updated = await prisma.jobPosting.update({ where: { id: jobId }, data, select: { profileId: true } });
  revalidatePath(`/profiles/${updated.profileId}/dashboard`);
  return { ok: true };
}

/** One URL that will not be added, and why. */
export type FilteredOut = { url: string; reason: string };

/**
 * Dry-run the paste: sort URLs into what will be added, what cannot be checked,
 * and what is rejected — WITHOUT touching the database.
 *
 * Three buckets rather than two, because the blacklist can only be applied here
 * to the company slug a board puts in its URL, and roughly a fifth of boards
 * carry none (paylocity, Oracle HCM, recruiterflow, jobdiva, plus a long tail).
 * Those are "unverified", not "clean": dropping them would discard good jobs,
 * and silently passing them would make the exported list look like a guarantee
 * it isn't. Anything unverified that IS blacklisted still gets caught after
 * extraction, when the real company name is known.
 */
export async function filterJobUrls(
  profileId: string,
  formData: FormData,
): Promise<{ ok: boolean; passed: string[]; unverified: string[]; removed: FilteredOut[]; error?: string }> {
  await assertOwnsProfile(profileId);
  const empty = { passed: [], unverified: [], removed: [] };
  const raw = String(formData.get("urls") ?? "");
  const urls = normalizeUrls(raw);

  // Lines that carry text but yield no usable URL — a stray note, or a row that
  // lost its link on the way out of a spreadsheet. Reported rather than dropped
  // silently, so a mangled paste is visible instead of quietly short.
  const removed: FilteredOut[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /https?:\/\//i.test(t) || normalizeUrl(t)) continue;
    removed.push({ url: t.slice(0, 300), reason: "not a URL" });
  }
  if (urls.length === 0 && removed.length === 0) {
    return { ok: false, ...empty, error: "Enter at least one URL." };
  }

  const existing = await prisma.jobPosting.findMany({ where: { profileId }, select: { url: true } });
  const have = new Set(existing.map((e) => normalizeUrl(e.url)).filter((u): u is string => !!u));
  const blacklist = await getCompanyBlacklist();

  const passed: string[] = [];
  const unverified: string[] = [];
  for (const url of urls) {
    if (have.has(url)) {
      removed.push({ url, reason: "already on this profile" });
      continue;
    }
    const slug = companySlugFromUrl(url);
    if (!slug) {
      unverified.push(url); // board hides the company — decided after extraction
      continue;
    }
    const hit = matchBlacklist(slug, blacklist);
    if (hit) removed.push({ url, reason: `blacklisted: ${hit.label}` });
    else passed.push(url);
  }
  return { ok: true, passed, unverified, removed };
}

/** Bulk-add job URLs as pending entries (no scraping yet). Duplicates — within
 *  the batch or already on this profile — are skipped, not re-added. */
export async function addJobUrls(
  profileId: string,
  formData: FormData,
): Promise<{ ok: boolean; added: number; skipped: number; excluded?: number; error?: string }> {
  await assertOwnsProfile(profileId);
  if (await isProfilePaused(profileId)) return { ok: false, added: 0, skipped: 0, error: PAUSED_MSG };
  const urls = normalizeUrls(String(formData.get("urls") ?? ""));
  if (urls.length === 0) return { ok: false, added: 0, skipped: 0, error: "Enter at least one URL." };

  // Skip any URL already on this profile (compare normalized on both sides).
  const existing = await prisma.jobPosting.findMany({ where: { profileId }, select: { url: true } });
  const have = new Set(existing.map((e) => normalizeUrl(e.url)).filter((u): u is string => !!u));
  const fresh = urls.filter((u) => !have.has(u));
  const skipped = urls.length - fresh.length;

  // Blacklist, first pass: the company slug most boards carry in the URL. A hit
  // here never costs a fetch. Boards that hide the company yield no slug and are
  // caught after extraction instead (see fetchJobNow).
  const blacklist = await getCompanyBlacklist();
  let excluded = 0;
  if (fresh.length) {
    await prisma.jobPosting.createMany({
      data: fresh.map((url) => {
        const hit = blacklist.length ? matchBlacklist(companySlugFromUrl(url), blacklist) : null;
        if (hit) excluded += 1;
        return hit
          ? { profileId, url, status: "excluded", error: `Blacklisted company: ${hit.label}` }
          : { profileId, url, status: "pending" };
      }),
    });
  }
  revalidatePath(`/profiles/${profileId}/dashboard`);
  return { ok: true, added: fresh.length - excluded, skipped, excluded };
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

    // Same remote-only rule the pipeline applies (see shouldTailorWorkplace), so a
    // job fetched one-off from the dashboard lands in the same state it would have
    // reached through the queue.
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        workplace: fields.workplace,
        descriptionRaw: fetched.text.slice(0, 20000),
        descriptionParsed: { description: fields.description, requirements: fields.requirements },
        status: shouldTailorWorkplace(fields.workplace) ? "fetched" : "skipped",
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
  if (await isProfilePaused(profileId)) return { ok: false, error: PAUSED_MSG };
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
  if (await isProfilePaused(job.profileId)) return { ok: false, error: PAUSED_MSG };

  try {
    const fields = await extractJobFields(text);
    await prisma.jobPosting.update({
      where: { id: jobId },
      data: {
        company: fields.company,
        role: fields.role,
        location: fields.location,
        // Re-classify from the pasted text. This row reached "needs_jd" because the
        // fetch found no JD, so any workplace stored then was guessed from a shell
        // page's boilerplate — leaving it would let that guess skip a job whose real
        // JD is now in hand.
        workplace: fields.workplace,
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
