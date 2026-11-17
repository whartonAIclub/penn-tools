// Turning what a user pastes, drops or attaches into the AI intake, in the
// browser: screenshots shrunk to no more than the AI reads (adapted from
// AskPenn's attachments.ts), and text files read into the notes box. Each
// failure is an Error whose message is shown.

import { MAX_IMAGE_BYTES, fileType, imageFitSize } from "@penntools/core/ai/attachments";
import type { AIImageType } from "@penntools/core/ai/attachments";
import type { IntakeScreenshot } from "@penntools/tool-penn-pals";

/** Text files whose contents go straight into the notes box. */
const TEXT_EXTENSIONS = ["txt", "md", "markdown", "text", "rtf"];

/** For the file picker: images (the photo library on a phone) and notes files. */
export const ACCEPT = ["image/*", ...TEXT_EXTENSIONS.map((ext) => `.${ext}`)].join(",");

function extension(name: string): string {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

export function isNotesFile(file: File): boolean {
  return file.type === "text/plain" || file.type === "text/markdown" || TEXT_EXTENSIONS.includes(extension(file.name));
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

/** A notes file's text: UTF-8, UTF-16 by its byte-order mark, or else Windows-1252 (old Windows apps). */
export async function readNotesFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes);
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  if (text.includes("\u0000")) throw new Error(`${file.name} doesn't look like a text file.`);
  if (!text.trim()) throw new Error(`${file.name} is empty.`);
  return text;
}

function encode(canvas: HTMLCanvasElement, type: AIImageType, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The screenshot as the AI would read it: sent untouched if it's a supported
 * type already within the AI's limits; otherwise redrawn at imageFitSize(), as
 * PNG (sharpest for text), or JPEG for photos or when the PNG is too big.
 * HEIC and other types the browser can open are converted the same way.
 */
export async function readScreenshot(file: File, name: string): Promise<IntakeScreenshot> {
  if (file.size === 0) throw new Error(`${name} is empty.`);
  const realType = fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (realType === "application/pdf") throw new Error(`${name} is a PDF. Take a screenshot of it instead.`);
  if (!realType && !file.type.startsWith("image/")) throw new Error(`${name} isn't an image.`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${name} couldn't be read. Try a PNG or JPEG instead.`);
  }
  const { width, height } = imageFitSize(bitmap.width, bitmap.height);
  if (realType && width === bitmap.width && height === bitmap.height && file.size <= MAX_IMAGE_BYTES) {
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

/** `name`, numbered if taken: browsers name every pasted image image.png. */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const numbered = `${base} (${n})${ext}`;
    if (!taken.includes(numbered)) return numbered;
  }
}
