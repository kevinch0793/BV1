"use client";

import { useState } from "react";
import { ResumePreviewModal } from "@/components/ResumePreviewModal";

/** "View resume" trigger that opens the preview/download dialog in place. */
export function ViewResumeButton({ tailoredId }: { tailoredId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-xs font-medium text-sky-700 hover:underline"
      >
        View resume
      </button>
      {open && <ResumePreviewModal tailoredId={tailoredId} onClose={() => setOpen(false)} />}
    </>
  );
}
