// Turning screenshots a user pastes, drops or picks into images for scoring, in
// the browser: shrunk to no more than Claude reads, as AskPenn's attachments.ts
// does for images. Each failure is an Error whose message is shown.

import { MAX_IMAGE_BYTES, fileType, imageFitSize } from "@penntools/core/ai/attachments";
import type { AIImageType } from "@penntools/core/ai/attachments";
import type { Screenshot } from "@penntools/tool-recruiting-helper";

/** For the file picker. */
export const ACCEPT = "image/*";

/** The blob's bytes as base64, without the data: prefix. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function encode(canvas: HTMLCanvasElement, type: AIImageType, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The screenshot as Claude would read it: sent untouched if it's a supported
 * type already within Claude's limits; otherwise redrawn at imageFitSize() as
 * PNG (sharp for text), or JPEG if the PNG is too big. Other image types the
 * browser can open (HEIC, AVIF) are converted the same way.
 */
export async function readScreenshot(file: File): Promise<Screenshot> {
  const name = file.name || "The pasted image";
  if (!file.type.startsWith("image/") && file.type !== "") throw new Error(`${name} isn't an image.`);
  if (file.size === 0) throw new Error(`${name} is empty.`);

  // The real type, from the file's first bytes: the browser's comes from the extension.
  const found = fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  const realType = found === "application/pdf" ? null : found;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${name} couldn't be read. Try a PNG or JPEG screenshot instead.`);
  }
  const { width, height } = imageFitSize(bitmap.width, bitmap.height);

  if (realType && width === bitmap.width && height === bitmap.height && file.size <= MAX_IMAGE_BYTES) {
    bitmap.close();
    return { mediaType: realType, data: await toBase64(file) };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff"; // JPEG has no transparency
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let type: AIImageType = "image/png";
  let blob = await encode(canvas, type);
  if (!blob || blob.size > MAX_IMAGE_BYTES) {
    type = "image/jpeg";
    blob = await encode(canvas, type, 0.92);
  }
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error(`${name} is too large to send.`);
  return { mediaType: type, data: await toBase64(blob) };
}

/** The screenshot as an <img> src. */
export function screenshotSrc({ mediaType, data }: Screenshot): string {
  return `data:${mediaType};base64,${data}`;
}
