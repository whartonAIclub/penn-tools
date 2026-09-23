import { NextRequest, NextResponse } from "next/server";
import {
  deleteReflection,
  listReflections,
  upsertReflection,
} from "@penntools/tool-19";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const ANON_COOKIE = "penntools_uid";
const ANON_HEADER = "x-tool-anon-id";

function withIdentityCookie(
  response: NextResponse,
  userId: string
) {
  response.cookies.set(ANON_COOKIE, userId, {
    httpOnly: true,
    path: "/",
  });

  return response;
}

async function resolveAnonUserId(request: NextRequest): Promise<string> {
  const provided = request.headers.get(ANON_HEADER)?.trim();
  if (provided) return provided;

  const cookieStore = await cookies();
  const existing = cookieStore.get(ANON_COOKIE)?.value;
  if (existing) return existing;

  return randomUUID();
}

function getDatabaseUrl(): string | null {
  return process.env["DATABASE_URL"] || null;
}

function extractEventId(request: NextRequest): string | null {
  const queryEventId = request.nextUrl.searchParams.get("eventId");
  if (queryEventId) return queryEventId;

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL environment variable is not set." },
      { status: 500 }
    );
  }

  const eventId = extractEventId(request) || undefined;
  const reflections = await listReflections(
    eventId
      ? { databaseUrl, userId, eventId }
      : { databaseUrl, userId }
  );
  return withIdentityCookie(NextResponse.json({ reflections }), userId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL environment variable is not set." },
      { status: 500 }
    );
  }

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
    databaseUrl,
    userId,
    eventId,
    reflectionText,
  });

  return withIdentityCookie(NextResponse.json({ reflection }), userId);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveAnonUserId(request);
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL environment variable is not set." },
      { status: 500 }
    );
  }

  const eventId = extractEventId(request);
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const deleted = await deleteReflection({ databaseUrl, userId, eventId });
  return withIdentityCookie(
    NextResponse.json({ eventId, deleted }),
    userId
  );
}
