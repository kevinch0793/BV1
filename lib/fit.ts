// Color scale for an ATS fit score (0-100), stepped every 5% (20 buckets):
// red (low) -> teal (high). Tailwind class names are kept whole (static) so the
// JIT compiler can see them; backgrounds stay light (100-300) and text dark
// (700-900) for readable contrast at every step.
const FIT_SCALE: { bg: string; text: string }[] = [
  { bg: "bg-red-100", text: "text-red-700" }, //         0-4
  { bg: "bg-red-200", text: "text-red-800" }, //         5-9
  { bg: "bg-orange-100", text: "text-orange-700" }, //   10-14
  { bg: "bg-orange-200", text: "text-orange-800" }, //   15-19
  { bg: "bg-amber-100", text: "text-amber-700" }, //     20-24
  { bg: "bg-amber-200", text: "text-amber-800" }, //     25-29
  { bg: "bg-yellow-100", text: "text-yellow-800" }, //   30-34
  { bg: "bg-yellow-200", text: "text-yellow-900" }, //   35-39
  { bg: "bg-lime-100", text: "text-lime-700" }, //       40-44
  { bg: "bg-lime-200", text: "text-lime-800" }, //       45-49
  { bg: "bg-lime-300", text: "text-lime-900" }, //       50-54
  { bg: "bg-green-100", text: "text-green-700" }, //     55-59
  { bg: "bg-green-200", text: "text-green-800" }, //     60-64
  { bg: "bg-green-300", text: "text-green-900" }, //     65-69
  { bg: "bg-emerald-100", text: "text-emerald-700" }, // 70-74
  { bg: "bg-emerald-200", text: "text-emerald-800" }, // 75-79
  { bg: "bg-emerald-300", text: "text-emerald-900" }, // 80-84
  { bg: "bg-teal-100", text: "text-teal-700" }, //       85-89
  { bg: "bg-teal-200", text: "text-teal-800" }, //       90-94
  { bg: "bg-teal-300", text: "text-teal-900" }, //       95-100
];

/** Tailwind bg + text classes for a fit score, one distinct step per 5%. */
export function fitColor(score: number): { bg: string; text: string } {
  const i = Math.min(FIT_SCALE.length - 1, Math.max(0, Math.floor(score / 5)));
  return FIT_SCALE[i];
}
