import { describe, it, expect } from "vitest";
import { createDocx, crc32, documentXml, escapeXml, zip } from "../docx.js";
import type { Catalog } from "../courses.js";
import { proposalBlocks, proposalDocx, proposalFileName } from "../proposal.js";

/** Reads a stored (uncompressed) zip back into { name: text }, checking each entry's CRC. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const crc = view.getUint32(pos + 16, true);
    const size = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true);
    const offset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);
    files[name] = decoder.decode(data);
    pos += 46 + nameLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("zip", () => {
  it("round-trips files, including non-ASCII text", () => {
    const files = unzip(zip([{ name: "a.txt", text: "hello" }, { name: "b/c.xml", text: "café · ✓" }]));
    expect(files).toEqual({ "a.txt": "hello", "b/c.xml": "café · ✓" });
  });
});

describe("escapeXml", () => {
  it("escapes markup and drops characters XML can't hold", () => {
    expect(escapeXml(`<b> & "x"\u0001`)).toBe("&lt;b&gt; &amp; &quot;x&quot;");
  });
});

describe("createDocx", () => {
  it("writes the parts Word needs, with the document's text in it", () => {
    const files = unzip(createDocx([{ type: "title", text: "R&D <Strategy>" }]));
    expect(Object.keys(files)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
    ]);
    expect(files["word/document.xml"]).toContain('<w:pStyle w:val="Title"/>');
    expect(files["word/document.xml"]).toContain("R&amp;D &lt;Strategy&gt;");
  });

  it("turns line breaks into breaks and gives tables a header row", () => {
    const xml = documentXml([
      { type: "paragraph", text: "one\ntwo" },
      { type: "table", rows: [["A", "B"], ["1"]] },
    ]);
    expect(xml).toContain('one</w:t><w:br/><w:t xml:space="preserve">two');
    expect(xml).toContain("<w:tblHeader/>");
    // Short rows are padded to the full width.
    expect(xml.match(/<w:tc>/g)).toHaveLength(4);
  });
});

const catalog: Catalog = {
  terms: [{ term: "2027A", label: "Spring 2027" }],
  termLabel: "Spring 2027",
  updated: "2026-11-03",
  source: "test",
  courses: [
    { code: "HCMG 8410", department: "HCMG", title: "Health Care Systems", description: "", credits: 1, sections: 1, crossListed: [], terms: ["Spring 2027"], sessions: ["Full"], rating: null },
    { code: "OIDD 6530", department: "OIDD", title: "Ops Analytics", description: "", credits: 0.5, sections: 1, crossListed: [], terms: ["Spring 2027"], sessions: ["Full"], rating: null },
  ],
};

const draft = {
  title: "  Health Care Operations ",
  theme: "Making care delivery run well.",
  courses: ["OIDD 6530", "HCMG 8410"],
  alignments: { "HCMG 8410": "How the system works.", "OIDD 6530": "Tools to improve it." },
};

describe("proposalBlocks", () => {
  it("puts the title, theme, course plan and each course's alignment in Wharton's order", () => {
    const blocks = proposalBlocks(draft, catalog, "November 10, 2026");
    expect(blocks.slice(0, 4)).toEqual([
      { type: "title", text: "Health Care Operations" },
      { type: "subtitle", text: "Individualized Major Proposal · Wharton MBA" },
      { type: "heading", level: 1, text: "Theme" },
      { type: "paragraph", text: "Making care delivery run well." },
    ]);
    expect(blocks).toContainEqual({
      type: "table",
      rows: [
        ["Course", "Title", "Department", "Credits"],
        ["OIDD 6530", "Ops Analytics", "Operations, Information & Decisions", "0.5 CU"],
        ["HCMG 8410", "Health Care Systems", "Health Care Management", "1 CU"],
      ],
    });
    expect(blocks).toContainEqual({ type: "paragraph", bold: true, text: "Total: 1.5 CU (maximum 21 CU)" });
    const headings = blocks.filter((b) => b.type === "heading" && b.level === 2).map((b) => (b as { text: string }).text);
    expect(headings).toEqual(["OIDD 6530: Ops Analytics", "HCMG 8410: Health Care Systems"]);
  });

  it("makes a .docx with the student's text", () => {
    const xml = unzip(proposalDocx(draft, catalog, "November 10, 2026"))["word/document.xml"]!;
    expect(xml).toContain("Tools to improve it.");
    expect(xml).toContain("Prepared on November 10, 2026 from the Spring 2027 course list.");
  });
});

describe("proposalFileName", () => {
  it("names the file after the title, without characters file systems reject", () => {
    expect(proposalFileName("Health / Care: Ops?")).toBe("Health Care Ops - Proposal.docx");
    expect(proposalFileName("   ")).toBe("Individualized Major - Proposal.docx");
  });
});
