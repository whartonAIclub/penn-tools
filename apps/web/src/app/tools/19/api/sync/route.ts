import { NextRequest, NextResponse } from "next/server";
import { runIngestion } from "@penntools/tool-19";
import { compassSql, databaseNotConfigured, isTool19Authorized, makeErrorId } from "../_guard";

/**
 * POST /tools/19/api/sync
 *
 * Manual trigger for the Compass ICS ingestion pipeline.
 * Intended for development and testing only.
 *
 * Requires env vars:
 *   COMPASS_ICS_FEED_URL  - full URL of the CampusGroups ICS feed
 *   DATABASE_URL          - Postgres connection string (Compass uses its own role)
 *
 * Example:
 *   curl -X POST http://localhost:3000/tools/19/api/sync
 */
export async function POST(request: NextRequest) {
  if (!isTool19Authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const feedUrl = process.env["COMPASS_ICS_FEED_URL"];
  const sql = compassSql();

  if (!feedUrl) {
    return NextResponse.json(
      { error: "COMPASS_ICS_FEED_URL environment variable is not set." },
      { status: 500 }
    );
  }

  if (!sql) return databaseNotConfigured();

  const result = await runIngestion({ feedUrl, sql }).catch((error) => {
    const errorId = makeErrorId();
    console.error(`[tool-19/sync] ${errorId}`, error);
    return {
      success: false,
      inserted: 0,
      updated: 0,
      total: 0,
      durationMs: 0,
      error: `Ingestion failed (${errorId})`,
    };
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
