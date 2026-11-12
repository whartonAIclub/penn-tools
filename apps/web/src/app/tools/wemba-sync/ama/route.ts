// POST /tools/wemba-sync/ama — answers a question about what the student uploaded
//
// Body: { provider, schedule, section, messages }: the weekend the page shows
// (or null), the student's section (or null) and the conversation, ending with
// the new question (see checkAsk). AMA answers from the student's saved
// weekends, syllabi and events, loaded here, plus the shown weekend in case
// it wasn't saved. The conversation isn't saved. A body over
// MAX_AMA_REQUEST_BYTES gets a 413, one checkAsk refuses a 400. The response
// is server-sent events: the answer's { type: "text", delta } events and a
// final { type: "done", result }, or { type: "error", error } if it fails.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import {
  MAX_AMA_REQUEST_BYTES,
  WeekendSchedule,
  askAMA,
  checkAsk,
  knownWeekends,
  listEvents,
  listSyllabi,
  listWeekends,
  type AMAKnowledge,
  type AMARequest,
  type Syllabus,
} from "@penntools/tool-wemba-sync";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { db } from "../db";

/** The body as text, or null once it's over MAX_AMA_REQUEST_BYTES. Counted while reading, since Content-Length can be missing or wrong. */
async function readBody(req: NextRequest): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_AMA_REQUEST_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_AMA_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Now in Philadelphia, e.g. "Friday, November 13, 2026, 4:05 PM", for questions like "what's next?". */
function now(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }).format(new Date());
}

/**
 * What AMA answers from: the student's saved weekends, syllabi and events,
 * and the shown weekend. Without storage, just the shown weekend.
 */
async function knowledge(userId: string, shown: WeekendSchedule | null): Promise<AMAKnowledge> {
  const sql = db();
  let weekends: WeekendSchedule[] = [];
  let syllabi: Syllabus[] = [];
  let events: AMAKnowledge["events"] = [];
  if (sql) {
    try {
      const [savedWeekends, savedSyllabi, savedEvents] = await Promise.all([
        listWeekends(sql, userId),
        listSyllabi(sql, userId),
        listEvents(sql, userId),
      ]);
      weekends = savedWeekends.map((w) => w.schedule);
      syllabi = savedSyllabi.map((s) => s.syllabus);
      events = savedEvents.map((e) => ({ ...e.event, rsvp: e.rsvp }));
    } catch (error) {
      console.error("[wemba-sync] loading AMA's uploads failed", error);
    }
  }
  return { weekends: knownWeekends(weekends, shown), syllabi, events, shown };
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();
  const ai = await getAI();
  if (!ai) return signInRequired();

  const text = await readBody(req);
  if (text === null) return Response.json({ error: "This conversation is too long. Reload the page to start a new one." }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: checkAsk says so
  }
  const problem = checkAsk(body);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  // Only the fields checkAsk checked, whatever else the browser sent. The AI API checks provider itself.
  const { provider, schedule, section, messages } = body as AMARequest;
  const request: AMARequest = {
    provider,
    schedule: schedule === null ? null : WeekendSchedule.parse(schedule), // drops fields the schema doesn't have
    section,
    messages: messages.map(({ role, content }) => ({ role, content }) as AMARequest["messages"][number]),
  };
  const events = askAMA(ai, request, await knowledge(user.id, request.schedule), now(), req.signal);

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
          console.error("[wemba-sync] AMA answer failed", error);
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
