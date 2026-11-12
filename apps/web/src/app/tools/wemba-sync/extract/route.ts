// POST /tools/wemba-sync/extract — reads a class weekend schedule PDF
//
// Body: { provider, filename, data }, the PDF as base64 (no data: prefix). A
// route rather than a server action, since a PDF can be larger than server
// actions accept. A body over MAX_REQUEST_BYTES gets a 413; a file that isn't
// a PDF, doesn't open or has over MAX_PDF_PAGES pages, a 400. Replies
// { schedule } or { error: { message, kind? } }, where kind is the AIError's.

import type { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_PDF_PAGES,
  MAX_REQUEST_BYTES,
  applyCorrections,
  checkUpload,
  extractWeekend,
} from "@penntools/tool-wemba-sync";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";

function failure(message: string, status: number, kind?: string): Response {
  return Response.json({ error: { message, kind } }, { status });
}

/** How many pages the PDF has, or null if it doesn't open. */
async function pageCount(data: string): Promise<number | null> {
  const task = getDocument({ data: new Uint8Array(Buffer.from(data, "base64")), isEvalSupported: false, verbosity: 0 });
  try {
    return (await task.promise).numPages;
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

/**
 * The body as text, or null once it's over MAX_REQUEST_BYTES. Counted while
 * reading, since Content-Length can be missing or wrong.
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

/** Today in Philadelphia, YYYY-MM-DD: the AI uses it for the year the schedule leaves out. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await getCurrentUser())) return signInRequired();
  const ai = await getAI();
  if (!ai) return signInRequired();

  const text = await readBody(req);
  if (text === null) return failure("This file is too large to read.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failure("Send the schedule as JSON.", 400);
  }
  const problem = checkUpload(body);
  if (problem) return failure(problem, 400);
  const { provider, filename, data } = body as { provider: AIProvider; filename: string; data: string };

  const pages = await pageCount(data);
  if (pages === null) return failure(`${filename} couldn't be read as a PDF.`, 400);
  if (pages > MAX_PDF_PAGES) return failure(`${filename} has ${pages} pages; schedules can have at most ${MAX_PDF_PAGES}.`, 400);

  try {
    // The AI API checks provider itself.
    // Then fill in what the PDF leaves out (corrections.ts).
    const schedule = applyCorrections(await extractWeekend(ai, provider, { filename, data }, today()));
    return Response.json({ schedule });
  } catch (error) {
    if (isAIError(error)) return failure(error.message, 502, error.kind);
    throw error;
  }
}
