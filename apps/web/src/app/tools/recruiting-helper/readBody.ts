// Reading a route's JSON body with a size cap, for the routes that take files
// (score/route.ts, resume/route.ts), as AskPenn's stream route does.

import type { NextRequest } from "next/server";

/**
 * The body as JSON (an empty object if it isn't JSON), or null once it's over
 * `maxBytes`. Counted while reading, since Content-Length can be missing or
 * wrong, so an oversized body is refused without holding it all.
 */
export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length")) > maxBytes) return null;
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    if (!reader) break;
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {}; // not JSON: the route's checks say what's missing
  }
}

/** A failed request, in the shape the page reads: { ok: false, error: { message, kind? } }. */
export function fail(message: string, status: number, kind?: string): Response {
  return Response.json({ ok: false, error: { message, ...(kind && { kind }) } }, { status });
}
