"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, register, type AuthState } from "@/app/actions/auth";

const input =
  "w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? login : register;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const isLogin = mode === "login";

  return (
    <div className="mx-auto mt-16 w-full max-w-sm">
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-sky-700 text-sm font-semibold text-white">R</span>
        <span className="text-lg font-semibold text-neutral-900">Tailored Resume</span>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-neutral-900">{isLogin ? "Sign in" : "Create an account"}</h1>
        <p className="mb-4 mt-1 text-sm text-neutral-500">
          {isLogin ? "Welcome back." : "An admin will approve your account before you can sign in."}
        </p>

        {state.ok ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>
        ) : (
          <form action={formAction} className="space-y-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Email
              <input name="email" type="email" autoComplete="email" required className={input} placeholder="you@example.com" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
              Password
              <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required className={input} placeholder="••••••••" />
            </label>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <button
              disabled={pending}
              className="w-full rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {pending ? "Please wait…" : isLogin ? "Sign in" : "Register"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-neutral-500">
          {isLogin ? (
            <>No account? <Link href="/register" className="text-sky-700 hover:underline">Register</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="text-sky-700 hover:underline">Sign in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
