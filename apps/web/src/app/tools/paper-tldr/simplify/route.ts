// POST /tools/paper-tldr/simplify — turns a paper's text into a one-page summary.
//
// Body: { provider, text }, where text is the PDF's text, extracted in the
// browser. A route rather than a server action because Next.js refuses server
// action requests over 1 MB, and a long paper's text can be bigger.
//
// A bad request gets a JSON SummaryResult with an error status. Otherwise the
// reply is a stream of server-sent events (see SimplifyEvent in ../types.ts):
// a "working" event every few seconds while the summary is written (a long
// paper can take minutes, and a silent connection risks a proxy's time limit),
// then one "result" event. AIErrors come back as data in that result. Leaving
// the page aborts req.signal, which cancels the AI call.

import { NextResponse, type NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkPaperText, summarizePaper, MAX_PAPER_CHARS } from "@penntools/tool-paper-tldr";
import { getAI } from "@/lib/ai";
import { signInRequired } from "@/lib/auth";
import type { SimplifyEvent, SummaryResult } from "../types";

const TOOL_ID = "paper-tldr";
/** The page cuts text at MAX_PAPER_CHARS; this allows that even if every character takes 4 bytes. */
const MAX_REQUEST_BYTES = MAX_PAPER_CHARS * 4 + 10_000;
const HEARTBEAT_MS = 15_000;

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
  if (raw === null) return fail("That request is too large.", 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("The request wasn't valid JSON.", 400);
  }
  // JSON.parse accepts `null`, numbers and strings too; only an object has fields.
  if (typeof parsed !== "object" || parsed === null) return fail("The request wasn't valid.", 400);
  const body = parsed as { provider?: unknown; text?: unknown };

  const problem = checkPaperText(body.text);
  if (problem) return fail(problem, 400);
  if (typeof body.provider !== "string") return fail("Choose a model.", 400);
  // The AI API checks the provider itself.
  const provider = body.provider as AIProvider;
  const text = body.text as string;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SimplifyEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // closed because the browser disconnected
        }
      };
      const heartbeat = setInterval(() => send({ type: "working" }), HEARTBEAT_MS);
      try {
        const summary = await summarizePaper(ai, provider, text, req.signal);
        send({ type: "result", result: { ok: true, summary } });
      } catch (error) {
        if (req.signal.aborted) return; // the browser went away; nothing to report
        if (isAIError(error)) {
          send({ type: "result", result: { ok: false, error: error.toJSON() } });
        } else {
          console.error("[paper-tldr] summary failed", error);
          send({ type: "result", result: { ok: false, error: { message: "Something went wrong. Try again." } } });
        }
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed because the browser disconnected
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  });
}
