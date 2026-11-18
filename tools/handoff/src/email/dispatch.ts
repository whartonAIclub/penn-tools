// Email jobs and their dispatcher (FOLLOWON-PLAN §2.4).
//
// Jobs are made in the action's own transaction (insertEmailJobs, called by store.ts transact after insertNotifications), so nothing
// is sent unless the action commits, and a retried action, answered from the actions log, makes none. A job exists only for a
// notification of an emailed kind whose recipient turned that category on, and only while a dispatcher with the world's sender worked
// in the last 10 minutes, so no surprise backlog builds up while email isn't connected. One job per notification, and one per change,
// kind, record and recipient (event_key), so nothing is emailed twice.
//
// dispatchEmail runs from the protected route or the local runner, never from a page, so delivery doesn't depend on anyone keeping a
// tab open. Each run, in order: records that it ran; stops if the sender isn't ready; sweeps the due worlds of its sender (so time-based
// changes are stored without a page load); marks overdue jobs expired; claims due jobs in a short transaction of its own (FOR UPDATE
// SKIP LOCKED, committed before anything is sent) with a 2-minute lease; checks each one, cheapest first (consent, the sender's gate,
// read in the app, the daily cap for matches, then relevance on the committed document); renders and sends one at a time, outside any
// transaction, with a stable idempotency key; records each outcome; prunes old jobs and captures; and records a working heartbeat.
// Delivery is at least once, without duplicates where the sender honours the key: never exactly once. A sender that answers it had
// already accepted an email (a lost answer, then a retry) leaves the job sent, with the note "already_accepted". A match that another
// run's sends could take past the daily cap is handed back for the next run, so overlapping runs keep to the cap between them.
//
// It runs as the handoff role, and logs counts and error classes only: no address, id or text.

import type { Sql, TransactionSql } from "postgres";
import type { NotificationLink, WorldId } from "../types.js";
import { idempotencyKey } from "./capture.js";
import { cleanAddress, sameAddress } from "./gates.js";
import { type EmailJobRow, isEmailKind } from "./kinds.js";
import { HEARTBEAT_FRESH_MS, senderForWorld } from "./prefs.js";
import { renderEmail } from "./templates.js";
import type {
  DispatchCounts,
  DispatchDeps,
  DispatchOptions,
  EmailCategory,
  EmailMessage,
  EmailSender,
  JobRef,
  Relevance,
  SendErrorCode,
  SendResult,
  SenderKind,
  SignInKind,
} from "./types.js";

// ── Rules ────────────────────────────────────────────────────────────────────────────────

export const DISPATCH_LIMIT = 25;
export const DISPATCH_LIMIT_MAX = 100;
export const GRACE_MS = 2 * 60_000;
export const LEASE_MS = 2 * 60_000;
/** The fifth failed attempt is the last. */
export const MAX_ATTEMPTS = 5;
/** After failed attempt k (1 to 4), the next waits this long. */
export const RETRY_AFTER_MS: readonly number[] = Object.freeze([1, 5, 15, 60].map((m) => m * 60_000));
/** At most this many match emails per recipient in 24 hours, across dispatcher runs that overlap too (matchLoad). */
export const MATCH_DAILY_CAP = 5;
export const FINISHED_JOBS_KEEP_DAYS = 14;
export const CAPTURES_KEEP_DAYS = 7;
/** A send that takes longer is counted as a timeout (and retried with the same key). */
export const SEND_TIMEOUT_MS = 10_000;
/**
 * A run stops sending after this long and hands its unsent claims back, so a run stays inside the scheduler's request timeout and well
 * inside its claims' 2-minute lease.
 */
export const RUN_BUDGET_MS = 20_000;
/** Due worlds swept per run. */
export const SWEEP_WORLDS_MAX = 20;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;
const PROVIDER_ID_MAX = 200;
const SEND_CODES: ReadonlySet<string> = new Set(["timeout", "rate_limited", "server_error", "network", "rejected", "auth", "config"]);

function asSql(tx: TransactionSql): Sql {
  return tx as unknown as Sql; // postgres.js types TransactionSql without Sql's call signatures (store.ts asSql)
}

async function clockMs(q: Sql): Promise<number> {
  const [row] = await q<{ ms: number }[]>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`;
  if (!row) throw new Error("Handoff: the clock query returned no row.");
  return row.ms;
}

/** The worlds a sender handles, as a LIKE pattern: the capture every test-… world, a provider the live world only. */
const scopeOf = (kind: SenderKind): string => (kind === "capture" ? "test-%" : "live");

// ── Making jobs (in the action's transaction) ────────────────────────────────────────────

/**
 * Inserts the email jobs for notifications this transaction just wrote (rows from kinds.ts emailJobRows): only for recipients who
 * turned that category on, only while the world's sender has a fresh heartbeat, and only for notifications really stored in this
 * world for that recipient (one RB-10 dropped as a duplicate gets none). A job that already exists is left alone. Returns how many were
 * inserted. Call it inside the write's transaction, after insertNotifications; it never sends anything.
 */
export async function insertEmailJobs(
  tx: Sql,
  o: { worldId: WorldId; changeId: string; now: number; rows: readonly EmailJobRow[] },
): Promise<number> {
  if (o.rows.length === 0) return 0;
  if (typeof o.changeId !== "string" || !UUID.test(o.changeId)) throw new TypeError("Handoff: a change id is a UUID.");
  if (typeof o.now !== "number" || !Number.isFinite(o.now)) throw new TypeError("Handoff: now must be a finite number of ms.");
  const sender = senderForWorld(o.worldId);
  const now = new Date(o.now);
  const inserted = await tx`
    INSERT INTO email_jobs (world_id, notification_id, user_id, kind, category, ref, link, event_key, retry_at, expires_at, created_at, updated_at)
    SELECT ${o.worldId}, n.id, n.user_id, n.kind, n.category, n.ref, n.link, ${o.changeId} || ':' || n.kind || ':' || n.ref,
           ${now}::timestamptz, ${now}::timestamptz + make_interval(secs => n.ttl_s), ${now}::timestamptz, ${now}::timestamptz
    FROM jsonb_to_recordset(${JSON.stringify(o.rows)}::text::jsonb)
      AS n(id text, user_id text, kind text, category text, ref text, link jsonb, ttl_s int)
    JOIN notifications nt ON nt.world_id = ${o.worldId} AND nt.id = n.id AND nt.user_id = n.user_id
    JOIN email_prefs p ON p.user_id = n.user_id AND CASE n.category WHEN 'exchange' THEN p.exchange_on ELSE p.matches_on END
    WHERE EXISTS (SELECT 1 FROM email_dispatch d WHERE d.sender = ${sender} AND d.last_ok_at > ${new Date(o.now - HEARTBEAT_FRESH_MS)})
    ON CONFLICT DO NOTHING`;
  return inserted.count;
}

/** Deletes a world's finished jobs over 14 days old and its captures over 7 days old (store.ts pruneIn calls it for its world). */
export async function pruneEmailIn(tx: Sql, worldId: WorldId, now: number): Promise<number> {
  const jobs = await tx`
    DELETE FROM email_jobs
    WHERE world_id = ${worldId} AND status IN ('sent', 'skipped', 'dead') AND updated_at < ${new Date(now - FINISHED_JOBS_KEEP_DAYS * DAY_MS)}`;
  const captures = await tx`DELETE FROM email_capture WHERE world_id = ${worldId} AND captured_at < ${new Date(now - CAPTURES_KEEP_DAYS * DAY_MS)}`;
  return jobs.count + captures.count;
}

// ── The dispatcher ───────────────────────────────────────────────────────────────────────

/** A job this run claimed. */
interface Claimed extends JobRef {
  worldId: WorldId;
  category: EmailCategory;
  /** The attempt this claim is (attempts after the claim): an outcome is recorded only while the job is still this claim. */
  attempts: number;
  retryAt: number;
  createdAt: number;
}

/** What the consent check reads for a claimed job. */
interface Consent {
  address: string | null;
  signIn: SignInKind | null;
  exchangeOn: boolean;
  matchesOn: boolean;
  current: string | null;
  read: boolean;
}

/** A sent job's note when the sender answered that it had already accepted this email (SendResult.duplicate); otherwise none. */
const ALREADY_ACCEPTED = "already_accepted";

type Outcome =
  | { status: "sent"; providerId: string | null; reason: typeof ALREADY_ACCEPTED | null }
  | { status: "failed"; reason: string; retryAt: number }
  | { status: "skipped" | "dead"; reason: string };

const zero = (): DispatchCounts => ({ swept: 0, claimed: 0, sent: 0, failed: 0, skipped: 0, dead: 0, expired: 0, pruned: 0 });
const keyOf = (j: { worldId: string; notificationId: string }): string => `${j.worldId}\n${j.notificationId}`;

/** One dispatcher run (see the top of this file). Throws only for a caller's mistake or a database failure; claims then wait out their lease. */
export async function dispatchEmail(sql: Sql, o: DispatchOptions, deps: DispatchDeps): Promise<DispatchCounts> {
  const sender = o.sender;
  const kind = sender?.kind;
  if (kind !== "capture" && kind !== "provider") throw new TypeError("Handoff: dispatchEmail needs a sender.");
  if ((kind === "capture") !== (o.worlds === "test")) throw new TypeError("Handoff: the capture handles test worlds only, and a provider the live world only.");
  const limit = o.limit ?? DISPATCH_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > DISPATCH_LIMIT_MAX) throw new TypeError(`Handoff: limit is a whole number from 1 to ${DISPATCH_LIMIT_MAX}.`);
  const graceMs = o.graceMs ?? GRACE_MS;
  if (!Number.isInteger(graceMs) || graceMs < 0 || graceMs > 3_600_000 || (graceMs === 0 && kind !== "capture")) {
    throw new TypeError("Handoff: graceMs is 0 to 3600000 ms, and 0 only with the capture.");
  }
  if (o.now !== undefined && (typeof o.now !== "number" || !Number.isFinite(o.now))) throw new TypeError("Handoff: now must be a finite number of ms.");
  if (typeof o.siteUrl !== "string" || !o.siteUrl) throw new TypeError("Handoff: dispatchEmail needs the site's URL.");

  const counts = zero();
  const started = Date.now();
  const scope = scopeOf(kind);
  const nowFor = async (): Promise<number> => o.now ?? (await clockMs(sql));

  let now = await nowFor();
  await sql`
    INSERT INTO email_dispatch (sender, last_run_at) VALUES (${kind}, ${new Date(now)})
    ON CONFLICT (sender) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`;
  if (!(await isReady(sender))) {
    console.warn(`[handoff] email dispatch (${kind}): the sender isn't ready; nothing sent.`);
    return counts;
  }

  // Time-based changes are stored even with no page open (their in-app notifications, and any jobs they make).
  const due = await sql<{ id: string }[]>`
    SELECT id FROM worlds WHERE id LIKE ${scope} AND next_due IS NOT NULL AND next_due <= ${new Date(now)}
    ORDER BY next_due LIMIT ${SWEEP_WORLDS_MAX}`;
  for (const { id } of due) {
    try {
      if (await deps.sweepDue(sql, id as WorldId, o.now)) counts.swept += 1;
    } catch (e) {
      console.warn("[handoff] email dispatch: a sweep failed", { error: errorClass(e) });
    }
  }
  now = await nowFor();

  // Overdue, and attempts used up after a crash: final, without sending.
  const expired = await sql`
    UPDATE email_jobs SET status = 'skipped', reason = 'expired', lease_until = NULL, updated_at = ${new Date(now)}
    WHERE world_id LIKE ${scope} AND expires_at <= ${new Date(now)}
      AND (status IN ('pending', 'failed') OR (status = 'sending' AND lease_until <= ${new Date(now)}))`;
  counts.expired = expired.count;
  const spent = await sql`
    UPDATE email_jobs SET status = 'dead', reason = 'attempts', lease_until = NULL, updated_at = ${new Date(now)}
    WHERE world_id LIKE ${scope} AND status = 'sending' AND lease_until <= ${new Date(now)} AND attempts >= ${MAX_ATTEMPTS}`;
  counts.dead += spent.count;

  const { jobs: claimed, unknown } = await claim(sql, scope, now, limit, graceMs);
  counts.claimed = claimed.length + unknown.length;
  for (const u of unknown) {
    // A kind this code doesn't send (a later version's, after a rollback): final at once, rather than leased until its attempts run out.
    const gone = await sql`
      UPDATE email_jobs SET status = 'dead', reason = 'unknown_kind', lease_until = NULL, updated_at = ${new Date(now)}
      WHERE world_id = ${u.world_id} AND notification_id = ${u.notification_id} AND status = 'sending' AND attempts = ${u.attempts}`;
    counts.dead += gone.count;
  }
  let configFailure = false;
  if (claimed.length > 0) configFailure = await work(sql, o, deps, claimed, now, started, counts);

  counts.pruned = await prune(sql, scope, now);
  if (!configFailure) await sql`UPDATE email_dispatch SET last_ok_at = ${new Date(now)} WHERE sender = ${kind}`;
  if (counts.claimed + counts.expired + counts.dead + counts.swept > 0 || configFailure) {
    console.info(`[handoff] email dispatch (${kind})`, { ...counts, ...(configFailure ? { stopped: "auth or config" } : {}) });
  }
  return counts;
}

async function isReady(sender: EmailSender): Promise<boolean> {
  try {
    return (await sender.ready()) === true;
  } catch {
    return false;
  }
}

/**
 * Claims due jobs (exchange emails first) in a transaction of its own, committed before anything is sent. `unknown`: claimed jobs of a
 * kind this code doesn't send.
 */
async function claim(
  sql: Sql,
  scope: string,
  now: number,
  limit: number,
  graceMs: number,
): Promise<{ jobs: Claimed[]; unknown: { world_id: string; notification_id: string; attempts: number }[] }> {
  const at = new Date(now);
  const rows = await sql.begin(async (raw) => {
    const tx = asSql(raw);
    await tx.unsafe("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '15s'");
    const got = await tx<
      { world_id: string; notification_id: string; user_id: string; kind: string; category: string; ref: string; link: Record<string, unknown> | null; attempts: number; retry_at: Date; created_at: Date }[]
    >`
      WITH due AS (
        SELECT world_id, notification_id FROM email_jobs
        WHERE world_id LIKE ${scope} AND attempts < ${MAX_ATTEMPTS} AND expires_at > ${at} AND created_at <= ${new Date(now - graceMs)}
          AND ((status IN ('pending', 'failed') AND retry_at <= ${at}) OR (status = 'sending' AND lease_until <= ${at}))
        ORDER BY (category = 'match'), retry_at, created_at, notification_id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      UPDATE email_jobs j SET status = 'sending', attempts = j.attempts + 1, lease_until = ${new Date(now + LEASE_MS)}, updated_at = ${at}
      FROM due WHERE j.world_id = due.world_id AND j.notification_id = due.notification_id
      RETURNING j.world_id, j.notification_id, j.user_id, j.kind, j.category, j.ref, j.link, j.attempts, j.retry_at, j.created_at`;
    return got.map((r) => ({ ...r }));
  });
  const out: Claimed[] = [];
  const unknown: { world_id: string; notification_id: string; attempts: number }[] = [];
  for (const r of rows) {
    if (!isEmailKind(r.kind) || (r.world_id !== "live" && !TEST_WORLD.test(r.world_id))) {
      unknown.push({ world_id: r.world_id, notification_id: r.notification_id, attempts: r.attempts });
      continue;
    }
    out.push({
      worldId: r.world_id as WorldId,
      notificationId: r.notification_id,
      userId: r.user_id,
      kind: r.kind,
      category: r.category === "match" ? "match" : "exchange",
      ref: r.ref,
      link: linkOf(r.link),
      attempts: r.attempts,
      retryAt: r.retry_at.getTime(),
      createdAt: r.created_at.getTime(),
    });
  }
  out.sort((a, b) => Number(a.category === "match") - Number(b.category === "match") || a.retryAt - b.retryAt || a.createdAt - b.createdAt);
  return { jobs: out, unknown };
}

function linkOf(link: Record<string, unknown> | null): NotificationLink | null {
  if (!link || typeof link["name"] !== "string") return null;
  const str = (k: string): string | undefined => (typeof link[k] === "string" ? (link[k] as string) : undefined);
  const id = str("id");
  const tab = str("tab");
  const listing = str("listing");
  return { name: link["name"], ...(id !== undefined ? { id } : {}), ...(tab !== undefined ? { tab } : {}), ...(listing !== undefined ? { listing } : {}) };
}

/** Checks, renders and sends the claimed jobs, one at a time. True when the sender failed for its credentials or configuration. */
async function work(
  sql: Sql,
  o: DispatchOptions,
  deps: DispatchDeps,
  claimed: readonly Claimed[],
  now: number,
  started: number,
  counts: DispatchCounts,
): Promise<boolean> {
  const finish = async (job: Claimed, out: Outcome): Promise<void> => {
    if (await record(sql, job, out, now)) {
      if (out.status === "sent") counts.sent += 1;
      else if (out.status === "failed") counts.failed += 1;
      else if (out.status === "skipped") counts.skipped += 1;
      else counts.dead += 1;
    }
  };

  // 1. Consent, the sender's gate and read in the app: one query for all of them.
  const consent = await consentOf(sql, claimed);
  const open: Claimed[] = [];
  for (const job of claimed) {
    const c = consent.get(keyOf(job));
    const why = consentWhy(job, c) ?? (c && c.address && c.signIn && o.sender.allows({ address: c.address, signIn: c.signIn }) ? null : "recipient_not_allowed")
      ?? (c?.read ? "read_in_app" : null);
    if (why) await finish(job, { status: "skipped", reason: why });
    else open.push(job);
  }

  // 2. Relevance: one engine run per world, on its committed document.
  const relevance = new Map<string, Relevance>();
  const worlds = [...new Set(open.map((j) => j.worldId))];
  const unchecked = new Set<string>();
  for (const worldId of worlds) {
    const jobs = open.filter((j) => j.worldId === worldId);
    try {
      const got = await deps.checkJobs(sql, worldId, jobs.map(jobRef), o.now);
      for (const j of jobs) relevance.set(keyOf(j), got.get(j.notificationId) ?? { ok: false, why: "missing" });
    } catch (e) {
      console.warn("[handoff] email dispatch: a relevance check failed", { error: errorClass(e) });
      for (const j of jobs) unchecked.add(keyOf(j));
    }
  }

  // 3. The daily cap, relevance, then one send at a time.
  let stop = false;
  for (const job of open) {
    if (stop || Date.now() - started > RUN_BUDGET_MS) {
      await release(sql, job, now); // not sent in this run: back as it was, for the next
      continue;
    }
    if (unchecked.has(keyOf(job))) {
      await finish(job, failure(job, "check", now));
      continue;
    }
    if (job.category === "match") {
      const load = await matchLoad(sql, job, claimed, now);
      if (load.sent >= MATCH_DAILY_CAP) {
        await finish(job, { status: "skipped", reason: "daily_cap" });
        continue;
      }
      if (load.sent + load.elsewhere >= MATCH_DAILY_CAP) {
        // Another run is sending this person's matches right now, and with those this one could pass the cap: handed back unsent, for
        // the next run to decide, so runs that overlap never send more than the cap between them.
        await release(sql, job, now);
        continue;
      }
    }
    const rel = relevance.get(keyOf(job));
    if (!rel || !rel.ok) {
      await finish(job, { status: "skipped", reason: `not_relevant:${rel ? rel.why : "missing"}` });
      continue;
    }
    const email = renderEmail(job.kind, rel.facts, o.siteUrl);
    const c = consent.get(keyOf(job));
    if (!email || !c?.address) {
      await finish(job, { status: "skipped", reason: "not_relevant:missing" });
      continue;
    }
    const message: EmailMessage = {
      to: c.address,
      subject: email.subject,
      text: email.text,
      html: email.html,
      idempotencyKey: idempotencyKey(job.worldId, job.notificationId),
      actionUrl: email.actionUrl,
    };
    const result = await sendOnce(o.sender, message);
    if (!result.ok && (result.code === "auth" || result.code === "config")) stop = true; // every later send would fail the same way
    await finish(job, outcomeOf(job, result, now));
  }
  return stop;
}

const jobRef = (j: Claimed): JobRef => ({ notificationId: j.notificationId, userId: j.userId, kind: j.kind, ref: j.ref, link: j.link });

async function consentOf(sql: Sql, jobs: readonly Claimed[]): Promise<Map<string, Consent>> {
  const rows = await sql<
    { world_id: string; notification_id: string; address: string | null; sign_in: string | null; exchange_on: boolean | null; matches_on: boolean | null; current: string | null; read: boolean | null }[]
  >`
    SELECT j.world_id, j.notification_id, p.address, p.sign_in, p.exchange_on, p.matches_on, pe.email AS current, n.read_at IS NOT NULL AS read
    FROM email_jobs j
    LEFT JOIN email_prefs p ON p.user_id = j.user_id
    LEFT JOIN people pe ON pe.user_id = j.user_id
    LEFT JOIN notifications n ON n.world_id = j.world_id AND n.id = j.notification_id
    WHERE j.world_id = ANY(${[...new Set(jobs.map((j) => j.worldId))]}::text[])
      AND j.notification_id = ANY(${jobs.map((j) => j.notificationId)}::text[])`;
  const out = new Map<string, Consent>();
  for (const r of rows) {
    out.set(keyOf({ worldId: r.world_id, notificationId: r.notification_id }), {
      address: r.address,
      signIn: r.sign_in === "google" || r.sign_in === "dev" ? r.sign_in : null,
      exchangeOn: r.exchange_on === true,
      matchesOn: r.matches_on === true,
      current: r.current,
      read: r.read === true,
    });
  }
  return out;
}

/** Consent, cheapest first: none for this category, no address on the account, or not the address they turned it on for. */
function consentWhy(job: Claimed, c: Consent | undefined): string | null {
  if (!c || c.address === null || !(job.category === "exchange" ? c.exchangeOn : c.matchesOn)) return "opted_out";
  if (cleanAddress(c.current) === null) return "no_address";
  if (!sameAddress(c.address, c.current)) return "address_changed";
  return null;
}

/**
 * A recipient's match emails, for the daily cap: `sent` in the last 24 hours, and `elsewhere`, the ones another dispatcher run holds
 * right now (sending, and not one of this run's own claims, which it sends one at a time and counts as they're sent). One statement, so
 * a job another run is recording is counted once, as one or the other.
 */
async function matchLoad(sql: Sql, job: Claimed, mine: readonly Claimed[], now: number): Promise<{ sent: number; elsewhere: number }> {
  const own = mine.filter((j) => j.worldId === job.worldId && j.userId === job.userId);
  const [row] = await sql<{ sent: number; elsewhere: number }[]>`
    SELECT (count(*) FILTER (WHERE j.status = 'sent' AND j.sent_at > ${new Date(now - DAY_MS)}))::int AS sent,
           (count(*) FILTER (WHERE j.status = 'sending' AND NOT EXISTS (
              SELECT 1 FROM unnest(${own.map((j) => j.notificationId)}::text[], ${own.map((j) => j.attempts)}::int[]) AS m(id, attempts)
              WHERE m.id = j.notification_id AND m.attempts = j.attempts)))::int AS elsewhere
    FROM email_jobs j
    WHERE j.world_id = ${job.worldId} AND j.user_id = ${job.userId} AND j.category = 'match'`;
  return { sent: row?.sent ?? 0, elsewhere: row?.elsewhere ?? 0 };
}

/** One send, never longer than SEND_TIMEOUT_MS, and never a throw: anything unexpected is a retryable failure. */
async function sendOnce(sender: EmailSender, m: EmailMessage): Promise<SendResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, retryable: true, code: "timeout" }), SEND_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([sender.send(m), timeout]);
    return checkedResult(result);
  } catch (e) {
    console.warn("[handoff] email dispatch: a send threw", { error: errorClass(e) });
    return { ok: false, retryable: true, code: "network" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** A sender's answer as SendResult says it is; anything else counts as a retryable server error. */
function checkedResult(r: unknown): SendResult {
  if (typeof r === "object" && r !== null) {
    const x = r as Record<string, unknown>;
    if (x["ok"] === true) {
      const id = x["providerId"];
      const providerId = typeof id === "string" && id.length > 0 && id.length <= PROVIDER_ID_MAX ? id : null;
      return x["duplicate"] === true ? { ok: true, providerId, duplicate: true } : { ok: true, providerId };
    }
    if (x["ok"] === false && typeof x["code"] === "string" && SEND_CODES.has(x["code"])) {
      return { ok: false, retryable: x["retryable"] === true, code: x["code"] as SendErrorCode };
    }
  }
  return { ok: false, retryable: true, code: "server_error" };
}

/**
 * What a send's answer makes of the job: sent (with a note when the sender had already accepted it and sent nothing more); failed and
 * retried later (auth and config too); or dead when permanent or out of attempts.
 */
function outcomeOf(job: Claimed, r: SendResult, now: number): Outcome {
  if (r.ok) return { status: "sent", providerId: r.providerId, reason: r.duplicate === true ? ALREADY_ACCEPTED : null };
  const retry = r.retryable || r.code === "auth" || r.code === "config";
  if (!retry) return { status: "dead", reason: r.code };
  return failure(job, r.code, now);
}

function failure(job: Claimed, code: string, now: number): Outcome {
  if (job.attempts >= MAX_ATTEMPTS) return { status: "dead", reason: "attempts" };
  const wait = RETRY_AFTER_MS[Math.min(job.attempts, RETRY_AFTER_MS.length) - 1] ?? RETRY_AFTER_MS[RETRY_AFTER_MS.length - 1] ?? 60_000;
  return { status: "failed", reason: `retry:${code}`, retryAt: now + wait };
}

/** Records an outcome, only while the job is still this run's claim (another run may have taken it over after a lapsed lease). */
async function record(sql: Sql, job: Claimed, out: Outcome, now: number): Promise<boolean> {
  const at = new Date(now);
  const sent = out.status === "sent";
  const done = await sql`
    UPDATE email_jobs
    SET status = ${out.status}, reason = ${out.reason}, sent_at = ${sent ? at : null}, provider_id = ${sent ? out.providerId : null},
        retry_at = COALESCE(${out.status === "failed" ? new Date(out.retryAt) : null}::timestamptz, retry_at), lease_until = NULL, updated_at = ${at}
    WHERE world_id = ${job.worldId} AND notification_id = ${job.notificationId} AND status = 'sending' AND attempts = ${job.attempts}`;
  return done.count === 1;
}

/**
 * Hands a claim back unsent (the run ran out of time, the sender's configuration failed, or another run's sends could take a match past
 * the daily cap): as it was before, for the next run.
 */
async function release(sql: Sql, job: Claimed, now: number): Promise<void> {
  await sql`
    UPDATE email_jobs SET status = CASE WHEN attempts <= 1 THEN 'pending' ELSE 'failed' END, attempts = attempts - 1, lease_until = NULL,
      updated_at = ${new Date(now)}
    WHERE world_id = ${job.worldId} AND notification_id = ${job.notificationId} AND status = 'sending' AND attempts = ${job.attempts}`;
}

/** Finished jobs over 14 days old and captures over 7 days old, in the sender's worlds. */
async function prune(sql: Sql, scope: string, now: number): Promise<number> {
  const jobs = await sql`
    DELETE FROM email_jobs
    WHERE world_id LIKE ${scope} AND status IN ('sent', 'skipped', 'dead') AND updated_at < ${new Date(now - FINISHED_JOBS_KEEP_DAYS * DAY_MS)}`;
  const captures = await sql`DELETE FROM email_capture WHERE world_id LIKE ${scope} AND captured_at < ${new Date(now - CAPTURES_KEEP_DAYS * DAY_MS)}`;
  return jobs.count + captures.count;
}

function errorClass(e: unknown): string {
  if (e instanceof Error) return e.name || "Error";
  return typeof e;
}
