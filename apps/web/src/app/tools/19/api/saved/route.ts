import { NextRequest, NextResponse } from "next/server";
import {
  listSavedEvents,
  saveEvent,
  unsaveEvent,
} from "@penntools/tool-19";
import {
  compassSql,
  databaseNotConfigured,
  extractEventId,
  resolveAnonUserId,
  withIdentityCookie,
} from "../_guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const sql = compassSql();

  if (!sql) return databaseNotConfigured();

  const savedEvents = await listSavedEvents({ sql, userId });
  return withIdentityCookie(NextResponse.json({ savedEvents }), userId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const sql = compassSql();

  if (!sql) return databaseNotConfigured();

  const body = (await request.json().catch(() => null)) as
    | { eventId?: unknown }
    | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const result = await saveEvent({ sql, userId, eventId });
  return withIdentityCookie(
    NextResponse.json({ eventId, saved: true, changed: result.saved }),
    userId
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const sql = compassSql();

  if (!sql) return databaseNotConfigured();

  const eventId = extractEventId(request);
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const result = await unsaveEvent({ sql, userId, eventId });
  return withIdentityCookie(
    NextResponse.json({ eventId, saved: false, changed: result.saved }),
    userId
  );
}