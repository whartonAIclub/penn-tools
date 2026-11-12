// POST /tools/wemba-sync/events — reads the events in an invite
//
// Body: { provider, text?, filename?, data? }: a pasted invite (from WhatsApp,
// an email, any invite site, or just its link) and/or a screenshot or flyer,
// an image or PDF as base64 (no data: prefix), read together. A route rather than a server
// action, since a screenshot can be larger than server actions accept. Nothing
// is saved here: the page shows the events for the student to check, then
// saves them with saveEvents (actions.ts). A body over MAX_REQUEST_BYTES gets
// a 413; an invite checkInvite refuses, a 400. Replies { events, warnings } or
// { error: { message, kind? } }, where kind is the AIError's.

import type { NextRequest } from "next/server";
import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { checkInvite, extractEvents, toInvite } from "@penntools/tool-wemba-sync";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { failure, readBody, today } from "../upload";

/** e.g. "Thursday, 2026-11-12": the weekday lets the AI resolve "this Friday". */
function todayWithWeekday(): string {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date());
  return `${weekday}, ${today()}`;
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
    return failure("Send the invite as JSON.", 400);
  }
  const problem = checkInvite(body);
  if (problem) return failure(problem, 400);
  const { provider, ...invite } = body as { provider: AIProvider; text?: string; filename?: string; data?: string };

  try {
    // The AI API checks provider itself.
    return Response.json(await extractEvents(ai, provider, toInvite(invite), todayWithWeekday()));
  } catch (error) {
    if (isAIError(error)) return failure(error.message, 502, error.kind);
    throw error;
  }
}
