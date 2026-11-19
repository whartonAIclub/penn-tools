// Test-only database helpers, following AskPenn's storage tests: each test file gets a throwaway
// schema built from schema.sql (applied twice, to prove it's safe to re-run) and drops it afterwards.
// Skipped when no database is configured (DATABASE_URL, or apps/web/.env.local).
//
// Tool code never opens connections (the page folder passes toolSql's pool in); only these tests do.
// They run as the admin user, so they can't catch a statement the handoff role isn't allowed to run:
// after changing schema.sql, apply it as the real role too (see "Database setup" in the README).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import type { ApplyHooks } from "../../store.js";

const envFile = fileURLToPath(new URL("../../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);

/** The admin connection string, or undefined: database tests skip without it. */
export const databaseUrl: string | undefined = process.env["DATABASE_URL"] || undefined;

export const schemaSql = readFileSync(fileURLToPath(new URL("../../../schema.sql", import.meta.url)), "utf8");

const SCHEMA_PREFIX = "handoff_test_";
const LEFTOVER = /^handoff_test_(\d{13})_[0-9a-f]{6}$/;
const HOUR_MS = 3_600_000;

export interface TestDb {
  /** Admin pool on the public search_path: creates and drops the schema, reads pg_stat_activity. */
  admin: Sql;
  /** The pool the store uses, with search_path set to the throwaway schema (max 10 connections). */
  sql: Sql;
  schema: string;
  /** The application_name of every connection `sql` and `pool()` open, to find them in pg_stat_activity. */
  appName: string;
  /** Another pool on the same schema: a second app instance, or a smaller pool for a burst. */
  pool(max?: number): Sql;
  /** Ends every pool and drops the schema. */
  close(): Promise<void>;
}

/**
 * Creates `handoff_test_<ms>_<hex>`, applies schema.sql twice, and returns pools on it. Also drops leftover
 * handoff_test_ schemas more than an hour old, which an interrupted run leaves behind.
 */
export async function createTestDb(label: string, max = 10): Promise<TestDb> {
  if (!databaseUrl) throw new Error("createTestDb needs DATABASE_URL.");
  const url = databaseUrl;
  const admin = postgres(url, { max: 2, onnotice: () => {} });
  const schema = `${SCHEMA_PREFIX}${Date.now()}_${randomBytes(3).toString("hex")}`;
  const appName = `handoff-test-${label}-${randomBytes(3).toString("hex")}`;
  const pools: Sql[] = [];
  const pool = (n = 5): Sql => {
    const p = postgres(url, {
      max: n,
      onnotice: () => {},
      connection: { search_path: schema, application_name: appName },
    });
    pools.push(p);
    return p;
  };
  try {
    await dropLeftovers(admin);
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const sql = pool(max);
    await sql.unsafe(schemaSql);
    await sql.unsafe(schemaSql);
    return {
      admin,
      sql,
      schema,
      appName,
      pool,
      async close() {
        await Promise.all(pools.map((p) => p.end({ timeout: 5 })));
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end({ timeout: 5 });
      },
    };
  } catch (e) {
    await Promise.all(pools.map((p) => p.end({ timeout: 1 })));
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end({ timeout: 1 });
    throw e;
  }
}

async function dropLeftovers(admin: Sql): Promise<void> {
  const rows = await admin<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace WHERE nspname LIKE ${SCHEMA_PREFIX + "%"}`;
  for (const { nspname } of rows) {
    const m = LEFTOVER.exec(nspname);
    if (m && Number(m[1]) < Date.now() - HOUR_MS) await admin.unsafe(`DROP SCHEMA IF EXISTS ${nspname} CASCADE`);
  }
}

/**
 * Waits until at least `n` connections of this test's pools are blocked on a lock, as Postgres reports them.
 * A condition with a deadline, not a sleep: it proves the transactions are really queued on the world's lock.
 */
export async function waitForLockWaiters(db: TestDb, n: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await db.admin<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name = ${db.appName} AND wait_event_type = 'Lock'`;
    const waiting = row?.waiting ?? 0;
    if (waiting >= n) return;
    if (Date.now() > deadline) throw new Error(`Timed out: ${waiting} of ${n} connections waiting on a lock.`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * Hooks for actions sent at once: the first transaction to get the world's lock holds it until Postgres reports `others` more
 * connections waiting on a lock. That proves they really were in flight together; the lock then lets them in one by one.
 */
export function firstWaitsFor(db: TestDb, others: number): ApplyHooks {
  let first = true;
  return {
    async afterLock() {
      if (!first) return;
      first = false;
      await waitForLockWaiters(db, others);
    },
  };
}

/** A promise with its resolve function, for holding a transaction at a hook until the test releases it. */
export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** All `n` parties wait at arrive() until the last one arrives; fails after `timeoutMs` instead of hanging. */
export function barrier(n: number, timeoutMs = 10_000): { arrive(): Promise<void> } {
  let arrived = 0;
  let release: () => void = () => {};
  let fail: (e: Error) => void = () => {};
  const all = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  all.catch(() => {}); // observed through arrive(); never an unhandled rejection
  const timer = setTimeout(() => fail(new Error(`Barrier: ${arrived} of ${n} arrived.`)), timeoutMs);
  timer.unref();
  return {
    arrive() {
      arrived += 1;
      if (arrived >= n) {
        clearTimeout(timer);
        release();
      }
      return all;
    },
  };
}
