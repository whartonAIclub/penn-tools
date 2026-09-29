// ─────────────────────────────────────────────────────────────────────────────
// Tool database credentials
//
// Tools that own tables get their own Postgres role, limited to their own
// schema (see scripts/setup-tools.mjs). The role's password is derived from the
// admin DATABASE_URL, so the pre-deploy setup and the running app agree on it
// without any per-tool secret to configure. Anyone holding the admin URL can
// derive it — but they already have full access, so nothing is weakened.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac } from "node:crypto";
import postgres from "postgres";

/** Postgres URL query parameters that raw Postgres clients understand. */
const PRESERVED_PARAMS = ["sslmode"];

/**
 * Strips Prisma-only query parameters (?schema=, ?connection_limit=,
 * ?pgbouncer=, ...) that raw Postgres clients would send to the server as
 * unknown settings and fail on.
 */
export function postgresConnectionUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const params = new URLSearchParams();
  for (const key of PRESERVED_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }
  url.search = params.toString();
  return url.toString();
}

/** Derives a tool role's password from the admin connection string. */
export function toolDatabasePassword(role: string, adminUrl: string): string {
  const adminPassword = decodeURIComponent(new URL(adminUrl).password);
  if (!adminPassword) {
    throw new Error("DATABASE_URL has no password; tool role passwords are derived from it.");
  }
  return createHmac("sha256", adminPassword)
    .update(`penntools-tool-role:${role}`)
    .digest("base64url");
}

/**
 * Connection string for a tool's own role (e.g. "compass"), whose search_path
 * is the tool's schema. Returns null (and logs why) when DATABASE_URL is
 * missing, malformed, or has no password to derive from.
 */
export function toolDatabaseUrl(
  role: string,
  adminUrl: string | undefined = process.env["DATABASE_URL"]
): string | null {
  if (!adminUrl) return null;

  try {
    const url = new URL(postgresConnectionUrl(adminUrl));
    url.username = role;
    url.password = toolDatabasePassword(role, adminUrl);
    return url.toString();
  } catch (error) {
    console.error(
      `[toolDatabaseUrl] Cannot build the "${role}" connection string:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// One pool per tool role, cached on globalThis so Next.js dev hot-reloads reuse
// it. Each entry remembers the DATABASE_URL it was built from: a changed URL
// (fixed .env.local, rotated password) rebuilds the pool, while a URL that
// can't be used is cached as null so the error is logged once, not per request.
const globalForToolSql = globalThis as unknown as {
  __penntoolsToolSql?: Map<string, { adminUrl: string | undefined; sql: postgres.Sql | null }>;
};
const pools = (globalForToolSql.__penntoolsToolSql ??= new Map());

/**
 * Shared connection pool for a tool's own role (e.g. "compass"), or null when
 * DATABASE_URL is not usable. Tools receive this client from their API routes;
 * they never create database connections themselves.
 */
export function toolSql(role: string): postgres.Sql | null {
  const adminUrl = process.env["DATABASE_URL"];
  const cached = pools.get(role);
  if (cached && cached.adminUrl === adminUrl) return cached.sql;

  void cached?.sql?.end();
  const url = toolDatabaseUrl(role, adminUrl);
  const sql = url ? postgres(url, { max: 5, idle_timeout: 30 }) : null;
  pools.set(role, { adminUrl, sql });
  return sql;
}
