// Reading Drive files. The test builds tiny made-up .docx, .xlsx and .pdf
// files in code, so no binary samples live in the repo.

import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import ExcelJS from "exceljs";
import { parseCsv } from "../imports/csv.js";
import { documentExcerpts, MAX_ZIP_FILES, ZipTooLargeError } from "../imports/documents.js";

/** A minimal Word document whose paragraphs are `paragraphs`. */
function docx(paragraphs: string[]): Uint8Array {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

async function xlsx(sheets: Record<string, string[][]>): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) workbook.addWorksheet(name).addRows(rows);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** A one-page PDF showing `line`. */
function pdf(line: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(out);
}

describe("documentExcerpts", () => {
  it("reads a Drive folder zip: Word, Excel, CSV, text and PDF files, skipping the rest", async () => {
    const zip = zipSync({
      "Pub/Playbook.docx": docx(["Book the bistro early.", "Ask Finance Club for half the cost."]),
      "Pub/Budget.xlsx": await xlsx({ "Fall 2025": [["Item", "Cost"], ["Venue deposit", "500"]] }),
      "Pub/Tracker.csv": strToU8('Event,Lesson\nSpeaker dinner,"RSVPs ran high, about a third"\n'),
      "Pub/Notes.md": strToU8("# Notes\n\nModerator took longest to recruit."),
      "Pub/Recap.pdf": pdf("Turnout dropped after midterms"),
      "Pub/photo.jpg": new Uint8Array([1, 2, 3]),
      "__MACOSX/Pub/._Playbook.docx": new Uint8Array([0]),
    });

    const { excerpts, skipped } = await documentExcerpts("Pub.zip", zip);

    const byFile = (file: string) => excerpts.filter((e) => e.meta.file === file);
    expect(byFile("Pub/Playbook.docx").map((e) => e.text)).toEqual(["Book the bistro early.\n\nAsk Finance Club for half the cost."]);
    expect(byFile("Pub/Budget.xlsx")).toEqual([{ text: "Item | Cost\nVenue deposit | 500", meta: { file: "Pub/Budget.xlsx", sheet: "Fall 2025" } }]);
    expect(byFile("Pub/Tracker.csv").map((e) => e.text)).toEqual(["Event | Lesson\nSpeaker dinner | RSVPs ran high, about a third"]);
    expect(byFile("Pub/Notes.md").map((e) => e.text)).toEqual(["# Notes\n\nModerator took longest to recruit."]);
    expect(byFile("Pub/Recap.pdf")).toEqual([{ text: "Turnout dropped after midterms", meta: { file: "Pub/Recap.pdf", page: 1 } }]);
    expect(skipped).toEqual([{ file: "Pub/photo.jpg", reason: "unsupported file type" }]);
  });

  it("reads a single document uploaded on its own", async () => {
    const { excerpts } = await documentExcerpts("Debrief.docx", docx(["Vendor overcharged for AV."]));
    expect(excerpts).toEqual([{ text: "Vendor overcharged for AV.", meta: { file: "Debrief.docx" } }]);
  });

  it("skips a file it can't read instead of failing the whole upload", async () => {
    const { excerpts, skipped } = await documentExcerpts("Broken.docx", strToU8("not really a docx"));
    expect(excerpts).toEqual([]);
    expect(skipped).toEqual([{ file: "Broken.docx", reason: "couldn't be read" }]);
  });

  it("repeats a table's header row at the top of every excerpt", async () => {
    const rows = [["Event", "Lesson"], ...Array.from({ length: 40 }, (_, i) => [`Event ${i}`, "x".repeat(60)])];
    const { excerpts } = await documentExcerpts("Big.xlsx", await xlsx({ Sheet1: rows }));
    expect(excerpts.length).toBeGreaterThan(1);
    expect(excerpts.every((e) => e.text.startsWith("Event | Lesson\n") && e.text.length <= 1500)).toBe(true);
  });

  it("refuses a zip with too many files", async () => {
    const files = Object.fromEntries(Array.from({ length: MAX_ZIP_FILES + 1 }, (_, i) => [`f${i}.txt`, strToU8("x")]));
    await expect(documentExcerpts("Huge.zip", zipSync(files))).rejects.toBeInstanceOf(ZipTooLargeError);
  });
});

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, line breaks in cells and CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"1,2","say ""hi"""\r\n"line\nbreak",\r\n\r\n')).toEqual([
      ["a", "b"],
      ["1,2", 'say "hi"'],
      ["line\nbreak", ""],
    ]);
  });
});
