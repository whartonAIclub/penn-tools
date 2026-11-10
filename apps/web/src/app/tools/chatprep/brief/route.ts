// POST /tools/chatprep/brief — makes a brief for one coffee chat
//
// Body: { provider, student, chat } (BriefRequest in tools/chatprep/src/
// brief.ts). Uploaded files are JSON too, as base64, so there's no multipart
// parsing. This is a route rather than a server action because Next.js
// refuses server action requests over 1 MB, and a resume PDF plus a few
// screenshots is often more. A body over MAX_REQUEST_BYTES gets a 413, and a
// PDF that doesn't open or has over MAX_PDF_PAGES pages a 400.
//
// The response is { brief, text } (text is the brief for the copy button), or
// { error: { kind?, message } }: kind is the AIError kind when the AI API failed.

import type { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { isAIError } from "@penntools/core/ai";
import {
  MAX_PDF_PAGES,
  MAX_REQUEST_BYTES,
  briefToText,
  buildBrief,
  checkBriefRequest,
  type BriefRequest,
  type UploadedFile,
} from "@penntools/tool-chatprep";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

function error(message: string, status: number, kind?: string): Response {
  return Response.json({ error: { ...(kind && { kind }), message } }, { status });
}

/** Why one of the PDFs can't be sent, or null: each must open and have at most MAX_PDF_PAGES pages. */
async function checkPdfs(files: UploadedFile[]): Promise<string | null> {
  for (const { name, mediaType, data } of files) {
    if (mediaType !== "application/pdf") continue;
    const task = getDocument({ data: new Uint8Array(Buffer.from(data, "base64")), isEvalSupported: false, verbosity: 0 });
    let pages: number;
    try {
      pages = (await task.promise).numPages;
    } catch {
      return `${name} couldn't be read as a PDF.`;
    } finally {
      await task.destroy();
    }
    if (pages > MAX_PDF_PAGES) return `${name} has ${pages} pages; PDFs can have at most ${MAX_PDF_PAGES}.`;
  }
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
  const user = await getCurrentUser();
  const ai = user ? await getAI() : null;
  if (!ai) return error("Sign in with the button at the top right to use ChatPrep.", 401);

  const text = await readBody(req);
  if (text === null) return error("Your files are too large to send together. Remove one and try again.", 413);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: checkBriefRequest says what's missing
  }
  const problem = checkBriefRequest(body);
  if (problem) return error(problem, 400);

  // Only the fields checkBriefRequest checked, whatever else the browser sent.
  const { provider, student, chat } = body as BriefRequest;
  const keep = ({ name, mediaType, data }: UploadedFile): UploadedFile => ({ name, mediaType, data });
  const resumeFile = student.resumeFile ? keep(student.resumeFile) : null;
  const profileFiles = (chat.profileFiles ?? []).map(keep);
  const newsFiles = (chat.newsFiles ?? []).map(keep);

  const pdfProblem = await checkPdfs([...(resumeFile ? [resumeFile] : []), ...profileFiles, ...newsFiles]);
  if (pdfProblem) return error(pdfProblem, 400);

  const studentInput = { resume: student.resume ?? "", targetRoles: student.targetRoles, weighing: student.weighing ?? null, resumeFile };
  const chatInput = { profile: chat.profile ?? "", company: chat.company, news: chat.news ?? null, profileFiles, newsFiles };
  try {
    const brief = await buildBrief(ai, provider, studentInput, chatInput);
    return Response.json({ brief, text: briefToText(brief, chatInput.company) });
  } catch (err) {
    if (isAIError(err)) return Response.json({ error: err.toJSON() }, { status: 502 });
    console.error("[chatprep] brief failed", err);
    return error("Something went wrong. Try again.", 500);
  }
}
