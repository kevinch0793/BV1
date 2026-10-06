import { requireAdmin } from "@/lib/auth";
import { seedFromEnvIfEmpty } from "@/lib/apiKeys";
import { activateKey, addKey, checkKey, deleteKey, listKeys, refreshAllKeys } from "@/app/actions/apiKeys";
import { ApiKeyManager } from "@/components/admin/ApiKeyManager";

// Live probes run on every view, so nothing here may be cached.
export const dynamic = "force-dynamic";

/**
 * Admin > API keys.
 *
 * Switching the OpenAI key used to mean editing .env and recreating the
 * container, because compose reads env_file only when a container is created --
 * a plain restart silently keeps the old value. The key now lives in the
 * database and this page switches it in place.
 */
export default async function ApiKeysPage() {
  await requireAdmin();
  // First visit adopts whatever is in OPENAI_API_KEY, so the key actually in use
  // appears in the list rather than the page looking empty while the platform
  // is plainly working.
  await seedFromEnvIfEmpty();
  const keys = await listKeys();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold text-neutral-900">API keys</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-600">
        Every OpenAI call the platform makes -- job extraction, tailoring, and the extension&apos;s answers -- uses the
        active key. Switching takes effect on the next request; no restart is needed. Statuses below are from the last
        time each key was tested -- press <span className="font-medium">Test</span> to check one against OpenAI now.
      </p>

      <ApiKeyManager
        initialKeys={keys}
        reload={listKeys}
        refreshAll={refreshAllKeys}
        check={checkKey}
        activate={activateKey}
        add={addKey}
        remove={deleteKey}
      />

      <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
        <div className="mb-1 font-medium text-neutral-800">What the statuses mean</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <span className="font-medium">Available</span> -- the key answered normally and can be used.
          </li>
          <li>
            <span className="font-medium">No credit</span> -- the key is valid but its billing account is empty. Adding
            credit fixes it; replacing the key does not.
          </li>
          <li>
            <span className="font-medium">Rate limited</span> -- too many requests just now. Usually clears by itself.
          </li>
          <li>
            <span className="font-medium">Rejected</span> -- the key was refused outright. It has been revoked or
            mistyped, and needs replacing.
          </li>
        </ul>
        <p className="mt-2">
          Keys on the same OpenAI account share one balance, so they run out together. A spare is only a real spare if it
          belongs to a different account.
        </p>
      </div>
    </div>
  );
}
