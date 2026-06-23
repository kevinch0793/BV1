// Ownership scoping for the current client. Admins are superusers: they can see
// and manage every client's data, so the helpers skip the clientId filter for
// admins. The assert helpers return the RESOURCE OWNER's clientId (not the
// caller's) so downstream settings/deletes target the right tenant.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireClient } from "@/lib/auth";

/** Prisma `where` fragment scoping Profile queries to the caller (admin: all). */
export async function profileWhere(): Promise<{ clientId?: string }> {
  const c = await requireClient();
  return c.role === "admin" ? {} : { clientId: c.id };
}

/** Prisma `where` fragment for resources scoped via their profile (admin: all). */
export async function ownedByProfileWhere(): Promise<{ profile?: { clientId: string } }> {
  const c = await requireClient();
  return c.role === "admin" ? {} : { profile: { clientId: c.id } };
}

export async function assertOwnsProfile(profileId: string): Promise<string> {
  const c = await requireClient();
  const p = await prisma.profile.findUnique({ where: { id: profileId }, select: { clientId: true } });
  if (!p) notFound();
  if (c.role !== "admin" && p.clientId !== c.id) notFound();
  return p.clientId;
}

export async function assertOwnsJob(jobId: string): Promise<string> {
  const c = await requireClient();
  const j = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { profile: { select: { clientId: true } } } });
  if (!j) notFound();
  if (c.role !== "admin" && j.profile.clientId !== c.id) notFound();
  return j.profile.clientId;
}

export async function assertOwnsTailored(tailoredId: string): Promise<string> {
  const c = await requireClient();
  const t = await prisma.tailoredResume.findUnique({ where: { id: tailoredId }, select: { profile: { select: { clientId: true } } } });
  if (!t) notFound();
  if (c.role !== "admin" && t.profile.clientId !== c.id) notFound();
  return t.profile.clientId;
}
