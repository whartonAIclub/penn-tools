// Test-only helpers for Handoff's email updates (follow-on Batch 4): a throwaway schema with the email tables, the dispatcher's
// store hooks as the tests supply them (store.ts exports its own, storeDispatchDeps, since C1), and a way to run an action and read
// the jobs the store made for it. Nothing here touches the handoff schema or the live world: every test builds and drops its own schema.
//
// The email tables are in schema.sql since C1, so createTestDb's schema has them; the draft (src/email/schema-email.sql) they were
// written in before C1 is gone, and nothing extra is applied unless it comes back. Since C1 + B2 the store itself makes the jobs: the
// engine tags each notification that may go by email (noteTo's meta), and transact inserts their jobs in the action's own transaction
// (insertEmailJobs). actTagged runs an action through the real store with a known request id and reads what that change stored and
// queued; the test names the tag it expects for each notification, and every job the store made must carry exactly that tag.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Sql } from "postgres";
import * as E from "../../../engine/index.js";
import type { LiveWorld } from "../../../engine/index.js";
import type { WorldDoc } from "../../engine-port.js";
import { ensurePerson, getView } from "../../store.js";
import type { Actor, NotificationLink, WorldId } from "../../types.js";
import { saveEmailPrefs } from "../../email/prefs.js";
import { emailRelevance } from "../../email/relevance.js";
import type { DispatchDeps, EmailKind, JobRef, Relevance, SenderKind, SignInKind } from "../../email/types.js";
import { createTestDb, type TestDb } from "./db.js";
import { type Ok, type SentAction, type StoreWorld } from "./live-store.js";

/** The email tables' draft DDL from before C1, if it ever comes back; since C1 schema.sql alone has the tables, and this is "". */
const draft = fileURLToPath(new URL("../../email/schema-email.sql", import.meta.url));
export const emailSchemaSql: string = existsSync(draft) ? readFileSync(draft, "utf8") : "";

/** createTestDb's throwaway schema, which has the email tables (schema.sql, applied twice to prove it's safe to re-run). */
export async function createEmailTestDb(label: string, max = 10): Promise<TestDb> {
  const db = await createTestDb(label, max);
  try {
    if (emailSchemaSql) {
      await db.sql.unsafe(emailSchemaSql);
      await db.sql.unsafe(emailSchemaSql);
    }
    return db;
  } catch (e) {
    await db.close();
    throw e;
  }
}

/** More labelled TEST accounts (made-up ids; C-CONTRACT §6), beside live-store.ts's A, B and C. */
const testActor = (x: string): Actor => ({ id: `handoff-test-${x}`, name: `Handoff Test ${x.toUpperCase()}`, email: `handoff-test-${x}@example.invalid` });
export const TEST_D = testActor("d");
export const TEST_E = testActor("e");
export const TEST_F = testActor("f");
export const TEST_G = testActor("g");
export const TEST_H = testActor("h");
/** The account the tests' sweep reads as (getView sweeps when a deadline has passed). */
export const SWEEPER: Actor = { id: "handoff-test-sweeper", name: "Handoff Test Sweeper", email: "handoff-test-sweeper@example.invalid" };
export const SITE = "http://localhost:3000";

/**
 * The dispatcher's store hooks for tests: sweepDue through getView (which sweeps a world whose next_due has passed, through the
 * store's write path), and checkJobs on the committed row, in the engine with every profile's name, at the run's time.
 */
export function testDispatchDeps(): DispatchDeps {
  return {
    async sweepDue(sql: Sql, worldId: WorldId, now?: number): Promise<boolean> {
      const [row] = await sql<{ due: boolean }[]>`
        SELECT next_due IS NOT NULL AND next_due <= ${new Date(now ?? Date.now())} AS due FROM worlds WHERE id = ${worldId}`;
      if (!row?.due) return false;
      await getView(sql, { worldId, viewer: SWEEPER, ...(now !== undefined ? { now } : {}) });
      return true;
    },
    async checkJobs(sql: Sql, worldId: WorldId, jobs: readonly JobRef[], now?: number): Promise<ReadonlyMap<string, Relevance>> {
      const [row] = await sql<{ doc: WorldDoc; ms: number }[]>`
        SELECT doc, floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms FROM worlds WHERE id = ${worldId}`;
      if (!row) return new Map(jobs.map((j) => [j.notificationId, { ok: false, why: "missing" } as Relevance]));
      const people = await sql<{ user_id: string; name: string }[]>`SELECT user_id, name FROM people`;
      const doc = row.doc;
      return E.withEngine({ doc: doc as unknown as LiveWorld, people: people.map((p) => ({ userId: p.user_id, name: p.name })), now: now ?? row.ms }, () =>
        new Map(jobs.map((j) => [j.notificationId, emailRelevance(doc, j)] as const)),
      );
    },
  };
}

/** A sender's heartbeat, as a working dispatcher run leaves it (null: it ran but never worked). */
export async function heartbeat(sql: Sql, sender: SenderKind, okAt: number | null, runAt: number = okAt ?? Date.now()): Promise<void> {
  await sql`
    INSERT INTO email_dispatch (sender, last_run_at, last_ok_at) VALUES (${sender}, ${new Date(runAt)}, ${okAt === null ? null : new Date(okAt)})
    ON CONFLICT (sender) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, last_ok_at = EXCLUDED.last_ok_at`;
}

/** Turns email categories on (or off) for a TEST account, as saveEmailPrefs will from its session (its address, its sign-in). */
export async function optIn(
  w: StoreWorld,
  actor: Actor,
  o: { exchange?: boolean; matches?: boolean; signIn?: SignInKind },
): Promise<void> {
  await ensurePerson(w.sql, actor); // as the handler will: the profile row exists even if this is the first thing they do
  const saved = await saveEmailPrefs(w.sql, {
    userId: actor.id, address: actor.email, signIn: o.signIn ?? "dev", worldId: w.worldId, now: w.now,
    ...(o.exchange !== undefined ? { exchange: o.exchange } : {}), ...(o.matches !== undefined ? { matches: o.matches } : {}),
  });
  if (!saved.ok) throw new Error(`saveEmailPrefs for ${actor.id}: ${saved.error}`);
}

/** A notification as stored, with the change that stored it. */
export interface StoredNote {
  id: string;
  userId: string;
  text: string;
  link: NotificationLink | null;
}

/** The tag the test expects on a stored note (the engine's noteTo meta: kind and ref), or null for one that stays in the app only. */
export type Tagger = (n: StoredNote, ok: Ok) => { kind: EmailKind; ref: string } | null;

/**
 * Runs an action through the store with a known request id (a new one, or a retry's) and reads what the change stored and queued: the
 * store itself makes the email jobs in the action's transaction (transact: the engine's tags, then insertEmailJobs). `jobs` is how many
 * jobs the world gained during the action; a retried change gains none. Every job made must be for a notification this change stored,
 * with exactly the kind and ref the test's `tag` names for it (a job for a note the test marked null, or with another tag, fails the
 * test) and the event key `<request id>:<kind>:<ref>`. A note the test tags may still get no job: that needs the recipient opted in and
 * the world's sender's fresh heartbeat, which each test arranges itself.
 */
export async function actTagged(
  w: StoreWorld,
  actor: Actor,
  action: SentAction,
  tag: Tagger,
  requestId: string = randomUUID(),
): Promise<{ ok: Ok; notes: StoredNote[]; jobs: number; requestId: string }> {
  const had = new Set((await jobsOf(w.sql, w.worldId)).map((j) => j.notification_id));
  const ok = await w.ok(actor, action, { requestId });
  const notes = await changeNotes(w.sql, w.worldId, requestId);
  const made = (await jobsOf(w.sql, w.worldId)).filter((j) => !had.has(j.notification_id));
  for (const j of made) {
    const n = notes.find((x) => x.id === j.notification_id);
    if (!n) throw new Error(`${action.type} by ${actor.id}: the store made a job for a notification this change didn't store (${j.notification_id}).`);
    const t = tag(n, ok);
    if (!t) throw new Error(`${action.type} by ${actor.id}: the store made a ${j.kind} job for a notification the test expected to stay in the app: "${n.text}"`);
    if (t.kind !== j.kind || t.ref !== j.ref || j.user_id !== n.userId) {
      throw new Error(`${action.type} by ${actor.id}: the store queued "${n.text}" as ${j.kind}/${j.ref} for ${j.user_id}; the test expected ${t.kind}/${t.ref} for ${n.userId}.`);
    }
    if (j.event_key !== `${requestId}:${j.kind}:${j.ref}`) throw new Error(`${action.type} by ${actor.id}: event key ${j.event_key} isn't <request id>:<kind>:<ref>.`);
  }
  return { ok, notes, jobs: made.length, requestId };
}

/** The notifications one change stored (the store keys each by the change's request id and its text: RB-10). */
export async function changeNotes(sql: Sql, worldId: WorldId, requestId: string): Promise<StoredNote[]> {
  const rows = await sql<{ id: string; user_id: string; text: string; link: NotificationLink | null }[]>`
    SELECT id, user_id, text, link FROM notifications
    WHERE world_id = ${worldId} AND dedupe = md5(${requestId} || E'\n' || text)
    ORDER BY at, id`;
  return rows.map((r) => ({ id: r.id, userId: r.user_id, text: r.text, link: r.link }));
}

/** Tags every note to `userId` with this kind and ref (by default the action's result: the request, goods request or share it made). */
export const to = (userId: string, kind: EmailKind, ref?: string): Tagger => (n, ok) => {
  const r = ref ?? ok.resultId;
  return n.userId === userId && r ? { kind, ref: r } : null;
};

/**
 * Lets a TEST account list tickets before and after follow-on Batch 1: its profile row, with a payment handle saved before Batch 1's
 * methods (a legacy handle, which listings and reservations still accept).
 */
export async function canSell(w: StoreWorld, actor: Actor): Promise<void> {
  await ensurePerson(w.sql, actor);
  await w.sql`UPDATE people SET pay_handle = ${`@${actor.id}`} WHERE user_id = ${actor.id}`;
}

export interface JobRow {
  notification_id: string;
  user_id: string;
  kind: string;
  category: string;
  ref: string;
  status: string;
  reason: string | null;
  attempts: number;
  retry_at: Date;
  lease_until: Date | null;
  sent_at: Date | null;
  event_key: string;
}

export async function jobsOf(sql: Sql, worldId: WorldId): Promise<JobRow[]> {
  return [...(await sql<JobRow[]>`
    SELECT notification_id, user_id, kind, category, ref, status, reason, attempts, retry_at, lease_until, sent_at, event_key
    FROM email_jobs WHERE world_id = ${worldId} ORDER BY created_at, notification_id`)];
}

export interface CaptureRow {
  idempotency_key: string;
  notification_id: string;
  to_address: string;
  subject: string;
  body_text: string;
  action_url: string;
}

export async function capturesOf(sql: Sql, worldId: WorldId): Promise<CaptureRow[]> {
  return [...(await sql<CaptureRow[]>`
    SELECT idempotency_key, notification_id, to_address, subject, body_text, action_url
    FROM email_capture WHERE world_id = ${worldId} ORDER BY captured_at, notification_id`)];
}
