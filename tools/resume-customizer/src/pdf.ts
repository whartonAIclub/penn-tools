// ─────────────────────────────────────────────────────────────────────────────
// The PDF export: the resume laid out as real text, never as an image, so
// applicant tracking systems can read it and people can select and search it.
// It uses LAYOUT's spacing, as the editor and the Word export (docx.ts) do.
//
// The page imports this from "@penntools/tool-resume-customizer/pdf" when it
// first counts pages (the Edit screen) or exports, since jsPDF is large.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import { LAYOUT, LETTER_POINTS, contactLines, run, type ExportSettings, type ResumeDoc, type TextRun } from "./resume.js";

// ── Fonts ─────────────────────────────────────────────────────────────────────

export type FontStyle = "regular" | "bold" | "italic" | "boldItalic";

/**
 * The settings' font's files, as loaded by the caller: Liberation Serif or
 * Sans from this package's fonts/ folder (SIL Open Font License,
 * fonts/LICENSE), which have Times New Roman's and Arial's letter widths and
 * cover accented Latin, Greek and Cyrillic, which the PDF's built-in fonts
 * don't. Only the styles usedStyles names are needed.
 */
export type FontSet = Partial<Record<FontStyle, ArrayBuffer>>;

const JSPDF_STYLES: Record<FontStyle, string> = {
  regular: "normal",
  bold: "bold",
  italic: "italic",
  boldItalic: "bolditalic",
};

function styleOf(run: { bold: boolean; italic: boolean }): FontStyle {
  if (run.bold && run.italic) return "boldItalic";
  if (run.bold) return "bold";
  if (run.italic) return "italic";
  return "regular";
}

/** Each font file as base64, which jsPDF takes, converted once: the page counts pages after every edit. */
const base64Cache = new WeakMap<ArrayBuffer, string>();

function toBase64(buffer: ArrayBuffer): string {
  let base64 = base64Cache.get(buffer);
  if (base64 === undefined) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    base64 = btoa(binary);
    base64Cache.set(buffer, base64);
  }
  return base64;
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = LETTER_POINTS;
const FAMILY = "Resume";

/** A piece of text in one style, placed on a line. */
interface Fragment {
  text: string;
  style: FontStyle;
  underline: boolean;
  x: number;
  width: number;
}

interface PdfLine {
  fragments: Fragment[];
  width: number;
}

class PdfWriter {
  readonly pdf: jsPDF;
  private readonly margin: number;
  private readonly contentWidth: number;
  private readonly size: number;
  private y: number;

  constructor(doc: ResumeDoc, settings: ExportSettings, fonts: FontSet) {
    this.pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
    // jsPDF parses each font it's given (about 400 KB each), and the page counts
    // pages after every edit: give it only the styles this resume uses.
    for (const style of usedStyles(doc)) {
      const file = `${style}.ttf`;
      const data = fonts[style];
      if (!data) throw new Error(`The PDF needs the ${style} font, which wasn't loaded.`);
      this.pdf.addFileToVFS(file, toBase64(data));
      this.pdf.addFont(file, FAMILY, JSPDF_STYLES[style], undefined, "Identity-H");
    }
    this.margin = settings.marginIn * 72;
    this.contentWidth = PAGE_WIDTH - 2 * this.margin;
    this.size = settings.sizePt;
    this.y = this.margin;
  }

  private em(n: number): number {
    return n * this.size;
  }

  private measure(text: string, style: FontStyle, size: number): number {
    this.pdf.setFont(FAMILY, JSPDF_STYLES[style]);
    this.pdf.setFontSize(size);
    return this.pdf.getTextWidth(text);
  }

  /** Runs broken into lines no wider than maxWidth, breaking at spaces. */
  private wrap(runs: TextRun[], maxWidth: number, size: number): PdfLine[] {
    // Words, each made of fragments that may differ in style ("**Bold**text").
    type Piece = Omit<Fragment, "x" | "width">;
    const words: Piece[][] = [];
    let current: Piece[] = [];
    // Spaces are measured in their run's style: only the styles the resume uses are loaded.
    let spaceStyle: FontStyle = runs[0] ? styleOf(runs[0]) : "regular";
    for (const r of runs) {
      const text = r.text.replace(/\s+/g, " ");
      for (const token of text.split(/( )/)) {
        if (!token) continue;
        if (token === " ") {
          if (current.length) words.push(current);
          current = [];
          spaceStyle = styleOf(r);
        } else {
          current.push({ text: token, style: styleOf(r), underline: r.underline });
        }
      }
    }
    if (current.length) words.push(current);
    if (!words.length) return [];

    const space = this.measure(" ", spaceStyle, size);
    const lines: PdfLine[] = [];
    let line: PdfLine = { fragments: [], width: 0 };
    const place = (piece: Piece) => {
      const width = this.measure(piece.text, piece.style, size);
      line.fragments.push({ ...piece, x: line.width, width });
      line.width += width;
    };
    for (const word of words) {
      const wordWidth = word.reduce((sum, p) => sum + this.measure(p.text, p.style, size), 0);
      const gap = line.fragments.length ? space : 0;
      if (line.fragments.length && line.width + gap + wordWidth > maxWidth) {
        lines.push(line);
        line = { fragments: [], width: 0 };
      } else {
        line.width += gap;
      }
      if (wordWidth <= maxWidth) {
        word.forEach(place);
        continue;
      }
      // A word wider than the line, such as a long URL: break it anywhere.
      for (const piece of word) {
        for (const ch of Array.from(piece.text)) {
          const w = this.measure(ch, piece.style, size);
          if (line.fragments.length && line.width + w > maxWidth) {
            lines.push(line);
            line = { fragments: [], width: 0 };
          }
          place({ ...piece, text: ch });
        }
      }
    }
    if (line.fragments.length) lines.push(line);
    return lines;
  }

  private lineHeight(size: number): number {
    return size * LAYOUT.lineHeight;
  }

  /** Starts a new page unless `height` more fits on this one. */
  private ensure(height: number): void {
    if (this.y + height > PAGE_HEIGHT - this.margin && this.y > this.margin) {
      this.pdf.addPage();
      this.y = this.margin;
    }
  }

  private draw(line: PdfLine, x: number, size: number): void {
    // Liberation's glyphs fill about 1.1em, centered in the line's height.
    const top = this.y + (this.lineHeight(size) - size * 1.1) / 2;
    for (const f of line.fragments) {
      this.pdf.setFont(FAMILY, JSPDF_STYLES[f.style]);
      this.pdf.setFontSize(size);
      this.pdf.text(f.text, x + f.x, top, { baseline: "top" });
      if (f.underline) {
        const underlineY = top + size * 1.0;
        this.pdf.setLineWidth(size * 0.05);
        this.pdf.line(x + f.x, underlineY, x + f.x + f.width, underlineY);
      }
    }
  }

  private centered(runs: TextRun[], size: number): void {
    for (const line of this.wrap(runs, this.contentWidth, size)) {
      this.ensure(this.lineHeight(size));
      this.draw(line, this.margin + (this.contentWidth - line.width) / 2, size);
      this.y += this.lineHeight(size);
    }
  }

  write(doc: ResumeDoc): void {
    const size = this.size;
    const lh = this.lineHeight(size);
    if (doc.name.trim()) this.centered([run(doc.name, { bold: true })], this.em(LAYOUT.nameSize));
    for (const line of contactLines(doc)) this.centered([run(line)], this.em(LAYOUT.contactSize));
    this.y += this.em(LAYOUT.afterContact);

    for (const section of doc.sections) {
      if (section.heading.trim()) {
        this.y += this.em(LAYOUT.beforeHeading);
        // Keep the heading with the first two lines under it, or as many as the
        // section has, so a short last section isn't pushed to a new page.
        this.ensure(lh * (1 + Math.min(2, section.lines.length)));
        this.centered([run(section.heading, { bold: true })], size);
        this.y += this.em(LAYOUT.afterHeading);
      }
      for (const line of section.lines) {
        if (line.kind === "row") {
          if (line.startsEntry) this.y += this.em(LAYOUT.beforeEntry);
          const gap = this.em(1);
          const right = this.wrap(line.right, this.contentWidth / 2, size);
          const rightWidth = right[0]?.width ?? 0;
          const left = this.wrap(line.left, Math.max(this.contentWidth - rightWidth - gap, this.contentWidth / 2), size);
          const count = Math.max(left.length, right.length);
          // An entry's first row stays with the line after it.
          this.ensure(lh * (count + (line.startsEntry ? 1 : 0)));
          for (let i = 0; i < count; i++) {
            const l = left[i];
            const r = right[i];
            if (l) this.draw(l, this.margin, size);
            if (r) this.draw(r, this.margin + this.contentWidth - r.width, size);
            this.y += lh;
          }
        } else if (line.kind === "bullet") {
          const indent = this.em(LAYOUT.bulletIndent);
          const lines = this.wrap(line.runs, this.contentWidth - indent, size);
          if (!lines.length) continue;
          // Bullets are short: keep each on one page.
          this.ensure(lh * lines.length);
          this.draw(
            { fragments: [{ text: "•", style: "regular", underline: false, x: 0, width: 0 }], width: 0 },
            this.margin + this.em(LAYOUT.bulletMarker),
            size,
          );
          for (const l of lines) {
            this.draw(l, this.margin + indent, size);
            this.y += lh;
          }
        } else {
          for (const l of this.wrap(line.runs, this.contentWidth, size)) {
            this.ensure(lh);
            this.draw(l, this.margin, size);
            this.y += lh;
          }
        }
      }
    }
  }
}

/** The font styles laying out `doc` draws text in: the only fonts the caller needs to load. */
export function usedStyles(doc: ResumeDoc): Set<FontStyle> {
  const styles = new Set<FontStyle>();
  if (doc.name.trim()) styles.add("bold");
  if (contactLines(doc).length) styles.add("regular");
  for (const section of doc.sections) {
    if (section.heading.trim()) styles.add("bold");
    for (const line of section.lines) {
      if (line.kind === "bullet") styles.add("regular"); // the bullet character
      for (const r of line.kind === "row" ? [...line.left, ...line.right] : line.runs) styles.add(styleOf(r));
    }
  }
  return styles;
}

/** The resume as a PDF file of real text, in the settings' font, size and margins. */
export function toPdf(doc: ResumeDoc, settings: ExportSettings, fonts: FontSet): ArrayBuffer {
  const writer = new PdfWriter(doc, settings, fonts);
  writer.write(doc);
  writer.pdf.setProperties({ title: doc.name.trim() ? `${doc.name.trim()} Resume` : "Resume", creator: "PennTools Resume Customizer" });
  return writer.pdf.output("arraybuffer");
}

/**
 * How many pages the PDF would have: the same layout as toPdf, without writing
 * the file (subsetting and compressing the fonts), for the page count the
 * editor shows after each edit.
 */
export function countPdfPages(doc: ResumeDoc, settings: ExportSettings, fonts: FontSet): number {
  const writer = new PdfWriter(doc, settings, fonts);
  writer.write(doc);
  return writer.pdf.getNumberOfPages();
}
