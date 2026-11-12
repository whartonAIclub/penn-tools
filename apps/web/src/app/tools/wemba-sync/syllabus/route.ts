// POST /tools/wemba-sync/syllabus — reads a course's syllabus and saves it
//
// Body: { provider, filename, data }, the file as base64 (no data: prefix), as
// for extract/route.ts: a PDF, or a Word document (.docx), whose text is sent
// to the AI instead, since the AI API doesn't take Word files (see docx.ts).
// The AI sorts the syllabus into categories (see
// tools/wemba-sync/src/syllabus.ts), and it's saved for the signed-in student,
// replacing their earlier syllabus for the same course. A body over
// MAX_REQUEST_BYTES gets a 413; a file that isn't a PDF or .docx, doesn't
// open, or is over MAX_SYLLABUS_PAGES pages or MAX_SYLLABUS_TEXT characters,
// or a new course past MAX_SYLLABI, a 400; storage that isn't set up, a 503.
// Replies { saved } or { error: { message, kind? } }, where kind is the
// AIError's.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_SYLLABUS_PAGES,
  MAX_SYLLABUS_TEXT,
  TooManySyllabiError,
  checkUpload,
  extractSyllabus,
  listSyllabi,
  saveSyllabus,
  uploadKind,
  type SyllabusDocument,
} from "@penntools/tool-wemba-sync";
import { docxText } from "@penntools/tool-wemba-sync/docx";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { STORAGE_UNAVAILABLE, db } from "../db";
import { failure, pageCount, readBody, today } from "../upload";

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  const ai = await getAI();
  if (!ai) return signInRequired();

  const text = await readBody(req);
  if (text === null) return failure("This file is too large to read.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failure("Send the syllabus as JSON.", 400);
  }
  const problem = checkUpload(body, ["pdf", "docx"]);
  if (problem) return failure(problem, 400);
  const { provider, filename, data } = body as { provider: AIProvider; filename: string; data: string };

  let document: SyllabusDocument;
  if (uploadKind(filename, data) === "pdf") {
    const pages = await pageCount(data);
    if (pages === null) return failure(`${filename} couldn't be read as a PDF.`, 400);
    if (pages > MAX_SYLLABUS_PAGES) {
      return failure(`${filename} has ${pages} pages; syllabi can have at most ${MAX_SYLLABUS_PAGES}.`, 400);
    }
    document = { kind: "pdf", filename, data };
  } else {
    const text = docxText(new Uint8Array(Buffer.from(data, "base64")));
    if (text === null) return failure(`${filename} couldn't be read as a Word document. Try saving it as a PDF.`, 400);
    if (!text) return failure(`${filename} has no text.`, 400);
    if (text.length > MAX_SYLLABUS_TEXT) return failure(`${filename} is too long to read as a syllabus.`, 400);
    document = { kind: "text", filename, text };
  }

  // Check storage works before the AI reads the file, so the student isn't
  // charged for a syllabus that can't be saved.
  const sql = db();
  try {
    if (!sql) throw new Error("DATABASE_URL is not set");
    await listSyllabi(sql, user.id);
  } catch (error) {
    console.error("[wemba-sync] syllabus storage unavailable", error);
    return failure(STORAGE_UNAVAILABLE, 503);
  }

  try {
    // The AI API checks provider itself.
    const syllabus = await extractSyllabus(ai, provider, document, today());
    return Response.json({ saved: await saveSyllabus(sql, user.id, filename, syllabus) });
  } catch (error) {
    if (isAIError(error)) return failure(error.message, 502, error.kind);
    if (error instanceof TooManySyllabiError) return failure(error.message, 400);
    throw error;
  }
}
