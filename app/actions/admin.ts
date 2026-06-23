"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function approveClient(id: string): Promise<void> {
  await requireAdmin();
  await prisma.client.update({ where: { id }, data: { status: "approved", approvedAt: new Date() } });
  // Guarantee the client has a Settings row (satisfies the @unique clientId invariant).
  await prisma.settings.upsert({ where: { clientId: id }, create: { clientId: id }, update: {} });
  revalidatePath("/admin/clients");
}

export async function rejectClient(id: string): Promise<void> {
  await requireAdmin();
  await prisma.client.update({ where: { id }, data: { status: "rejected" } });
  revalidatePath("/admin/clients");
}
