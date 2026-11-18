// POST /tools/resume-customizer/tailor — tailors the resume to the job.
//
// A route rather than a server action so the page can cancel it: the page
// aborts its fetch, req.signal fires, and the AI call stops mid-reply (the AI
// API records only what was used). Body: { provider, resume, jobDescription,
// files }, checked by checkTailorInput; one over MAX_TAILOR_BYTES gets a 413.
// The reply is an ActionResult, as the page's server actions return: the
// tailored ResumeDoc, or an error (an AIError's kind included) to show.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { MAX_TAILOR_BYTES, checkTailorInput, tailorResume, type TailorInput } from "@penntools/tool-resume-customizer";
import type { ResumeDoc } from "@penntools/tool-resume-customizer/resume";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import type { ActionResult } from "../actions";

function result(body: ActionResult<ResumeDoc>, status = 200): Response {
  return Response.json(body, { status });
}

/**
 * The body as text, or null once it's over MAX_TAILOR_BYTES. Counted while
 * reading, since Content-Length can be missing or wrong, so an oversized body
 * is refused without holding it all.
 */
async function readBody(req: NextRequest): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_TAILOR_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_TAILOR_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  const ai = (await getAI("resume-customizer"))!;

  const text = await readBody(req);
  if (text === null) return result({ ok: false, error: { message: "Your files are too large to send. Remove some and try again." } }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: checkTailorInput says so
  }
  const problem = checkTailorInput(body);
  if (problem) return result({ ok: false, error: { message: problem } }, 400);
  // The AI API checks provider itself.
  const { provider, resume, jobDescription, files } = body as TailorInput & { provider: AIProvider };

  try {
    // Only the fields checkTailorInput checked, whatever else the browser sent.
    const input: TailorInput = { resume, jobDescription, files: files.map(({ name, tag, text }) => ({ name, tag, text })) };
    return result({ ok: true, data: await tailorResume(ai, provider, input, req.signal) });
  } catch (error) {
    // Cancelled: the page has stopped listening, so there's no one to answer.
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (isAIError(error)) return result({ ok: false, error: error.toJSON() });
    throw error;
  }
}
