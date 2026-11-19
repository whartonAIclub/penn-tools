// Fills in the Add a deal form from a screenshot or photo of a deal (an ad, an
// email, a web page, a sign in a shop window), with the AI API (free credit,
// then the student's own key). Like fillFromText, nothing here is saved: the
// student checks the result first.
//
// The page sends the image to the tool's fill-screenshot route, not a server
// action, since Next.js refuses server action requests over 1 MB.

import type { AI, AIMessage, AIProvider } from "@penntools/core/ai";
import { AI_IMAGE_TYPES, base64Bytes, base64FileType, isBase64 } from "@penntools/core/ai/attachments";
import { DealDraft, FILL_SYSTEM_PROMPT, fitDraft } from "./fillFromText.js";

/** The image types the AI API reads. */
export const SCREENSHOT_TYPES = AI_IMAGE_TYPES;
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number];

/**
 * Largest image sent, in bytes. The page shrinks bigger ones first, so this
 * is only reached by a very detailed photo; well under the AI API's 7 MB.
 */
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/** Largest request the fill-screenshot route reads: the image as base64, plus room for the rest. */
export const MAX_SCREENSHOT_REQUEST_BYTES = Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 + 4096;

export interface Screenshot {
  mediaType: ScreenshotType;
  /** The image's bytes, base64-encoded, without a data: prefix. */
  data: string;
}

/** Why the screenshot can't be sent, or null if it's fine. */
export function checkScreenshot(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "Drop a screenshot or photo first.";
  const { mediaType, data } = value as Record<string, unknown>;
  if (!SCREENSHOT_TYPES.includes(mediaType as ScreenshotType)) return "Use a PNG, JPEG, WebP or GIF image.";
  // The AI API also rejects an image whose bytes aren't the type it's labelled.
  if (typeof data !== "string" || !data || !isBase64(data) || base64FileType(data) !== mediaType) {
    return "That image couldn't be read. Try another one.";
  }
  if (base64Bytes(data) > MAX_SCREENSHOT_BYTES) return "That image is too big. Crop it to the deal and try again.";
  return null;
}

/** The message carrying the image: an image part, then the instruction. */
export function imageMessage(screenshot: Screenshot): AIMessage {
  return {
    role: "user",
    content: [
      { type: "image", mediaType: screenshot.mediaType, data: screenshot.data },
      { type: "text", text: "This is a screenshot or photo of a student deal. Fill in the form from what it shows." },
    ],
  };
}

/**
 * The deal shown in `screenshot`, as a draft for the form (see fitDraft),
 * without a link: one can't be checked against an image, and the model has
 * made up likely-looking links for screenshots that had none. Students paste
 * the link themselves.
 */
export async function fillFromScreenshot(ai: AI, provider: AIProvider, screenshot: Screenshot): Promise<DealDraft> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: DealDraft,
    system: FILL_SYSTEM_PROMPT,
    messages: [imageMessage(screenshot)],
  });
  return { ...fitDraft(object), url: null };
}
