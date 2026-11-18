// POST /tools/penn-pals/tracker/read — fills the "Log a chat" form with AI
//
// Body (JSON): { provider, story, screenshots: [{ name, mediaType, data }], base? }
// with screenshots as base64. One AI call; nothing is saved, and screenshots
// go to the AI inside the request and are then gone. Answers an IntakeResult
// (see ../actions.ts): 401 signed out, 413 over MAX_INTAKE_REQUEST_BYTES,
// 400 for a bad request, 200 otherwise, AI errors included as data.

import type { NextRequest } from "next/server";
import { MAX_INTAKE_REQUEST_BYTES } from "@penntools/tool-penn-pals";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { readChat, type IntakeResult } from "../actions";

/**
 * The body as text, or null once it's over MAX_INTAKE_REQUEST_BYTES. Counted
 * while reading, since Content-Length can be missing or wrong, so an oversized
 * body is refused without holding it all.
 */
async function readBody(req: NextRequest): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_INTAKE_REQUEST_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_INTAKE_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function fail(message: string, status: number): Response {
  return Response.json({ ok: false, error: { message } } satisfies IntakeResult, { status });
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await getCurrentUser())) return signInRequired();

  const text = await readBody(req);
  if (text === null) return fail("That's too much to send at once. Try fewer or smaller screenshots.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail("The request wasn't valid JSON.", 400);
  }
  if (typeof body !== "object" || body === null) return fail("The request wasn't valid JSON.", 400);

  return Response.json(await readChat(body as Record<string, unknown>));
}
