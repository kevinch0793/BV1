"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TemplateOption } from "@/components/templates";
import { setProfileTemplate } from "@/app/actions/profiles";

// Small "bookmark" tab on a profile card's top-right corner showing the resume
// template used for that profile — "Default" follows the client-wide Settings
// template; pick any template to override it just for this profile.
export function ProfileTemplateBadge({ profileId, current, templates }: { profileId: string; current: string | null; templates: TemplateOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="absolute -top-2.5 right-3 z-10" onClick={(e) => e.stopPropagation()}>
      <select
        title="Resume template for this profile"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value || null;
          start(async () => {
            await setProfileTemplate(profileId, v);
            router.refresh();
          });
        }}
        className="cursor-pointer rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 shadow-sm hover:border-sky-400 focus:border-sky-500 focus:outline-none disabled:opacity-50"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
