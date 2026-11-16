// POST /tools/askpenn/stream — sends a message and streams AskPenn's reply
//
// Body: { chatId: string | null, provider, tier?, reasoning?, content,
// attachments? }; tier and reasoning default to AskPenn's (fast, low).
// Attachments are JSON too, images and PDFs as base64, so there's no
// multipart parsing; they go to the model inline and only their names are
// saved; a body over MAX_REQUEST_BYTES gets a 413, and a PDF that doesn't
// open or has over MAX_PDF_PAGES pages a 400. The response is
// server-sent events: { type: "chat", chatId } first (the new chat's id when
// chatId was null), then the reply's { type: "text", delta } events and a
// final { type: "done", result }, or { type: "error", error } if it fails.

import type { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider, AIReasoning, AITier } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  ChatNotFoundError,
  MAX_PDF_PAGES,
  MAX_REQUEST_BYTES,
  checkRequest,
  sendMessage,
  type Attachment,
} from "@penntools/tool-askpenn";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";

/** Why one of the PDFs can't be sent, or null: each must open and have at most MAX_PDF_PAGES pages. */
async function checkPdfs(attachments: Attachment[]): Promise<string | null> {
  for (const { name, mediaType, data } of attachments) {
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
  if (!user) return signInRequired();

  const sql = toolSql("askpenn");
  if (!sql) return Response.json({ error: "AskPenn's database is not configured." }, { status: 500 });

  const text = await readBody(req);
  if (text === null) return Response.json({ error: "This message is too large to send." }, { status: 413 });
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text) as Record<string, unknown> | null;
  } catch {
    // not JSON: checkRequest says what's missing
  }
  const problem = checkRequest(body ?? {});
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const { chatId, provider, tier, reasoning, content, attachments } = body as {
    chatId?: string | null;
    provider: AIProvider;
    tier?: AITier;
    reasoning?: AIReasoning;
    content: string;
    attachments?: Attachment[];
  };
  const pdfProblem = attachments ? await checkPdfs(attachments) : null;
  if (pdfProblem) return Response.json({ error: pdfProblem }, { status: 400 });

  const events = sendMessage({
    sql,
    ai: (await getAI("askpenn"))!,
    userId: user.id,
    chatId: chatId ?? null,
    provider,
    ...(tier && { tier }),
    ...(reasoning && { reasoning }),
    content,
    // Only the fields checkRequest checked, whatever else the browser sent.
    ...(attachments && { attachments: attachments.map(({ name, mediaType, data }) => ({ name, mediaType, data })) }),
    signal: req.signal,
  });

  // The first event comes after the chat is checked and the message saved, so
  // an unknown chat can still get a proper 404.
  let first: IteratorResult<unknown>;
  try {
    first = await events.next();
  } catch (error) {
    if (error instanceof ChatNotFoundError) return Response.json({ error: "Chat not found." }, { status: 404 });
    throw error;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        if (!first.done) send(first.value);
        for await (const event of events) send(event);
      } catch (error) {
        if (req.signal.aborted) return; // the browser went away; nothing to report
        if (isAIError(error)) {
          send({ type: "error", error: error.toJSON() });
        } else {
          console.error("[askpenn] reply failed", error);
          send({ type: "error", error: { kind: "unavailable", provider, message: "Something went wrong. Try again." } });
        }
      } finally {
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
