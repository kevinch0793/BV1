"use client";

import { useEffect, useRef } from "react";

/**
 * A <form> that enables its Save button(s) only when the fields differ from
 * their initial values. Mark the primary submit button with `data-save`.
 * Delete buttons (which use formAction and have no data-save) stay enabled.
 */
export function DirtyForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const baseline = useRef<string>("");

  function snapshot(): string {
    const form = ref.current;
    if (!form) return "";
    const fd = new FormData(form);
    const parts: string[] = [];
    for (const [k, v] of fd.entries()) parts.push(`${k}=${typeof v === "string" ? v : "[file]"}`);
    return parts.join("");
  }

  function setSaveDisabled(disabled: boolean) {
    ref.current
      ?.querySelectorAll<HTMLButtonElement>("[data-save]")
      .forEach((b) => {
        b.disabled = disabled;
      });
  }

  function recompute() {
    setSaveDisabled(snapshot() === baseline.current);
  }

  useEffect(() => {
    baseline.current = snapshot();
    setSaveDisabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      ref={ref}
      action={action}
      className={className}
      onInput={recompute}
      onChange={recompute}
      onSubmit={() => {
        // After a save, the submitted values become the new clean baseline.
        baseline.current = snapshot();
        setSaveDisabled(true);
      }}
    >
      {children}
    </form>
  );
}
