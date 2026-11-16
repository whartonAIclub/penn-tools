// POST /tools/due/read — reads a course outline PDF with the student's own AI key
//
// Body: { provider, filename, data } with the PDF as base64. A route rather
// than a server action, since Next.js refuses server action requests over
// 1 MB. Responds with { course, deadlines, recurring } (see readOutline in
// tools/due/src/outline.ts), or { error } with an AIError's data or a message:
// 413 for a body over MAX_REQUEST_BYTES, 400 for anything but a readable PDF
// of at most MAX_PDF_PAGES pages, 502 when the AI API fails.

import type { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { MAX_PDF_PAGES, MAX_REQUEST_BYTES, checkOutlineRequest, readOutline } from "@penntools/tool-due";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";

/** Why the PDF can't be read, or null: it must open and have at most MAX_PDF_PAGES pages. */
async function checkPdf(filename: string, data: string): Promise<string | null> {
  const task = getDocument({ data: new Uint8Array(Buffer.from(data, "base64")), isEvalSupported: false, verbosity: 0 });
  let pages: number;
  try {
    pages = (await task.promise).numPages;
  } catch {
    return `${filename} couldn't be opened as a PDF.`;
  } finally {
    await task.destroy();
  }
  if (pages > MAX_PDF_PAGES) return `${filename} has ${pages} pages; Due reads outlines of up to ${MAX_PDF_PAGES}.`;
  return null;
}

/** The body as text, or null once it's over MAX_REQUEST_BYTES, counted while reading (as AskPenn does). */
async function readBody(req: NextRequest): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_REQUEST_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
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

  const text = await readBody(req);
  if (text === null) return Response.json({ error: { message: "This file is too large." } }, { status: 413 });
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text) as Record<string, unknown> | null;
  } catch {
    // not JSON: checkOutlineRequest says what's missing
  }
  const problem = checkOutlineRequest(body ?? {});
  if (problem) return Response.json({ error: { message: problem } }, { status: 400 });
  const { provider, filename, data } = body as { provider: AIProvider; filename: string; data: string };

  const pdfProblem = await checkPdf(filename, data);
  if (pdfProblem) return Response.json({ error: { message: pdfProblem } }, { status: 400 });

  try {
    const { course, deadlines, recurring, usage } = await readOutline((await getAI())!, provider, { filename, data }, { signal: req.signal });
    console.info(`[due] read an outline: ${deadlines.length} deadlines, ${recurring.length} repeating, ${usage.inputTokens} in / ${usage.outputTokens} out tokens`);
    return Response.json({ course, deadlines, recurring });
  } catch (error) {
    if (isAIError(error)) return Response.json({ error: error.toJSON() }, { status: 502 });
    console.error("[due] reading an outline failed", error);
    return Response.json({ error: { message: "Something went wrong reading the outline. Try again." } }, { status: 500 });
  }
}
