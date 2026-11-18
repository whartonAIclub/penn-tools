/**
 * parseFile.ts — text from uploaded files, in the browser: PDF, Word (.docx),
 * PowerPoint (.pptx) and plain text. The text is all the AI sees, and what the
 * page previews. Parsers load only when needed.
 */

import type JSZip from "jszip";
import { LIMITS, type ContextFile, type FileTag } from "@penntools/tool-resume-customizer/resume";

export interface UploadedFile {
  id: string;
  name: string;
  tag: FileTag;
  /** "" when the file couldn't be read; see `error`. */
  text: string;
  /** Why the file couldn't be read; such files aren't sent to the AI. */
  error?: string;
}

export const ACCEPT = ".pdf,.docx,.pptx,.txt,.md";
const SUPPORTED = new Set(["pdf", "docx", "pptx", "txt", "md"]);

/** Larger files are refused: a resume or project document is far smaller, and parsing one this size would stall the page. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * The most text kept from a file, well over what's ever sent (LIMITS), so a
 * huge text file can't freeze the preview. A resume over LIMITS.resume is
 * still caught: the Workspace says so.
 */
const MAX_FILE_TEXT = 100_000;

/** Text from each file, in order. Drag and drop ignores the file input's `accept`, so types are checked here. */
export async function parseFiles(files: FileList | File[], tag: FileTag): Promise<UploadedFile[]> {
  const parsed: UploadedFile[] = [];
  for (const file of Array.from(files)) {
    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await parseFile(file);
    parsed.push({ id, name: file.name, tag, ...result });
  }
  return parsed;
}

/**
 * The files to send as context for tailoring the base resume: readable ones
 * other than the base, at most LIMITS.files, trimmed to LIMITS.context
 * characters in all. `trimmed` says whether anything was left out.
 */
export function contextFiles(files: UploadedFile[], baseId: string | undefined): { files: ContextFile[]; trimmed: boolean } {
  const out: ContextFile[] = [];
  let left: number = LIMITS.context;
  let trimmed = false;
  for (const f of files) {
    if (f.id === baseId || f.error || !f.text.trim()) continue;
    if (left <= 0 || out.length >= LIMITS.files) {
      trimmed = true;
      break;
    }
    const text = f.text.length > left ? f.text.slice(0, left) : f.text;
    if (text.length < f.text.length) trimmed = true;
    out.push({ name: f.name.slice(0, LIMITS.fileName), tag: f.tag, text });
    left -= text.length;
  }
  return { files: out, trimmed };
}

async function parseFile(file: File): Promise<{ text: string; error?: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED.has(ext)) {
    return { text: "", error: "Unsupported file type. Upload a PDF, Word (.docx), PowerPoint (.pptx) or text file." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { text: "", error: "This file is over 10 MB. Upload a smaller copy, such as the text alone." };
  }
  try {
    let text: string;
    if (ext === "pdf") text = cleanResumeText(await parsePdf(file));
    else if (ext === "docx") text = await parseDocx(file);
    else if (ext === "pptx") text = await parsePptx(file);
    else text = await file.text();
    text = text.trim().slice(0, MAX_FILE_TEXT);
    if (!text) {
      return {
        text: "",
        error: ext === "pdf" ? "No text found. If it's a scanned PDF, export it from Word or Google Docs instead." : "No text found.",
      };
    }
    return { text };
  } catch (err) {
    console.error("parseFile error:", err);
    return { text: "", error: "Couldn't read this file. Try saving it again, or as another format." };
  }
}

// ── Text cleaning ─────────────────────────────────────────────────────────────

const SECTION_KEYWORDS = [
  "EDUCATION", "EXPERIENCE", "WORK EXPERIENCE", "PROFESSIONAL EXPERIENCE",
  "EMPLOYMENT", "SKILLS", "TECHNICAL SKILLS", "CORE COMPETENCIES",
  "PROJECTS", "LEADERSHIP", "ACTIVITIES", "EXTRACURRICULAR",
  "VOLUNTEER", "VOLUNTEERING", "CERTIFICATIONS", "LICENSES",
  "PUBLICATIONS", "RESEARCH", "AWARDS", "HONORS", "HONORS & AWARDS",
  "SUMMARY", "PROFILE", "OBJECTIVE", "ADDITIONAL", "ADDITIONAL INFORMATION",
  "LANGUAGES", "INTERESTS", "HOBBIES", "AFFILIATIONS", "INVOLVEMENT",
  "COURSEWORK", "TEACHING", "REFERENCES",
];

// A line that looks like a section header: ALL CAPS, optionally ending in ":".
function isSectionHeader(line: string): boolean {
  const t = line.trim().replace(/:$/, "").trim();
  if (t.length < 3) return false;
  return SECTION_KEYWORDS.includes(t.toUpperCase()) || /^[A-Z][A-Z\s&/-]{2,}$/.test(t);
}

/**
 * Raw PDF text with a resume's structure restored: bullets normalized, right-
 * aligned dates and locations separated with " | ", blank lines around section
 * headers, and runs of blank lines collapsed.
 */
export function cleanResumeText(rawText: string): string {
  let lines = rawText.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());

  const BULLET_RE = /^\s*[●▪▸→◦•]\s*/;
  lines = lines.map((l) => (BULLET_RE.test(l) ? "  • " + l.replace(BULLET_RE, "").trimStart() : l));

  const LOCATION_TAIL = /^(.+?)\s{3,}([A-Z][a-zA-Z .]+,\s*[A-Z]{2}(?:\s|$).*)$/;
  const DATE_TAIL = /^(.+?)\s{3,}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}.*)$/i;
  const YEAR_RANGE_TAIL = /^(.+?)\s{3,}(\d{4}\s*[–-]\s*(?:\d{4}|Present|Current|Now).*)$/i;
  const SEASON_TAIL = /^(.+?)\s{3,}((?:Summer|Fall|Spring|Winter)\s+\d{4}.*)$/i;
  lines = lines.map((l) => {
    if (l.startsWith("  •") || isSectionHeader(l)) return l;
    for (const re of [LOCATION_TAIL, DATE_TAIL, YEAR_RANGE_TAIL, SEASON_TAIL]) {
      const m = l.match(re);
      if (m) return `${m[1]!.trimEnd()} | ${m[2]!.trimStart()}`;
    }
    return l;
  });

  const result: string[] = [];
  for (const line of lines) {
    if (isSectionHeader(line)) {
      if (result.length > 0 && result[result.length - 1] !== "") result.push("");
      result.push(line, "");
    } else {
      result.push(line);
    }
  }

  const collapsed: string[] = [];
  for (const line of result) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  return collapsed.join("\n").trim();
}

// ── PDF (pdfjs-dist v3) ───────────────────────────────────────────────────────

/** A piece of a PDF page's text, as pdf.js gives it. transform is [scaleX, skewX, skewY, scaleY, x, y]. */
export interface PdfTextItem {
  str?: string;
  transform: number[];
  /** Its width on the page, in points. */
  width?: number;
}

/**
 * A page's text, one line per row of items. Items are sorted top to bottom
 * (PDF y grows upwards), then left to right, and those within 3 points of each
 * other's y are one line. A gap of more than two characters' width between
 * items is a right-aligned column, such as dates or a location: it's kept as
 * a run of spaces, which cleanResumeText turns into " | ".
 */
export function pageText(allItems: PdfTextItem[]): string {
  const items = allItems.filter((item) => item.str);
  const sorted = [...items].sort((a, b) => {
    const dy = (b.transform[5] ?? 0) - (a.transform[5] ?? 0);
    return Math.abs(dy) > 2 ? dy : (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
  });
  const lines: string[] = [];
  let line = "";
  let lastY = sorted[0]?.transform[5] ?? 0;
  let lastEnd: number | null = null;
  for (const item of sorted) {
    const y = item.transform[5] ?? lastY;
    const x = item.transform[4] ?? 0;
    if (Math.abs(y - lastY) > 3 && line) {
      lines.push(line.trim());
      line = "";
      lastY = y;
      lastEnd = null;
    }
    // A whitespace item only separates: the gap is measured from the last
    // word's end, since pdf.js may fill a right-aligned column's gap with one.
    if (!item.str!.trim()) continue;
    if (line) {
      const fontSize = Math.abs(item.transform[0] ?? 10) || 10;
      line += lastEnd !== null && x - lastEnd > fontSize * 2 ? "     " : " ";
    }
    line += item.str!.trim();
    lastEnd = item.width !== undefined ? x + item.width : null;
  }
  if (line) lines.push(line.trim());
  return lines.filter(Boolean).join("\n");
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // The worker that matches the installed pdfjs-dist, bundled with the app.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.js", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const pages: string[] = [];
    let length = 0;
    // Only the first MAX_FILE_TEXT characters are kept, so stop reading once
    // there are that many, rather than parsing every page of a long PDF.
    for (let i = 1; i <= pdf.numPages && length <= MAX_FILE_TEXT; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      // Each item's transform is [scaleX, skewX, skewY, scaleY, x, y]. Sort
      // top to bottom (PDF y grows upwards), then left to right, and join
      // items within 3 points of each other's y into one line.
      const text = pageText(content.items as PdfTextItem[]);
      pages.push(text);
      length += text.length;
    }
    return pages.filter(Boolean).join("\n\n");
  } finally {
    await pdf.destroy();
  }
}

// ── Word (mammoth) ────────────────────────────────────────────────────────────

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
}

// ── PowerPoint (JSZip and the slides' XML) ────────────────────────────────────

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? "";
    const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

/**
 * The most slide XML read from one PowerPoint file, in characters: far more
 * than a real deck's text needs, so a small file that unzips to gigabytes (a
 * zip bomb) can't freeze the page.
 */
const MAX_PPTX_XML = 20_000_000;

/**
 * A zipped file's text, up to `max` characters: unzipped as a stream that's
 * paused once there's enough, rather than all at once. JSZip's types leave
 * out internalStream, which its documentation describes.
 */
function readCapped(entry: JSZip.JSZipObject, max: number): Promise<string> {
  const streamable = entry as JSZip.JSZipObject & { internalStream(type: "string"): JSZip.JSZipStreamHelper<string> };
  return new Promise((resolve, reject) => {
    let text = "";
    const stream = streamable.internalStream("string");
    stream
      .on("data", (chunk) => {
        text += chunk;
        if (text.length >= max) {
          stream.pause();
          resolve(text.slice(0, max));
        }
      })
      .on("error", reject)
      .on("end", () => resolve(text))
      .resume();
  });
}

async function parsePptx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideNumber = (name: string) => parseInt(name.match(/slide(\d+)\.xml$/)?.[1] ?? "0", 10);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  let budget = MAX_PPTX_XML;
  for (const name of slideNames) {
    if (budget <= 0) break;
    const xml = await readCapped(zip.files[name]!, budget);
    budget -= xml.length;
    const text = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g))
      .map((m) => decodeXmlEntities(m[1]!))
      .join(" ")
      .trim();
    if (text) slides.push(text);
  }
  return slides.join("\n\n");
}
