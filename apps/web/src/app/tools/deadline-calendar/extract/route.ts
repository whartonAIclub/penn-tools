// POST /tools/deadline-calendar/extract — reads one syllabus PDF's deadlines
//
// Body: { provider, file: { name, data } }, the PDF as base64. A route rather
// than a server action, since syllabi often pass the 1 MB a server action
// takes. A body over MAX_REQUEST_BYTES gets a 413, and a PDF that doesn't
// open or has over MAX_PDF_PAGES pages a 400. The reply is { result } with the
// SyllabusDeadlines, or { error: { kind?, message } } (kind is the AIError's).

import type { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_PDF_PAGES,
  MAX_REQUEST_BYTES,
  checkUpload,
  extractDeadlines,
  todayInPhiladelphia,
  type SyllabusFile,
} from "@penntools/tool-deadline-calendar";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";

function failure(message: string, status: number): Response {
  return Response.json({ error: { message } }, { status });
}

/** Why the PDF can't be read, or null: it must open and have at most MAX_PDF_PAGES pages. */
async function checkPdf({ name, data }: SyllabusFile): Promise<string | null> {
  const task = getDocument({ data: new Uint8Array(Buffer.from(data, "base64")), isEvalSupported: false, verbosity: 0 });
  let pages: number;
  try {
    pages = (await task.promise).numPages;
  } catch {
    return `${name} couldn't be read as a PDF.`;
  } finally {
    await task.destroy();
  }
  if (pages > MAX_PDF_PAGES) return `${name} has ${pages} pages; syllabi can have at most ${MAX_PDF_PAGES}.`;
  return null;
}

/**
 * The body as text, or null once it's over MAX_REQUEST_BYTES. Counted while
 * reading, since Content-Length can be missing or wrong, so an oversized body
 * is refused without holding it all.
 */
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
  if (!(await getCurrentUser())) return signInRequired();

  const text = await readBody(req);
  if (text === null) return failure("This file is too large to upload.", 413);
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text) as Record<string, unknown> | null;
  } catch {
    // not JSON: checkUpload says what's missing
  }
  const problem = checkUpload(body?.file);
  if (problem) return failure(problem, 400);
  // Only the fields checkUpload checked, whatever else the browser sent. The AI API checks provider itself.
  const { name, data } = body!.file as SyllabusFile;
  const file = { name, data };
  const pdfProblem = await checkPdf(file);
  if (pdfProblem) return failure(pdfProblem, 400);

  try {
    const result = await extractDeadlines((await getAI())!, body!.provider as AIProvider, file, todayInPhiladelphia(), req.signal);
    return Response.json({ result });
  } catch (error) {
    if (isAIError(error)) return Response.json({ error: error.toJSON() }, { status: 502 });
    console.error("[deadline-calendar] extraction failed", error);
    return failure("Something went wrong. Try again.", 500);
  }
}
