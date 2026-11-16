// ─────────────────────────────────────────────────────────────────────────────
// Images and PDFs in AI API messages
//
// Both are sent inline as base64, in the request itself: nothing is uploaded
// to or stored at the provider. The limits are the stricter provider's, so one
// set works for both, and imageFitSize() lets a page shrink an image before
// sending it, to no more than Claude reads anyway.
//
// Also exported on its own as "@penntools/core/ai/attachments", which browser
// code can import without bundling zod.
// ─────────────────────────────────────────────────────────────────────────────

/** Image types both providers read. Anything else (HEIC, SVG, …) must be converted first. */
export const AI_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type AIImageType = (typeof AI_IMAGE_TYPES)[number];

/** The largest image, in bytes before base64: Claude's limit is 10 MB of base64. */
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

/**
 * The most of an image Claude reads: its long edge at most MAX_IMAGE_EDGE px,
 * and at most MAX_IMAGE_PATCHES patches of IMAGE_PATCH_SIZE px squared. Larger
 * images are downscaled by the provider, so shrinking them first loses nothing
 * on Claude (OpenAI's newest models can read more).
 */
export const MAX_IMAGE_EDGE = 2576;
export const MAX_IMAGE_PATCHES = 4784;
export const IMAGE_PATCH_SIZE = 28;

/**
 * The size to send a `width` × `height` image at: unchanged if Claude reads it
 * whole, otherwise the largest size with the same aspect ratio that it does.
 */
export function imageFitSize(width: number, height: number): { width: number; height: number } {
  const patches = (scale: number) =>
    Math.ceil(Math.round(width * scale) / IMAGE_PATCH_SIZE) * Math.ceil(Math.round(height * scale) / IMAGE_PATCH_SIZE);

  let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  if (patches(scale) > MAX_IMAGE_PATCHES) {
    // Start from the area that fits, then step down for patches rounded up at the edges.
    scale = Math.min(scale, Math.sqrt((MAX_IMAGE_PATCHES * IMAGE_PATCH_SIZE ** 2) / (width * height)));
    while (patches(scale) > MAX_IMAGE_PATCHES) scale *= 0.995;
  }
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * A file's real type from its first 12 bytes: one of AI_IMAGE_TYPES, a PDF, or
 * null for anything else. Browsers take a file's type from its extension,
 * which is often wrong: images saved from the web as .jpg are often WebP.
 */
export function fileType(bytes: Uint8Array): AIImageType | "application/pdf" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 3) === "\xff\xd8\xff") return "image/jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/** fileType() of base64 `data`, from its first 16 characters (12 bytes); null if they aren't base64. */
export function base64FileType(data: string): ReturnType<typeof fileType> {
  let head: string;
  try {
    head = atob(data.slice(0, 16));
  } catch {
    return null;
  }
  return fileType(Uint8Array.from(head, (char) => char.charCodeAt(0)));
}

/** Whether `data` is base64 without a data: prefix, as both providers take it inline. */
export function isBase64(data: string): boolean {
  return data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(data);
}

/** The size in bytes of base64 `data`, without decoding it. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}
