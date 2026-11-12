// POST /tools/recruiting-helper/resume — reads an uploaded PDF résumé and
// returns its text, for the profile's background box. Nothing is saved here:
// the user checks the text, then saves their profile. Word files never come
// here; the page reads them itself, so the server never unzips an upload.
//
// Body: { provider, name, data }, data being the file as base64. The PDF is
// read by the AI API, after checking it opens and has at most
// MAX_RESUME_PAGES pages.
//
// Responds { ok: true, text } or { ok: false, error: { kind?, message } }.

import type { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_RESUME_PAGES,
  MAX_RESUME_REQUEST_BYTES,
  checkResume,
  readPdfResume,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { fail, readJsonBody } from "../readBody";

/** The PDF's page count, or null if it doesn't open (as AskPenn's stream route checks PDFs). */
async function pdfPages(data: string): Promise<number | null> {
  const task = getDocument({ data: new Uint8Array(Buffer.from(data, "base64")), isEvalSupported: false, verbosity: 0 });
  try {
    return (await task.promise).numPages;
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const body = await readJsonBody(req, MAX_RESUME_REQUEST_BYTES);
  if (!body) return fail("That file is too large. Résumés must be under 5 MB.", 413);

  const problem = checkResume(body);
  if (problem) return fail(problem, 400);
  const file = { name: body["name"] as string, data: body["data"] as string };

  try {
    const pages = await pdfPages(file.data);
    if (pages === null) return fail(`${file.name} couldn't be opened as a PDF.`, 400);
    if (pages > MAX_RESUME_PAGES) {
      return fail(`${file.name} has ${pages} pages. Upload a résumé of at most ${MAX_RESUME_PAGES} pages.`, 400);
    }
    const { provider } = body;
    if (!AI_PROVIDERS.includes(provider as AIProvider)) return fail("Pick an AI provider.", 400);
    const text = await readPdfResume((await getAI("recruiting-helper"))!, provider as AIProvider, file);
    return text
      ? Response.json({ ok: true, text })
      : fail(`${file.name} doesn't look like a résumé, or its text couldn't be read.`, 422);
  } catch (error) {
    if (isAIError(error)) return Response.json({ ok: false, error: error.toJSON() }, { status: 502 });
    throw error;
  }
}
