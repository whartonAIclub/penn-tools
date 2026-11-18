// POST /tools/recruiting-helper/chat — asks a follow-up question about one
// item on the signed-in user's list and streams the answer, as AskPenn's
// stream route does (server actions can't stream).
//
// Body: { itemId, provider, question }. The response is server-sent events:
// the answer's { type: "text", delta } events and a final { type: "done",
// result }, or { type: "error", error } if it fails. Before the stream starts,
// a bad request gets a 400, an unknown item a 404 and a full chat a 409, as
// { ok: false, error: { message } }. The question is saved first, the answer
// once it completes.

import type { NextRequest } from "next/server";
import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider, AIStreamEvent } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  ChatFullError,
  ItemNotFoundError,
  MAX_QUESTION_LENGTH,
  askAboutItem,
  checkQuestion,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { fail, readJsonBody } from "../readBody";

/** The question as UTF-8 (up to 3 bytes a character), plus room for the item id and provider. */
const MAX_CHAT_REQUEST_BYTES = MAX_QUESTION_LENGTH * 3 + 4096;

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  const ai = await getAI("recruiting-helper");
  if (!user || !ai) return signInRequired();

  const sql = toolSql("recruitinghelper");
  if (!sql) return fail("Recruiting Helper's database is not configured.", 500);

  const body = await readJsonBody(req, MAX_CHAT_REQUEST_BYTES);
  if (!body) return fail(`Keep questions to at most ${MAX_QUESTION_LENGTH.toLocaleString()} characters.`, 413);
  const { itemId, provider, question } = body;
  if (!AI_PROVIDERS.includes(provider as AIProvider)) return fail("Pick an AI provider.", 400);
  if (typeof itemId !== "string") return fail("Pick an item on your list.", 400);
  const problem = checkQuestion(question);
  if (problem) return fail(problem, 400);

  let events: AsyncGenerator<AIStreamEvent>;
  try {
    events = await askAboutItem({
      sql,
      ai,
      userId: user.id,
      itemId,
      provider: provider as AIProvider,
      question: question as string,
      signal: req.signal,
    });
  } catch (error) {
    if (error instanceof ItemNotFoundError) return fail(error.message, 404);
    if (error instanceof ChatFullError) return fail(error.message, 409);
    throw error;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of events) send(event);
      } catch (error) {
        if (req.signal.aborted) return; // the browser went away; nothing to report
        if (isAIError(error)) {
          send({ type: "error", error: error.toJSON() });
        } else {
          console.error("[recruiting-helper] chat answer failed", error);
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
