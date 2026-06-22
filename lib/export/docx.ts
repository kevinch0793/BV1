import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { ResumeContent } from "@/lib/llm/schema";
import type { SectionKey } from "@/lib/sections";
import { stripDashes } from "@/lib/sanitize";

const s = (x?: string | null) => stripDashes((x ?? "").trim());
const PAGE_WIDTH_TWIPS = 12240; // US Letter at 1440 twips/in
const MARGIN_TWIPS = 720; // 0.5in
const RIGHT_TAB = PAGE_WIDTH_TWIPS - MARGIN_TWIPS * 2;

function dateRange(a?: string | null, b?: string | null): string {
  return [s(a), s(b)].filter(Boolean).join(" - ");
}

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
    children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22, color: "222222" })],
  });
}

/** A "left ............ right" line using a right tab stop. */
function leftRight(left: TextRun[], right: string): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { after: 20 },
    children: [...left, new TextRun({ text: `\t${right}`, color: "666666", size: 19 })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 20 },
    children: [new TextRun({ text: s(text), size: 20 })],
  });
}

function summaryBlock(r: ResumeContent): Paragraph[] {
  if (!s(r.summary)) return [];
  return [
    sectionHeading("Summary"),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: s(r.summary), size: 20 })],
    }),
  ];
}

function experienceBlock(r: ResumeContent): Paragraph[] {
  if (!r.experience.length) return [];
  const out: Paragraph[] = [sectionHeading("Experience")];
  for (const e of r.experience) {
    out.push(
      leftRight(
        [new TextRun({ text: [s(e.role), s(e.company)].filter(Boolean).join(", "), bold: true, size: 21 })],
        dateRange(e.startDate, e.endDate),
      ),
    );
    if (s(e.location)) {
      out.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: s(e.location), italics: true, size: 19, color: "666666" })] }));
    }
    const groups = (e.projects ?? []).filter((g) => g.bullets.some((b) => b.trim()) || s(g.name));
    const titled = groups.length > 1;
    for (const g of groups) {
      if (titled && (s(g.name) || s(g.type))) {
        out.push(
          new Paragraph({
            spacing: { before: 40, after: 20 },
            children: [new TextRun({ text: [s(g.name), s(g.type)].filter(Boolean).join(" - "), bold: true, italics: true, size: 20 })],
          }),
        );
      }
      for (const b of g.bullets.filter((x) => x.trim())) out.push(bullet(b));
    }
  }
  return out;
}

function skillsBlock(r: ResumeContent): Paragraph[] {
  if (!r.skills.length) return [];
  const out: Paragraph[] = [sectionHeading("Skills")];
  for (const sk of r.skills) {
    const items = sk.items.map(s).filter(Boolean).join(", ");
    if (!items) continue;
    out.push(
      new Paragraph({
        spacing: { after: 30 },
        children: [
          new TextRun({ text: `${s(sk.category)}: `, bold: true, size: 20 }),
          new TextRun({ text: items, size: 20 }),
        ],
      }),
    );
  }
  return out;
}

function educationBlock(r: ResumeContent): Paragraph[] {
  if (!r.education.length) return [];
  const out: Paragraph[] = [sectionHeading("Education")];
  for (const ed of r.education) {
    const line = [s(ed.degree), s(ed.field)].filter(Boolean).join(", ");
    const text = [s(ed.school), line].filter(Boolean).join(", ") + (s(ed.details) ? ` (${s(ed.details)})` : "");
    out.push(leftRight([new TextRun({ text, size: 20 })], dateRange(ed.startDate, ed.endDate)));
  }
  return out;
}

const BLOCKS: Record<SectionKey, (r: ResumeContent) => Paragraph[]> = {
  summary: summaryBlock,
  experience: experienceBlock,
  skills: skillsBlock,
  education: educationBlock,
};

function header(r: ResumeContent): Paragraph[] {
  const contactParts = [s(r.contact.email), s(r.contact.phone), s(r.contact.location)].filter(Boolean);
  const linkParts = (r.contact.links ?? []).map((l) => s(l.label)).filter(Boolean);
  const contactLine = [...contactParts, ...linkParts].join("  |  ");
  const out: Paragraph[] = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: s(r.name), bold: true, size: 36 })] }),
  ];
  if (s(r.title)) out.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: s(r.title), size: 22, color: "444444" })] }));
  if (contactLine) out.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: contactLine, size: 19, color: "555555" })] }));
  return out;
}

/** Build a clean, editable, ATS-friendly .docx from the tailored resume. */
export async function buildResumeDocx(content: ResumeContent, order: SectionKey[]): Promise<Buffer> {
  const children: Paragraph[] = [...header(content)];
  for (const key of order) children.push(...BLOCKS[key](content));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, right: MARGIN_TWIPS } },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
