// Reading a Word document's text, and telling a .docx from a PDF.

import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { docxText } from "../docx.js";
import { checkUpload, uploadKind } from "../schedule.js";

/** A zip archive of `files`, each deflated (or stored), as Word writes them. */
function zip(files: Record<string, string>, { store = false } = {}): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(content);
    const data = store ? raw : deflateRawSync(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(store ? 0 : 8, 8);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(store ? 0 : 8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, centralBytes, end]));
}

const p = (...runs: string[]) => `<w:p>${runs.map((r) => `<w:r>${r}</w:r>`).join("")}</w:p>`;
const t = (text: string) => `<w:t xml:space="preserve">${text}</w:t>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p(t("FNCE 6130: Corporate Finance"))}
${p(t("Session 1"), "<w:tab/>", t("Valuation &amp; risk"))}
${p(t("Kept"), "<w:delText>Deleted</w:delText>", '<w:instrText> HYPERLINK "https://x" </w:instrText>', t(" text"))}
<w:tbl><w:tr><w:tc>${p(t("Midterm"))}</w:tc><w:tc>${p(t("40%"))}</w:tc></w:tr></w:tbl>
${p(t("Caf&#233; &lt;Huntsman&gt;"))}
</w:body></w:document>`;

describe("docxText", () => {
  it("reads paragraphs, tabs and tables, leaving out deletions and field codes", () => {
    const text = docxText(zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": DOCUMENT }));
    expect(text).toContain("FNCE 6130: Corporate Finance");
    expect(text).toContain("Session 1\tValuation & risk");
    expect(text).toContain("Kept text");
    expect(text).not.toMatch(/Deleted|HYPERLINK/);
    expect(text).toMatch(/Midterm\s+40%/);
    expect(text).toContain("Café <Huntsman>");
  });

  it("reads a stored (uncompressed) entry", () => {
    expect(docxText(zip({ "word/document.xml": DOCUMENT }, { store: true }))).toContain("Corporate Finance");
  });

  it("returns null for anything that isn't a .docx", () => {
    expect(docxText(zip({ "other.xml": "<x/>" }))).toBeNull();
    expect(docxText(new TextEncoder().encode("%PDF-1.7 not a zip"))).toBeNull();
    expect(docxText(zip({ "word/document.xml": DOCUMENT }).subarray(0, 60))).toBeNull();
  });
});

describe("uploadKind and checkUpload", () => {
  const docx = Buffer.from(zip({ "word/document.xml": DOCUMENT })).toString("base64");
  const pdf = btoa("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

  it("tells a PDF from a .docx", () => {
    expect(uploadKind("a.pdf", pdf)).toBe("pdf");
    expect(uploadKind("FNCE.docx", docx)).toBe("docx");
    expect(uploadKind("FNCE.zip", docx)).toBeNull();
  });

  it("accepts a .docx only where asked", () => {
    expect(checkUpload({ filename: "FNCE.docx", data: docx })).toMatch(/isn't a PDF\.$/);
    expect(checkUpload({ filename: "FNCE.docx", data: docx }, ["pdf", "docx"])).toBeNull();
    expect(checkUpload({ filename: "FNCE.doc", data: btoa("\xd0\xcf\x11\xe0 old") }, ["pdf", "docx"])).toMatch(/Word \(\.docx\)/);
  });
});
