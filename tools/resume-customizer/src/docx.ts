// ─────────────────────────────────────────────────────────────────────────────
// The Word export: the resume as a real .docx, with Word's own bullet lists and
// right tab stops, so it stays editable in Word and Google Docs. It uses
// LAYOUT's spacing, as the editor and the PDF export (pdf.ts) do.
//
// The page imports this from "@penntools/tool-resume-customizer/docx" only when
// someone downloads the Word file, since docx is large.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AlignmentType,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun as DocxRun,
} from "docx";
import { FONT_NAMES, LAYOUT, LETTER_POINTS, contactLines, run, type ExportSettings, type ResumeDoc, type TextRun } from "./resume.js";

/** Twentieths of a point, Word's unit for spacing and page sizes. */
const twips = (points: number) => Math.round(points * 20);

function docxRuns(runs: TextRun[], size?: number): DocxRun[] {
  return runs
    .filter((r) => r.text)
    .map(
      (r) =>
        new DocxRun({
          text: r.text,
          bold: r.bold,
          italics: r.italic,
          ...(r.underline ? { underline: {} } : {}),
          ...(size ? { size: Math.round(size * 2) } : {}), // half-points
        }),
    );
}

/** The resume as a Word document (.docx) in the settings' font, size and margins. */
export async function toDocx(doc: ResumeDoc, settings: ExportSettings): Promise<ArrayBuffer> {
  const size = settings.sizePt;
  const em = (n: number) => twips(n * size);
  const margin = twips(settings.marginIn * 72);
  const contentWidth = twips(LETTER_POINTS.width) - 2 * margin;
  // Word's single spacing is about 1.15em for these fonts; 240 means single.
  const line = Math.round((240 * LAYOUT.lineHeight) / 1.15);

  // The name and contact lines, as in the PDF: each only if it has text, with
  // the space below the header after whichever comes last.
  const header = [
    ...(doc.name.trim() ? [docxRuns([run(doc.name, { bold: true })], size * LAYOUT.nameSize)] : []),
    ...contactLines(doc).map((l) => docxRuns([run(l)], size * LAYOUT.contactSize)),
  ];
  const children: Paragraph[] = header.map(
    (runs, i) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line, ...(i === header.length - 1 ? { after: em(LAYOUT.afterContact) } : {}) },
        children: runs,
      }),
  );
  for (const section of doc.sections) {
    if (section.heading.trim()) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          keepNext: true,
          spacing: { line, before: em(LAYOUT.beforeHeading), after: em(LAYOUT.afterHeading) },
          children: docxRuns([run(section.heading, { bold: true })]),
        }),
      );
    }
    for (const l of section.lines) {
      if (l.kind === "row") {
        children.push(
          new Paragraph({
            keepNext: true,
            tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
            spacing: { line, before: l.startsEntry ? em(LAYOUT.beforeEntry) : 0 },
            children: [...docxRuns(l.left), new DocxRun({ children: [new Tab()] }), ...docxRuns(l.right)],
          }),
        );
      } else if (l.kind === "bullet") {
        children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { line }, children: docxRuns(l.runs) }));
      } else {
        children.push(new Paragraph({ spacing: { line }, children: docxRuns(l.runs) }));
      }
    }
  }

  const document = new Document({
    creator: "PennTools Resume Customizer",
    title: doc.name.trim() ? `${doc.name.trim()} Resume` : "Resume",
    styles: { default: { document: { run: { font: FONT_NAMES[settings.font], size: Math.round(size * 2) } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: em(LAYOUT.bulletIndent), hanging: em(LAYOUT.bulletIndent - LAYOUT.bulletMarker) },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: twips(LETTER_POINTS.width), height: twips(LETTER_POINTS.height) },
            margin: { top: margin, right: margin, bottom: margin, left: margin },
          },
        },
        children,
      },
    ],
  });
  return Packer.toArrayBuffer(document);
}
