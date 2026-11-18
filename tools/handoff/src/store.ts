// Handoff's shared data: every SQL statement the tool runs. The page folder (page.tsx, actions.ts)
// passes the pool from toolSql("handoff") and the signed-in user, who always comes from the session.
// The marketplace rules are reached only through an EnginePort (engine-port.ts): the real engine by
// default, or a test's stand-in.
//
// Writes (applyAction, C-DESIGN §4.1). The action is parsed before any lock. Then one transaction:
// lock the world's row (SELECT … FOR UPDATE; a world's first write creates the row in the same
// transaction); run the reducer as the session's user at the
// database's clock; refuse the write only if it introduces an invariant violation; save the
// document; write the action's notifications to their own table; log the action, so a retry with
// the same request id returns its first outcome. The actor's view is built after COMMIT.
//
// Every write takes the same lock first, so writes form one order and each is checked against the
// result of every earlier one, across app instances too (§4.3).
//
// Reads (getView, §4.2): the committed document, swept first if a deadline has passed, then
// projected for the viewer from allowlists.
//
// Guests (getGuestView, refreshGuestView; C-CONTRACT §7): a signed-out visitor's view, from the guest
// allowlists, with no viewer. A pure read: no profile row, no world created, no expiry sweep, no lock.

import { createHash, randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { checkPayMethods, readPayMethods } from "../engine/index.js";
import { errorCode, isBusy, setupErrorKind, unavailableMessage } from "./db-errors.js";
import { insertEmailJobs, pruneEmailIn } from "./email/dispatch.js";
import { emailJobRows } from "./email/kinds.js";
import { readEmailState } from "./email/prefs.js";
import { emailRelevance } from "./email/relevance.js";
import type { DispatchDeps, JobRef, Relevance } from "./email/types.js";
import { enginePort } from "./engine-port.js";
import type { EngineNote, EnginePort, LiveAction, ReduceResult, WorldDoc } from "./engine-port.js";
import { PHOTO_NOT_HERE_ERROR, photoRefOf } from "./photo.js";
import type { Photo, PhotoMime } from "./photo.js";
import type {
  ActOutcome,
  Actor,
  GuestRefreshOutcome,
  GuestView,
  NotificationLink,
  PayMethod,
  PersonRow,
  RefreshOutcome,
  SeqStep,
  View,
  ViewNotification,
  WorldId,
} from "./types.js";

// ── What users are told ──────────────────────────────────────────────────────────────────

export const INTERNAL_ERROR = "Something went wrong. Nothing was changed.";
export const BUSY_ERROR = "Handoff is busy. Try again in a moment.";
export const FULL_ERROR = "Handoff's shared data has reached its size limit, so this change wasn't saved.";
export const BAD_REQUEST_ERROR = "This change couldn't be sent. Reload the page and try again.";
export const REUSED_REQUEST_ERROR = "This change was already sent with different details. Reload the page and try again.";
/** After COMMIT the change is real, so a failure to build the view must never say "Nothing was changed". */
export const SAVED_NO_VIEW_ERROR = "Your change was saved, but Handoff couldn't load the latest data. Reload the page.";
const REFUSED_FALLBACK = "That can't be done right now.";
const RELOAD_SUFFIX = " Reload the page to see the latest.";

// ── Limits ───────────────────────────────────────────────────────────────────────────────

/** Above this the document is logged on every write: archiving is due (C-DESIGN §1.4, J2-12). */
export const DOC_WARN_BYTES = 2 * 1024 * 1024;
/** Above this a write that grows the document is refused ("full"); writes that shrink it still go through. */
export const DOC_MAX_BYTES = 5 * 1024 * 1024;
export const NOTIFICATIONS_IN_VIEW = 100;
/**
 * The first write of each New York day prunes old actions, read notifications and extra snapshots, and so does every write
 * whose version is a multiple of this (review P4: by version alone, a quiet world kept its actions for weeks).
 */
export const PRUNE_EVERY_VERSIONS = 50;
export const ACTIONS_KEEP_DAYS = 7;
export const READ_NOTIFICATIONS_KEEP_DAYS = 90;
/** Daily snapshots: the newest 7, and none older than DAILY_SNAPSHOT_KEEP_DAYS except the newest DAILY_SNAPSHOTS_ALWAYS_KEPT. */
export const DAILY_SNAPSHOTS_KEPT = 7;
export const DAILY_SNAPSHOT_KEEP_DAYS = 7;
/** The latest write's own snapshot and the rollback point before it, kept whatever their age (a quiet world has no others). */
export const DAILY_SNAPSHOTS_ALWAYS_KEPT = 2;
export const UPGRADE_SNAPSHOTS_KEPT = 3;
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const STATEMENT_TIMEOUT = "15s";
const DAY_MS = 86_400_000;
const NEW_YORK = "America/New_York";
/** actions.actor_id for expiry sweeps, which run with no actor. No user id may take it. */
const SYSTEM_ACTOR = "system";
/** people.name is required, but an account's name can be empty. Not the email: emails are private. */
const FALLBACK_NAME = "Classmate";
const NAME_MAX = 120;
const EMAIL_MAX = 254;
const USER_ID_MAX = 64;
const PAY_HANDLE_MAX = 60;
const NOTE_TEXT_MAX = 2000;
const MAX_READ_IDS = 200;
/** How many violation keys one log line names; the count is always complete. */
const VIOLATIONS_LOGGED = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;
const NOTE_ID = /^[0-9a-z-]{1,48}$/;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROLS = /[\u0000-\u001f\u007f]/g;

// ── Public API ───────────────────────────────────────────────────────────────────────────

/** Test-only hooks, called with the world's lock held and just before COMMIT. */
export interface ApplyHooks {
  afterLock?(): Promise<void>;
  beforeCommit?(): Promise<void>;
}

export interface ApplyInput {
  worldId: WorldId;
  /** The session's user. */
  actor: Actor;
  /** The browser's id for one intent (a UUID), reused when it retries. */
  requestId: string;
  /** The action as received; parsed before anything else. */
  action: unknown;
  /**
   * §9s item 6: an image the server already accepted (photo.ts), sent beside "Post item" or setItemPhoto. Its bytes go to item_photos
   * in the action's own transaction, and the document gets only its reference. With any other action it is refused ("invalid").
   */
  photo?: Photo;
  /** Tests only: the time to run at (ms). actions.ts never passes it, so writes use the database's clock. */
  now?: number;
  /** Tests only: false skips FOR UPDATE and the version guard (the race test's negative control). */
  lock?: boolean;
  /** Tests only: how long to wait for the world's lock (default 5000 ms). */
  lockTimeoutMs?: number;
  /** Tests only. */
  hooks?: ApplyHooks;
}

export interface PruneCounts {
  actions: number;
  notifications: number;
  snapshots: number;
  /** Follow-on B4: the world's finished email jobs over 14 days old and its captured emails over 7 days old (email/dispatch.ts). */
  email: number;
}

/** True for "live" and for "test-…" world ids: the same rule as the worlds.id CHECK. */
export function isWorldId(value: unknown): value is WorldId {
  return value === "live" || (typeof value === "string" && TEST_WORLD.test(value));
}

/**
 * Creates or refreshes the user's profile row from the session's name and email, on every page load and action.
 * Writes only when the name or email changed. Needs neither the world's lock nor a version bump.
 */
export async function ensurePerson(sql: Sql, actor: Actor): Promise<void> {
  assertUserId(actor.id);
  const name = cleanName(actor.name);
  const email = cleanEmail(actor.email);
  const [current] = await sql<{ name: string; email: string | null }[]>`
    SELECT name, email FROM people WHERE user_id = ${actor.id}`;
  if (current && current.name === name && current.email === email) return;
  await sql`
    INSERT INTO people (user_id, name, email) VALUES (${actor.id}, ${name}, ${email})
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()
    WHERE people.name IS DISTINCT FROM EXCLUDED.name OR people.email IS DISTINCT FROM EXCLUDED.email`;
}

/**
 * The viewer's view of a world. A world nobody has written to yet is an empty view at version 0 (nothing is
 * created). When a stored deadline has passed, the expiry is swept and stored first. Throws on database errors;
 * the page maps them with setupErrorKind.
 */
export async function getView(
  sql: Sql,
  o: { worldId: WorldId; viewer: Actor; now?: number },
  port: EnginePort = enginePort,
): Promise<View> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  await ensurePerson(sql, o.viewer);
  // The clock and the row's identity first; the document itself only when this pool hasn't cached that version.
  const head = await readHead(sql, o.worldId);
  let now = o.now ?? head.ms;
  const read = await readWorld(sql, o.worldId, head);
  let doc = read?.doc ?? port.empty();
  let version = read?.version ?? 0;
  if (read && read.next_due !== null && read.next_due.getTime() <= now) {
    try {
      ({ doc, version, now } = await sweepWorld(sql, o.worldId, o.now, port));
    } catch (e) {
      if (setupErrorKind(e)) throw e;
      // Views derive expiry from the clock, so this one is still right; the next read sweeps again.
      logFailure("sweep", o.worldId, "sweep", {}, e);
    }
  }
  return buildView(sql, port, { worldId: o.worldId, viewerId: o.viewer.id, doc, version, now });
}

/**
 * A refresh: `{unchanged: true}` when the world is still at `version`, nothing stored is due, and the tab's own view hasn't
 * reached its `nextRefreshAt`; otherwise the whole view. A view changes at its nextRefreshAt even when nothing is stored then
 * (a train leaving, an item's pickup window closing), so a tab that sends a nextRefreshAt that has come gets the whole view
 * (review INT-1). The unchanged path reads only the version and next_due.
 */
export async function refreshView(
  sql: Sql,
  o: {
    worldId: WorldId;
    viewer: Actor;
    version: number;
    /** The nextRefreshAt of the view the tab shows (null: nothing in it changes with time). */
    nextRefreshAt: number | null;
    now?: number;
  },
  port: EnginePort = enginePort,
): Promise<RefreshOutcome> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  const head = await refreshHead(sql, o);
  if (head.unchanged) return { unchanged: true, version: head.version };
  const view = await getView(
    sql,
    { worldId: o.worldId, viewer: o.viewer, ...(o.now !== undefined ? { now: o.now } : {}) },
    port,
  );
  return { unchanged: false, view };
}

/**
 * What a signed-out visitor sees (C-CONTRACT §7): the guest view, built from the guest allowlists, with no viewer. A pure read:
 * it writes nothing (no profile row, no world, no expiry sweep) and takes no lock. When a stored deadline has passed and no
 * signed-in read has swept it yet, the view is still right, since every view is computed at its own time. The engine runs it with
 * no one's profile row. Throws on database errors; the page maps them with setupErrorKind.
 */
export async function getGuestView(
  sql: Sql,
  o: { worldId: WorldId; now?: number },
  port: EnginePort = enginePort,
): Promise<GuestView> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  const head = await readHead(sql, o.worldId);
  const now = o.now ?? head.ms;
  const read = await readWorld(sql, o.worldId, head);
  const doc = read?.doc ?? port.empty();
  const version = read?.version ?? 0;
  return port.run({ doc, people: [], now }, () => port.guest(doc, { worldId: o.worldId, version, now }));
}

/**
 * A guest's refresh: `{unchanged: true}` on refreshView's terms (the world still at `version`, nothing stored due, and the tab's
 * own nextRefreshAt not reached), otherwise the whole guest view. Guests never sweep, so while a stored deadline is past due
 * (someone's hold lapsed and no signed-in read has stored it yet), each guest refresh gets the whole guest view, built at its time.
 */
export async function refreshGuestView(
  sql: Sql,
  o: {
    worldId: WorldId;
    version: number;
    /** The nextRefreshAt of the guest view the tab shows (null: nothing in it changes with time). */
    nextRefreshAt: number | null;
    now?: number;
  },
  port: EnginePort = enginePort,
): Promise<GuestRefreshOutcome> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  const head = await refreshHead(sql, o);
  if (head.unchanged) return { unchanged: true, version: head.version };
  const view = await getGuestView(sql, { worldId: o.worldId, ...(o.now !== undefined ? { now: o.now } : {}) }, port);
  return { unchanged: false, view };
}

/** The database's clock and the world's row identity (no document): one query, whether or not the world has a row. */
async function readHead(
  sql: Sql,
  worldId: WorldId,
): Promise<{ ms: number; version: number | null; xmin: string | null; next_due: Date | null }> {
  return first(
    await sql<{ ms: number; version: number | null; xmin: string | null; next_due: Date | null }[]>`
      SELECT c.ms, w.version, w.xmin::text AS xmin, w.next_due
      FROM (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms) AS c
      LEFT JOIN worlds w ON w.id = ${worldId}`,
  );
}

/**
 * Whether a refresh may answer "unchanged" (both kinds): the world is still at the tab's version, nothing stored is due, and the
 * tab's view hasn't reached its own nextRefreshAt (a view's counts change then even when nothing is stored; review INT-1).
 * Reads only the version and next_due.
 */
async function refreshHead(
  sql: Sql,
  o: { worldId: WorldId; version: number; nextRefreshAt: number | null; now?: number },
): Promise<{ unchanged: boolean; version: number }> {
  if (o.nextRefreshAt !== null && (typeof o.nextRefreshAt !== "number" || !Number.isFinite(o.nextRefreshAt))) {
    throw new TypeError("Handoff: nextRefreshAt must be a time in ms, or null.");
  }
  const read = first(
    await sql<{ ms: number; version: number | null; next_due: Date | null }[]>`
      SELECT c.ms, w.version, w.next_due
      FROM (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms) AS c
      LEFT JOIN worlds w ON w.id = ${o.worldId}`,
  );
  const now = o.now ?? read.ms;
  const version = read.version ?? 0;
  const due = read.next_due !== null && read.next_due.getTime() <= now;
  const reached = o.nextRefreshAt !== null && o.nextRefreshAt <= now;
  return { unchanged: o.version === version && !due && !reached, version };
}

/**
 * Runs one action for the session's user (C-DESIGN §4.1). Every outcome comes back as data: a database or engine
 * failure never throws, and nothing is saved unless the outcome is ok. Throws only for a caller's mistake
 * (a malformed world id, user id or test option).
 */
export async function applyAction(sql: Sql, input: ApplyInput, port: EnginePort = enginePort): Promise<ActOutcome> {
  assertWorldId(input.worldId);
  assertUserId(input.actor.id);
  assertNow(input.now);
  const lockTimeoutMs = input.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 60_000) {
    throw new TypeError("Handoff: lockTimeoutMs must be a whole number of ms from 1 to 60000.");
  }
  if (typeof input.requestId !== "string" || !UUID.test(input.requestId)) {
    return { ok: false, code: "invalid", error: BAD_REQUEST_ERROR };
  }
  // parse and actionIds are engine-side code: a bug there is an internal error, reported as data like the rest.
  let action: LiveAction;
  let ids: Record<string, string>;
  try {
    const parsed = port.parse(input.action);
    if (!parsed.ok) return { ok: false, code: "invalid", error: parsed.error };
    action = parsed.action;
    if (typeof action.type !== "string" || action.type.length === 0 || action.type.length > 40) {
      throw new TypeError("The port parsed an action without a valid type.");
    }
    ids = port.actionIds(action);
    // §9s item 6: the server's reference to the image goes into the parsed action here, so it can only be the server's own.
    if (input.photo) {
      const withPic = port.attachPhoto ? port.attachPhoto(action, photoRefOf(input.photo)) : null;
      if (!withPic) return { ok: false, code: "invalid", error: PHOTO_NOT_HERE_ERROR };
      action = withPic;
    }
  } catch (e) {
    logFailure("parse", input.worldId, "(unparsed)", {}, e);
    return { ok: false, code: "internal", error: INTERNAL_ERROR };
  }
  const spec: WriteSpec = {
    worldId: input.worldId,
    actorId: input.actor.id,
    requestId: input.requestId,
    action,
    ids,
    photo: input.photo,
    now: input.now,
    lock: input.lock !== false,
    lockTimeoutMs,
    hooks: input.hooks,
  };

  let written: Written;
  try {
    await ensurePerson(sql, input.actor);
    written = await write(sql, spec, port);
  } catch (e) {
    return failedOutcome(e, spec);
  }
  if (written.kind === "mismatch") return { ok: false, code: "invalid", error: REUSED_REQUEST_ERROR };
  if (written.kind === "applied") logExistingViolations(input.worldId, written.version, written.existing);

  let view: View;
  try {
    view = await buildView(sql, port, {
      worldId: input.worldId,
      viewerId: input.actor.id,
      doc: written.doc,
      version: written.version,
      now: written.now,
    });
  } catch (e) {
    logFailure("view after action", spec.worldId, action.type, spec.ids, e);
    return { ok: false, code: "internal", error: afterCommitError(written) };
  }
  return outcomeOf(written, view);
}

/** A stored photo as the route serves it: what it is, its bytes and its version (the ETag). */
export interface StoredPhoto {
  mime: PhotoMime;
  bytes: Uint8Array;
  version: string;
}

const ITEM_ID = /^g[0-9a-f]{16}$/;
const PHOTO_VERSION = /^[0-9a-f]{16}$/;

/**
 * An item's photo for one viewer (§9s item 6), or null: served only when that viewer's view shows the item with its photo right now
 * (the port's photoFor: a signed-out visitor, viewerId null, only while the item is available; a signed-in account until it ends).
 * `version`, when given, must be the photo's current one, so an address made for an earlier photo serves nothing. A pure read: no
 * lock, no sweep, no profile row; the document usually comes from this pool's cache. An id or version that isn't one is null too.
 */
export async function readItemPhoto(
  sql: Sql,
  o: { worldId: WorldId; itemId: string; viewerId: string | null; version?: string; now?: number },
  port: EnginePort = enginePort,
): Promise<StoredPhoto | null> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  if (typeof o.itemId !== "string" || !ITEM_ID.test(o.itemId)) return null;
  if (o.version !== undefined && (typeof o.version !== "string" || !PHOTO_VERSION.test(o.version))) return null;
  const photoFor = port.photoFor;
  if (!photoFor) return null;
  const head = await readHead(sql, o.worldId);
  const read = await readWorld(sql, o.worldId, head);
  if (!read) return null;
  const doc = read.doc;
  const ref = port.run({ doc, people: [], now: o.now ?? head.ms }, () => photoFor(doc, o.itemId, o.viewerId));
  if (!ref || (o.version !== undefined && o.version !== ref.v)) return null;
  const [row] = await sql<{ mime: PhotoMime; bytes: Uint8Array; version: string }[]>`
    SELECT mime, bytes, version FROM item_photos WHERE world_id = ${o.worldId} AND item_id = ${o.itemId} AND version = ${ref.v}`;
  return row ? { mime: row.mime, bytes: row.bytes, version: row.version } : null;
}

/**
 * Marks the user's own notifications read: some by id, or "all". Scoped to the user in SQL, so another user's
 * ids change nothing. Takes no world lock and doesn't change the version. Returns how many were marked.
 */
export async function markNotificationsRead(
  sql: Sql,
  o: { worldId: WorldId; userId: string; ids: string[] | "all" },
): Promise<number> {
  assertWorldId(o.worldId);
  assertUserId(o.userId);
  if (o.ids === "all") {
    const all = await sql`
      UPDATE notifications SET read_at = clock_timestamp()
      WHERE world_id = ${o.worldId} AND user_id = ${o.userId} AND read_at IS NULL`;
    return all.count;
  }
  if (!Array.isArray(o.ids)) throw new TypeError('Handoff: ids must be a list of notification ids or "all".');
  // An id that doesn't match the table's pattern can't exist, so leaving it out changes nothing.
  const ids = [...new Set(o.ids.filter((id): id is string => typeof id === "string" && NOTE_ID.test(id)))];
  if (ids.length === 0) return 0;
  const some = await sql`
    UPDATE notifications SET read_at = clock_timestamp()
    WHERE world_id = ${o.worldId} AND user_id = ${o.userId} AND read_at IS NULL
      AND id = ANY(${ids.slice(0, MAX_READ_IDS)}::text[])`;
  return some.count;
}

/**
 * Saves the user's payment handle ("" clears it), the one handle profiles held before follow-on B1. No server action calls it since
 * protocol 2 (saveMyProfile takes payMethods only: savePayMethods); it stays for the tests that build a profile from before B1, which
 * reads as one "other" method. The handle replaces any saved methods (pay_methods). Profiles are shared by all worlds; given `worldId`,
 * clearing it is refused while one of the user's listings there depends on it (savePayMethods' rule).
 */
export async function saveProfile(
  sql: Sql,
  o: { userId: string; payHandle: string; worldId?: WorldId; /** Tests only: the time the guard reads the world at. */ now?: number },
  port: EnginePort = enginePort,
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertUserId(o.userId);
  if (o.worldId !== undefined) assertWorldId(o.worldId);
  assertNow(o.now);
  if (typeof o.payHandle !== "string") return { ok: false, error: "Enter a payment handle, or leave it empty." };
  const handle = o.payHandle.trim();
  if (HAS_CONTROL.test(handle)) return { ok: false, error: "The payment handle can't contain line breaks." };
  if (Array.from(handle).length > PAY_HANDLE_MAX) {
    return { ok: false, error: `Keep the payment handle to ${PAY_HANDLE_MAX} characters.` };
  }
  return sql.begin(async (raw): Promise<{ ok: true } | { ok: false; error: string }> => {
    const tx = asSql(raw);
    const needed = !handle && o.worldId !== undefined ? await payStillNeeded(tx, sql, o.worldId, o.userId, port, o.now) : null;
    if (needed) return { ok: false, error: lastMethodError(needed) };
    const saved = await tx`UPDATE people SET pay_handle = ${handle}, pay_methods = '[]'::jsonb, updated_at = NOW() WHERE user_id = ${o.userId}`;
    return saved.count === 1 ? { ok: true } : { ok: false, error: NO_PROFILE_ERROR };
  });
}

/** Removing the last way to be paid while open listings need it (follow-on B1). */
export const LAST_METHOD_ERROR = "Buyers of your open listings need a way to pay you. Keep one method, or close those listings first.";
/**
 * The same refusal once invite to pay is the live flow (follow-on B5): an open listing alone needs no method then. What does is a
 * buyer the seller has invited, or an older offer or reply that's still open (the port's payNeededRule says which rule applies).
 */
export const LAST_METHOD_OPEN_ERROR = "A buyer you've invited, or whose offer is still open, needs a way to pay you. Keep one method, or withdraw the invitation or decline the offer first.";
const lastMethodError = (rule: "listing" | "exchange"): string => (rule === "exchange" ? LAST_METHOD_OPEN_ERROR : LAST_METHOD_ERROR);
const NO_PROFILE_ERROR = "Your profile isn't set up yet. Reload the page and try again.";

/**
 * Saves the user's payment methods (follow-on B1; C-CONTRACT §1 saveMyProfile): 0 to 2, the first preferred, checked and normalized
 * by the engine's checkPayMethods (a refusal names the method it's about: `index`). Saving replaces a handle saved before B1
 * (pay_handle is emptied). Removing every method is refused while one of the user's listings in `worldId` could still take a new buyer
 * and has no handle of its own (the engine's payNeededBy), under the world's lock, so a listing posted meanwhile is counted. Profiles
 * are shared by all worlds; nothing else is locked.
 */
export async function savePayMethods(
  sql: Sql,
  o: { userId: string; payMethods: unknown; worldId?: WorldId; /** Tests only: the time the guard reads the world at. */ now?: number },
  port: EnginePort = enginePort,
): Promise<{ ok: true; methods: PayMethod[] } | { ok: false; error: string; index: 0 | 1 | null }> {
  assertUserId(o.userId);
  if (o.worldId !== undefined) assertWorldId(o.worldId);
  assertNow(o.now);
  const checked = checkPayMethods(o.payMethods);
  if (!checked.ok) return { ok: false, error: checked.error, index: checked.index };
  const methods: PayMethod[] = checked.methods.map((m) => ({ kind: m.kind, value: m.value }));
  // The JSON goes in as text and is cast in SQL, as the world's document does (bound straight to jsonb, it would be encoded twice).
  const json = JSON.stringify(methods);
  return sql.begin(async (raw): Promise<{ ok: true; methods: PayMethod[] } | { ok: false; error: string; index: 0 | 1 | null }> => {
    const tx = asSql(raw);
    const needed = methods.length === 0 && o.worldId !== undefined ? await payStillNeeded(tx, sql, o.worldId, o.userId, port, o.now) : null;
    if (needed) return { ok: false, error: lastMethodError(needed), index: null };
    const saved = await tx`
      UPDATE people SET pay_methods = ${json}::text::jsonb, pay_handle = '', updated_at = NOW() WHERE user_id = ${o.userId}`;
    return saved.count === 1 ? { ok: true, methods } : { ok: false, error: NO_PROFILE_ERROR, index: null };
  });
}

/**
 * Whether something of the user's in the world still needs their saved methods (the engine's payNeededBy), read under the world's
 * lock (bounded as a write's wait is), so a change that removes them is ordered with the writes that list, invite or reserve. Says by
 * which rule (the port's payNeededRule: open listings until invite to pay is switched on, then open invitations and offers), or null
 * when nothing does, or the world has no row yet.
 */
async function payStillNeeded(tx: Sql, sql: Sql, worldId: WorldId, userId: string, port: EnginePort, at?: number): Promise<"listing" | "exchange" | null> {
  await tx.unsafe(`SET LOCAL lock_timeout = '${DEFAULT_LOCK_TIMEOUT_MS}ms'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
  const row = await lockWorld(tx, sql, { worldId, lock: true });
  if (!row) return null;
  const now = at ?? (await clockMs(tx)); // the database's clock, read after the lock, as a write's is
  const doc = row.doc;
  return engine(() => port.run({ doc, people: [], now }, () => (port.payNeeded(doc, userId) > 0 ? (port.payNeededRule ? port.payNeededRule() : "listing") : null)));
}

/**
 * Deletes a world's actions older than 7 days, its read notifications older than 90 days, and snapshots over their caps:
 * daily ones beyond the newest 7 or older than 7 days (except the newest 2), and before-upgrade ones beyond 3; manual ones are
 * kept. Writes run this too: the first write of each New York day, and every 50th version.
 */
export async function pruneWorld(sql: Sql, worldId: WorldId, now?: number): Promise<PruneCounts> {
  assertWorldId(worldId);
  assertNow(now);
  return sql.begin(async (raw): Promise<PruneCounts> => {
    const tx = asSql(raw);
    return pruneIn(tx, worldId, now ?? (await clockMs(tx)));
  });
}

// ── Email updates: the dispatcher's hooks (follow-on B4; email/dispatch.ts) ──────────────

/**
 * The dispatcher's sweep (DispatchDeps.sweepDue): stores the world's expiry through the write path when its next_due has passed, so
 * time-based changes (and the notifications and email jobs they make) never wait for someone to open a page. True when it swept.
 */
export async function sweepDue(sql: Sql, worldId: WorldId, now?: number, port: EnginePort = enginePort): Promise<boolean> {
  assertWorldId(worldId);
  assertNow(now);
  const head = await readHead(sql, worldId);
  if (head.next_due === null || head.next_due.getTime() > (now ?? head.ms)) return false;
  await sweepWorld(sql, worldId, now, port);
  return true;
}

/**
 * The dispatcher's check (DispatchDeps.checkJobs): each job's emailRelevance on the committed document (this pool's cached copy when
 * it's current), in the engine with every profile's name and no one's email, at `now` (the database's clock unless a test gives one).
 * A world with no row answers "missing" for every job. Reads only.
 */
export async function checkEmailJobs(sql: Sql, worldId: WorldId, jobs: readonly JobRef[], now?: number): Promise<Map<string, Relevance>> {
  assertWorldId(worldId);
  assertNow(now);
  const head = await readHead(sql, worldId);
  const read = await readWorld(sql, worldId, head);
  if (!read) return new Map<string, Relevance>(jobs.map((j) => [j.notificationId, { ok: false, why: "missing" }]));
  const people = await readPeople(sql, false);
  const doc = read.doc;
  return enginePort.run({ doc, people, now: now ?? head.ms }, () => new Map<string, Relevance>(jobs.map((j) => [j.notificationId, emailRelevance(doc, j)])));
}

/** The store's hooks for dispatchEmail, as the dispatch route passes them. */
export const storeDispatchDeps: DispatchDeps = Object.freeze({
  sweepDue: (sql: Sql, worldId: WorldId, now?: number): Promise<boolean> => sweepDue(sql, worldId, now),
  checkJobs: (sql: Sql, worldId: WorldId, jobs: readonly JobRef[], now?: number): Promise<Map<string, Relevance>> => checkEmailJobs(sql, worldId, jobs, now),
});

// ── The write transaction ────────────────────────────────────────────────────────────────

interface WriteSpec {
  worldId: WorldId;
  /** null: the system's expiry sweep. */
  actorId: string | null;
  requestId: string;
  action: LiveAction;
  ids: Record<string, string>;
  /** §9s item 6: the accepted image this action carries, if any (never for a sweep). */
  photo?: Photo | undefined;
  now: number | undefined;
  lock: boolean;
  lockTimeoutMs: number;
  hooks: ApplyHooks | undefined;
}

/** What the actions log keeps of an outcome: what the actor was told, so a retry gets the same answer. */
interface LoggedResult {
  toast?: string | null;
  resultId?: string | null;
  error?: string;
  steps?: SeqStep[];
}

interface PriorAction {
  type: string;
  ids: Record<string, string>;
  ok: boolean;
  result: LoggedResult;
}

/**
 * The transaction's result. `doc`, `version` and `xmin` are the world as committed (or as locked, when nothing changed).
 * After COMMIT an applied write's `doc` is the stored JSON parsed again and frozen (`json` is that JSON).
 */
type Written =
  /** `existing`: violations the saved document still has, all from before this action (logged, never refused). */
  | { kind: "applied"; res: ReduceResult; doc: WorldDoc; json: string; version: number; xmin: string; now: number; existing: string[] }
  | { kind: "refused"; res: ReduceResult; doc: WorldDoc; version: number; xmin: string; now: number }
  | { kind: "replay"; prior: PriorAction; doc: WorldDoc; version: number; xmin: string; now: number }
  | { kind: "mismatch"; doc: WorldDoc; version: number; xmin: string; now: number }
  | { kind: "unchanged"; doc: WorldDoc; version: number; xmin: string; now: number };

type EngineOut =
  | { refused: true; res: ReduceResult }
  | { refused: false; res: ReduceResult; notes: EngineNote[]; before: string[]; after: string[]; due: number | null };

/** A world's row: its document (deep-frozen; maybe this pool's cached copy) and the row's identity (version, xmin). */
interface WorldRow {
  version: number;
  xmin: string;
  doc: WorldDoc;
  next_due: Date | null;
}

interface HeadRow {
  ms: number;
  type: string | null;
  ids: Record<string, string> | null;
  ok: boolean | null;
  result: LoggedResult | null;
}

/** The action would leave the shared data in a state the rules forbid. Nothing is saved. */
class InvariantError extends Error {
  override name = "InvariantError";
  constructor(public readonly violations: string[]) {
    super("A newly introduced invariant violation.");
  }
}

/** The world's version moved under the lock: impossible unless a writer bypassed the lock. Nothing is saved. */
class VersionConflict extends Error {
  override name = "VersionConflict";
}

/** The engine threw. Keeps only the original error's class, never its message or the action's payload. */
class EngineError extends Error {
  override name = "EngineError";
  constructor(public readonly inner: string) {
    super("The engine failed.");
  }
}

/** The write would grow the document past DOC_MAX_BYTES. */
class DocTooLarge extends Error {
  override name = "DocTooLarge";
  constructor(public readonly bytes: number) {
    super("The document is too large.");
  }
}

/** The world's row isn't there: deleted while a sweep or a first write was on its way. */
class MissingWorld extends Error {
  override name = "MissingWorld";
}

/**
 * postgres.js 3.4 declares TransactionSql as Omit<Sql, …>, and Omit drops Sql's call signatures, so TypeScript
 * rejects tx`…` (TS2349) although it works at runtime. This restores the tagged-template type. It is a type-only
 * cast: code holding the result never calls begin or end on it.
 */
function asSql(tx: TransactionSql): Sql {
  return tx as unknown as Sql;
}

async function write(sql: Sql, w: WriteSpec, port: EnginePort): Promise<Written> {
  // The document a write leaves is cached just before COMMIT (see transact). If the transaction fails after that, the
  // entry is taken out again, so the cache holds only what was committed.
  let pending = null as CachedWorld | null;
  let written: Written;
  try {
    written = await sql.begin((raw) => transact(asSql(raw), sql, w, port, (entry) => { pending = entry; }));
  } catch (e) {
    if (pending) forget(sql, w.worldId, pending);
    throw e;
  }
  // Committed. An applied write's document is the JSON just stored, parsed again and frozen, so the actor's view and the
  // cache hold exactly what every other reader will read (JSON drops undefined values and turns NaN into null).
  if (written.kind === "applied") written.doc = pending ? docOf(pending) : deepFreeze(JSON.parse(written.json) as WorldDoc);
  // A write that changed no document leaves the one it locked (cached already, or read under the lock) for the next.
  else if (w.lock && !pending) remember(sql, w.worldId, { version: written.version, xmin: written.xmin, json: null, doc: written.doc });
  return written;
}

/** The write's transaction (C-DESIGN §4.1). `cachePending` receives the entry it cached just before COMMIT, if any. */
async function transact(
  tx: Sql,
  sql: Sql,
  w: WriteSpec,
  port: EnginePort,
  cachePending: (entry: CachedWorld) => void,
): Promise<Written> {
  /**
   * Caches the document this transaction is about to commit, before COMMIT: COMMIT hands the lock to the next writer at
   * once, and it should find this document rather than read it again. The entry is keyed by this transaction's own xmin,
   * so it can match the row only once this transaction has committed; if it fails instead, write() takes the entry out.
   * The race test's unlocked writes (the negative control) never touch the cache.
   */
  const cacheBeforeCommit = (entry: CachedWorld): void => {
    if (!w.lock) return;
    remember(sql, w.worldId, entry);
    cachePending(entry);
  };

  await tx.unsafe(`SET LOCAL lock_timeout = '${w.lockTimeoutMs}ms'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
  let row = await lockWorld(tx, sql, w);
  if (!row && w.actorId !== null) {
    // A world's first write creates its row here, inside the transaction, so that every wait an action makes on
    // the world is bounded by lock_timeout (C-DESIGN §4.5). Outside it, this INSERT would wait, unbounded, for
    // any writer that had saved the row but not yet committed. A concurrent first write waits on this INSERT
    // until this transaction commits, then finds the row and locks it. Sweeps never create a world.
    await tx`
      INSERT INTO worlds (id, doc) VALUES (${w.worldId}, ${JSON.stringify(port.empty())}::text::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    row = await lockWorld(tx, sql, w);
  }
  if (!row) throw new MissingWorld();
  await w.hooks?.afterLock?.();

  // The database's clock, read after the lock so time follows the order of writes; and this actor's earlier
  // outcome for the same request id, if this is a retry.
  const head = first(
    await tx<HeadRow[]>`
      SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms, a.type, a.ids, a.ok, a.result
      FROM (SELECT 1) AS one
      LEFT JOIN actions a
        ON a.world_id = ${w.worldId} AND a.actor_id = ${w.actorId ?? SYSTEM_ACTOR} AND a.request_id = ${w.requestId}`,
  );
  const now = w.now ?? head.ms;
  const locked = { doc: row.doc, version: row.version, xmin: row.xmin, now };
  if (head.type !== null) {
    const prior: PriorAction = { type: head.type, ids: head.ids ?? {}, ok: head.ok === true, result: head.result ?? {} };
    return sameAction(prior, w.action.type, w.ids) ? { kind: "replay", prior, ...locked } : { kind: "mismatch", ...locked };
  }

  const sweep = w.actorId === null;
  // A sweep checks next_due again under the lock: another request may have swept already.
  if (sweep && !(row.next_due !== null && row.next_due.getTime() <= now)) {
    return { kind: "unchanged", ...locked };
  }
  const before = sweep ? JSON.stringify(row.doc) : null;

  // Profiles, read after the lock (C-DESIGN §4.1): a classmate whose first write committed while this one
  // waited for the lock is in this read too, so the engine can name them. Without emails: the engine never
  // sees them (§3.6).
  const people = await readPeople(tx, false);

  // Everything the engine does happens in one synchronous run.
  const doc = row.doc;
  const out = engine(() =>
    port.run({ doc, people, now }, (): EngineOut => {
      const res = port.reduce(doc, w.actorId, w.action);
      if (typeof res.error === "string") return { refused: true, res };
      // Drained before the invariants are checked, so the new document is at rest like the stored one; otherwise
      // the at-rest rule "the document holds no notifications" (§4.6) would refuse every write that notifies.
      const notes = port.drain(res.state);
      return {
        refused: false,
        res,
        notes,
        before: port.violations(doc),
        after: port.violations(res.state),
        due: port.nextDue(res.state),
      };
    }),
  );

  if (out.refused) {
    if (sweep) throw new EngineError("SweepRefused");
    await logAction(tx, w, now, { ok: false, result: loggedResult(out.res, false), before: row.version, after: row.version });
    await w.hooks?.beforeCommit?.();
    return { kind: "refused", res: out.res, ...locked };
  }
  // Only violations this action introduced are refused; old damage never freezes the world (§4.6, J1-4).
  const introduced = introducedViolations(out.before, out.after);
  if (introduced.length > 0) throw new InvariantError(introduced);
  const due = dueTime(out.due, w.worldId);

  const json = JSON.stringify(out.res.state);
  if (sweep && out.notes.length === 0 && json === before) {
    // Nothing expired: move next_due on and leave the version alone. A deadline the sweep didn't clear would
    // make every read sweep again, so it isn't stored.
    const next = due !== null && due <= now ? null : due;
    if (next !== due) console.warn(`[handoff] world ${w.worldId}: nextDue is in the past after a sweep; not stored.`);
    // Any UPDATE gives the row a new xmin, which keys the cached document, so the entry moves to it before COMMIT.
    const [moved] = await tx<{ xmin: string }[]>`
      UPDATE worlds SET next_due = ${toDate(next)} WHERE id = ${w.worldId} RETURNING xmin::text AS xmin`;
    if (!moved) throw new MissingWorld();
    cacheBeforeCommit({ version: row.version, xmin: moved.xmin, json: null, doc: row.doc });
    return { kind: "unchanged", ...locked, xmin: moved.xmin };
  }

  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > DOC_MAX_BYTES && bytes > Buffer.byteLength(before ?? JSON.stringify(row.doc), "utf8")) {
    // The expiry sweep is exempt: it records only what time already decided (holds lapsing, backups active again), a few lines
    // per record and once each. Refused, it would stay due, and every read would run it again under the lock (review INT-3).
    if (!sweep) throw new DocTooLarge(bytes);
    console.warn(`[handoff] world ${w.worldId}: stored the expiry sweep although the document is ${bytes} bytes, past the ${DOC_MAX_BYTES}-byte limit; archiving is overdue.`);
  }
  const version = row.version + 1;
  if (bytes > DOC_WARN_BYTES) {
    console.warn(`[handoff] world ${w.worldId} is ${bytes} bytes at version ${version}; archiving is due.`);
  }

  // The JSON goes in as text and is cast in SQL: bound straight to a jsonb parameter, postgres.js would
  // JSON-encode the string a second time and store a JSON string instead of the document.
  const saved = w.lock
    ? await tx<{ xmin: string }[]>`
        UPDATE worlds SET doc = ${json}::text::jsonb, version = ${version}, next_due = ${toDate(due)}, updated_at = NOW()
        WHERE id = ${w.worldId} AND version = ${row.version} RETURNING xmin::text AS xmin`
    : await tx<{ xmin: string }[]>`
        UPDATE worlds SET doc = ${json}::text::jsonb, version = ${version}, next_due = ${toDate(due)}, updated_at = NOW()
        WHERE id = ${w.worldId} RETURNING xmin::text AS xmin`;
  const xmin = saved[0]?.xmin;
  if (saved.count !== 1 || xmin === undefined) throw new VersionConflict();
  // §9s item 6: item_photos follows the document in this same transaction (the bytes this action brought; the rows it no longer refers to).
  await syncPhotos(tx, w, port, row.doc, out.res.state);
  await insertNotifications(tx, w.worldId, w.requestId, out.notes);
  // Follow-on B4: an email job per stored notification of an emailed kind (the engine's tag: kind and ref, passed on by drain) whose
  // recipient turned that category on, while a dispatcher with this world's sender worked in the last 10 minutes (email/dispatch.ts).
  // In this transaction, joined to the notifications rows just written, so nothing is queued unless the action commits, a notification
  // RB-10 dropped as a duplicate gets no job, and a retried change (answered from the actions log above) never gets here. Untagged
  // notes make no rows and no query. A sweep's change id is its own random UUID.
  await insertEmailJobs(tx, { worldId: w.worldId, changeId: w.requestId, now, rows: emailJobRows(out.notes) });
  await logAction(tx, w, now, { ok: true, result: loggedResult(out.res, true), before: row.version, after: version });
  // The day's first write takes its snapshot and prunes, so nothing outlives its limit by more than a day of writes.
  const firstToday = await maybeSnapshotDaily(tx, w.worldId, version, json, now);
  if (firstToday || version % PRUNE_EVERY_VERSIONS === 0) await pruneIn(tx, w.worldId, now);
  // The JSON is cached as it was stored and parsed once, when first needed (the actor's view, usually).
  cacheBeforeCommit({ version, xmin, json, doc: null });
  await w.hooks?.beforeCommit?.();
  return { kind: "applied", res: out.res, doc: out.res.state, json, version, xmin, now, existing: out.after };
}

/** The document and item_photos disagree about a photo: a bug, never a person's mistake. Nothing is saved. */
class PhotoMismatch extends Error {
  override name = "PhotoMismatch";
}

/**
 * Keeps item_photos in step with the document a write is about to commit (§9s item 6), inside that write's transaction, so a photo's
 * bytes and its reference are saved together or not at all:
 * - an item whose reference is new, or names another version, gets the image this action brought (one row per item: a replaced
 *   photo's bytes are overwritten). A new reference with no such image, or an image the document didn't take, fails the write;
 * - every item whose reference is gone (its photo removed, or the item sold, closed or expired) loses its row.
 * A write that touches no photo runs no query here. A port without photos (the tests' stand-in) does nothing.
 */
async function syncPhotos(tx: Sql, w: WriteSpec, port: EnginePort, before: WorldDoc, after: WorldDoc): Promise<void> {
  if (!port.photoRefs) {
    if (w.photo) throw new PhotoMismatch("This port takes no photos.");
    return;
  }
  const had = new Map(port.photoRefs(before).map((r) => [r.id, r.v]));
  const has = new Map(port.photoRefs(after).map((r) => [r.id, r.v]));
  const fresh = [...has].filter(([id, v]) => had.get(id) !== v);
  const gone = [...had.keys()].filter((id) => !has.has(id));
  const photo = w.photo;
  if (photo ? !(fresh.length === 1 && fresh[0]![1] === photo.version) : fresh.length > 0) {
    throw new PhotoMismatch("A photo's reference and its bytes don't go together.");
  }
  if (gone.length > 0) await tx`DELETE FROM item_photos WHERE world_id = ${w.worldId} AND item_id = ANY(${gone}::text[])`;
  if (photo && w.actorId !== null) {
    await tx`
      INSERT INTO item_photos (world_id, item_id, owner_id, mime, bytes, version, width, height)
      VALUES (${w.worldId}, ${fresh[0]![0]}, ${w.actorId}, ${photo.mime}, ${Buffer.from(photo.bytes)}, ${photo.version}, ${photo.width}, ${photo.height})
      ON CONFLICT (world_id, item_id) DO UPDATE
        SET owner_id = EXCLUDED.owner_id, mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, version = EXCLUDED.version,
            width = EXCLUDED.width, height = EXCLUDED.height, created_at = NOW()`;
  }
}

/**
 * The world's row, locked with FOR UPDATE, and its document: this pool's cached copy when the row's version and xmin still
 * match it (any UPDATE of the row, including a manual fix in SQL, gives it a new xmin), otherwise read here, under the lock.
 * With the lock off (the race test's negative control only), one unlocked read and no cache.
 */
async function lockWorld(tx: Sql, sql: Sql, w: Pick<WriteSpec, "worldId" | "lock">): Promise<WorldRow | undefined> {
  if (!w.lock) {
    const [row] = await tx<WorldRow[]>`SELECT version, xmin::text AS xmin, doc, next_due FROM worlds WHERE id = ${w.worldId}`;
    return row && { ...row, doc: deepFreeze(row.doc) };
  }
  const [head] = await tx<{ version: number; xmin: string; next_due: Date | null }[]>`
    SELECT version, xmin::text AS xmin, next_due FROM worlds WHERE id = ${w.worldId} FOR UPDATE`;
  if (!head) return undefined;
  const hit = cachedDoc(sql, w.worldId, head.version, head.xmin);
  if (hit) return { ...head, doc: hit };
  // With the row locked, this is the latest version there is: a cached one above it is dead (the world was deleted and
  // created again, or set back), and would otherwise keep every later document out of the cache (see remember).
  forgetAbove(sql, w.worldId, head.version);
  // This transaction holds the row's lock, so this reads the very version it just locked.
  const [body] = await tx<{ doc: WorldDoc }[]>`SELECT doc FROM worlds WHERE id = ${w.worldId}`;
  if (!body) throw new MissingWorld();
  return { ...head, doc: deepFreeze(body.doc) };
}

/**
 * A world's committed row for a read (getView), given the head it already read: this pool's cached document when the
 * version and xmin match, otherwise the row read again in one query, so its document, version and next_due agree (a write
 * may have committed since the head). Undefined when the world has no row.
 */
async function readWorld(
  sql: Sql,
  worldId: WorldId,
  head: { version: number | null; xmin: string | null; next_due: Date | null },
): Promise<WorldRow | undefined> {
  if (head.version === null || head.xmin === null) return undefined;
  const hit = cachedDoc(sql, worldId, head.version, head.xmin);
  if (hit) return { version: head.version, xmin: head.xmin, doc: hit, next_due: head.next_due };
  const [row] = await sql<WorldRow[]>`SELECT version, xmin::text AS xmin, doc, next_due FROM worlds WHERE id = ${worldId}`;
  if (!row) return undefined;
  const doc = deepFreeze(row.doc);
  remember(sql, worldId, { version: row.version, xmin: row.xmin, json: null, doc });
  return { ...row, doc };
}

/** The system's expiry sweep (no actor, not a client action), through the same write path. */
async function sweepWorld(
  sql: Sql,
  worldId: WorldId,
  now: number | undefined,
  port: EnginePort,
): Promise<{ doc: WorldDoc; version: number; now: number }> {
  const w = await write(
    sql,
    {
      worldId,
      actorId: null,
      requestId: randomUUID(),
      action: { type: "sweep" },
      ids: {},
      now,
      lock: true,
      lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
      hooks: undefined,
    },
    port,
  );
  if (w.kind === "applied") logExistingViolations(worldId, w.version, w.existing);
  return { doc: w.doc, version: w.version, now: w.now };
}

function engine<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new EngineError(errorClass(e));
  }
}

/** The keys in `after` that `before` didn't have. */
export function introducedViolations(before: readonly string[], after: readonly string[]): string[] {
  const old = new Set(before);
  return after.filter((key) => !old.has(key));
}

/**
 * Logs, once per saved version, the violations a document still has from before (C-DESIGN §4.6): they never block
 * a write, but they mean something needs fixing. Keys only, never record contents.
 */
function logExistingViolations(worldId: WorldId, version: number, keys: readonly string[]): void {
  if (keys.length === 0) return;
  const shown = keys.slice(0, VIOLATIONS_LOGGED).join(", ");
  const more = keys.length > VIOLATIONS_LOGGED ? `, and ${keys.length - VIOLATIONS_LOGGED} more` : "";
  console.warn(
    `[handoff] world ${worldId} at version ${version} still has ${keys.length} invariant violation(s) from before ` +
      `(not blocking writes): ${shown}${more}`,
  );
}

function sameAction(prior: PriorAction, type: string, ids: Record<string, string>): boolean {
  if (prior.type !== type) return false;
  const a = Object.keys(prior.ids).sort();
  const b = Object.keys(ids).sort();
  return a.length === b.length && a.every((key, i) => key === b[i] && prior.ids[key] === ids[key]);
}

function dueTime(due: number | null, worldId: string): number | null {
  if (due === null) return null;
  if (Number.isFinite(due)) return due;
  console.warn(`[handoff] world ${worldId}: nextDue returned a non-finite time; not stored.`);
  return null;
}

function loggedResult(res: ReduceResult, ok: boolean): LoggedResult {
  const steps = res.steps ? { steps: res.steps } : {};
  return ok
    ? { toast: res.toast ?? null, resultId: res.result?.id ?? null, ...steps }
    : { error: refusalText(res.error), ...steps };
}

function refusalText(error: string | undefined): string {
  return typeof error === "string" && error.trim() ? error : REFUSED_FALLBACK;
}

async function logAction(
  tx: Sql,
  w: WriteSpec,
  now: number,
  e: { ok: boolean; result: LoggedResult; before: number; after: number },
): Promise<void> {
  await tx`
    INSERT INTO actions (world_id, actor_id, request_id, type, ids, ok, result, version_before, version_after, at)
    VALUES (${w.worldId}, ${w.actorId ?? SYSTEM_ACTOR}, ${w.requestId}, ${w.action.type},
            ${JSON.stringify(w.ids)}::text::jsonb, ${e.ok}, ${JSON.stringify(e.result)}::text::jsonb,
            ${e.before}, ${e.after}, ${new Date(now)})`;
}

/**
 * Writes the action's notifications. The same words for the same person twice in one change are written once (ON CONFLICT DO
 * NOTHING, on a key of the change's request id and the text). Separate changes never merge, even in the same words while an earlier
 * one is unread: each is its own news, such as a second exchange's payment confirmed (readiness RB-10). A retried change is answered
 * from the actions log before it gets here, so it adds nothing either.
 */
async function insertNotifications(tx: Sql, worldId: WorldId, changeId: string, notes: EngineNote[]): Promise<number> {
  if (notes.length === 0) return 0;
  const rows: { id: string; user_id: string; body: string; link?: NotificationLink; dedupe: string; at: string }[] = [];
  for (const n of notes) {
    if (typeof n.id !== "string" || !NOTE_ID.test(n.id)) throw new EngineError("BadNotificationId");
    if (typeof n.userId !== "string" || n.userId.length === 0) throw new EngineError("BadNotificationUser");
    if (typeof n.at !== "number" || !Number.isFinite(n.at)) throw new EngineError("BadNotificationTime");
    if (typeof n.text !== "string" || !n.text.trim()) throw new EngineError("EmptyNotification");
    const body = clip(n.text, NOTE_TEXT_MAX);
    const dedupe = createHash("md5").update(`${changeId}\n${body}`, "utf8").digest("hex");
    // A missing key becomes SQL NULL; the link CHECK refuses a JSON null.
    const link = isPlainObject(n.link) ? { link: n.link as NotificationLink } : {};
    rows.push({ id: n.id, user_id: n.userId, body, ...link, dedupe, at: new Date(n.at).toISOString() });
  }
  const inserted = await tx`
    INSERT INTO notifications (world_id, id, user_id, text, link, dedupe, at)
    SELECT ${worldId}, n.id, n.user_id, n.body, n.link, n.dedupe, n.at
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::text::jsonb)
      AS n(id text, user_id text, body text, link jsonb, dedupe text, at timestamptz)
    ON CONFLICT (world_id, user_id, dedupe) WHERE read_at IS NULL DO NOTHING`;
  return inserted.count;
}

/**
 * The first write of each New York day keeps a snapshot of the document it saved. Returns whether this was that write (its
 * caller then prunes, which also caps the snapshots).
 */
async function maybeSnapshotDaily(tx: Sql, worldId: WorldId, version: number, json: string, now: number): Promise<boolean> {
  const at = new Date(now);
  const [today] = await tx<{ taken: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM world_snapshots
      WHERE world_id = ${worldId} AND reason = 'daily'
        AND (taken_at AT TIME ZONE ${NEW_YORK})::date = (${at}::timestamptz AT TIME ZONE ${NEW_YORK})::date
    ) AS taken`;
  if (today?.taken) return false;
  await tx`
    INSERT INTO world_snapshots (world_id, version, reason, doc, taken_at)
    VALUES (${worldId}, ${version}, 'daily', ${json}::text::jsonb, ${at})
    ON CONFLICT (world_id, version, reason) DO NOTHING`;
  return true;
}

async function pruneSnapshots(
  tx: Sql,
  worldId: WorldId,
  reason: "daily" | "before-upgrade",
  keep: number,
): Promise<number> {
  const pruned = await tx`
    DELETE FROM world_snapshots
    WHERE world_id = ${worldId} AND reason = ${reason}
      AND version < (
        SELECT min(version) FROM (
          SELECT version FROM world_snapshots WHERE world_id = ${worldId} AND reason = ${reason}
          ORDER BY version DESC LIMIT ${keep}
        ) AS kept
      )`;
  return pruned.count;
}

/**
 * Daily snapshots older than DAILY_SNAPSHOT_KEEP_DAYS, except the newest DAILY_SNAPSHOTS_ALWAYS_KEPT: they hold everyone's data,
 * so they're short-lived even in a world written to once a week, but the rollback point before the latest write stays.
 */
async function pruneOldDailySnapshots(tx: Sql, worldId: WorldId, now: number): Promise<number> {
  const pruned = await tx`
    DELETE FROM world_snapshots
    WHERE world_id = ${worldId} AND reason = 'daily' AND taken_at < ${new Date(now - DAILY_SNAPSHOT_KEEP_DAYS * DAY_MS)}
      AND version < (
        SELECT min(version) FROM (
          SELECT version FROM world_snapshots WHERE world_id = ${worldId} AND reason = 'daily'
          ORDER BY version DESC LIMIT ${DAILY_SNAPSHOTS_ALWAYS_KEPT}
        ) AS newest
      )`;
  return pruned.count;
}

async function pruneIn(tx: Sql, worldId: WorldId, now: number): Promise<PruneCounts> {
  const actions = await tx`
    DELETE FROM actions WHERE world_id = ${worldId} AND at < ${new Date(now - ACTIONS_KEEP_DAYS * DAY_MS)}`;
  const notifications = await tx`
    DELETE FROM notifications
    WHERE world_id = ${worldId} AND read_at IS NOT NULL AND at < ${new Date(now - READ_NOTIFICATIONS_KEEP_DAYS * DAY_MS)}`;
  const daily = await pruneSnapshots(tx, worldId, "daily", DAILY_SNAPSHOTS_KEPT);
  const old = await pruneOldDailySnapshots(tx, worldId, now);
  const upgrade = await pruneSnapshots(tx, worldId, "before-upgrade", UPGRADE_SNAPSHOTS_KEPT);
  // Follow-on B4: finished email jobs after 14 days and captured emails after 7 (the dispatcher prunes its worlds the same way).
  const email = await pruneEmailIn(tx, worldId, now);
  return { actions: actions.count, notifications: notifications.count, snapshots: daily + old + upgrade, email };
}

// ── The document cache (C-DESIGN §1.2 item 3) ────────────────────────────────────────────
//
// Each pool (one per app instance, as toolSql builds it) keeps the last document it read or wrote for each world, keyed
// by the row's version and xmin. A write then locks the row with a small SELECT and skips reading and parsing the whole
// document while it holds the lock, and a read skips it when nothing changed. Correctness never depends on the cache:
// another instance's write, or any manual UPDATE of the row, changes the xmin, so the next lock or read misses and reads
// the row. Cached documents are deep-frozen: the engine copies a document before changing it, and anything that tried to
// write into a cached one would throw (engine and store code are strict-mode modules) instead of silently changing what
// later writes start from. A write caches its document just before COMMIT, keyed by its own transaction's xmin, which the
// row carries only if the transaction commits; if it fails, the entry is removed. So a hit is always a committed document.

/** Worlds cached per pool: "live", plus a few test worlds in development. */
export const DOC_CACHE_WORLDS = 8;

/** One world's cached document: the JSON as it was stored until something first needs it, then parsed and frozen. */
interface CachedWorld {
  version: number;
  xmin: string;
  json: string | null;
  doc: WorldDoc | null;
}

/** The entry's document, parsed from its JSON (once) and deep-frozen. */
function docOf(entry: CachedWorld): WorldDoc {
  if (!entry.doc) {
    if (entry.json === null) throw new Error("Handoff: a cached world has neither a document nor its JSON.");
    entry.doc = deepFreeze(JSON.parse(entry.json) as WorldDoc);
    entry.json = null;
  }
  return entry.doc;
}

/** Takes out an entry this pool cached before a COMMIT that then failed (only if it is still the one there). */
function forget(sql: Sql, worldId: WorldId, entry: CachedWorld): void {
  const { worlds } = docCache(sql);
  if (worlds.get(worldId) === entry) worlds.delete(worldId);
}

/** Takes out the world's entry if it is for a version above `version`, which a writer holding the row's lock knows is the latest. */
function forgetAbove(sql: Sql, worldId: WorldId, version: number): void {
  const { worlds } = docCache(sql);
  const entry = worlds.get(worldId);
  if (entry && entry.version > version) worlds.delete(worldId);
}

interface DocCache {
  worlds: Map<string, CachedWorld>;
  hits: number;
  misses: number;
}

const docCaches = new WeakMap<Sql, DocCache>();

function docCache(sql: Sql): DocCache {
  let cache = docCaches.get(sql);
  if (!cache) {
    cache = { worlds: new Map(), hits: 0, misses: 0 };
    docCaches.set(sql, cache);
  }
  return cache;
}

function cachedDoc(sql: Sql, worldId: WorldId, version: number, xmin: string): WorldDoc | null {
  const cache = docCache(sql);
  const entry = cache.worlds.get(worldId);
  if (entry && entry.version === version && entry.xmin === xmin) {
    cache.hits += 1;
    return docOf(entry);
  }
  cache.misses += 1;
  return null;
}

/** Caches a committed document, unless the pool already holds a newer version of the world (writes can finish out of order). */
function remember(sql: Sql, worldId: WorldId, entry: CachedWorld): void {
  const { worlds } = docCache(sql);
  const current = worlds.get(worldId);
  if (current && current.version > entry.version) return;
  worlds.delete(worldId); // re-inserted last: the least recently stored world is evicted first
  worlds.set(worldId, entry);
  while (worlds.size > DOC_CACHE_WORLDS) {
    const oldest = worlds.keys().next().value;
    if (oldest === undefined) break;
    worlds.delete(oldest);
  }
}

/** How the pool's document cache has done: for tests and diagnostics. */
export function documentCacheStats(sql: Sql): { worlds: number; hits: number; misses: number } {
  const cache = docCache(sql);
  return { worlds: cache.worlds.size, hits: cache.hits, misses: cache.misses };
}

/** Freezes a parsed JSON value and everything in it, so a write into it throws. Returns it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

// ── Views ────────────────────────────────────────────────────────────────────────────────

async function buildView(
  sql: Sql,
  port: EnginePort,
  a: { worldId: WorldId; viewerId: string; doc: WorldDoc; version: number; now: number },
): Promise<View> {
  const people = await readPeople(sql, true);
  const rows = await sql<
    { id: string; user_id: string; text: string; link: NotificationLink | null; at_ms: number; read: boolean; unread: number }[]
  >`
    SELECT id, user_id, text, link, round(extract(epoch FROM at) * 1000)::float8 AS at_ms, read_at IS NOT NULL AS read,
           (SELECT count(*)::int FROM notifications
            WHERE world_id = ${a.worldId} AND user_id = ${a.viewerId} AND read_at IS NULL) AS unread
    FROM notifications
    WHERE world_id = ${a.worldId} AND user_id = ${a.viewerId}
    ORDER BY at DESC, id DESC
    LIMIT ${NOTIFICATIONS_IN_VIEW}`;
  const byId = new Map(people.map((p) => [p.userId, p] as const));
  // ensurePerson ran first, so the viewer is always in the view (C-DESIGN §1.4, J1-1).
  if (!byId.has(a.viewerId)) throw new Error("Handoff: the viewer has no profile row.");
  const notifications: ViewNotification[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    text: r.text,
    link: r.link,
    at: r.at_ms,
    read: r.read,
  }));
  const unreadCount = rows[0]?.unread ?? 0;
  // Follow-on B4: the viewer's own email updates (email/prefs.ts readEmailState): available only while this world's sender (the capture
  // for test worlds, a provider for live) worked in the last 10 minutes; their categories for their current sign-in address. Read
  // before the engine runs (nothing async happens inside run); the guest view never has it.
  const email = await readEmailState(sql, { userId: a.viewerId, worldId: a.worldId, now: a.now });
  // The engine runs without anyone's email; only the projection gets them, through its context.
  const enginePeople = people.map((p) => ({ ...p, email: null }));
  const view = port.run({ doc: a.doc, people: enginePeople, now: a.now }, () =>
    port.project(a.doc, a.viewerId, {
      worldId: a.worldId,
      version: a.version,
      now: a.now,
      people: byId,
      notifications,
      unreadCount,
    }),
  );
  return { ...view, email };
}

/**
 * Every profile row. payMethods (follow-on B1) are the saved methods, or a handle saved before B1 as one method of kind "other", word
 * for word (the engine's readPayMethods), or none: never anything taken from the email.
 */
async function readPeople(q: Sql, withEmail: boolean): Promise<PersonRow[]> {
  type Row = { user_id: string; name: string; email: string | null; pay_handle: string; pay_methods: unknown };
  const rows = withEmail
    ? await q<Row[]>`SELECT user_id, name, email, pay_handle, pay_methods FROM people ORDER BY user_id`
    : await q<Row[]>`SELECT user_id, name, NULL::text AS email, pay_handle, pay_methods FROM people ORDER BY user_id`;
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    payHandle: r.pay_handle,
    payMethods: readPayMethods(r.pay_methods, r.pay_handle),
  }));
}

// ── Outcomes ─────────────────────────────────────────────────────────────────────────────

function outcomeOf(w: Written, view: View): ActOutcome {
  switch (w.kind) {
    case "applied":
      return {
        ok: true,
        replay: false,
        toast: w.res.toast ?? null,
        resultId: w.res.result?.id ?? null,
        ...stepsOf(w.res.steps),
        view,
      };
    case "refused":
      return { ok: false, code: "refused", error: refusalText(w.res.error), replay: false, ...stepsOf(w.res.steps), view };
    case "replay": {
      const r = w.prior.result;
      return w.prior.ok
        ? { ok: true, replay: true, toast: r.toast ?? null, resultId: r.resultId ?? null, ...stepsOf(r.steps), view }
        : { ok: false, code: "refused", error: refusalText(r.error), replay: true, ...stepsOf(r.steps), view };
    }
    default:
      throw new Error(`Handoff: unexpected write result "${w.kind}".`);
  }
}

function stepsOf(steps: SeqStep[] | undefined): { steps?: SeqStep[] } {
  return steps ? { steps } : {};
}

/** The error when the view can't be built after COMMIT: true to what happened, which "Nothing was changed" isn't. */
function afterCommitError(w: Written): string {
  switch (w.kind) {
    case "applied":
      return SAVED_NO_VIEW_ERROR;
    case "refused":
      return refusalText(w.res.error) + RELOAD_SUFFIX;
    case "replay":
      return w.prior.ok ? SAVED_NO_VIEW_ERROR : refusalText(w.prior.result.error) + RELOAD_SUFFIX;
    default:
      return INTERNAL_ERROR;
  }
}

function failedOutcome(e: unknown, w: WriteSpec): ActOutcome {
  if (e instanceof DocTooLarge) {
    console.warn(`[handoff] world ${w.worldId}: refused "${w.action.type}", which would grow the document to ${e.bytes} bytes.`);
    return { ok: false, code: "full", error: FULL_ERROR };
  }
  if (isBusy(e)) return { ok: false, code: "busy", error: BUSY_ERROR };
  const kind = setupErrorKind(e);
  if (kind) return { ok: false, code: "unavailable", reason: kind, error: unavailableMessage(kind) };
  logFailure("action", w.worldId, w.action.type, w.ids, e);
  return { ok: false, code: "internal", error: INTERNAL_ERROR };
}

/** Logs a failure with the action's type and record ids and the error's class: never the payload or a message. */
function logFailure(stage: string, worldId: string, type: string, ids: Record<string, string>, e: unknown): void {
  const facts: Record<string, unknown> = { world: worldId, type, ids, error: errorClass(e) };
  if (e instanceof InvariantError) facts["violations"] = e.violations;
  if (e instanceof EngineError) facts["cause"] = e.inner;
  const code = errorCode(e);
  if (code) facts["code"] = code;
  console.error(`[handoff] ${stage} failed`, facts);
}

function errorClass(e: unknown): string {
  if (e instanceof Error) return e.name || e.constructor.name || "Error";
  return typeof e;
}

// ── Small helpers ────────────────────────────────────────────────────────────────────────

function assertWorldId(id: unknown): asserts id is WorldId {
  if (!isWorldId(id)) throw new TypeError("Handoff: not a world id.");
}

function assertUserId(id: unknown): asserts id is string {
  if (typeof id !== "string" || id.length === 0 || Array.from(id).length > USER_ID_MAX || id === SYSTEM_ACTOR) {
    throw new TypeError("Handoff: not a user id.");
  }
}

function assertNow(now: unknown): void {
  if (now !== undefined && (typeof now !== "number" || !Number.isFinite(now))) {
    throw new TypeError("Handoff: now must be a finite number of ms.");
  }
}

function cleanName(name: string | null): string {
  const flat = (typeof name === "string" ? name : "").replace(CONTROLS, " ").replace(/\s+/g, " ").trim();
  return flat ? Array.from(flat).slice(0, NAME_MAX).join("").trim() : FALLBACK_NAME;
}

function cleanEmail(email: string | null): string | null {
  const flat = (typeof email === "string" ? email : "").replace(CONTROLS, "").trim();
  return flat && Array.from(flat).length <= EMAIL_MAX ? flat : null;
}

/** At most `max` characters (code points), ending in "…" when cut. */
function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toDate(ms: number | null): Date | null {
  return ms === null ? null : new Date(ms);
}

function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Handoff: a query that always returns a row returned none.");
  return row;
}

async function clockMs(q: Sql): Promise<number> {
  return first(await q<{ ms: number }[]>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`).ms;
}
