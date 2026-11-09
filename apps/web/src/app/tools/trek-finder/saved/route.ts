// PUT /tools/trek-finder/saved — saves a trip for the signed-in user
// DELETE /tools/trek-finder/saved — removes it from their saved trips
//
// Body: { tripId: string }. Responds 204 on success, 400 for a bad body, 401
// when signed out, and (PUT only) 404 for a trip that doesn't exist.

import type { NextRequest } from "next/server";
import { toolSql } from "@penntools/platform/db";
import { saveTrip, unsaveTrip } from "@penntools/tool-trek-finder";
import { getCurrentUser, signInRequired } from "@/lib/auth";

interface SavedRequest {
  sql: NonNullable<ReturnType<typeof toolSql>>;
  userId: string;
  tripId: string;
}

/** The checked request, or the error response to send instead. */
async function readRequest(req: NextRequest): Promise<SavedRequest | Response> {
  const user = await getCurrentUser();
  if (!user) return signInRequired();

  const sql = toolSql("trekfinder");
  if (!sql) return Response.json({ error: "Trek Finder's database is not configured." }, { status: 500 });

  const body = (await req.json().catch(() => null)) as { tripId?: unknown } | null;
  const tripId = body?.tripId;
  if (typeof tripId !== "string" || !tripId) return Response.json({ error: "tripId is required." }, { status: 400 });

  return { sql, userId: user.id, tripId };
}

export async function PUT(req: NextRequest): Promise<Response> {
  const request = await readRequest(req);
  if (request instanceof Response) return request;

  const saved = await saveTrip(request.sql, request.userId, request.tripId);
  if (!saved) return Response.json({ error: "Trip not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const request = await readRequest(req);
  if (request instanceof Response) return request;

  await unsaveTrip(request.sql, request.userId, request.tripId);
  return new Response(null, { status: 204 });
}
