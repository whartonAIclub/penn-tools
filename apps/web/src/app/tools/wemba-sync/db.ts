// WEMBA Sync's database: its own wembasync schema (tools/wemba-sync/schema.sql).

import { toolSql } from "@penntools/platform/db";

/** Shown when the database can't be reached or isn't set up for the tool yet. */
export const STORAGE_UNAVAILABLE = "WEMBA Sync's storage isn't set up yet, so uploads can't be saved. Try again later.";

/** The tool's database client, or null without DATABASE_URL. */
export function db() {
  return toolSql("wembasync");
}
