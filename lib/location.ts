// Classify a job's free-text location into a workplace mode + a brief place
// label (a US state code where possible). Pure string logic — safe on the client.

const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC", "washington dc": "DC",
};
const US_CODES = new Set(Object.values(STATE_ABBR));

export type Workplace = "Remote" | "Hybrid" | "Onsite";

export function locationKind(location: string | null | undefined): Workplace {
  const l = (location ?? "").toLowerCase();
  if (/\bhybrid\b/.test(l)) return "Hybrid";
  if (/\bremote\b|work[ -]?from[ -]?home|\bwfh\b|work[ -]?from[ -]?anywhere|anywhere/.test(l)) return "Remote";
  return "Onsite";
}

// A short place label for non-remote roles: a US state code when one is present,
// else a 2-letter region/country code, else the city.
export function briefState(location: string | null | undefined): string {
  const parts = (location ?? "")
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter((s) => s && !/^(hybrid|onsite|remote)$/i.test(s));

  for (const s of parts) {
    if (US_CODES.has(s.toUpperCase())) return s.toUpperCase();
    const abbr = STATE_ABBR[s.toLowerCase()];
    if (abbr) return abbr;
  }
  // Non-US: first 2-letter region/country code (e.g. ES, UK, BC).
  for (const s of parts) {
    const up = s.toUpperCase();
    if (/^[A-Z]{2}$/.test(up) && up !== "US") return up;
  }
  return parts[0] ?? ""; // fallback: the city
}
