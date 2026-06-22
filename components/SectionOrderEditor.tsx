"use client";

import { useState, useTransition } from "react";
import { SECTION_LABELS, type SectionKey } from "@/lib/sections";
import { updateSectionOrder } from "@/app/actions/settings";

const saveBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900";

export function SectionOrderEditor({ initial }: { initial: SectionKey[] }) {
  const [order, setOrder] = useState<SectionKey[]>(initial);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const dirty = order.join(",") !== initial.join(",");

  function move(from: number, to: number) {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setSaved(false);
  }

  function save() {
    start(async () => {
      await updateSectionOrder(order);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="max-w-sm space-y-1.5">
        {order.map((key, i) => (
          <li
            key={key}
            draggable
            onDragStart={() => setDragging(i)}
            onDragEnter={() => setOver(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) move(dragging, i);
              setDragging(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            className={`flex cursor-grab items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-neutral-800 select-none active:cursor-grabbing ${
              dragging === i
                ? "border-sky-400 opacity-50"
                : over === i
                  ? "border-sky-400 ring-1 ring-sky-200"
                  : "border-neutral-200"
            }`}
          >
            <span aria-hidden className="text-neutral-400">⠿</span>
            <span className="w-5 text-xs text-neutral-400">{i + 1}</span>
            {SECTION_LABELS[key]}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={!dirty || pending} className={saveBtn}>
          {pending ? "Saving…" : "Save order"}
        </button>
        {saved && !dirty && <span className="text-xs text-emerald-600">Saved.</span>}
        <span className="text-[11px] text-neutral-400">Drag to reorder. The header (name + contact) always stays on top.</span>
      </div>
    </div>
  );
}
