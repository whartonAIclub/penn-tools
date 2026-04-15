import { NextRequest, NextResponse } from "next/server";
import {
  listSavedEvents,
  saveEvent,
  unsaveEvent,
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

  const savedEvents = await listSavedEvents({ databaseUrl, userId });
  return withIdentityCookie(NextResponse.json({ savedEvents }), userId);
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
    | { eventId?: unknown }
    | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const result = await saveEvent({ databaseUrl, userId, eventId });
  return withIdentityCookie(
    NextResponse.json({ eventId, saved: true, changed: result.saved }),
    userId
  );
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

  const result = await unsaveEvent({ databaseUrl, userId, eventId });
  return withIdentityCookie(
    NextResponse.json({ eventId, saved: false, changed: result.saved }),
    userId
  );
}