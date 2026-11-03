// Tests for reading uploaded résumés: file checks, Word files (read here, with
// a tiny real .docx), and PDFs (with a fake AI: no keys, no network, no cost).

import { describe, it, expect } from "vitest";
import type { AI, GenerateObjectRequest, AISchema } from "@penntools/core/ai";
import { checkResume, readDocx, readPdfResume } from "../resume.js";

/** A minimal .docx with two paragraphs and blank lines between them. */
const DOCX = await makeDocx("Business development manager, Acme\n\n\n\nWharton MBA");

/** Builds a .docx in memory: the three parts Word needs, zipped without compression. */
async function makeDocx(text: string): Promise<string> {
  const paragraphs = text
    .split("\n")
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`)
    .join("");
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
  };
  return Buffer.from(zipStored(files)).toString("base64");
}

/** A zip archive of `files`, stored (no compression), which is all mammoth needs. */
function zipStored(files: Record<string, string>): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const PDF = Buffer.from("%PDF-1.4\n%fake résumé").toString("base64");

function fakeAI(object: unknown) {
  const requests: GenerateObjectRequest<AISchema>[] = [];
  const ai = {
    generateObject: async (request: GenerateObjectRequest<AISchema>) => {
      requests.push(request);
      return { object, provider: "anthropic", model: "fake", usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 } };
    },
  } as unknown as AI;
  return { ai, requests };
}

describe("checkResume", () => {
  it("recognizes PDFs by their bytes and Word files as .docx zips", () => {
    expect(checkResume({ name: "cv.pdf", data: PDF })).toEqual({ type: "pdf" });
    expect(checkResume({ name: "CV.DOCX", data: DOCX })).toEqual({ type: "docx" });
  });

  it.each([
    ["an old .doc", { name: "cv.doc", data: DOCX }],
    ["a .docx that isn't a zip", { name: "cv.docx", data: PDF.replace("JVBER", "AAAAA") }],
    ["a picture", { name: "me.png", data: "iVBORw0KGgo=" }],
    ["no data", { name: "cv.pdf", data: "" }],
    ["no name", { data: PDF }],
    ["nothing", null],
  ])("rejects %s", (_label, file) => {
    expect(checkResume(file)).toEqual({ problem: expect.any(String) });
  });

  it("explains how to convert an old .doc", () => {
    expect(checkResume({ name: "cv.doc", data: DOCX })).toEqual({ problem: expect.stringContaining("Save As") });
  });
});

describe("readDocx", () => {
  it("returns the document's text, with extra blank lines removed", async () => {
    expect(await readDocx(DOCX)).toBe("Business development manager, Acme\n\nWharton MBA");
  });
});

describe("readPdfResume", () => {
  it("sends the PDF to the AI and returns its text", async () => {
    const { ai, requests } = fakeAI({ text: "  BD manager  \n\n\n\nWharton MBA ", readable: true });
    expect(await readPdfResume(ai, "anthropic", { name: "cv.pdf", data: PDF })).toBe("BD manager\n\nWharton MBA");
    expect(requests[0]?.messages[0]?.content).toEqual([{ type: "pdf", filename: "cv.pdf", data: PDF }]);
    expect(requests[0]?.tier).toBe("fast");
  });

  it("returns null when the AI says it isn't a readable résumé", async () => {
    const { ai } = fakeAI({ text: "", readable: false });
    expect(await readPdfResume(ai, "openai", { name: "cv.pdf", data: PDF })).toBeNull();
  });
});
