// What the routes that read an uploaded PDF share: extract/route.ts (a class
// weekend's schedule) and syllabus/route.ts (a course's syllabus).

import type { NextRequest } from "next/server";
import { MAX_REQUEST_BYTES } from "@penntools/tool-wemba-sync";

export function failure(message: string, status: number, kind?: string): Response {
  return Response.json({ error: { message, kind } }, { status });
}

/**
 * The body as text, or null once it's over MAX_REQUEST_BYTES. Counted while
 * reading, since Content-Length can be missing or wrong.
 */
export async function readBody(req: NextRequest): Promise<string | null> {
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

/** Today in Philadelphia, YYYY-MM-DD: the AI uses it for the year a PDF leaves out. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}
