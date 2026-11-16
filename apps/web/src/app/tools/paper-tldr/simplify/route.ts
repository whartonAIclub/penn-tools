// POST /tools/paper-tldr/simplify — turns a paper's text into a one-page summary.
//
// Body: { provider, text }, where text is the PDF's text, extracted in the
// browser. A route rather than a server action because Next.js refuses server
// action requests over 1 MB, and a long paper's text can come close. The reply
// is a SummaryResult (see ../types.ts); AIErrors come back as data.

import { NextResponse, type NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkPaperText, summarizePaper, MAX_PAPER_CHARS } from "@penntools/tool-paper-tldr";
import { getAI } from "@/lib/ai";
import { signInRequired } from "@/lib/auth";
import type { SummaryResult } from "../types";

const TOOL_ID = "paper-tldr";
/** Generous for MAX_PAPER_CHARS of text even if every character takes 4 bytes. */
const MAX_REQUEST_BYTES = MAX_PAPER_CHARS * 4 + 10_000;

function fail(message: string, status: number) {
  return NextResponse.json<SummaryResult>({ ok: false, error: { message } }, { status });
}

/** The body as text, or null once it's over MAX_REQUEST_BYTES, counted while reading. */
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

export async function POST(req: NextRequest) {
  const ai = await getAI(TOOL_ID);
  if (!ai) return signInRequired();

  const raw = await readBody(req);
  if (raw === null) return fail("That paper is too long to summarize.", 413);

  let body: { provider?: unknown; text?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return fail("The request wasn't valid JSON.", 400);
  }

  const problem = checkPaperText(body.text);
  if (problem) return fail(problem, 400);
  if (typeof body.provider !== "string") return fail("Choose a model.", 400);

  try {
    // The AI API checks the provider itself.
    const summary = await summarizePaper(ai, body.provider as AIProvider, body.text as string);
    return NextResponse.json<SummaryResult>({ ok: true, summary });
  } catch (error) {
    if (isAIError(error)) return NextResponse.json<SummaryResult>({ ok: false, error: error.toJSON() });
    throw error;
  }
}
