"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isPlan, type Plan } from "@/lib/plan";

/**
 * Approve a pending registration, choosing the plan its profiles start on.
 *
 * The plan itself lives on each Profile — one account may run several
 * candidates — but approval happens here, usually before any profile exists, so
 * this sets the client's default. Profiles created afterwards inherit it, and
 * any already created are brought in line, which is what an admin means by
 * "approve this client as normal".
 */
export async function approveClient(id: string, plan: Plan = "tailor"): Promise<void> {
  await requireAdmin();
  const defaultPlan: Plan = isPlan(plan) ? plan : "tailor";
  await prisma.client.update({
    where: { id },
    data: { status: "approved", approvedAt: new Date(), defaultPlan },
  });
  await prisma.profile.updateMany({ where: { clientId: id }, data: { plan: defaultPlan } });
  // Guarantee the client has a Settings row (satisfies the @unique clientId invariant).
  await prisma.settings.upsert({ where: { clientId: id }, create: { clientId: id }, update: {} });
  revalidatePath("/admin/clients");
}

export async function rejectClient(id: string): Promise<void> {
  await requireAdmin();
  await prisma.client.update({ where: { id }, data: { status: "rejected" } });
  revalidatePath("/admin/clients");
}

/**
 * Change the plan of ONE profile. This is the authoritative control: the plan is
 * per-profile, so this is what actually decides whether that candidate's jobs
 * get tailored.
 */
export async function setProfilePlan(profileId: string, plan: Plan): Promise<void> {
  await requireAdmin();
  if (!isPlan(plan)) return;
  await prisma.profile.update({ where: { id: profileId }, data: { plan } });
  revalidatePath("/admin/clients");
  revalidatePath(`/profiles/${profileId}`);
  revalidatePath(`/profiles/${profileId}/dashboard`);
}

/**
 * Change what an approved client's NEW profiles inherit, without touching the
 * profiles they already have — those are set individually, and silently
 * re-planning a running candidate would stop their resumes with no trace.
 */
export async function setClientDefaultPlan(clientId: string, plan: Plan): Promise<void> {
  await requireAdmin();
  if (!isPlan(plan)) return;
  await prisma.client.update({ where: { id: clientId }, data: { defaultPlan: plan } });
  revalidatePath("/admin/clients");
}
