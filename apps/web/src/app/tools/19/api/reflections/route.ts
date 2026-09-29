import { NextRequest, NextResponse } from "next/server";
import {
  deleteReflection,
  listReflections,
  upsertReflection,
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

  const eventId = extractEventId(request) || undefined;
  const reflections = await listReflections(
    eventId
      ? { sql, userId, eventId }
      : { sql, userId }
  );
  return withIdentityCookie(NextResponse.json({ reflections }), userId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const sql = compassSql();

  if (!sql) return databaseNotConfigured();

  const body = (await request.json().catch(() => null)) as
    | { eventId?: unknown; reflectionText?: unknown }
    | null;

  const eventId =
    typeof body?.eventId === "string" ? body.eventId.trim() : "";
  const reflectionText =
    typeof body?.reflectionText === "string"
      ? body.reflectionText.trim()
      : "";

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  if (!reflectionText) {
    return NextResponse.json(
      { error: "reflectionText is required" },
      { status: 400 }
    );
  }

  if (reflectionText.length > 2000) {
    return NextResponse.json(
      { error: "reflectionText must be 2000 characters or less" },
      { status: 400 }
    );
  }

  const reflection = await upsertReflection({
    sql,
    userId,
    eventId,
    reflectionText,
  });

  return withIdentityCookie(NextResponse.json({ reflection }), userId);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const sql = compassSql();

  if (!sql) return databaseNotConfigured();

  const eventId = extractEventId(request);
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const deleted = await deleteReflection({ sql, userId, eventId });
  return withIdentityCookie(
    NextResponse.json({ eventId, deleted }),
    userId
  );
}
