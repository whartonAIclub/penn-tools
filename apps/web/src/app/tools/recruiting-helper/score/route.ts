// POST /tools/recruiting-helper/score — scores a pasted job posting or LinkedIn
// profile against the signed-in user's saved profile, and saves it to their list.
//
// Body: { kind: "posting" | "contact", provider, text, screenshots, link? };
// screenshots are base64 images (see Screenshot in the tool's scoring.ts). A
// route rather than a server action, since Next.js refuses server action
// requests over 1 MB and screenshots are bigger. A body over MAX_REQUEST_BYTES
// gets a 413.
//
// Responds { ok: true, item, replaced } or { ok: false, error: { kind?, message } },
// where kind is the AIError kind when the AI API failed.

import type { NextRequest } from "next/server";
import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  MAX_REQUEST_BYTES,
  checkPaste,
  cleanLink,
  getProfile,
  reviewContact,
  reviewPosting,
  saveItem,
  type NewItem,
  type Paste,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";

function fail(message: string, status: number, kind?: string): Response {
  return Response.json({ ok: false, error: { message, ...(kind && { kind }) } }, { status });
}

/**
 * The body as text, or null once it's over MAX_REQUEST_BYTES. Counted while
 * reading, since Content-Length can be missing or wrong (as AskPenn's stream route does).
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

  const sql = toolSql("recruitinghelper");
  if (!sql) return fail("Recruiting Helper's database is not configured.", 500);

  const text = await readBody(req);
  if (text === null) return fail("That's too much to score at once. Use fewer or smaller screenshots.", 413);
  let body: Record<string, unknown> = {};
  try {
    body = (JSON.parse(text) as Record<string, unknown> | null) ?? {};
  } catch {
    // not JSON: the checks below say what's missing
  }

  const { kind, provider } = body;
  if (kind !== "posting" && kind !== "contact") return fail("kind must be posting or contact.", 400);
  if (!AI_PROVIDERS.includes(provider as AIProvider)) return fail("Pick an AI provider.", 400);
  const problem = checkPaste(body, kind === "posting" ? "a job posting" : "a LinkedIn profile");
  if (problem) return fail(problem, 400);
  const link = kind === "posting" ? cleanLink(body["link"]) : null;
  if (link === undefined) return fail("The link must be a web address starting with https://.", 400);

  const profile = await getProfile(sql, user.id);
  if (!profile) return fail("Save your profile first.", 400);

  // Only the fields checkPaste checked, whatever else the browser sent.
  const paste: Paste = {
    text: body["text"] as string,
    screenshots: (body["screenshots"] as Paste["screenshots"]).map(({ mediaType, data }) => ({ mediaType, data })),
  };

  let scored: NewItem;
  try {
    const ai = (await getAI())!;
    scored =
      kind === "posting"
        ? { ...(await reviewPosting(ai, provider as AIProvider, profile, paste)), link }
        : await reviewContact(ai, provider as AIProvider, profile, paste);
  } catch (error) {
    if (isAIError(error)) return Response.json({ ok: false, error: error.toJSON() }, { status: 502 });
    throw error;
  }

  if (scored.kind === "contact" && !scored.name) {
    return fail(
      "I couldn't find the person's name. Include the top of their profile, where the name is, and try again.",
      422,
    );
  }

  const { item, replaced } = await saveItem(sql, user.id, scored);
  return Response.json({ ok: true, item, replaced });
}
