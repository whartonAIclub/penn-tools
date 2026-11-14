// A minimal Word (.docx) writer: titles, headings, paragraphs and simple
// tables, which is all the proposal needs. A .docx file is a zip of a few XML
// files; this writes them uncompressed ("stored"), which every zip reader and
// Word accept. Kept in the tool, rather than adding a library, so the tool has
// no extra dependencies. Runs in the browser or in Node.

export type DocxBlock =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "heading"; text: string; level: 1 | 2 }
  /** Line breaks in `text` stay line breaks. `bold` makes the whole paragraph bold. */
  | { type: "paragraph"; text: string; bold?: boolean; italic?: boolean }
  /** The first row is the header, repeated on each page. */
  | { type: "table"; rows: string[][] };

// ── XML ───────────────────────────────────────────────────────────────────────

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Escapes text for XML, dropping characters XML can't hold (most control characters). */
export function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function run(text: string, format: { bold?: boolean | undefined; italic?: boolean | undefined } = {}): string {
  const props = `${format.bold ? "<w:b/>" : ""}${format.italic ? "<w:i/>" : ""}`;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const body = lines.map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join("<w:br/>");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${body}</w:r>`;
}

function paragraph(text: string, style?: string, format?: { bold?: boolean | undefined; italic?: boolean | undefined }): string {
  const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${props}${text ? run(text, format) : ""}</w:p>`;
}

function table(rows: string[][]): string {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const grid = `<w:tblGrid>${"<w:gridCol/>".repeat(columns)}</w:tblGrid>`;
  const body = rows
    .map((row, i) => {
      const header = i === 0;
      const cells = Array.from({ length: columns }, (_, c) => row[c] ?? "")
        .map((cell) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${paragraph(cell, undefined, { bold: header })}</w:tc>`)
        .join("");
      return `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells}</w:tr>`;
    })
    .join("");
  const props = '<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
  // Word wants a paragraph after a table, so one follows each.
  return `<w:tbl>${props}${grid}${body}</w:tbl><w:p/>`;
}

function blockXml(block: DocxBlock): string {
  switch (block.type) {
    case "title":
      return paragraph(block.text, "Title");
    case "subtitle":
      return paragraph(block.text, "Subtitle");
    case "heading":
      return paragraph(block.text, `Heading${block.level}`);
    case "paragraph":
      return paragraph(block.text, undefined, { bold: block.bold, italic: block.italic });
    case "table":
      return table(block.rows);
  }
}

export function documentXml(blocks: readonly DocxBlock[]): string {
  // US Letter with 1-inch margins (units are twentieths of a point).
  const section =
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  return `${XML_HEADER}<w:document xmlns:w="${W_NS}"><w:body>${blocks.map(blockXml).join("")}${section}</w:body></w:document>`;
}

const STYLES_XML =
  `${XML_HEADER}<w:styles xmlns:w="${W_NS}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="011F5B"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="595959"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>' +
  '<w:rPr><w:b/><w:color w:val="011F5B"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>' +
  '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>' +
  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>' +
  '<w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>' +
  '</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
  '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  "</w:styles>";

const CONTENT_TYPES_XML =
  `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  "</Types>";

const RELS_XML =
  `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOCUMENT_RELS_XML =
  `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A Word document with these blocks, as the bytes of a .docx file. */
export function createDocx(blocks: readonly DocxBlock[]): Uint8Array<ArrayBuffer> {
  return zip([
    { name: "[Content_Types].xml", text: CONTENT_TYPES_XML },
    { name: "_rels/.rels", text: RELS_XML },
    { name: "word/document.xml", text: documentXml(blocks) },
    { name: "word/styles.xml", text: STYLES_XML },
    { name: "word/_rels/document.xml.rels", text: DOCUMENT_RELS_XML },
  ]);
}

// ── Zip (stored, no compression) ──────────────────────────────────────────────

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00, zip's earliest date: fixed, so the same input gives the same file. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** General-purpose flag bit 11: file names are UTF-8. */
const UTF8_FLAG = 0x0800;

export function zip(files: readonly { name: string; text: string }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const name = encoder.encode(f.name);
    const data = encoder.encode(f.text);
    return { name, data, crc: crc32(data), offset: 0 };
  });

  const localSize = entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let pos = 0;
  const u16 = (v: number) => {
    view.setUint16(pos, v, true);
    pos += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(pos, v, true);
    pos += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, pos);
    pos += b.length;
  };

  for (const e of entries) {
    e.offset = pos;
    u32(0x04034b50); // local file header
    u16(20); // version needed
    u16(UTF8_FLAG);
    u16(0); // method: stored
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.data.length); // compressed size
    u32(e.data.length); // uncompressed size
    u16(e.name.length);
    u16(0); // extra field length
    bytes(e.name);
    bytes(e.data);
  }

  const centralStart = pos;
  for (const e of entries) {
    u32(0x02014b50); // central directory header
    u16(20); // version made by
    u16(20); // version needed
    u16(UTF8_FLAG);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(e.offset);
    bytes(e.name);
  }

  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(centralStart);
  u16(0); // comment length
  return out;
}
