// ─────────────────────────────────────────────────────────────────────────────
// Uploaded files: a resume PDF or image, LinkedIn screenshots or PDFs, and
// news articles as PDFs or screenshots
//
// The page reads each file in the browser (apps/web/src/app/tools/chatprep/
// readFile.ts) and sends it as base64 with the rest of the request; it goes to
// the AI inline, through the AI API, and nothing is stored. checkFiles is the
// server's check of what the browser sent; the brief route also counts PDF
// pages, which needs a PDF parser.
// ─────────────────────────────────────────────────────────────────────────────

import { AI_IMAGE_TYPES, base64Bytes, base64FileType, isBase64 } from "@penntools/core/ai";
import type { AIContentPart, AIImageType } from "@penntools/core/ai";

export const FILE_TYPES = [...AI_IMAGE_TYPES, "application/pdf"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export interface UploadedFile {
  name: string;
  mediaType: FileType;
  /** The file's bytes as base64, without a data: prefix. */
  data: string;
}

const MB = 1024 * 1024;

/** One resume, as a PDF or an image. */
export const MAX_RESUME_FILES = 1;
/** A LinkedIn profile takes a few screenshots, or one "Save to PDF" file. */
export const MAX_PROFILE_FILES = 5;
/** News articles about the company, saved as PDFs or screenshots. */
export const MAX_NEWS_FILES = 3;
/** Claude reads each PDF page as text and an image (about 1,500 tokens), so keep them short. */
export const MAX_PDF_PAGES = 8;
/** All files in one request together, in bytes. */
export const MAX_FILES_BYTES = 20 * MB;
export const MAX_FILE_NAME_LENGTH = 200;

/** The limits, for the page to check before sending. */
export interface FileLimits {
  resumeFiles: number;
  profileFiles: number;
  newsFiles: number;
  pdfPages: number;
  bytes: number;
  nameLength: number;
}

export const FILE_LIMITS: FileLimits = {
  resumeFiles: MAX_RESUME_FILES,
  profileFiles: MAX_PROFILE_FILES,
  newsFiles: MAX_NEWS_FILES,
  pdfPages: MAX_PDF_PAGES,
  bytes: MAX_FILES_BYTES,
  nameLength: MAX_FILE_NAME_LENGTH,
};

/** The size of all files' bytes together. */
export function filesBytes(files: UploadedFile[]): number {
  return files.reduce((total, file) => total + base64Bytes(file.data), 0);
}

// Names go to the AI inside a tag; control characters have no place in one.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

/**
 * Why `files` can't be sent, or null if they're fine (undefined and null mean
 * none). `label` names them in the message, e.g. "resume files".
 */
export function checkFiles(files: unknown, label: string, maxCount: number): string | null {
  if (files === undefined || files === null) return null;
  if (!Array.isArray(files)) return `${label} must be a list.`;
  if (files.length > maxCount) return `Upload at most ${maxCount} ${label}.`;

  for (const file of files as unknown[]) {
    if (typeof file !== "object" || file === null) return `Each of the ${label} must be an object.`;
    const { name, mediaType, data } = file as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || name.length > MAX_FILE_NAME_LENGTH) {
      return `Each file needs a name under ${MAX_FILE_NAME_LENGTH} characters.`;
    }
    if (CONTROL_CHARS_RE.test(name)) return `${name.slice(0, 40)} has control characters in its name. Rename it and upload it again.`;
    if (!FILE_TYPES.includes(mediaType as FileType)) return `${name} isn't a PDF or an image.`;
    if (typeof data !== "string" || !data) return `${name} is empty.`;
    // The browser's type comes from the extension; this is the file's real one.
    if (!isBase64(data) || base64FileType(data) !== mediaType) return `${name} isn't a valid ${mediaType === "application/pdf" ? "PDF" : "image"}.`;
  }
  return null;
}

/**
 * A file as the AI receives it, inside a tag that says whose it is, so the
 * model can tell the student's resume from the person's profile and the news.
 */
export function fileParts(file: UploadedFile, tag: "resume_file" | "profile_file" | "news_file"): AIContentPart[] {
  const name = file.name.replace(/"/g, "'");
  const content: AIContentPart =
    file.mediaType === "application/pdf"
      ? { type: "pdf", filename: file.name, data: file.data }
      : { type: "image", mediaType: file.mediaType satisfies AIImageType, data: file.data };
  return [{ type: "text", text: `<${tag} name="${name}">` }, content, { type: "text", text: `</${tag}>` }];
}
