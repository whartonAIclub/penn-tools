// Classifies database errors so pages and actions can say what's wrong without showing raw errors.
// No SQL here: store.ts, page.tsx and actions.ts pass whatever they caught.

import type { SetupErrorKind } from "./types.js";

/** SQLSTATEs meaning Handoff's role, schema or tables aren't there, or this role can't use them. */
const NOT_SET_UP = new Set([
  "28000", // invalid_authorization_specification: the role doesn't exist
  "28P01", // invalid_password: the role exists, with another password
  "3D000", // invalid_catalog_name: the database doesn't exist
  "3F000", // invalid_schema_name
  "42P01", // undefined_table
  "42501", // insufficient_privilege
]);

/** Codes meaning the database can't be reached, is shutting down, or dropped the connection. */
const DOWN = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT", // postgres.js: no connection within connect_timeout
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now (starting up or in recovery)
  // Beyond C-DESIGN §2.3's list: the connection broke mid-request. "down" is the honest message, since the
  // alternative, "Nothing was changed", can't be promised when a connection drops during COMMIT.
  "57P02", // crash_shutdown
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "CONNECTION_CLOSED", // postgres.js: the server closed the connection
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED", // postgres.js: the pool was ended (toolSql rebuilds it when DATABASE_URL changes)
]);

/** SQLSTATEs meaning the world's lock or a query took too long. */
const BUSY = new Set([
  "55P03", // lock_not_available (lock_timeout)
  "57014", // query_canceled (statement_timeout)
]);

/**
 * The error's code: a Postgres SQLSTATE, a Node network code, or a postgres.js code. For an AggregateError
 * (Node tries each address of a host name), the first inner error's code.
 */
export function errorCode(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && code) return code;
  const inner = (e as { errors?: unknown }).errors;
  if (Array.isArray(inner)) {
    for (const x of inner) {
      const c = errorCode(x);
      if (c) return c;
    }
  }
  return null;
}

/** "not-set-up" or "down" when the error means Handoff's data can't be used at all, otherwise null. */
export function setupErrorKind(e: unknown): SetupErrorKind | null {
  const code = errorCode(e);
  if (!code) return null;
  if (NOT_SET_UP.has(code)) return "not-set-up";
  if (DOWN.has(code)) return "down";
  return null;
}

/** True when the world's lock or a query timed out: the action can be retried. */
export function isBusy(e: unknown): boolean {
  const code = errorCode(e);
  return code !== null && BUSY.has(code);
}

/** The short message an action or refresh shows for each kind (the page's HandoffUnavailable has the long ones). */
export function unavailableMessage(kind: SetupErrorKind): string {
  switch (kind) {
    case "no-database":
      return "Handoff can't reach its database. Nothing was changed.";
    case "not-set-up":
      return "Handoff's shared data isn't set up on this server yet. Nothing was changed.";
    case "down":
      return "Handoff's database isn't responding. Try again in a minute.";
  }
}
