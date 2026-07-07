"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateAnswerToken, revokeAnswerToken } from "@/app/actions/settings";

const primaryBtn = "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40";
const secondaryBtn = "rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40";

type TokenInfo = { id: string; profileId: string; createdAt: string; lastUsedAt: string | null };

export function ApiTokenPanel({
  profiles,
  tokens,
}: {
  profiles: { id: string; name: string }[];
  tokens: TokenInfo[];
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<{ profileId: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tokenByProfile = new Map(tokens.map((t) => [t.profileId, t]));

  async function generate(profileId: string) {
    setBusyId(profileId);
    setCopied(false);
    try {
      const res = await generateAnswerToken(profileId);
      setRevealed({ profileId, token: res.token });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }
  async function revoke(tokenId: string, profileId: string) {
    setBusyId(profileId);
    try {
      await revokeAnswerToken(tokenId);
      setRevealed((r) => (r?.profileId === profileId ? null : r));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }
  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  }

  if (!profiles.length) return <p className="text-sm text-amber-600">Create a profile first.</p>;

  return (
    <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
      {profiles.map((p) => {
        const tok = tokenByProfile.get(p.id);
        const busy = busyId === p.id;
        const showToken = revealed?.profileId === p.id ? revealed.token : null;
        return (
          <div key={p.id} className="flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-900">{p.name}</div>
                <div className="text-xs text-neutral-400">
                  {tok
                    ? `Token active${tok.lastUsedAt ? ` — last used ${new Date(tok.lastUsedAt).toLocaleDateString()}` : " — not used yet"}`
                    : "No token"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => generate(p.id)} disabled={busy} className={primaryBtn}>
                  {busy ? "Working…" : tok ? "Regenerate" : "Generate token"}
                </button>
                {tok && (
                  <button onClick={() => revoke(tok.id, p.id)} disabled={busy} className={secondaryBtn}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
            {showToken && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
                <div className="mb-1 text-xs font-medium text-emerald-700">
                  New token for {p.name} — copy it now; it won&apos;t be shown again:
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs text-neutral-800">{showToken}</code>
                  <button onClick={() => copy(showToken)} className={secondaryBtn}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
