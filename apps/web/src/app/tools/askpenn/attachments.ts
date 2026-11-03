// Turning the files a user attaches, pastes or drops into AskPenn attachments,
// in the browser: images shrunk to no more than Claude reads, PDFs as base64,
// and text files as their text. Each failure is an Error whose message is shown.

import { MAX_IMAGE_BYTES, base64Bytes, fileType, imageFitSize } from "@penntools/core/ai/attachments";
import type { AIImageType } from "@penntools/core/ai/attachments";
import type { Attachment, AttachmentLimits } from "@penntools/tool-askpenn";

/** Files that are text whatever type the browser reports (it often reports none for code). */
const TEXT_EXTENSIONS = [
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "css", "yaml", "yml", "toml", "ini", "log",
  "tex", "bib", "sql", "sh", "py", "r", "m", "js", "jsx", "ts", "tsx", "java", "c", "h", "cpp", "hpp", "cs", "go",
  "rb", "rs", "php", "swift", "kt",
];

/** For the file picker. */
export const ACCEPT = ["image/*", "application/pdf", ".pdf", "text/*", ...TEXT_EXTENSIONS.map((ext) => `.${ext}`)].join(",");

function extension(name: string): string {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

function isText(file: File): boolean {
  return file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSIONS.includes(extension(file.name));
}

/** The blob's bytes as base64, without the data: prefix. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The file's text. Excel saves CSV as Windows-1252 and "Unicode Text" as
 * UTF-16, so those are read too: UTF-16 by its byte-order mark, and anything
 * that isn't valid UTF-8 as Windows-1252.
 */
async function readText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** How many pages the PDF has, with pdf.js, which loads only when a PDF is attached. */
async function pdfPageCount(file: File): Promise<number> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.js", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

function encode(canvas: HTMLCanvasElement, type: AIImageType, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The image as Claude would read it: sent untouched, as its real type, if
 * that's a supported type and already within Claude's limits, so nothing is
 * lost; otherwise redrawn at imageFitSize(). Photos are re-encoded as JPEG,
 * everything else as PNG (sharper for screenshots and text), falling back to
 * JPEG if the PNG is too big.
 */
async function prepareImage(file: File, name: string, realType: AIImageType | null): Promise<Attachment> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${name} couldn't be read. Try a JPEG or PNG instead.`);
  }
  const { width, height } = imageFitSize(bitmap.width, bitmap.height);
  const unchanged = width === bitmap.width && height === bitmap.height;

  if (realType && unchanged && file.size <= MAX_IMAGE_BYTES) {
    bitmap.close();
    return { name, mediaType: realType, data: await toBase64(file) };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const draw = (background?: string) => {
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
  };

  let type: AIImageType = realType === "image/jpeg" || !realType ? "image/jpeg" : "image/png";
  draw(type === "image/jpeg" ? "#fff" : undefined); // JPEG has no transparency
  let blob = await encode(canvas, type, 0.92);
  if (blob && blob.size > MAX_IMAGE_BYTES && type === "image/png") {
    type = "image/jpeg";
    draw("#fff");
    blob = await encode(canvas, type, 0.92);
  }
  bitmap.close();
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error(`${name} is too large to send.`);
  return { name, mediaType: type, data: await toBase64(blob) };
}

/**
 * The file as an attachment, or an Error saying why it can't be one. Checks
 * what can be checked of one file on its own; addFiles checks them together.
 */
export async function readAttachment(file: File, limits: AttachmentLimits): Promise<Attachment> {
  const name = file.name || "Pasted image";

  if (name.length > limits.nameLength) {
    throw new Error(`${name.slice(0, 40)}… has a name over ${limits.nameLength} characters. Rename it and attach it again.`);
  }
  if (file.size === 0) throw new Error(`${name} is empty.`);
  // Decided by the real type first: the browser's comes from the extension, which may be wrong or missing.
  const realType = fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (realType === "application/pdf" || file.type === "application/pdf" || extension(name) === "pdf") {
    if (realType !== "application/pdf") throw new Error(`${name} isn't a valid PDF.`);
    let pages: number;
    try {
      pages = await pdfPageCount(file);
    } catch {
      throw new Error(`${name} couldn't be read as a PDF.`);
    }
    if (pages > limits.pdfPages) throw new Error(`${name} has ${pages} pages; PDFs can have at most ${limits.pdfPages}.`);
    return { name, mediaType: "application/pdf", data: await toBase64(file) };
  }
  if (realType) return prepareImage(file, name, realType);
  if (isText(file)) {
    const text = await readText(file);
    if (text.includes("\u0000")) throw new Error(`${name} doesn't look like a text file.`);
    if (!text.trim()) throw new Error(`${name} is empty.`);
    return { name, mediaType: "text/plain", data: text };
  }
  // Other images (HEIC, AVIF, …) are converted, if the browser can read them.
  if (file.type.startsWith("image/")) return prepareImage(file, name, null);
  throw new Error(`${name} isn't an image, PDF or text file.`);
}

/**
 * `name`, numbered if a file of the message already has it: browsers name
 * every pasted image image.png, and the model tells files apart by name.
 */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const numbered = `${base} (${n})${ext}`;
    if (!taken.includes(numbered)) return numbered;
  }
}

/** The attachment's size as checkRequest counts it: bytes, or characters for text. */
export function attachmentSize(attachment: Attachment): number {
  return attachment.mediaType === "text/plain" ? attachment.data.length : base64Bytes(attachment.data);
}
