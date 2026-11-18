// The pilot report's only database access: every read in one REPEATABLE READ, READ ONLY transaction, so the figures come from
// one snapshot and nothing can be written (Postgres refuses any write in it). It reads the live world's row, counts of the other
// tables, and the actions log's last 7 days (type, ok, actor and time: never its stored toasts or refusals). It never calls the
// store: no profile row is made, no deadline is swept, no notification is marked read.
//
// The caller passes the pool, with search_path set to Handoff's schema (the owner's runner, scripts/pilot-report.mjs) or to a
// test's throwaway schema. Table names are unqualified for that reason; the one platform table, public.users, is read only when
// asked to identify known TEST and Local Developer accounts, and only when this connection may read it.

import type { Sql, TransactionSql } from "postgres";
import type { WorldDoc } from "../engine-port.js";
import { ACTIONS_KEEP_DAYS } from "../store.js";
import { REPORT_WORLD } from "./types.js";
import type { ActionRow, KnownTestAccounts, PilotData } from "./types.js";

const DAY_MS = 86_400_000;
const STATEMENT_TIMEOUT = "30s";

/** Tests only: called inside the report's transaction, after every read. */
export interface CollectHooks {
  inTransaction?(tx: Sql): Promise<void>;
}

export interface CollectOptions {
  /**
   * Look up known TEST and Local Developer accounts in public.users (google_id "local-dev" or "handoff-test-…", or an
   * @example.invalid email), so their records can be left out. Needs a connection that may read public.users; without one,
   * the report says the accounts weren't identified.
   */
  identifyTestAccounts?: boolean;
  /** Tests only: the time to report at (ms). Otherwise the database clock, read inside the transaction. */
  now?: number;
  hooks?: CollectHooks;
}

interface WorldRow {
  version: number;
  created_at: Date;
  updated_at: Date;
  next_due: Date | null;
  doc: WorldDoc;
}

interface CountsRow {
  test_worlds: number;
  profiles: number;
  notifications: number;
  unread: number;
  snapshots: number;
  actions: number;
  oldest_action: Date | null;
}

/**
 * Reads everything the report needs in one read-only transaction. Throws if Postgres doesn't confirm the transaction is read-only
 * (before anything is read), or on a database error.
 */
export async function collectPilotData(sql: Sql, opts: CollectOptions = {}): Promise<PilotData> {
  if (opts.now !== undefined && (typeof opts.now !== "number" || !Number.isFinite(opts.now))) {
    throw new TypeError("Handoff report: now must be a finite number of ms.");
  }
  return sql.begin(async (raw): Promise<PilotData> => {
    const tx = asSql(raw);
    // The transaction's first statement, so it applies: one snapshot for every read, and no write can run.
    await tx.unsafe(`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    const mode = first(
      await tx<{ read_only: string; isolation: string; ms: number }[]>`
        SELECT current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation,
               floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`,
    );
    if (mode.read_only !== "on") throw new Error("Handoff report: the transaction isn't read-only, so nothing was read.");
    const now = opts.now ?? mode.ms;

    const [world] = await tx<WorldRow[]>`
      SELECT version, created_at, updated_at, next_due, doc FROM worlds WHERE id = ${REPORT_WORLD}`;
    const counts = first(
      await tx<CountsRow[]>`
        SELECT (SELECT count(*)::int FROM worlds WHERE id <> ${REPORT_WORLD}) AS test_worlds,
               (SELECT count(*)::int FROM people) AS profiles,
               (SELECT count(*)::int FROM notifications WHERE world_id = ${REPORT_WORLD}) AS notifications,
               (SELECT count(*)::int FROM notifications WHERE world_id = ${REPORT_WORLD} AND read_at IS NULL) AS unread,
               (SELECT count(*)::int FROM world_snapshots WHERE world_id = ${REPORT_WORLD}) AS snapshots,
               (SELECT count(*)::int FROM actions WHERE world_id = ${REPORT_WORLD}) AS actions,
               (SELECT min(at) FROM actions WHERE world_id = ${REPORT_WORLD}) AS oldest_action`,
    );
    // The last 7 days, which the log always holds in full: pruning only deletes rows older than 7 days.
    const recent = await tx<{ type: string; ok: boolean; actor_id: string; at: Date }[]>`
      SELECT type, ok, actor_id, at FROM actions
      WHERE world_id = ${REPORT_WORLD} AND at > ${new Date(now - ACTIONS_KEEP_DAYS * DAY_MS)} AND at <= ${new Date(now)}
      ORDER BY at, type`;
    const known = opts.identifyTestAccounts ? await knownTestAccounts(tx) : null;
    await opts.hooks?.inTransaction?.(tx);

    const rows: ActionRow[] = recent.map((r) => ({ type: r.type, ok: r.ok, actorId: r.actor_id, at: r.at.getTime() }));
    return {
      now,
      transaction: { readOnly: mode.read_only === "on", isolation: mode.isolation },
      live: world
        ? {
            version: world.version,
            createdAt: world.created_at.getTime(),
            updatedAt: world.updated_at.getTime(),
            nextDue: world.next_due ? world.next_due.getTime() : null,
            doc: world.doc,
          }
        : null,
      testWorlds: counts.test_worlds,
      profiles: counts.profiles,
      notifications: { total: counts.notifications, unread: counts.unread },
      snapshots: counts.snapshots,
      actions: { retained: counts.actions, oldestAt: counts.oldest_action ? counts.oldest_action.getTime() : null, recent: rows },
      knownTestAccounts: known,
    };
  });
}

/**
 * The ids of known TEST and Local Developer accounts: public.users rows whose google_id is "local-dev" (the local development
 * sign-in) or starts with "handoff-test-" (the minted TEST sessions), or whose email is at example.invalid (a reserved domain no
 * real account has). Only ids are read; they stay in memory. Without the right to read public.users, says so instead.
 */
async function knownTestAccounts(tx: Sql): Promise<KnownTestAccounts> {
  const [check] = await tx<{ readable: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'users' AND c.relkind IN ('r', 'p')
        AND has_table_privilege(c.oid, 'SELECT')
        AND (SELECT count(*) FROM pg_catalog.pg_attribute a
             WHERE a.attrelid = c.oid AND a.attname IN ('id', 'google_id', 'email') AND NOT a.attisdropped) = 3
    ) AS readable`;
  if (!check?.readable) return { resolved: false, reason: "this connection can't read public.users" };
  const rows = await tx<{ id: string }[]>`
    SELECT id::text AS id FROM public.users
    WHERE google_id = 'local-dev' OR google_id LIKE 'handoff-test-%' OR lower(email) LIKE '%@example.invalid'`;
  return { resolved: true, ids: rows.map((r) => r.id) };
}

/** postgres.js 3.4 types TransactionSql without Sql's call signatures (see store.ts's asSql); a type-only cast. */
function asSql(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Handoff report: a query that always returns a row returned none.");
  return row;
}
