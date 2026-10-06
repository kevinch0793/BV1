"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { invalidateActiveKey, probeKey, refreshKeyStatus } from "@/lib/apiKeys";
import { looksLikeOpenAIKey, maskKey, type KeyStatus } from "@/lib/apiKeyStatus";
import { resetKeyHealth } from "@/lib/llm/health";

const ADMIN_KEYS = "/admin/keys";

export type KeyRow = {
  id: string;
  label: string;
  last6: string;
  active: boolean;
  lastStatus: KeyStatus;
  lastDetail: string | null;
  lastCheckedAt: string | null;
};

/**
 * Every key, newest first, WITHOUT the secrets. The browser only ever receives
 * the last six characters, so the list can be rendered without putting a usable
 * credential into the page source.
 */
export async function listKeys(): Promise<KeyRow[]> {
  await requireAdmin();
  const rows = await prisma.apiKey.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: { id: true, label: true, last6: true, active: true, lastStatus: true, lastDetail: true, lastCheckedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    last6: r.last6,
    active: r.active,
    lastStatus: (r.lastStatus as KeyStatus) ?? "unknown",
    lastDetail: r.lastDetail,
    lastCheckedAt: r.lastCheckedAt ? r.lastCheckedAt.toISOString() : null,
  }));
}

/** Probe every stored key and persist the verdicts. Runs them concurrently. */
export async function refreshAllKeys(): Promise<KeyRow[]> {
  await requireAdmin();
  const ids = await prisma.apiKey.findMany({ select: { id: true } });
  await Promise.all(ids.map((k) => refreshKeyStatus(k.id).catch(() => undefined)));
  revalidatePath(ADMIN_KEYS);
  return listKeys();
}

/** Probe one key on demand. */
export async function checkKey(id: string): Promise<KeyRow[]> {
  await requireAdmin();
  await refreshKeyStatus(id).catch(() => undefined);
  revalidatePath(ADMIN_KEYS);
  return listKeys();
}

/**
 * Store a new key. It is probed BEFORE being written, so a mistyped or dead key
 * is reported immediately rather than sitting in the list looking available.
 */
export async function addKey(label: string, secret: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const trimmed = (secret || "").trim();
  const name = (label || "").trim() || "Untitled key";
  if (!looksLikeOpenAIKey(trimmed)) return { ok: false, error: "That does not look like an OpenAI key (expected sk-...)." };

  const existing = await prisma.apiKey.findFirst({ where: { secret: trimmed }, select: { label: true } });
  if (existing) return { ok: false, error: `That key is already stored as "${existing.label}".` };

  const probe = await probeKey(trimmed);
  await prisma.apiKey.create({
    data: {
      label: name,
      secret: trimmed,
      last6: maskKey(trimmed),
      active: false,
      lastStatus: probe.status,
      lastDetail: probe.detail,
      lastCheckedAt: new Date(),
    },
  });
  revalidatePath(ADMIN_KEYS);
  return { ok: true };
}

/**
 * Make one key the active one.
 *
 * The key is re-probed first and a dead one is refused: activating a key that
 * cannot work would stop every tailor, fetch and extension answer at once, and
 * the only symptom users see is the extension silently failing. The stored
 * status is updated either way, so a refusal still leaves the list accurate.
 */
export async function activateKey(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const row = await prisma.apiKey.findUnique({ where: { id }, select: { secret: true, label: true } });
  if (!row) return { ok: false, error: "Key not found." };

  const probe = await probeKey(row.secret);
  await prisma.apiKey.update({
    where: { id },
    data: { lastStatus: probe.status, lastDetail: probe.detail, lastCheckedAt: new Date() },
  });
  if (probe.status !== "ok") {
    revalidatePath(ADMIN_KEYS);
    return { ok: false, error: `Not switched - ${row.label} is not available: ${probe.detail}` };
  }

  // Exactly one active row. Clearing first keeps the invariant even if the
  // second statement fails.
  await prisma.apiKey.updateMany({ where: { active: true }, data: { active: false } });
  await prisma.apiKey.update({ where: { id }, data: { active: true } });
  invalidateActiveKey();
  resetKeyHealth();
  revalidatePath(ADMIN_KEYS);
  revalidatePath("/");
  return { ok: true };
}

/** Remove a key. The active one is protected, so the platform is never left keyless. */
export async function deleteKey(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const row = await prisma.apiKey.findUnique({ where: { id }, select: { active: true } });
  if (!row) return { ok: false, error: "Key not found." };
  if (row.active) return { ok: false, error: "That key is in use. Switch to another key first." };
  await prisma.apiKey.delete({ where: { id } });
  revalidatePath(ADMIN_KEYS);
  return { ok: true };
}
