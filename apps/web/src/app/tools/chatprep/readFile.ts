// Turning a file the student uploads, drops or pastes into one ChatPrep can
// send, in the browser: images shrunk to no more than Claude reads, PDFs as
// base64. Each failure is an Error whose message is shown. Adapted from
// AskPenn's attachments.ts, without its text files.

import { MAX_IMAGE_BYTES, fileType, imageFitSize } from "@penntools/core/ai/attachments";
import type { AIImageType } from "@penntools/core/ai/attachments";
import type { FileLimits, UploadedFile } from "@penntools/tool-chatprep";

/** For the file picker. */
export const ACCEPT = "image/*,application/pdf,.pdf";

/** The blob's bytes as base64, without the data: prefix. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** How many pages the PDF has, with pdf.js, which loads only when a PDF is uploaded. */
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
 * The image as Claude would read it: sent untouched if it's a supported type
 * already within Claude's limits; otherwise redrawn at imageFitSize(), as PNG
 * (sharper for screenshots), or JPEG for photos or if the PNG is too big.
 */
async function prepareImage(file: File, name: string, realType: AIImageType | null): Promise<UploadedFile> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${name} couldn't be read. Try a PNG or JPEG instead.`);
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

/** The file ready to send, or an Error saying why it can't be. */
export async function readFile(file: File, limits: FileLimits): Promise<UploadedFile> {
  const name = file.name || "Pasted screenshot.png";
  if (name.length > limits.nameLength) throw new Error(`${name.slice(0, 40)}… has a name over ${limits.nameLength} characters. Rename it and upload it again.`);
  if (file.size === 0) throw new Error(`${name} is empty.`);

  // Decided by the real type first: the browser's comes from the extension, which may be wrong or missing.
  const realType = fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (realType === "application/pdf" || file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
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
  // Other images (HEIC, AVIF, …) are converted, if the browser can read them.
  if (file.type.startsWith("image/")) return prepareImage(file, name, null);
  throw new Error(`${name} isn't a PDF or an image. Upload a PDF, a screenshot, or paste the text instead.`);
}

/**
 * `name`, numbered if another file already has it: browsers name every
 * pasted screenshot image.png, and the AI tells files apart by name.
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
