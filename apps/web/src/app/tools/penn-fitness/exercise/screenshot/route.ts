// POST /tools/penn-fitness/exercise/screenshot — reads a timetable screenshot
// into the user's schedule (section 8.1B of tools/penn-fitness/docs/outtake.md).
//
// Body (JSON): { provider, weekStart, image: { mediaType, data } }, the image
// as base64. A route rather than a server action, since images can be over a
// server action's 1 MB limit. The image goes to the AI and is then dropped:
// it's never stored or logged. The blocks replace the last screenshot import
// for that week, unconfirmed, for the user to review.
//
// Responds { added, warnings, notes, needsSemesterDates }, or { error } with
// an AIError's info (kind, message) when the AI call fails.

import type { NextRequest } from "next/server";
import { AI_PROVIDERS, isAIError, MAX_IMAGE_BYTES, type AIProvider } from "@penntools/core/ai";
import {
  getPreferences,
  isLocalDate,
  readTimetable,
  replaceImportedBlocks,
  SHARED_PREFS,
  timetableToBlocks,
  type TimetableImage,
} from "@penntools/tool-penn-fitness";
import { getAI } from "@/lib/ai";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { db } from "../data";

/** Base64 is 4/3 the size of the image, plus a little JSON around it. */
const MAX_REQUEST_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64 * 1024;

/** The body as text, or null once it's over MAX_REQUEST_BYTES (counted while reading, as AskPenn does). */
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

const problem = (message: string, status: number) => Response.json({ error: { kind: "bad_request", message } }, { status });

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const text = await readBody(req);
  if (text === null) return problem("That image is too large. Try a screenshot under 7 MB.", 413);
  let body: { provider?: unknown; weekStart?: unknown; image?: { mediaType?: unknown; data?: unknown } } | null;
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return problem("That upload couldn't be read. Try again.", 400);
  }
  const provider = body?.provider;
  const weekStart = body?.weekStart;
  const image = body?.image;
  if (typeof provider !== "string" || !(AI_PROVIDERS as readonly string[]).includes(provider)) return problem("Pick an AI provider.", 400);
  if (typeof weekStart !== "string" || !isLocalDate(weekStart)) return problem("Pick a week.", 400);
  if (typeof image?.mediaType !== "string" || typeof image.data !== "string") return problem("Upload an image.", 400);

  const ai = await getAI("penn-fitness");
  if (!ai) return signInRequired();

  try {
    const reading = await readTimetable(ai, provider as AIProvider, image as TimetableImage, weekStart);
    const sql = db();
    const shared = await getPreferences(sql, user.id, SHARED_PREFS);
    const result = timetableToBlocks(reading, { weekStart, semesterStart: shared.semesterStart, semesterEnd: shared.semesterEnd });
    const saved = await replaceImportedBlocks(sql, user.id, "SCREENSHOT", weekStart, result.blocks);
    return Response.json({ added: saved.length, warnings: result.warnings, notes: result.notes, needsSemesterDates: result.needsSemesterDates });
  } catch (error) {
    if (isAIError(error)) return Response.json({ error: error.toJSON() }, { status: error.kind === "bad_request" ? 400 : 502 });
    console.error("[penn-fitness] screenshot import failed", error instanceof Error ? error.message : "unknown error");
    return problem("Something went wrong reading that screenshot. Try again.", 500);
  }
}
