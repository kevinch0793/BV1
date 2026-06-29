// Per-profile colors (stable by profile order) + categorical palettes for chart
// segments. One color map is built once in the orchestrator and passed to every
// widget so a profile is the same color everywhere.

export const PROFILE_COLORS = [
  "#0284c7", // sky-600
  "#059669", // emerald-600
  "#7c3aed", // violet-600
  "#d97706", // amber-600
  "#e11d48", // rose-600
  "#0d9488", // teal-600
  "#4f46e5", // indigo-600
  "#db2777", // pink-600
  "#65a30d", // lime-600
  "#0891b2", // cyan-600
];

export function makeColorOf(profiles: { id: string }[]): (id: string) => string {
  const m = new Map<string, string>();
  profiles.forEach((p, i) => m.set(p.id, PROFILE_COLORS[i % PROFILE_COLORS.length]));
  return (id: string) => m.get(id) ?? "#94a3b8";
}

// Cycled palette for non-profile categorical segments (e.g. role families).
export const CATEGORICAL = [
  "#0ea5e9", "#22c55e", "#a855f7", "#f59e0b", "#ef4444",
  "#14b8a6", "#6366f1", "#ec4899", "#84cc16", "#64748b",
];

// Intuitive fixed colors for workplace modes.
export const WORKPLACE_COLORS: Record<string, string> = {
  remote: "#059669", // green — fully remote
  hybrid: "#0284c7", // blue
  onsite: "#d97706", // amber
  inPerson: "#e11d48", // rose
  unknown: "#cbd5e1", // grey
};
