"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export type AuthState = { error?: string; ok?: boolean; message?: string };

function parseCreds(formData: FormData): { email: string; password: string } | null {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email.includes("@") || email.length < 3) return null;
  if (password.length < 6) return null;
  return { email, password };
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const creds = parseCreds(formData);
  if (!creds) return { error: "Enter a valid email and password (min 6 characters)." };

  const client = await prisma.client.findUnique({ where: { email: creds.email } });
  if (!client || !verifyPassword(creds.password, client.passwordHash)) {
    return { error: "Invalid email or password." };
  }
  if (client.status === "pending") return { error: "Your account is awaiting admin approval." };
  if (client.status === "rejected") return { error: "Your account request was declined." };

  await setSessionCookie(client.id);
  redirect(client.role === "admin" ? "/admin/clients" : "/");
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const creds = parseCreds(formData);
  if (!creds) return { error: "Enter a valid email and a password of at least 6 characters." };

  const existing = await prisma.client.findUnique({ where: { email: creds.email } });
  if (existing) return { error: "That email is already registered." };

  await prisma.client.create({
    data: { email: creds.email, passwordHash: hashPassword(creds.password), role: "client", status: "pending" },
  });
  return { ok: true, message: "Registration received — an admin will approve your account before you can sign in." };
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
