import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@penntools/tool-19";
import { isTool19Authorized, makeErrorId } from "../_guard";

/**
 * GET /tools/19/api/events
 *
 * Returns ingested events from Postgres for the Tool 19 dashboard.
 */
export async function GET(request: NextRequest) {
  if (!isTool19Authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL environment variable is not set." },
      { status: 500 }
    );
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : undefined;

  const limit =
    typeof parsedLimit === "number" &&
    Number.isFinite(parsedLimit) &&
    parsedLimit > 0
      ? Math.min(parsedLimit, 500)
      : undefined;

  const listOptions =
    typeof limit === "number" ? { databaseUrl, limit } : { databaseUrl };

  const result = await listEvents(listOptions).catch((error) => {
    const errorId = makeErrorId();
    console.error(`[tool-19/events] ${errorId}`, error);
    return { error: `Failed to load events (${errorId})` };
  });

  if ("error" in result) {
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }

  return NextResponse.json({ events: result });
}
