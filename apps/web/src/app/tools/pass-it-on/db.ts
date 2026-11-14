// The tool's database client: the passiton role, in its own schema.

import { toolSql } from "@penntools/platform/db";

/** Null when DATABASE_URL isn't set. */
export function maybeDb(): ReturnType<typeof toolSql> {
  return toolSql("passiton");
}

export function db(): NonNullable<ReturnType<typeof toolSql>> {
  const sql = maybeDb();
  if (!sql) throw new Error("Pass It On's database is not configured (check DATABASE_URL).");
  return sql;
}
