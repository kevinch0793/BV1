"use client";

import { useCallback, useState, useTransition } from "react";
import { STATUS_LABEL, type KeyStatus } from "@/lib/apiKeyStatus";
import type { KeyRow } from "@/app/actions/apiKeys";

/**
 * Admin screen for choosing which OpenAI key the platform uses.
 *
 * Keys are listed by their last six characters only -- the secret never leaves
 * the server.
 *
 * Nothing is probed automatically. Opening the page costs no API calls: the table
 * shows the verdict from the last test with how long ago it was taken, and a key
 * is only re-tested when the admin asks for it. Probing on every view spent calls
 * on keys nobody was looking at, and the status still went stale the moment the
 * page was left open.
 *
 * Switching is the exception -- activateKey always re-tests first, because
 * activating a dead key would stop tailoring, fetching and extension answers at
 * once. That probe is still triggered by a click.
 */

/** Colour carries the three-way meaning of the status: usable, fixable by
 *  topping up or waiting, or broken. */
const BADGE: Record<KeyStatus, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  no_credit: "border-amber-200 bg-amber-50 text-amber-700",
  rate_limited: "border-amber-200 bg-amber-50 text-amber-700",
  revoked: "border-rose-200 bg-rose-50 text-rose-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  unknown: "border-neutral-200 bg-neutral-50 text-neutral-500",
};

function ago(iso: string | null): string {
  if (!iso) return "not tested yet";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "tested " + secs + "s ago";
  if (secs < 3600) return "tested " + Math.round(secs / 60) + "m ago";
  if (secs < 86400) return "tested " + Math.round(secs / 3600) + "h ago";
  return "tested " + Math.round(secs / 86400) + "d ago";
}

export function ApiKeyManager({
  initialKeys,
  reload,
  refreshAll,
  check,
  activate,
  add,
  remove,
}: {
  initialKeys: KeyRow[];
  reload: () => Promise<KeyRow[]>;
  refreshAll: () => Promise<KeyRow[]>;
  check: (id: string) => Promise<KeyRow[]>;
  activate: (id: string) => Promise<{ ok: boolean; error?: string }>;
  add: (label: string, secret: string) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [, startTransition] = useTransition();

  // A test action returns the refreshed list directly; activate / add / remove
  // return an ok/error result and need a follow-up read. That read uses reload,
  // which only re-reads stored rows -- re-probing here would spend an API call
  // per key every time a key was added or deleted.
  const run = useCallback(
    async (id: string | null, fn: () => Promise<unknown>) => {
      setBusyId(id ?? "__global__");
      setError(null);
      try {
        const res = (await fn()) as KeyRow[] | { ok?: boolean; error?: string };
        if (Array.isArray(res)) {
          setKeys(res);
        } else {
          if (res && res.ok === false) setError(res.error ?? "Something went wrong.");
          setKeys(await reload());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const active = keys.find((k) => k.active);
  const anyBusy = busyId !== null;
  const testingAll = busyId === "__global__";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-neutral-600">
          {active ? (
            <>
              In use: <span className="font-medium text-neutral-900">{active.label}</span>{" "}
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">sk-...{active.last6}</code>
            </>
          ) : (
            <span className="text-amber-700">No key is active -- the platform is falling back to OPENAI_API_KEY.</span>
          )}
        </div>
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => startTransition(() => void run(null, refreshAll))}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {testingAll ? "Testing..." : "Test all"}
        </button>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">In use</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {keys.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                  No keys stored yet. Add one below.
                </td>
              </tr>
            )}
            {keys.map((k) => {
              const busy = busyId === k.id;
              return (
                <tr key={k.id} className={k.active ? "bg-emerald-50/40" : undefined}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">{k.label}</div>
                    <code className="text-xs text-neutral-500">sk-...{k.last6}</code>
                  </td>
                  <td className="px-3 py-2">
                    <span className={"inline-block rounded-md border px-1.5 py-0.5 text-xs font-medium " + BADGE[k.lastStatus]}>
                      {STATUS_LABEL[k.lastStatus]}
                    </span>
                    <div className="mt-0.5 text-[11px] text-neutral-500" title={k.lastDetail ?? undefined}>
                      {ago(k.lastCheckedAt)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {k.active ? (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => startTransition(() => void run(k.id, () => check(k.id)))}
                        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {busy ? "Testing..." : "Test"}
                      </button>
                      {!k.active && (
                        <>
                          <button
                            type="button"
                            disabled={anyBusy}
                            onClick={() => startTransition(() => void run(k.id, () => activate(k.id)))}
                            className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            title="Checks the key first and refuses to switch if it is not available"
                          >
                            {busy ? "Switching..." : "Use this key"}
                          </button>
                          <button
                            type="button"
                            disabled={anyBusy}
                            onClick={() => startTransition(() => void run(k.id, () => remove(k.id)))}
                            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-neutral-200 p-4">
        <div className="mb-2 text-sm font-medium text-neutral-900">Add a key</div>
        <p className="mb-3 text-xs text-neutral-500">
          The key is tested against OpenAI before it is saved, and is never shown again afterwards -- only its last six
          characters.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name (e.g. Main account)"
            className="w-56 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="sk-proj-..."
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="w-80 rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-sm"
          />
          <button
            type="button"
            disabled={!secret.trim() || anyBusy}
            onClick={() =>
              startTransition(() =>
                void run(null, async () => {
                  const res = await add(label, secret);
                  if (res.ok) {
                    setLabel("");
                    setSecret("");
                  }
                  return res;
                }),
              )
            }
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Add &amp; test
          </button>
        </div>
      </div>
    </div>
  );
}
