// ─────────────────────────────────────────────────────────────────────────────
// Reading a Word (.docx) résumé, in the browser.
//
// A .docx is a zip file, and a few MB of zip can unzip to gigabytes, so the
// server never unzips uploads: the page reads the file here, with mammoth's
// browser build, and sends only the text (capped at MAX_BACKGROUND_LENGTH) when
// the profile is saved. A malicious file can then only slow the uploader's own tab.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_BACKGROUND_LENGTH } from "./scoring.js";

/** Whether `name` and the file's first bytes look like a .docx (a zip, which starts "PK\x03\x04"). */
export function isDocx(name: string, bytes: ArrayBuffer): boolean {
  const start = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return name.toLowerCase().endsWith(".docx") && [0x50, 0x4b, 0x03, 0x04].every((b, i) => start[i] === b);
}

/** Blank lines and runs of spaces collapsed, trimmed to the background's limit. */
export function tidy(text: string): string {
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.slice(0, MAX_BACKGROUND_LENGTH);
}

/** The text of a .docx. Loads mammoth only when a Word file is uploaded. */
export async function readDocx(bytes: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import("mammoth");
  // The browser build reads `arrayBuffer`; the Node build (in tests) reads `buffer`.
  const input = { arrayBuffer: bytes, buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer };
  const { value } = await mammoth.extractRawText(input);
  return tidy(value);
}
