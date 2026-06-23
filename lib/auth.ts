// Session auth: HMAC-signed stateless cookie + per-request client lookup.
// (No "server-only" import — that package isn't installed — but this module
// imports next/headers + prisma, so it is server-only in practice.)
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export { hashPassword, verifyPassword } from "@/lib/password";

const COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, seconds

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set — add it to .env.");
  return s;
}

type SessionPayload = { clientId: string; exp: number };

export function signSession(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest().toString("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!p.clientId || typeof p.exp !== "number" || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export type CurrentClient = { id: string; email: string; role: string; status: string };

/** Reads + verifies the session cookie and loads the client; null unless approved. */
export async function getCurrentClient(): Promise<CurrentClient | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;
  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { id: true, email: true, role: true, status: true },
  });
  // Authority always comes from the live row — a rejected client is bounced
  // here even though their cookie is still validly signed.
  if (!client || client.status !== "approved") return null;
  return client;
}

export async function requireClient(): Promise<CurrentClient> {
  const c = await getCurrentClient();
  if (!c) redirect("/login");
  return c;
}

export async function requireAdmin(): Promise<CurrentClient> {
  const c = await requireClient();
  if (c.role !== "admin") notFound();
  return c;
}

/** Set the session cookie (only legal inside a Server Action / Route Handler). */
export async function setSessionCookie(clientId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  (await cookies()).set(COOKIE, signSession({ clientId, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
