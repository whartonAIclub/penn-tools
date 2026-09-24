import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@penntools/tool-19";
import { compassSql, databaseNotConfigured, isTool19Authorized, makeErrorId } from "../_guard";

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

  const sql = compassSql();

  if (!sql) return databaseNotConfigured();

  const limitParam = request.nextUrl.searchParams.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : undefined;
  const timeParam = request.nextUrl.searchParams.get("time");

  const limit =
    typeof parsedLimit === "number" &&
    Number.isFinite(parsedLimit) &&
    parsedLimit > 0
      ? Math.min(parsedLimit, 500)
      : undefined;

  const upcomingOnly = timeParam === "upcoming";

  const listOptions =
    typeof limit === "number"
      ? { sql, limit, upcomingOnly }
      : { sql, upcomingOnly };

  const result = await listEvents(listOptions).catch((error) => {
    const errorId = makeErrorId();
    console.error(`[tool-19/events] ${errorId}`, error);
    return { error: `Failed to load events (${errorId})` };
  });

  if ("error" in result) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({ events: result });
}
