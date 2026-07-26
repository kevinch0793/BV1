import type { ResumeContent } from "@/lib/llm/schema";
import { deepStripDashes } from "@/lib/sanitize";
import { SECTION_KEYS, type SectionKey } from "@/lib/sections";

export type TemplateId =
  | "modern"
  | "minimal"
  | "bold"
  | "elegant"
  | "tech"
  | "slate"
  | "navy"
  | "emerald"
  | "rose"
  | "amber"
  | "violet"
  | "stone"
  | "compact"
  | "spacious"
  | "ink"
  | "classic"
  | "terminal";

export const DEFAULT_TEMPLATE: TemplateId = "modern";

type HeaderVariant = "center" | "left" | "split" | "leftAccent";
type SectionVariant = "plain" | "sideRule";

type Theme = {
  id: TemplateId;
  label: string;
  description: string;
  root: string;
  header: HeaderVariant;
  headerWrap: string;
  name: string;
  title: string;
  contactWrap: string;
  contact: string;
  link: string;
  sectionVariant: SectionVariant;
  sectionTitle: string;
  /** background color of the hairline used by the sideRule variant */
  rule?: string;
  /** section title is a filled bar/chip → accent recolors its background, not text */
  sectionFill?: boolean;
  sectionWrap: string;
  role: string;
  company: string;
  date: string;
  subgroupTitle: string;
};

const THEMES: Record<TemplateId, Theme> = {
  modern: {
    id: "modern",
    label: "Modern",
    description: "Sky accent rail, clean sans-serif.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "leftAccent",
    headerWrap: "mb-3 border-l-4 border-sky-700 pl-3",
    name: "text-2xl font-bold text-neutral-900",
    title: "text-sm font-medium text-sky-800",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "text-[12px] text-neutral-600",
    link: "text-sky-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle: "mb-1 text-[12px] font-bold uppercase tracking-[0.18em] text-sky-800",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] text-sky-800",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-semibold text-sky-800",
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    description: "Airy, no color, hairline section labels.",
    root: "font-sans text-[12.5px] leading-relaxed text-neutral-700 text-justify",
    header: "left",
    headerWrap: "mb-4",
    name: "text-2xl font-semibold tracking-tight text-neutral-900",
    title: "text-sm text-neutral-500",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "text-[11.5px] text-neutral-500",
    link: "text-neutral-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3.5",
    sectionTitle: "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] text-neutral-500",
    date: "text-[11px] text-neutral-400",
    subgroupTitle: "mt-1 font-medium text-neutral-700",
  },
  bold: {
    id: "bold",
    label: "Bold",
    description: "High-contrast header bar and filled section labels.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "split",
    headerWrap: "mb-3 flex items-end justify-between gap-3 border-b-2 border-neutral-900 pb-2",
    name: "text-[26px] font-extrabold tracking-tight text-neutral-900",
    title: "text-sm font-semibold text-neutral-600",
    contactWrap: "flex flex-col items-end gap-0.5 text-right",
    contact: "text-[11px] text-neutral-600",
    link: "text-neutral-900 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle:
      "mb-1.5 inline-block rounded-sm bg-neutral-900 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white",
    sectionFill: true,
    role: "font-bold text-neutral-900",
    company: "text-[12px] font-medium text-neutral-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-bold text-neutral-900",
  },
  elegant: {
    id: "elegant",
    label: "Elegant",
    description: "Serif headings, centered, understated.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "center",
    headerWrap: "mb-3 text-center",
    name: "font-serif text-3xl font-bold tracking-tight text-neutral-900",
    title: "font-serif text-sm italic text-neutral-600",
    contactWrap: "mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5",
    contact: "text-[11.5px] text-neutral-600",
    link: "text-neutral-800 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle:
      "mb-1.5 border-b border-neutral-300 pb-0.5 text-center font-serif text-[13px] font-semibold uppercase tracking-[0.15em] text-neutral-800",
    role: "font-serif font-semibold text-neutral-900",
    company: "font-serif text-[12px] italic text-neutral-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-serif font-semibold italic text-neutral-800",
  },
  tech: {
    id: "tech",
    label: "Tech",
    description: "Monospace accents, engineer-flavored.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "left",
    headerWrap: "mb-3",
    name: "font-mono text-2xl font-bold text-neutral-900",
    title: "font-mono text-sm text-teal-700",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "font-mono text-[11px] text-neutral-600",
    link: "text-teal-700 underline",
    sectionVariant: "sideRule",
    rule: "bg-teal-200",
    sectionWrap: "mb-3",
    sectionTitle: "font-mono text-[11px] font-bold uppercase tracking-widest text-teal-700",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] font-medium text-teal-700",
    date: "font-mono text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-mono font-semibold text-teal-700",
  },
  slate: {
    id: "slate",
    label: "Slate",
    description: "Centered header rule, calm slate tones.",
    root: "font-sans text-[12.5px] leading-snug text-slate-700 text-justify",
    header: "center",
    headerWrap: "mb-3 border-b border-slate-300 pb-2 text-center",
    name: "text-2xl font-bold tracking-tight text-slate-900",
    title: "text-sm font-medium text-slate-500",
    contactWrap: "mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5",
    contact: "text-[11.5px] text-slate-500",
    link: "text-slate-700 underline",
    sectionVariant: "sideRule",
    rule: "bg-slate-300",
    sectionWrap: "mb-3",
    sectionTitle: "text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600",
    role: "font-semibold text-slate-900",
    company: "text-[12px] font-medium text-slate-600",
    date: "text-[11px] text-slate-400",
    subgroupTitle: "mt-1 font-semibold text-slate-700",
  },
  navy: {
    id: "navy",
    label: "Executive",
    description: "Deep navy, serif name, corporate split header.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "split",
    headerWrap: "mb-3 flex items-end justify-between gap-3 border-b-2 border-blue-900 pb-2",
    name: "font-serif text-[26px] font-bold tracking-tight text-blue-950",
    title: "text-sm font-medium text-blue-800",
    contactWrap: "flex flex-col items-end gap-0.5 text-right",
    contact: "text-[11px] text-neutral-600",
    link: "text-blue-800 underline",
    sectionVariant: "sideRule",
    rule: "bg-blue-200",
    sectionWrap: "mb-3",
    sectionTitle: "text-[11px] font-bold uppercase tracking-[0.18em] text-blue-900",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] font-medium text-blue-800",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-serif font-semibold text-blue-900",
  },
  emerald: {
    id: "emerald",
    label: "Forest",
    description: "Emerald accent rail with hairline section rules.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "leftAccent",
    headerWrap: "mb-3 border-l-4 border-emerald-600 pl-3",
    name: "text-2xl font-bold text-neutral-900",
    title: "text-sm font-medium text-emerald-700",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "text-[12px] text-neutral-600",
    link: "text-emerald-700 underline",
    sectionVariant: "sideRule",
    rule: "bg-emerald-200",
    sectionWrap: "mb-3",
    sectionTitle: "text-[12px] font-bold uppercase tracking-[0.16em] text-emerald-700",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] font-medium text-emerald-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-semibold text-emerald-700",
  },
  rose: {
    id: "rose",
    label: "Rosewood",
    description: "Centered serif headings in warm rose.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "center",
    headerWrap: "mb-3 text-center",
    name: "font-serif text-3xl font-bold tracking-tight text-rose-900",
    title: "font-serif text-sm italic text-rose-700",
    contactWrap: "mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5",
    contact: "text-[11.5px] text-neutral-600",
    link: "text-rose-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle:
      "mb-1.5 border-b border-rose-200 pb-0.5 text-center font-serif text-[13px] font-semibold uppercase tracking-[0.15em] text-rose-800",
    role: "font-serif font-semibold text-neutral-900",
    company: "font-serif text-[12px] italic text-rose-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-serif font-semibold italic text-rose-800",
  },
  amber: {
    id: "amber",
    label: "Amber",
    description: "Warm amber split header, clean sans-serif.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "split",
    headerWrap: "mb-3 flex items-end justify-between gap-3 border-b border-amber-400 pb-2",
    name: "text-[26px] font-extrabold tracking-tight text-neutral-900",
    title: "text-sm font-semibold text-amber-700",
    contactWrap: "flex flex-col items-end gap-0.5 text-right",
    contact: "text-[11px] text-neutral-600",
    link: "text-amber-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle: "mb-1 text-[12px] font-bold uppercase tracking-[0.18em] text-amber-700",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] font-medium text-amber-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-semibold text-amber-700",
  },
  violet: {
    id: "violet",
    label: "Orchid",
    description: "Violet bar-marked section titles, clean sans-serif.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "left",
    headerWrap: "mb-3",
    name: "text-2xl font-bold tracking-tight text-violet-900",
    title: "text-sm font-medium text-violet-600",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "text-[12px] text-neutral-600",
    link: "text-violet-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle: "mb-1 border-l-2 border-violet-500 pl-2 text-[12px] font-bold uppercase tracking-[0.16em] text-violet-700",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] font-medium text-violet-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-semibold text-violet-700",
  },
  stone: {
    id: "stone",
    label: "Manuscript",
    description: "Fully serif, warm stone tones, hairline rules.",
    root: "font-serif text-[12.5px] leading-relaxed text-stone-800 text-justify",
    header: "left",
    headerWrap: "mb-3",
    name: "text-[27px] font-bold tracking-tight text-stone-900",
    title: "text-sm italic text-stone-600",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "text-[11.5px] text-stone-500",
    link: "text-stone-700 underline",
    sectionVariant: "sideRule",
    rule: "bg-stone-300",
    sectionWrap: "mb-3",
    sectionTitle: "text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-700",
    role: "font-semibold text-stone-900",
    company: "text-[12px] italic text-stone-600",
    date: "text-[11px] text-stone-400",
    subgroupTitle: "mt-1 font-semibold italic text-stone-700",
  },
  compact: {
    id: "compact",
    label: "Compact",
    description: "Dense, left-aligned — fits more on the page.",
    root: "font-sans text-[11px] leading-tight text-neutral-800 text-left",
    header: "left",
    headerWrap: "mb-2",
    name: "text-xl font-bold tracking-tight text-neutral-900",
    title: "text-[12px] font-medium text-neutral-600",
    contactWrap: "mt-0.5 flex flex-wrap gap-x-2 gap-y-0",
    contact: "text-[10.5px] text-neutral-500",
    link: "text-neutral-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-2",
    sectionTitle: "mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-neutral-500",
    role: "font-semibold text-neutral-900",
    company: "text-[11px] text-neutral-600",
    date: "text-[10.5px] text-neutral-500",
    subgroupTitle: "mt-0.5 font-semibold text-neutral-800",
  },
  spacious: {
    id: "spacious",
    label: "Spacious",
    description: "Airy, left-aligned, generous whitespace.",
    root: "font-sans text-[13px] leading-loose text-neutral-700 text-left",
    header: "left",
    headerWrap: "mb-5",
    name: "text-3xl font-semibold tracking-tight text-neutral-900",
    title: "text-[15px] text-neutral-500",
    contactWrap: "mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5",
    contact: "text-[12px] text-neutral-500",
    link: "text-neutral-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-5",
    sectionTitle: "mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-400",
    role: "font-semibold text-neutral-900",
    company: "text-[12.5px] text-neutral-500",
    date: "text-[11.5px] text-neutral-400",
    subgroupTitle: "mt-1.5 font-medium text-neutral-700",
  },
  ink: {
    id: "ink",
    label: "Ink",
    description: "Full-width dark section bars, editorial contrast.",
    root: "font-sans text-[12.5px] leading-snug text-neutral-800 text-justify",
    header: "split",
    headerWrap: "mb-3 flex items-end justify-between gap-3 border-b-4 border-neutral-900 pb-2",
    name: "text-[26px] font-extrabold tracking-tight text-neutral-900",
    title: "text-sm font-semibold text-neutral-500",
    contactWrap: "flex flex-col items-end gap-0.5 text-right",
    contact: "text-[11px] text-neutral-600",
    link: "text-neutral-900 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle: "mb-1.5 block bg-neutral-800 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white",
    sectionFill: true,
    role: "font-bold text-neutral-900",
    company: "text-[12px] font-medium text-neutral-600",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-bold text-neutral-900",
  },
  classic: {
    id: "classic",
    label: "Classic",
    description: "Traditional serif, centered name, ruled headings.",
    root: "font-serif text-[12.5px] leading-snug text-neutral-800 text-left",
    header: "center",
    headerWrap: "mb-3 text-center",
    name: "text-3xl font-bold tracking-tight text-neutral-900",
    title: "text-sm text-neutral-600",
    contactWrap: "mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5",
    contact: "text-[11.5px] text-neutral-600",
    link: "text-neutral-800 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle: "mb-1.5 border-b border-neutral-800 pb-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-neutral-900",
    role: "font-semibold text-neutral-900",
    company: "text-[12px] text-neutral-700",
    date: "text-[11px] text-neutral-500",
    subgroupTitle: "mt-1 font-semibold text-neutral-800",
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    description: "Full monospace, left-aligned, hash-marked sections.",
    root: "font-mono text-[11.5px] leading-snug text-neutral-800 text-left",
    header: "left",
    headerWrap: "mb-3",
    name: "text-2xl font-bold tracking-tight text-neutral-900",
    title: "text-[13px] text-green-700",
    contactWrap: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
    contact: "text-[10.5px] text-neutral-600",
    link: "text-green-700 underline",
    sectionVariant: "plain",
    sectionWrap: "mb-3",
    sectionTitle: "mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-green-700 before:text-green-500 before:content-['#_']",
    role: "font-bold text-neutral-900",
    company: "text-[11px] text-green-700",
    date: "text-[10.5px] text-neutral-500",
    subgroupTitle: "mt-1 font-bold text-green-700",
  },
};

export type TemplateOption = { id: TemplateId; label: string; description: string };

export const TEMPLATES: TemplateOption[] = Object.values(THEMES).map((t) => ({
  id: t.id,
  label: t.label,
  description: t.description,
}));

// Templates reserved to specific accounts. Everyone else doesn't see them in the
// pickers, and can't have them persisted (see the settings/profile actions).
const RESERVED_TEMPLATE_IDS = new Set<TemplateId>(["bold", "tech", "violet", "slate"]);
const TEMPLATE_EXEMPT_EMAILS = new Set<string>(["anustariq45@gmail.com"]);

/** Whether the given account may use the reserved templates. */
export function canUseReservedTemplates(email: string | null | undefined): boolean {
  return !!email && TEMPLATE_EXEMPT_EMAILS.has(email.trim().toLowerCase());
}

/** Template picker options visible to the given account (reserved ones filtered out). */
export function templatesFor(email: string | null | undefined): TemplateOption[] {
  if (canUseReservedTemplates(email)) return TEMPLATES;
  return TEMPLATES.filter((t) => !RESERVED_TEMPLATE_IDS.has(t.id));
}

/** Whether the given account is allowed to select/persist a specific template id. */
export function isTemplateAllowed(id: string | null | undefined, email: string | null | undefined): boolean {
  if (!id) return true;
  return canUseReservedTemplates(email) || !RESERVED_TEMPLATE_IDS.has(id as TemplateId);
}

// Resume font family choices (Settings → Template). "default" keeps each
// template's own mixed fonts; any other choice applies one family to the whole
// resume via the `.rs-font-override` rule in globals.css. Stacks resolve to the
// loaded Geist fonts or web-safe system fonts, so preview and PDF match.
export const RESUME_FONTS = [
  { id: "sans", label: "Sans (Geist)", stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" },
  { id: "arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica", stack: "Helvetica, Arial, sans-serif" },
  { id: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", stack: "Tahoma, Geneva, Verdana, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", stack: "'Trebuchet MS', 'Segoe UI', Tahoma, sans-serif" },
  { id: "calibri", label: "Calibri", stack: "Calibri, 'Segoe UI', Candara, Arial, sans-serif" },
  { id: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  { id: "times", label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  { id: "garamond", label: "Garamond", stack: "Garamond, 'EB Garamond', 'Times New Roman', serif" },
  { id: "palatino", label: "Palatino", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  { id: "cambria", label: "Cambria", stack: "Cambria, 'Hoefler Text', Georgia, serif" },
  { id: "mono", label: "Mono (Geist)", stack: "var(--font-geist-mono), ui-monospace, monospace" },
  { id: "courier", label: "Courier New", stack: "'Courier New', Courier, monospace" },
] as const;

// Accent color presets (Settings → Template). "default" keeps each template's own
// colors; any other choice recolors the accent elements (section titles, links,
// company names, subtitle, header rule) via the `--rs-accent` var + `.rs-accent-on`
// rules in globals.css. A no-op at "default", so an untouched resume is unchanged.
export const ACCENT_COLORS = [
  { id: "sky", label: "Sky", value: "#0369a1" },
  { id: "blue", label: "Blue", value: "#1d4ed8" },
  { id: "navy", label: "Navy", value: "#1e3a8a" },
  { id: "teal", label: "Teal", value: "#0f766e" },
  { id: "emerald", label: "Emerald", value: "#047857" },
  { id: "violet", label: "Violet", value: "#6d28d9" },
  { id: "rose", label: "Rose", value: "#be123c" },
  { id: "amber", label: "Amber", value: "#b45309" },
  { id: "slate", label: "Slate", value: "#334155" },
  { id: "black", label: "Black", value: "#111827" },
] as const;

export const DEFAULT_FONT = "sans";
export const DEFAULT_ACCENT = "sky";

export function resumeFontStack(id?: string | null): string {
  return RESUME_FONTS.find((f) => f.id === id)?.stack ?? "";
}

/** Hex value for an accent id, or "" for the template default (no override). */
export function resumeAccentValue(id?: string | null): string {
  return ACCENT_COLORS.find((c) => c.id === id)?.value ?? "";
}

function dateRange(a?: string | null, b?: string | null): string {
  return [a, b].filter(Boolean).join(" - ");
}

function ContactLine({ t, c }: { t: Theme; c: ResumeContent["contact"] }) {
  const parts = [c.email, c.phone, c.location].filter(Boolean);
  return (
    <div className={`${t.contactWrap} ${t.contact}`}>
      {parts.map((p, i) => (
        <span key={`p-${i}`}>{p}</span>
      ))}
      {c.links.map((l, i) => (
        <a key={`link-${i}`} href={l.url} className={`${t.link} rs-ac`}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

// `headerWrap` carries the layout: block (stacked) for center/left/leftAccent,
// flex justify-between (side by side) for split.
function Header({ t, r }: { t: Theme; r: ResumeContent }) {
  return (
    <header className={`${t.headerWrap} rs-ac-bd`}>
      <div>
        <h1 className={t.name}>{r.name}</h1>
        {r.title && <p className={`${t.title} rs-ac`}>{r.title}</p>}
      </div>
      <ContactLine t={t} c={r.contact} />
    </header>
  );
}

function Section({ t, title, children }: { t: Theme; title: string; children: React.ReactNode }) {
  return (
    <section className={t.sectionWrap}>
      {t.sectionVariant === "sideRule" ? (
        <div className="mb-1 flex items-center gap-2">
          <h2 className={`${t.sectionTitle} ${t.sectionFill ? "rs-ac-bg" : "rs-ac"}`}>{title}</h2>
          <span className={`h-px flex-1 ${t.rule ?? "bg-neutral-300"} rs-ac-bg`} />
        </div>
      ) : (
        <h2 className={`${t.sectionTitle} ${t.sectionFill ? "rs-ac-bg" : "rs-ac"}`}>{title}</h2>
      )}
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  const list = items.filter((b) => b.trim());
  if (!list.length) return null;
  return (
    <ul className="ml-4 list-disc space-y-0.5">
      {list.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

// One company's project subgroups. A single group renders as bullets only; two
// or more render each under a "Name - Type" subtitle.
function ExperienceGroups({ t, projects }: { t: Theme; projects: ResumeContent["experience"][number]["projects"] }) {
  const groups = (projects ?? []).filter((g) => g.bullets.some((b) => b.trim()) || g.name);
  if (groups.length <= 1) return <Bullets items={groups[0]?.bullets ?? []} />;
  return (
    <>
      {groups.map((g, i) => (
        <div key={i} className="mt-1">
          {(g.name || g.type) && (
            <div className={`${t.subgroupTitle} rs-ac`}>{`${g.name}${g.type ? ` - ${g.type}` : ""}`}</div>
          )}
          <Bullets items={g.bullets} />
        </div>
      ))}
    </>
  );
}

function SummaryBlock({ t, r }: { t: Theme; r: ResumeContent }) {
  if (!r.summary) return null;
  return (
    <Section t={t} title="Summary">
      <p>{r.summary}</p>
    </Section>
  );
}

function ExperienceBlock({ t, r }: { t: Theme; r: ResumeContent }) {
  if (!r.experience.length) return null;
  return (
    <Section t={t} title="Experience">
      {r.experience.map((e, i) => (
        <div key={i} className="mb-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className={t.role}>{e.role}</span>
            <span className={t.date}>{dateRange(e.startDate, e.endDate)}</span>
          </div>
          <div className={`${t.company} rs-ac`}>{`${e.company}${e.location ? ` · ${e.location}` : ""}`}</div>
          <ExperienceGroups t={t} projects={e.projects} />
        </div>
      ))}
    </Section>
  );
}

function SkillsBlock({ t, r }: { t: Theme; r: ResumeContent }) {
  if (!r.skills.length) return null;
  return (
    <Section t={t} title="Skills">
      {r.skills.map((s, i) => (
        <div key={i}>
          <span className="font-semibold">{s.category}:</span> {s.items.join(", ")}
        </div>
      ))}
    </Section>
  );
}

function EducationBlock({ t, r }: { t: Theme; r: ResumeContent }) {
  if (!r.education.length) return null;
  return (
    <Section t={t} title="Education">
      {r.education.map((ed, i) => (
        <div key={i} className="flex items-baseline justify-between gap-2">
          <span>
            <span className="font-semibold">{ed.school}</span>
            {`${ed.degree ? `, ${ed.degree}` : ""}${ed.field ? `, ${ed.field}` : ""}${ed.details ? ` (${ed.details})` : ""}`}
          </span>
          <span className={t.date}>{dateRange(ed.startDate, ed.endDate)}</span>
        </div>
      ))}
    </Section>
  );
}

function ResumeDoc({
  t,
  r,
  order,
  fontId,
  accentId,
}: {
  t: Theme;
  r: ResumeContent;
  order: SectionKey[];
  fontId?: string;
  accentId?: string;
}) {
  const blocks: Record<SectionKey, React.ReactNode> = {
    summary: <SummaryBlock key="summary" t={t} r={r} />,
    experience: <ExperienceBlock key="experience" t={t} r={r} />,
    skills: <SkillsBlock key="skills" t={t} r={r} />,
    education: <EducationBlock key="education" t={t} r={r} />,
  };
  // Optional client-wide overrides (Settings → Template): a global font family
  // (forced over the template's font classes via `.rs-font-override`) and an accent
  // color (recolors accent elements via `.rs-accent-on`). Both are no-ops at their
  // defaults, so an untouched resume renders exactly as its template defines.
  const stack = resumeFontStack(fontId);
  const accent = resumeAccentValue(accentId);
  const style: Record<string, string> = {};
  if (stack) style["--rs-font"] = stack;
  if (accent) style["--rs-accent"] = accent;
  return (
    <div
      className={`${t.root}${stack ? " rs-font-override" : ""}${accent ? " rs-accent-on" : ""}`}
      style={Object.keys(style).length ? (style as React.CSSProperties) : undefined}
    >
      <Header t={t} r={r} />
      {order.map((k) => blocks[k])}
    </div>
  );
}

export function ResumePreview({
  content,
  template,
  order = SECTION_KEYS,
  fontId,
  accentId,
}: {
  content: ResumeContent;
  template: TemplateId;
  order?: SectionKey[];
  fontId?: string;
  accentId?: string;
}) {
  // Defensive: strip any en/em dashes (covers manual edits + older saved data).
  const r = deepStripDashes(content);
  const theme = THEMES[template] ?? THEMES[DEFAULT_TEMPLATE];
  return <ResumeDoc t={theme} r={r} order={order} fontId={fontId} accentId={accentId} />;
}

/** Normalize a possibly-legacy stored template id to a current one. */
export function normalizeTemplate(id: string): TemplateId {
  return (THEMES as Record<string, Theme>)[id] ? (id as TemplateId) : DEFAULT_TEMPLATE;
}
