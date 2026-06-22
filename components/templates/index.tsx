import type { ResumeContent } from "@/lib/llm/schema";

export type TemplateId = "classic" | "modern" | "compact";

export const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "Centered serif header, traditional." },
  { id: "modern", label: "Modern", description: "Accent rule, clean sans-serif." },
  { id: "compact", label: "Compact", description: "Dense, single-column, ATS-friendly." },
];

function ContactLine({ c }: { c: ResumeContent["contact"] }) {
  const parts = [c.email, c.phone, c.location].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px]">
      {parts.map((p, i) => (
        <span key={`p-${i}`}>{p}</span>
      ))}
      {c.links.map((l, i) => (
        <a key={`link-${i}`} href={l.url} className="text-current underline">
          {l.label}
        </a>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="ml-4 list-disc space-y-0.5">
      {items.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

// Render a company's project subgroups. One group → bullets only (no title);
// two or more → a "Name — Type" subtitle above each group's bullets.
function ExperienceGroups({
  projects,
  titleClassName,
}: {
  projects: ResumeContent["experience"][number]["projects"];
  titleClassName: string;
}) {
  const groups = (projects ?? []).filter((g) => g.bullets.length > 0 || g.name);
  if (groups.length <= 1) return <Bullets items={groups[0]?.bullets ?? []} />;
  return (
    <>
      {groups.map((g, i) => (
        <div key={i} className="mt-1">
          {(g.name || g.type) && (
            <div className={titleClassName}>
              {g.name}
              {g.type ? ` — ${g.type}` : ""}
            </div>
          )}
          <Bullets items={g.bullets} />
        </div>
      ))}
    </>
  );
}

// ---- Classic ----------------------------------------------------------------
function Classic({ r }: { r: ResumeContent }) {
  return (
    <div className="font-serif text-[12.5px] leading-snug text-neutral-900">
      <header className="mb-3 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{r.name}</h1>
        {r.title && <p className="text-sm italic text-neutral-700">{r.title}</p>}
        <div className="mt-1">
          <ContactLine c={r.contact} />
        </div>
      </header>
      {r.summary && <Section title="Summary"><p>{r.summary}</p></Section>}
      {r.experience.length > 0 && (
        <Section title="Experience">
          {r.experience.map((e, i) => (
            <div key={i} className="mb-2">
              <div className="flex justify-between font-semibold">
                <span>{e.role}{e.company && `, ${e.company}`}</span>
                <span className="text-neutral-600">{[e.startDate, e.endDate].filter(Boolean).join(" – ")}</span>
              </div>
              {e.location && <div className="text-[11px] text-neutral-600">{e.location}</div>}
              <ExperienceGroups projects={e.projects} titleClassName="mt-1 font-semibold italic text-neutral-800" />
            </div>
          ))}
        </Section>
      )}
      {r.skills.length > 0 && (
        <Section title="Skills">
          {r.skills.map((s, i) => (
            <div key={i}><span className="font-semibold">{s.category}:</span> {s.items.join(", ")}</div>
          ))}
        </Section>
      )}
      {r.education.length > 0 && (
        <Section title="Education">
          {r.education.map((ed, i) => (
            <div key={i} className="flex justify-between">
              <span><span className="font-semibold">{ed.school}</span>{ed.degree && ` — ${ed.degree}`}{ed.field && `, ${ed.field}`}{ed.details && ` (${ed.details})`}</span>
              <span className="text-neutral-600">{[ed.startDate, ed.endDate].filter(Boolean).join(" – ")}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <section className="mb-3">
        <h2 className="mb-1 border-b border-neutral-400 text-[13px] font-bold uppercase tracking-wider">{title}</h2>
        {children}
      </section>
    );
  }
}

// ---- Modern -----------------------------------------------------------------
function Modern({ r }: { r: ResumeContent }) {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-3">
      <h2 className="mb-1 text-[12px] font-bold uppercase tracking-[0.18em] text-sky-800">{title}</h2>
      {children}
    </section>
  );
  return (
    <div className="font-sans text-[12.5px] leading-snug text-neutral-800">
      <header className="mb-3 border-l-4 border-sky-700 pl-3">
        <h1 className="text-2xl font-bold text-neutral-900">{r.name}</h1>
        {r.title && <p className="text-sm font-medium text-sky-800">{r.title}</p>}
        <div className="mt-1 text-left">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-neutral-600">
            {[r.contact.email, r.contact.phone, r.contact.location].filter(Boolean).map((p, i) => <span key={`p-${i}`}>{p}</span>)}
            {r.contact.links.map((l, i) => <a key={`link-${i}`} href={l.url} className="text-sky-700 underline">{l.label}</a>)}
          </div>
        </div>
      </header>
      {r.summary && <Section title="Summary"><p>{r.summary}</p></Section>}
      {r.experience.length > 0 && (
        <Section title="Experience">
          {r.experience.map((e, i) => (
            <div key={i} className="mb-2">
              <div className="flex justify-between">
                <span className="font-semibold text-neutral-900">{e.role}</span>
                <span className="text-[11px] text-neutral-500">{[e.startDate, e.endDate].filter(Boolean).join(" – ")}</span>
              </div>
              <div className="text-[12px] text-sky-800">{e.company}{e.location && ` · ${e.location}`}</div>
              <ExperienceGroups projects={e.projects} titleClassName="mt-1 font-semibold text-sky-800" />
            </div>
          ))}
        </Section>
      )}
      {r.skills.length > 0 && (
        <Section title="Skills">
          {r.skills.map((s, i) => (<div key={i}><span className="font-semibold">{s.category}:</span> {s.items.join(", ")}</div>))}
        </Section>
      )}
      {r.education.length > 0 && (
        <Section title="Education">
          {r.education.map((ed, i) => (
            <div key={i} className="flex justify-between">
              <span><span className="font-semibold">{ed.school}</span>{ed.degree && ` — ${ed.degree}`}{ed.field && `, ${ed.field}`}{ed.details && ` (${ed.details})`}</span>
              <span className="text-[11px] text-neutral-500">{[ed.startDate, ed.endDate].filter(Boolean).join(" – ")}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ---- Compact ----------------------------------------------------------------
function Compact({ r }: { r: ResumeContent }) {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-2">
      <h2 className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-900">{title}</h2>
      {children}
    </section>
  );
  return (
    <div className="font-sans text-[11.5px] leading-tight text-neutral-800">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h1 className="text-xl font-bold text-neutral-900">{r.name}{r.title && <span className="ml-2 text-sm font-normal text-neutral-600">{r.title}</span>}</h1>
        <div className="text-[11px] text-neutral-600">
          {[r.contact.email, r.contact.phone, r.contact.location].filter(Boolean).join(" · ")}
          {r.contact.links.map((l, i) => <a key={`link-${i}`} href={l.url} className="ml-2 underline">{l.label}</a>)}
        </div>
      </header>
      {r.summary && <Section title="Summary"><p>{r.summary}</p></Section>}
      {r.experience.length > 0 && (
        <Section title="Experience">
          {r.experience.map((e, i) => (
            <div key={i} className="mb-1.5">
              <div className="flex justify-between"><span className="font-semibold">{e.role} — {e.company}</span><span className="text-neutral-500">{[e.startDate, e.endDate].filter(Boolean).join("–")}</span></div>
              <ExperienceGroups projects={e.projects} titleClassName="mt-0.5 font-semibold" />
            </div>
          ))}
        </Section>
      )}
      {r.skills.length > 0 && (
        <Section title="Skills">
          {r.skills.map((s, i) => (<div key={i}><span className="font-semibold">{s.category}:</span> {s.items.join(", ")}</div>))}
        </Section>
      )}
      {r.education.length > 0 && (
        <Section title="Education">
          {r.education.map((ed, i) => (<div key={i}>{ed.school}{ed.degree && ` — ${ed.degree}`}{ed.field && `, ${ed.field}`} <span className="text-neutral-500">{[ed.startDate, ed.endDate].filter(Boolean).join("–")}</span></div>))}
        </Section>
      )}
    </div>
  );
}

export function ResumePreview({ content, template }: { content: ResumeContent; template: TemplateId }) {
  if (template === "modern") return <Modern r={content} />;
  if (template === "compact") return <Compact r={content} />;
  return <Classic r={content} />;
}
