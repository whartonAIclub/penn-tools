// The tool's database, for its page, server actions and upload route — SERVER ONLY.

import "server-only";
import { toolSql } from "@penntools/platform/db";
import { dataVersion, industryCounts } from "@penntools/tool-industry-connector";

export const TOOL_ID = "industry-connector";

/** The tool database client toolSql returns (the web app has no direct postgres dependency). */
type Sql = NonNullable<ReturnType<typeof toolSql>>;

/** The tool's database client, or null when the database isn't configured. */
export function db(): Sql | null {
  return toolSql("industryconnector");
}

let counts: { version: string; value: Record<string, number> } | null = null;

/**
 * People per industry, counted once and reused until the next upload changes
 * dataVersion: one small query per page view instead of counting everyone.
 */
export async function cachedIndustryCounts(sql: Sql): Promise<Record<string, number>> {
  const version = await dataVersion(sql);
  if (counts?.version !== version) counts = { version, value: await industryCounts(sql) };
  return counts.value;
}
