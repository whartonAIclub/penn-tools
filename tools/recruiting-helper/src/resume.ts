// ─────────────────────────────────────────────────────────────────────────────
// Reading an uploaded PDF résumé into the profile's background text.
//
// PDFs go to the AI API, which reads them like a person would (including
// scanned ones and multi-column layouts) and copies out the text. Word (.docx)
// files never reach the server: the page reads them itself (docx.ts), since
// unzipping an uploaded file here could exhaust the server's memory.
// The file itself is never stored; only the text the user then saves.
// ─────────────────────────────────────────────────────────────────────────────

import { base64Bytes, base64FileType, isBase64, z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { tidy } from "./docx.js";
import { MAX_BACKGROUND_LENGTH } from "./scoring.js";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
/** A résumé is a page or two; this leaves room for a CV. */
export const MAX_RESUME_PAGES = 5;
/** The largest résumé request: the file as base64, plus room for the rest. */
export const MAX_RESUME_REQUEST_BYTES = Math.ceil(MAX_RESUME_BYTES / 3) * 4 + 16 * 1024;

export interface ResumeFile {
  name: string;
  /** The file's bytes as base64, without a data: prefix. */
  data: string;
}

/** Null if the file is a PDF the server can read, or why it can't be read. */
export function checkResume(value: unknown): string | null {
  const { name, data } = (typeof value === "object" && value !== null ? value : {}) as Partial<ResumeFile>;
  if (typeof name !== "string" || !name.trim() || name.length > 200) return "The file needs a name.";
  if (typeof data !== "string" || !data || !isBase64(data)) return `${name} is empty or couldn't be read.`;
  if (base64Bytes(data) > MAX_RESUME_BYTES) return `${name} is over ${MAX_RESUME_BYTES / 1024 / 1024} MB.`;
  if (base64FileType(data) === "application/pdf") return null;
  if (name.toLowerCase().endsWith(".doc")) {
    return `${name} is an older Word file. In Word, use File → Save As → Word Document (.docx) or PDF.`;
  }
  return `${name} isn't a PDF.`;
}

const ResumeText = z.object({
  text: z.string().describe("The résumé's content as plain text"),
  readable: z.boolean().describe("False if this isn't a résumé or its text can't be read"),
});

const RESUME_SYSTEM = `You copy the content of a résumé into plain text for a career tool.
Keep every role, employer, date, result, skill, school and language, in the résumé's order and wording.
Use simple lines and "- " bullets; no markdown headings or tables. Leave out contact details (phone, email, address).
Keep it under ${MAX_BACKGROUND_LENGTH} characters, shortening the oldest roles first if you must.`;

/** The text of a PDF résumé, read by the AI; null if it isn't a readable résumé. */
export async function readPdfResume(ai: AI, provider: AIProvider, file: ResumeFile): Promise<string | null> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: ResumeText,
    system: RESUME_SYSTEM,
    messages: [{ role: "user", content: [{ type: "pdf", filename: file.name, data: file.data }] }],
  });
  return object.readable && object.text.trim() ? tidy(object.text) : null;
}
