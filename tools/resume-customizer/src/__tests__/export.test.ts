// The exports, checked by reading them back: the PDF's text with pdf.js (an
// image would have none), and the .docx's XML with JSZip.

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { toDocx } from "../docx.js";
import { FONT_FILES, countPdfPages, toPdf, type FontSet, type FontStyle } from "../pdf.js";
import { DEFAULT_SETTINGS, run, type ExportSettings, type ResumeDoc } from "../resume.js";
import { sample } from "./fixtures.js";

function fonts(settings: ExportSettings): FontSet {
  const load = (style: FontStyle) => {
    const buffer = readFileSync(new URL(`../../fonts/${FONT_FILES[settings.font][style]}`, import.meta.url));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  };
  return { regular: load("regular"), bold: load("bold"), italic: load("italic"), boldItalic: load("boldItalic") };
}

/** Each page's text, one string per line as pdf.js reads it. */
async function pdfLines(bytes: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import("pdfjs-dist");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  try {
    const pages: string[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const rows = new Map<number, { x: number; str: string }[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const y = Math.round(item.transform[5] as number);
        rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4] as number, str: item.str }]);
      }
      pages.push(
        [...rows.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, items]) =>
            items
              .sort((a, b) => a.x - b.x)
              .map((i) => i.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim(),
          ),
      );
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

describe("toPdf", () => {
  it("writes real text, non-Latin letters included", async () => {
    const { bytes, pages } = toPdf(sample, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS));
    expect(pages).toBe(1);
    const text = (await pdfLines(bytes)).flat().join("\n");
    expect(text).toContain("ŁUKASZ NGUYỄN");
    expect(text).toContain("BAIN & COMPANY");
    expect(text).toContain("2022–2024");
    expect(text).toMatch(/Led a team of\s+five\s+analysts/);
    expect(text).toContain("Skills:");
  });

  it("draws each contact line, in order, under the name", async () => {
    const doc: ResumeDoc = { ...sample, contact: "jane@wharton.upenn.edu\nlinkedin.com/in/jane" };
    const [lines] = await pdfLines(toPdf(doc, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS)).bytes);
    expect(lines!.slice(0, 4)).toEqual(["ŁUKASZ NGUYỄN", "jane@wharton.upenn.edu", "linkedin.com/in/jane", "EXPERIENCE"]);
    const zip = await JSZip.loadAsync(await toDocx(doc, DEFAULT_SETTINGS));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml.indexOf("jane@wharton.upenn.edu")).toBeLessThan(xml.indexOf("linkedin.com/in/jane"));
  });

  it("lays out a resume that uses only some font styles", async () => {
    // Bold only: the regular style isn't loaded, so nothing may measure in it.
    const boldOnly: ResumeDoc = { name: "JANE DOE", contact: "", sections: [{ heading: "EXPERIENCE", lines: [] }] };
    const text = (await pdfLines(toPdf(boldOnly, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS)).bytes)).flat().join("\n");
    expect(text).toContain("JANE DOE");
    expect(text).toContain("EXPERIENCE");
  });

  it("embeds only the letters it uses, so the file stays small", () => {
    const { bytes } = toPdf(sample, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS));
    // Each font file is about 400 KB; the four whole would be 1.5 MB.
    expect(bytes.byteLength).toBeLessThan(200_000);
  });

  it("works in the sans font", async () => {
    const settings: ExportSettings = { font: "sans", sizePt: 10, marginIn: 0.5 };
    const text = (await pdfLines(toPdf(sample, settings, fonts(settings)).bytes)).flat().join("\n");
    expect(text).toContain("Associate Consultant");
  });

  it("moves to a new page between lines, keeping each bullet whole", async () => {
    // Two lines each, so 30 of them run onto a second page.
    const bullet =
      "Rebuilt the quarterly forecasting model across eight business units and four regions, working with finance leads, which cut the close by three days";
    const long: ResumeDoc = {
      ...sample,
      sections: [{ heading: "EXPERIENCE", lines: Array.from({ length: 30 }, (_, i) => ({ kind: "bullet" as const, runs: [run(`${i + 1}. ${bullet}`)] })) }],
    };
    const { bytes, pages } = toPdf(long, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS));
    expect(pages).toBe(2);
    // The editor's page count, without writing the file, agrees.
    expect(countPdfPages(long, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS))).toBe(2);
    expect(countPdfPages(sample, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS))).toBe(1);
    const [first, second] = await pdfLines(bytes);
    // The second page starts with a bullet's first line: no bullet is split.
    expect(second![0]).toMatch(/^• \d+\. Rebuilt/);
    expect(first!.at(-1)).toMatch(/three days$/);
  });

  it("wraps long rows and words without losing text", async () => {
    const doc: ResumeDoc = {
      name: "A",
      contact: "https://www.example.com/a/very/long/link/that/does/not/fit/on/one/line/of/the/page/at/all/ever/really",
      sections: [],
    };
    const text = (await pdfLines(toPdf(doc, DEFAULT_SETTINGS, fonts(DEFAULT_SETTINGS)).bytes)).flat().join("");
    expect(text.replace(/\s/g, "")).toContain(doc.contact);
  });
});

describe("toDocx", () => {
  it("writes a Word document with the text, font and Letter page", async () => {
    const zip = await JSZip.loadAsync(await toDocx(sample, { font: "sans", sizePt: 11, marginIn: 1 }));
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of ["ŁUKASZ NGUYỄN", "BAIN &amp; COMPANY", "Associate Consultant", "Built a pricing model for a $2B retailer"]) {
      expect(xml).toContain(text);
    }
    // Letter, with one-inch margins, in twentieths of a point.
    expect(xml).toMatch(/<w:pgSz w:w="12240" w:h="15840"/);
    expect(xml).toMatch(/w:left="1440"/);
    // Bullets are a Word list; rows put the right side after a right tab.
    expect(xml).toContain("<w:numPr>");
    expect(xml).toMatch(/<w:tab w:val="right"/);
    const styles = await zip.file("word/styles.xml")!.async("string");
    expect(styles).toContain('w:ascii="Arial"');
  });
});
