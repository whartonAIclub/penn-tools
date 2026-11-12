// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: the text of a Word (.docx) file
//
// The AI API takes PDFs and images but not Word files, so syllabus/route.ts
// sends a .docx's text instead. A .docx is a zip archive whose
// word/document.xml holds the body; docxText() finds that entry, inflates it
// and turns its paragraphs, tabs and table cells into plain text. Server
// only (node:zlib), so it's exported as @penntools/tool-wemba-sync/docx,
// not from the package's index, which the page's browser code imports.
// ─────────────────────────────────────────────────────────────────────────────

import { inflateRawSync } from "node:zlib";

/** The most a .docx's document.xml may inflate to: real syllabi are well under 1 MB, so this stops zip bombs. */
const MAX_XML_BYTES = 20 * 1024 * 1024;

const ENTRY = "word/document.xml";

/** The archive's word/document.xml, or null if it isn't a zip holding one. */
function documentXml(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);

  // The end-of-central-directory record is in the last 22 bytes plus a comment of up to 64 KB.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (u32(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;

  const entries = u16(end + 10);
  let at = u32(end + 16);
  for (let i = 0; i < entries && at + 46 <= bytes.length; i++) {
    if (u32(at) !== 0x02014b50) return null;
    const method = u16(at + 10);
    const compressedSize = u32(at + 20);
    const nameLength = u16(at + 28);
    const local = u32(at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (name === ENTRY) {
      if (local + 30 > bytes.length || u32(local) !== 0x04034b50) return null;
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data.length <= MAX_XML_BYTES ? new TextDecoder().decode(data) : null;
      if (method !== 8) return null;
      return new TextDecoder().decode(inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES }));
    }
    at += 46 + nameLength + u16(at + 30) + u16(at + 32);
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

/**
 * The document's text: a line per paragraph or table row, with tabs between
 * table cells. Null if the bytes aren't a .docx. Deleted tracked changes and
 * field codes (e.g. a link's target) are left out.
 */
export function docxText(bytes: Uint8Array): string | null {
  let xml: string | null;
  try {
    xml = documentXml(bytes);
  } catch {
    return null; // a truncated archive, bad deflate data or over MAX_XML_BYTES
  }
  if (xml === null) return null;
  const text = xml
    .replace(/<w:(delText|instrText)\b[^>]*>[\s\S]*?<\/w:\1>/g, "")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:(br|cr)\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:(p|tr)>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
