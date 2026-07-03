"use client";

import { useState } from "react";
import { generateApiToken, revokeApiToken, setAnswerProfile } from "@/app/actions/settings";

const input =
  "rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const primaryBtn = "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40";
const secondaryBtn = "rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40";

export function ApiTokenPanel({
  profiles,
  hasToken,
  answerProfileId,
}: {
  profiles: { id: string; name: string }[];
  hasToken: boolean;
  answerProfileId: string | null;
}) {
  const [profileId, setProfileId] = useState(answerProfileId ?? "");
  const [profileSaved, setProfileSaved] = useState(false);
  const [tokenExists, setTokenExists] = useState(hasToken);
  const [token, setToken] = useState<string | null>(null); // shown once, right after generating
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveProfile(id: string) {
    setProfileId(id);
    setProfileSaved(false);
    const fd = new FormData();
    fd.set("answerProfileId", id);
    await setAnswerProfile(fd);
    setProfileSaved(true);
  }
  async function generate() {
    setBusy(true);
    try {
      const res = await generateApiToken();
      setToken(res.token);
      setTokenExists(true);
      setCopied(false);
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    try {
      await revokeApiToken();
      setTokenExists(false);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex max-w-sm flex-col gap-1 text-xs font-medium text-neutral-500">
        Answer as
        <select value={profileId} onChange={(e) => saveProfile(e.target.value)} className={input}>
          <option value="">— pick a profile —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {!profiles.length && <span className="text-amber-600">Create a profile first.</span>}
        {profileSaved && <span className="text-emerald-600">Saved.</span>}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generate} disabled={busy} className={primaryBtn}>
          {busy ? "Working…" : tokenExists ? "Regenerate token" : "Generate token"}
        </button>
        {tokenExists && (
          <button onClick={revoke} disabled={busy} className={secondaryBtn}>Revoke</button>
        )}
        <span className="text-xs text-neutral-400">{tokenExists ? "A token is active." : "No token yet."}</span>
      </div>

      {token && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-1 text-xs font-medium text-emerald-700">New token — copy it now; it won&apos;t be shown again:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs text-neutral-800">{token}</code>
            <button onClick={copy} className={secondaryBtn}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
