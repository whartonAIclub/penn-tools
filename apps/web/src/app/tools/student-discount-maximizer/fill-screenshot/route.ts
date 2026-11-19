// POST /tools/student-discount-maximizer/fill-screenshot — a draft of the Add
// a deal form from a screenshot or photo, with the AI API (free credit, then
// the student's own key).
//
// Body: { provider, screenshot: { mediaType, data } }, the image as base64.
// A route rather than a server action, since Next.js refuses server action
// requests over 1 MB. Answers with the same ActionResult the server actions
// return; a body over MAX_SCREENSHOT_REQUEST_BYTES gets a 413.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_SCREENSHOT_REQUEST_BYTES,
  checkScreenshot,
  fillFromScreenshot,
  type Screenshot,
} from "@penntools/tool-student-discount-maximizer";
import { getAI } from "@/lib/ai";
import { signInRequired } from "@/lib/auth";
import { readBodyText } from "@/lib/readBody";

function fail(message: string, status: number): Response {
  return Response.json({ ok: false, error: { message } }, { status });
}

export async function POST(req: NextRequest): Promise<Response> {
  const ai = await getAI("student-discount-maximizer");
  if (!ai) return signInRequired();

  const text = await readBodyText(req, MAX_SCREENSHOT_REQUEST_BYTES);
  if (text === null) return fail("That image is too big. Crop it to the deal and try again.", 413);
  let body: { provider?: unknown; screenshot?: unknown } = {};
  try {
    body = (JSON.parse(text) as typeof body | null) ?? {};
  } catch {
    // not JSON: checkScreenshot says what's missing
  }
  const problem = checkScreenshot(body.screenshot);
  if (problem) return fail(problem, 400);
  const { mediaType, data } = body.screenshot as Screenshot;

  try {
    // The AI API checks provider itself.
    const draft = await fillFromScreenshot(ai, body.provider as AIProvider, { mediaType, data });
    return Response.json({ ok: true, data: draft });
  } catch (error) {
    if (isAIError(error)) return Response.json({ ok: false, error: error.toJSON() });
    console.error("[student-discount-maximizer] screenshot fill failed", error);
    return fail("Something went wrong. Try again.", 500);
  }
}
