// Turns a dropped, pasted or chosen screenshot or photo into what the
// screenshot fill-in sends: base64 of an image the AI API reads. Images Claude
// would read whole go as they are, so text stays sharp; bigger ones are
// redrawn at imageFitSize() as JPEG. Other images the browser can open (HEIC
// photos in Safari, AVIF…) are converted to JPEG. Runs in the browser.

import { AI_IMAGE_TYPES, fileType, imageFitSize, type AIImageType } from "@penntools/core/ai/attachments";
import type { Screenshot } from "@penntools/tool-student-discount-maximizer";

const UNREADABLE = "That image couldn't be read. Try a screenshot, or a PNG or JPEG.";

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** The image ready to send, or a message saying why it can't be used. */
export async function prepareScreenshot(file: File, maxBytes: number): Promise<Screenshot | string> {
  if (!file.type.startsWith("image/")) return "Drop an image: a screenshot or a photo.";
  // The real type, from the file's first bytes: a .jpg saved from the web is
  // often WebP, and the AI API turns away an image labelled with the wrong type.
  const real = fileType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  const sendable = AI_IMAGE_TYPES.includes(real as AIImageType) ? (real as AIImageType) : null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return UNREADABLE;
  }
  try {
    const size = imageFitSize(bitmap.width, bitmap.height);
    const whole = size.width === bitmap.width && size.height === bitmap.height;
    if (sendable && whole && file.size <= maxBytes) return { mediaType: sendable, data: await toBase64(file) };

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return UNREADABLE;
    // JPEG has no transparency: paint white first so see-through areas aren't black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.8, 0.65, 0.5]) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= maxBytes) return { mediaType: "image/jpeg", data: await toBase64(blob) };
    }
    return "That image is too big. Crop it to the deal and try again.";
  } finally {
    bitmap.close();
  }
}
