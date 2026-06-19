"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseResume } from "@/lib/llm/service";

function lines(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const orNull = (v: FormDataEntryValue | null) => str(v) || null;

// ---- Profile ----------------------------------------------------------------

export async function createProfile(formData: FormData) {
  const profile = await prisma.profile.create({
    data: {
      label: str(formData.get("label")) || "Untitled profile",
      fullName: str(formData.get("fullName")) || "New Profile",
    },
  });
  redirect(`/profiles/${profile.id}`);
}

export async function updateProfileBasics(profileId: string, formData: FormData) {
  await prisma.profile.update({
    where: { id: profileId },
    data: {
      label: str(formData.get("label")) || "Untitled profile",
      fullName: str(formData.get("fullName")),
      email: orNull(formData.get("email")),
      phone: orNull(formData.get("phone")),
      location: orNull(formData.get("location")),
      summary: orNull(formData.get("summary")),
      links: {
        linkedin: str(formData.get("linkedin")),
        github: str(formData.get("github")),
        portfolio: str(formData.get("portfolio")),
      },
    },
  });
  revalidatePath(`/profiles/${profileId}`);
}

export async function deleteProfile(profileId: string) {
  await prisma.profile.delete({ where: { id: profileId } });
  redirect("/profiles");
}

// ---- Experience -------------------------------------------------------------

export async function addExperience(profileId: string) {
  const count = await prisma.experience.count({ where: { profileId } });
  await prisma.experience.create({
    data: { profileId, company: "", role: "", order: count },
  });
  revalidatePath(`/profiles/${profileId}`);
}

export async function updateExperience(id: string, profileId: string, formData: FormData) {
  await prisma.experience.update({
    where: { id },
    data: {
      company: str(formData.get("company")),
      role: str(formData.get("role")),
      location: orNull(formData.get("location")),
      startDate: orNull(formData.get("startDate")),
      endDate: orNull(formData.get("endDate")),
      current: formData.get("current") === "on",
      bullets: lines(formData.get("bullets")),
    },
  });
  revalidatePath(`/profiles/${profileId}`);
}

export async function deleteExperience(id: string, profileId: string) {
  await prisma.experience.delete({ where: { id } });
  revalidatePath(`/profiles/${profileId}`);
}

// ---- Education --------------------------------------------------------------

export async function addEducation(profileId: string) {
  const count = await prisma.education.count({ where: { profileId } });
  await prisma.education.create({ data: { profileId, school: "", order: count } });
  revalidatePath(`/profiles/${profileId}`);
}

export async function updateEducation(id: string, profileId: string, formData: FormData) {
  await prisma.education.update({
    where: { id },
    data: {
      school: str(formData.get("school")),
      degree: orNull(formData.get("degree")),
      field: orNull(formData.get("field")),
      startDate: orNull(formData.get("startDate")),
      endDate: orNull(formData.get("endDate")),
      gpa: orNull(formData.get("gpa")),
    },
  });
  revalidatePath(`/profiles/${profileId}`);
}

export async function deleteEducation(id: string, profileId: string) {
  await prisma.education.delete({ where: { id } });
  revalidatePath(`/profiles/${profileId}`);
}

// ---- Projects (name + type required for from-scratch generation) ------------

export async function addProject(profileId: string) {
  const count = await prisma.project.count({ where: { profileId } });
  await prisma.project.create({
    data: { profileId, name: "", type: "", order: count },
  });
  revalidatePath(`/profiles/${profileId}`);
}

export async function updateProject(id: string, profileId: string, formData: FormData) {
  await prisma.project.update({
    where: { id },
    data: {
      name: str(formData.get("name")),
      type: str(formData.get("type")),
      company: orNull(formData.get("company")),
      description: orNull(formData.get("description")),
      bullets: lines(formData.get("bullets")),
    },
  });
  revalidatePath(`/profiles/${profileId}`);
}

export async function deleteProject(id: string, profileId: string) {
  await prisma.project.delete({ where: { id } });
  revalidatePath(`/profiles/${profileId}`);
}

// ---- Skills -----------------------------------------------------------------

export async function setSkills(profileId: string, formData: FormData) {
  // Skills entered as "Category: a, b, c" lines or a flat comma list.
  const raw = String(formData.get("skills") ?? "");
  await prisma.skill.deleteMany({ where: { profileId } });
  const toCreate: { profileId: string; name: string; category: string | null }[] = [];
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const idx = line.indexOf(":");
    const category = idx >= 0 ? line.slice(0, idx).trim() || null : null;
    const rest = idx >= 0 ? line.slice(idx + 1) : line;
    const items = rest.split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of items) toCreate.push({ profileId, name, category });
  }
  if (toCreate.length) await prisma.skill.createMany({ data: toCreate });
  revalidatePath(`/profiles/${profileId}`);
}

// ---- Parse resume → auto-fill profile ---------------------------------------

export type ParseResult = {
  ok: boolean;
  error?: string;
  summary?: { experiences: number; education: number; projects: number; skills: number };
};

export async function parseResumeIntoProfile(
  profileId: string,
  formData: FormData,
): Promise<ParseResult> {
  const file = formData.get("file");
  const pastedText = str(formData.get("text"));

  let resumeText: string;

  try {
    if (file instanceof File && file.size > 0) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const buf = Buffer.from(await file.arrayBuffer());
      if (isPdf) {
        // Extract text locally (no native deps) before sending to OpenAI.
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await extractText(pdf, { mergePages: true });
        resumeText = text.trim();
        if (resumeText.length < 30) {
          return {
            ok: false,
            error: "Couldn't read text from that PDF (it may be scanned/image-only). Paste the text instead.",
          };
        }
      } else {
        resumeText = buf.toString("utf-8");
      }
    } else if (pastedText) {
      resumeText = pastedText;
    } else {
      return { ok: false, error: "Paste resume text or choose a file first." };
    }
  } catch (e) {
    return { ok: false, error: `Could not read input: ${(e as Error).message}` };
  }

  const rawTextForBase = resumeText;

  let parsed;
  try {
    parsed = await parseResume({ text: resumeText });
  } catch (e) {
    return { ok: false, error: `Parsing failed: ${(e as Error).message}` };
  }

  // Replace the structured sections + basics in one transaction.
  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: profileId },
      data: {
        fullName: parsed.fullName || undefined,
        email: parsed.email || null,
        phone: parsed.phone || null,
        location: parsed.location || null,
        summary: parsed.summary || null,
        links: {
          linkedin: parsed.links.linkedin,
          github: parsed.links.github,
          portfolio: parsed.links.portfolio,
        },
      },
    });

    await tx.experience.deleteMany({ where: { profileId } });
    await tx.education.deleteMany({ where: { profileId } });
    await tx.project.deleteMany({ where: { profileId } });
    await tx.skill.deleteMany({ where: { profileId } });

    for (const [i, e] of parsed.experiences.entries()) {
      await tx.experience.create({
        data: {
          profileId,
          company: e.company,
          role: e.role,
          location: e.location || null,
          startDate: e.startDate || null,
          endDate: e.endDate || null,
          current: e.current,
          bullets: e.bullets,
          order: i,
        },
      });
    }
    for (const [i, ed] of parsed.education.entries()) {
      await tx.education.create({
        data: {
          profileId,
          school: ed.school,
          degree: ed.degree || null,
          field: ed.field || null,
          startDate: ed.startDate || null,
          endDate: ed.endDate || null,
          gpa: ed.gpa || null,
          order: i,
        },
      });
    }
    for (const [i, p] of parsed.projects.entries()) {
      await tx.project.create({
        data: {
          profileId,
          name: p.name,
          type: p.type || "Project",
          company: p.company || null,
          description: p.description || null,
          bullets: p.bullets,
          order: i,
        },
      });
    }
    const skillRows = parsed.skills.flatMap((s) =>
      s.items.map((name) => ({ profileId, name, category: s.category || null })),
    );
    if (skillRows.length) await tx.skill.createMany({ data: skillRows });

    if (rawTextForBase) {
      await tx.baseResume.upsert({
        where: { profileId },
        create: { profileId, rawText: rawTextForBase },
        update: { rawText: rawTextForBase },
      });
    }
  });

  revalidatePath(`/profiles/${profileId}`);
  return {
    ok: true,
    summary: {
      experiences: parsed.experiences.length,
      education: parsed.education.length,
      projects: parsed.projects.length,
      skills: parsed.skills.reduce((n, s) => n + s.items.length, 0),
    },
  };
}

// ---- Base resume ------------------------------------------------------------

export async function saveBaseResume(profileId: string, formData: FormData) {
  const rawText = str(formData.get("rawText"));
  if (rawText) {
    await prisma.baseResume.upsert({
      where: { profileId },
      create: { profileId, rawText },
      update: { rawText },
    });
  } else {
    await prisma.baseResume.deleteMany({ where: { profileId } });
  }
  revalidatePath(`/profiles/${profileId}`);
}
