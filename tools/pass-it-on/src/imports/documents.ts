// Reading files from a club's Google Drive: a downloaded folder (a zip, where
// Google Docs and Sheets arrive as .docx and .xlsx) or single files. Each file
// becomes excerpts that record where they came from.

import { unzipSync } from "fflate";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { extractText } from "unpdf";
import { parseCsv } from "./csv.js";
import { MAX_EXCERPT_CHARS, packUnits, type ExcerptDraft } from "./excerpts.js";

export const DOCUMENT_EXTENSIONS = [".docx", ".xlsx", ".csv", ".txt", ".md", ".pdf"] as const;

/** Limits on an uploaded zip, so a broken or hostile one can't exhaust memory. */
export const MAX_ZIP_FILES = 1000;
export const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;

export interface DocumentImport {
  excerpts: ExcerptDraft[];
  /** Files that were skipped, with why: an unsupported type, or unreadable. */
  skipped: { file: string; reason: string }[];
}

export class ZipTooLargeError extends Error {
  constructor() {
    super(`The zip is too large: at most ${MAX_ZIP_FILES} files and ${MAX_UNZIPPED_BYTES / 1024 / 1024} MB unzipped.`);
  }
}

/** Excerpts from one uploaded file: a zip of a Drive folder, or a single document. */
export async function documentExcerpts(filename: string, data: Uint8Array): Promise<DocumentImport> {
  if (extensionOf(filename) !== ".zip") {
    return readFiles([[filename, data]]);
  }

  let count = 0;
  let total = 0;
  const files = unzipSync(data, {
    filter: (file) => {
      if (file.name.endsWith("/") || isHidden(file.name)) return false;
      count++;
      total += file.originalSize;
      if (count > MAX_ZIP_FILES || total > MAX_UNZIPPED_BYTES) throw new ZipTooLargeError();
      return true;
    },
  });
  return readFiles(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

async function readFiles(files: [string, Uint8Array][]): Promise<DocumentImport> {
  const result: DocumentImport = { excerpts: [], skipped: [] };
  for (const [file, data] of files) {
    const extension = extensionOf(file);
    if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
      result.skipped.push({ file, reason: "unsupported file type" });
      continue;
    }
    try {
      const excerpts = await readFile(file, extension, data);
      result.excerpts.push(...excerpts);
    } catch {
      result.skipped.push({ file, reason: "couldn't be read" });
    }
  }
  return result;
}

async function readFile(file: string, extension: string, data: Uint8Array): Promise<ExcerptDraft[]> {
  switch (extension) {
    case ".docx": {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      return fromParagraphs(value, { file });
    }
    case ".txt":
    case ".md":
      return fromParagraphs(new TextDecoder().decode(data), { file });
    case ".csv":
      return fromRows(parseCsv(new TextDecoder().decode(data)), { file });
    case ".xlsx": {
      const workbook = new ExcelJS.Workbook();
      // exceljs's types want its own Buffer type; a Node Buffer is what it reads.
      await workbook.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
      const excerpts: ExcerptDraft[] = [];
      workbook.eachSheet((sheet) => {
        const rows: string[][] = [];
        sheet.eachRow((row) => {
          const cells: string[] = [];
          row.eachCell((cell) => cells.push(cell.text));
          rows.push(cells);
        });
        excerpts.push(...fromRows(rows, { file, sheet: sheet.name }));
      });
      return excerpts;
    }
    case ".pdf": {
      const { text } = await extractText(data, { mergePages: false });
      return text.flatMap((page, i) => fromParagraphs(page, { file, page: i + 1 }));
    }
    default:
      return [];
  }
}

/** Text split at blank lines into paragraphs, packed into excerpts. */
function fromParagraphs(text: string, meta: ExcerptDraft["meta"]): ExcerptDraft[] {
  return packUnits(text.split(/\n\s*\n/), MAX_EXCERPT_CHARS, "\n\n").map((t) => ({ text: t, meta }));
}

/**
 * A table as excerpts: one line per row, cells joined with " | ". The first
 * row (usually the headers) starts every excerpt, so each one reads alone.
 */
function fromRows(rows: string[][], meta: ExcerptDraft["meta"]): ExcerptDraft[] {
  const lines = rows.map((cells) => cells.map((c) => c.trim()).join(" | ")).filter((l) => l.replace(/[\s|]/g, ""));
  if (lines.length === 0) return [];
  const [header, ...body] = lines;
  if (body.length === 0) return [{ text: header!, meta }];
  return packUnits(body, MAX_EXCERPT_CHARS - header!.length - 1).map((t) => ({ text: `${header}\n${t}`, meta }));
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** macOS metadata and dotfiles that zips often carry. */
function isHidden(path: string): boolean {
  return path.startsWith("__MACOSX/") || path.split("/").some((part) => part.startsWith("."));
}
