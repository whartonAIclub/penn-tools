import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { toolSql } from "@penntools/platform/db";

const ANON_COOKIE = "penntools_uid";
const ANON_HEADER = "x-tool-anon-id";

/** Compass's database client (compass role, compass schema), or null if unavailable. */
export function compassSql() {
  return toolSql("compass");
}

export function databaseNotConfigured(): NextResponse {
  return NextResponse.json(
    { error: "Compass database is not configured (check DATABASE_URL)." },
    { status: 500 }
  );
}

export function isTool19Authorized(request: NextRequest): boolean {
  const adminKey = process.env["TOOL19_ADMIN_KEY"];

  // Allow local development when no key is configured.
  if (!adminKey) {
    return process.env["NODE_ENV"] !== "production";
  }

  const providedKey = request.headers.get("x-tool-admin-key") || "";
  return providedKey === adminKey;
}

export function makeErrorId(): string {
  return `t19_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function withIdentityCookie(
  response: NextResponse,
  userId: string
) {
  response.cookies.set(ANON_COOKIE, userId, {
    httpOnly: true,
    path: "/",
  });

  return response;
}

export async function resolveAnonUserId(request: NextRequest): Promise<string> {
  const provided = request.headers.get(ANON_HEADER)?.trim();
  if (provided) return provided;

  const cookieStore = await cookies();
  const existing = cookieStore.get(ANON_COOKIE)?.value;
  if (existing) return existing;

  return randomUUID();
}

export function extractEventId(request: NextRequest): string | null {
  const queryEventId = request.nextUrl.searchParams.get("eventId");
  if (queryEventId) return queryEventId;

  return null;
}
