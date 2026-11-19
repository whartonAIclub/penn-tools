// Handoff's shared data: every SQL statement the tool runs. The page folder (page.tsx, actions.ts, the act and photo routes)
// passes the pool from toolSql("handoff") and the signed-in user, who always comes from the session. The marketplace rules are
// reached only through an EnginePort (engine-port.ts): the real engine by default, or a test's stand-in.
//
// Storage (review of PR #88). The market is rows: every event, holding, listing, exchange, public request or alert, share, item
// and goods request is its own row in `records`, and worlds.doc keeps only the rest of the document (its settings: "meta"). The
// engine still sees one document: the store joins the rows into it (the port's join), runs the rules on it, and writes back only
// the rows that changed (the port's split). A world's version is worlds.version plus every row's tally: each change adds exactly
// one, on a row it writes anyway, so the version still counts changes and no row is written by every change.
//
// Writes (applyAction, C-DESIGN §4.1 as revised). The action is parsed before any transaction. Then one transaction:
//   1. lock the actor's profile row, so one account's changes run one at a time (a retried click finds its first outcome; the
//      account's limits count right), and look up this request id's earlier outcome;
//   2. read the market as committed (this app instance's copy when nothing changed since), and run the rules at the database's
//      clock, read with it;
//   3. lock what the change touches, in a fixed order: the profiles of the people whose records it changes, then the rows it
//      changes and the rows they depend on (an exchange's listing, a goods request's item, a new listing's event: the port's
//      guards). If anything was committed meanwhile, read again and run the rules again, until what the change touches is all
//      locked and it was decided on what is committed;
//   4. refuse the change only if it introduces an invariant violation; write the rows that changed, the notifications and the
//      actions log. The actor's view is built after COMMIT.
// So two changes wait for each other only when they touch the same listing, item, exchange, request or person, and each is
// decided on the other's result; unrelated trades go through at the same time.
//
// Reads (getView, §4.2): the committed market (one copy per version, shared by every tab this app instance serves), swept first
// if a deadline has passed, projected for the viewer from allowlists with only the profiles that view names. Opening Handoff
// saves nothing: the profile row is made by the account's first change (review of PR #88).
//
// Guests (getGuestView, refreshGuestView; C-CONTRACT §7): a signed-out visitor's view, from the guest allowlists, with no viewer.
// A pure read: no profile row, no world created, no expiry sweep, no lock.

import { createHash, randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { checkPayMethods, readPayMethods } from "../engine/index.js";
import { errorCode, isBusy, setupErrorKind, unavailableMessage } from "./db-errors.js";
import { enginePort } from "./engine-port.js";
import type { EngineNote, EnginePort, LiveAction, MarketRecord, ReduceResult, WorldDoc } from "./engine-port.js";
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
/** A change that would make one record (a listing with its history, say) larger than RECORD_MAX_BYTES. */
export const FULL_ERROR = "That's more than Handoff can keep on one listing, item or request, so this change wasn't saved.";
export const BAD_REQUEST_ERROR = "This change couldn't be sent. Reload the page and try again.";
export const REUSED_REQUEST_ERROR = "This change was already sent with different details. Reload the page and try again.";
/** After COMMIT the change is real, so a failure to build the view must never say "Nothing was changed". */
export const SAVED_NO_VIEW_ERROR = "Your change was saved, but Handoff couldn't load the latest data. Reload the page.";
/** Review of PR #88: an account sent more than ACTIONS_PER_MINUTE changes in a minute. Nothing is saved or logged. */
export const RATE_ERROR = "You're making changes faster than Handoff takes them. Wait a minute, then try again. Nothing was changed.";
/** Deleting one's data while something of theirs is still open (deleteMyData). */
export const DELETE_OPEN_ERROR =
  "First close or finish what's still going on: listings and items that can still sell, your requests and alerts, and exchanges with classmates that aren't done. Then you can delete your Handoff data.";
const REFUSED_FALLBACK = "That can't be done right now.";
const RELOAD_SUFFIX = " Reload the page to see the latest.";

// ── Limits ───────────────────────────────────────────────────────────────────────────────

/**
 * Review of PR #88: the most open records (listings and items that can still sell, live requests and alerts, shares, exchanges not
 * done; the port's openOf) one account may have in a world.
 */
export const OPEN_RECORDS_MAX = 100;
/** Review of PR #88: the most changes one account may send to a world in a minute (refused ones count; a retried click doesn't). */
export const ACTIONS_PER_MINUTE = 30;
/** The refusal when an account would go over OPEN_RECORDS_MAX (logged like the rules' refusals, so a retry gets the same answer). */
export const OPEN_LIMIT_ERROR = `You have ${OPEN_RECORDS_MAX} open listings, items, requests and exchanges, the most one account can have at once. Close one you no longer need, then try again.`;
/** One record's stored JSON at most. The market as a whole has no size limit: nothing reads or writes all of it at once. */
export const RECORD_MAX_BYTES = 256 * 1024;
export const NOTIFICATIONS_IN_VIEW = 100;
/**
 * The first write of each New York day prunes old actions, read notifications and extra snapshots, and so does every write that
 * takes the world's version past a multiple of this (review P4: by the day alone, a quiet world kept its actions for weeks).
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
/** A guest view is reused for this long at most (and never past its nextRefreshAt or the version it was built at). */
export const GUEST_VIEW_REUSE_MS = 30_000;
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const STATEMENT_TIMEOUT = "15s";
/** A write that keeps meeting newly committed changes reads and decides again at most this many times, then starts over. */
const MAX_PASSES = 6;
/** Whole transactions, for a deadlock or a row that changed under a write that didn't lock it. Then "busy". */
const WRITE_ATTEMPTS = 5;
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
/**
 * worlds.doc's `format` once a world is kept as rows, with the document's own format beside it (`rowsFormat`). Code from before the
 * rows refuses any format but its own (engine-port.ts's WORLD_FORMAT), so during a deploy an older app instance can't mistake the
 * meta alone for the whole market and write an empty one over it.
 */
const ROWS_FORMAT = "rows";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_WORLD = /^test-[a-z0-9-]{1,40}$/;
const NOTE_ID = /^[0-9a-z-]{1,48}$/;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROLS = /[\u0000-\u001f\u007f]/g;

// ── Public API ───────────────────────────────────────────────────────────────────────────

/** Test-only hooks. afterLock: once per transaction, once the change's first locks are held. beforeCommit: just before COMMIT. */
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
  /** Tests only: false takes no lock and writes the rows it changed blindly (the race tests' negative control). */
  lock?: boolean;
  /** Tests only: how long to wait for each lock (default 5000 ms). */
  lockTimeoutMs?: number;
  /** Tests only: other limits than OPEN_RECORDS_MAX and ACTIONS_PER_MINUTE (null: none). */
  limits?: { openRecords?: number | null; perMinute?: number | null };
  /** Tests only. */
  hooks?: ApplyHooks;
}

export interface PruneCounts {
  actions: number;
  notifications: number;
  snapshots: number;
}

/** True for "live" and for "test-…" world ids: the same rule as the worlds.id CHECK. */
export function isWorldId(value: unknown): value is WorldId {
  return value === "live" || (typeof value === "string" && TEST_WORLD.test(value));
}

/**
 * Creates or refreshes the user's profile row from the session's name and email. Called by the account's first change and every
 * change after it (applyAction, saveMyProfile), never by opening Handoff (review of PR #88). Writes only when the name or email
 * changed.
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
 * The viewer's view of a world. A world nobody has written to yet is an empty view at version 0 (nothing is created), and so is
 * the view of someone who has never changed anything: they have no profile row, and none is made (review of PR #88). When a
 * deadline has passed since the market was last stored, the expiry is swept and stored first. Throws on database errors; the page
 * maps them with setupErrorKind.
 */
export async function getView(
  sql: Sql,
  o: { worldId: WorldId; viewer: Actor; now?: number },
  port: EnginePort = enginePort,
): Promise<View> {
  assertWorldId(o.worldId);
  assertUserId(o.viewer.id);
  assertNow(o.now);
  return currentView(sql, port, o, await loadState(sql, sql, o.worldId, port));
}

/** getView's work, given the market as just read (refreshView reads it to decide, and passes it on). */
async function currentView(
  sql: Sql,
  port: EnginePort,
  o: { worldId: WorldId; viewer: Actor; now?: number },
  loaded: Loaded,
): Promise<View> {
  let { ms, state } = loaded;
  if (state && isDue(state, port, o.now ?? ms)) {
    try {
      await sweepWorld(sql, o.worldId, o.now, port);
      ({ ms, state } = await loadState(sql, sql, o.worldId, port));
    } catch (e) {
      if (setupErrorKind(e)) throw e;
      // Views derive expiry from the clock, so this one is still right; the next read sweeps again.
      logFailure("sweep", o.worldId, "sweep", {}, e);
    }
  }
  return buildView(sql, port, { worldId: o.worldId, viewer: o.viewer, state, now: o.now ?? ms });
}

/**
 * A refresh: `{unchanged: true}` when the world is still at `version`, nothing stored is due, and the tab's own view hasn't
 * reached its `nextRefreshAt`; otherwise the whole view. A view changes at its nextRefreshAt even when nothing is stored then
 * (a train leaving, an item's pickup window closing), so a tab that sends a nextRefreshAt that has come gets the whole view
 * (review INT-1). The unchanged path reads the world's version, and the market only when this app instance hasn't cached that
 * version yet (once per version, for every tab it serves).
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
  assertUserId(o.viewer.id);
  assertNow(o.now);
  checkNextRefreshAt(o.nextRefreshAt);
  const loaded = await loadState(sql, sql, o.worldId, port);
  const head = refreshHead(loaded, port, o);
  if (head.unchanged) return { unchanged: true, version: head.version };
  const view = await currentView(sql, port, { worldId: o.worldId, viewer: o.viewer, ...(o.now !== undefined ? { now: o.now } : {}) }, loaded);
  return { unchanged: false, view };
}

/**
 * What a signed-out visitor sees (C-CONTRACT §7): the guest view, built from the guest allowlists, with no viewer. A pure read:
 * it writes nothing (no profile row, no world, no expiry sweep) and takes no lock. When a stored deadline has passed and no
 * signed-in read has swept it yet, the view is still right, since every view is computed at its own time. The engine runs it with
 * no one's profile row. Every visitor gets the same view, so this app instance builds it once per version and reuses it for up to
 * GUEST_VIEW_REUSE_MS (never past its nextRefreshAt). Throws on database errors; the page maps them with setupErrorKind.
 */
export async function getGuestView(
  sql: Sql,
  o: { worldId: WorldId; now?: number },
  port: EnginePort = enginePort,
): Promise<GuestView> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  return guestViewOf(port, o, await loadState(sql, sql, o.worldId, port));
}

function guestViewOf(port: EnginePort, o: { worldId: WorldId; now?: number }, loaded: Loaded): GuestView {
  const { state } = loaded;
  const now = o.now ?? loaded.ms;
  if (!state) {
    const empty = port.empty();
    return port.run({ doc: empty, people: [], now }, () => port.guest(empty, { worldId: o.worldId, version: 0, now }));
  }
  // Reused only at the database's clock (tests inject their own time, and get a view built at it).
  const reuse = o.now === undefined ? state.guest : null;
  if (reuse && now >= reuse.builtAt && now - reuse.builtAt < GUEST_VIEW_REUSE_MS && (reuse.view.nextRefreshAt === null || now < reuse.view.nextRefreshAt)) {
    return { ...reuse.view, serverNow: now };
  }
  const doc = docOfState(state, port);
  const view = port.run({ doc, people: [], now }, () => port.guest(doc, { worldId: o.worldId, version: state.version, now }));
  if (o.now === undefined) state.guest = { view: deepFreeze(view), builtAt: now };
  return view;
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
  checkNextRefreshAt(o.nextRefreshAt);
  const loaded = await loadState(sql, sql, o.worldId, port);
  const head = refreshHead(loaded, port, o);
  if (head.unchanged) return { unchanged: true, version: head.version };
  return { unchanged: false, view: guestViewOf(port, { worldId: o.worldId, ...(o.now !== undefined ? { now: o.now } : {}) }, loaded) };
}

function checkNextRefreshAt(at: unknown): void {
  if (at !== null && (typeof at !== "number" || !Number.isFinite(at))) {
    throw new TypeError("Handoff: nextRefreshAt must be a time in ms, or null.");
  }
}

/**
 * Whether a refresh may answer "unchanged" (both kinds): the world is still at the tab's version, nothing stored is due, and the
 * tab's view hasn't reached its own nextRefreshAt (a view's counts change then even when nothing is stored; review INT-1).
 */
function refreshHead(
  loaded: Loaded,
  port: EnginePort,
  o: { version: number; nextRefreshAt: number | null; now?: number },
): { unchanged: boolean; version: number } {
  const now = o.now ?? loaded.ms;
  const version = loaded.state?.version ?? 0;
  const due = loaded.state !== null && isDue(loaded.state, port, now);
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
    limits: {
      openRecords: input.limits?.openRecords === undefined ? OPEN_RECORDS_MAX : input.limits.openRecords,
      perMinute: input.limits?.perMinute === undefined ? ACTIONS_PER_MINUTE : input.limits.perMinute,
    },
    hooks: input.hooks,
  };

  let written: Written;
  try {
    // The profile row is made (or its name and email refreshed) by the account's changes only: opening Handoff saves nothing.
    await ensurePerson(sql, input.actor);
    written = await write(sql, spec, port);
  } catch (e) {
    return failedOutcome(e, spec);
  }
  if (written.kind === "mismatch") return { ok: false, code: "invalid", error: REUSED_REQUEST_ERROR };
  if (written.kind === "limited") return { ok: false, code: "busy", error: RATE_ERROR };
  if (written.kind === "applied") logExistingViolations(input.worldId, written.version, written.existing);

  let view: View;
  try {
    // The market as committed now: this change, and any other committed since (read from the rows that changed).
    const loaded = await loadState(sql, sql, input.worldId, port);
    view = await buildView(sql, port, { worldId: input.worldId, viewer: input.actor, state: loaded.state, now: written.now });
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

/** What readItemPhoto answers when the asker already has this version (its ETag): that it's still theirs to see, without the bytes. */
export interface PhotoNotModified {
  notModified: true;
  version: string;
}

const ITEM_ID = /^g[0-9a-f]{16}$/;
const PHOTO_VERSION = /^[0-9a-f]{16}$/;

/**
 * An item's photo for one viewer (§9s item 6), or null: served only when that viewer's view shows the item with its photo right now
 * (the port's photoFor: a signed-out visitor, viewerId null, only while the item is available; a signed-in account until it ends).
 * `version`, when given, must be the photo's current one, so an address made for an earlier photo serves nothing. `etag`: the
 * version the asker already holds; when it is still the current one, no bytes are read (PhotoNotModified). Review of PR #88: reads
 * only the item's own rows (the item, and the requests on it) and its photo, never the whole market. A pure read: no lock, no sweep,
 * no profile row. An id or version that isn't one is null too.
 */
export async function readItemPhoto(
  sql: Sql,
  o: { worldId: WorldId; itemId: string; viewerId: string | null; version?: string; etag?: string; now?: number },
  port: EnginePort = enginePort,
): Promise<StoredPhoto | PhotoNotModified | null> {
  assertWorldId(o.worldId);
  assertNow(o.now);
  if (typeof o.itemId !== "string" || !ITEM_ID.test(o.itemId)) return null;
  if (o.version !== undefined && (typeof o.version !== "string" || !PHOTO_VERSION.test(o.version))) return null;
  const photoFor = port.photoFor;
  if (!photoFor) return null;
  const [row] = await sql<{ ms: number; split: boolean | null; meta: WorldDoc | null; recs: [string, string, number, Record<string, unknown>][] | null }[]>`
    SELECT c.ms, w.split_at IS NOT NULL AS split, CASE WHEN w.split_at IS NOT NULL THEN w.doc END AS meta,
           CASE WHEN w.split_at IS NOT NULL THEN (
             SELECT coalesce(json_agg(json_build_array(r.kind, r.id, r.ord, r.data)), '[]'::json) FROM records r
             WHERE r.world_id = w.id AND (r.id = ${o.itemId} OR r.parent_id = ${o.itemId})) END AS recs
    FROM (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms) AS c
    LEFT JOIN worlds w ON w.id = ${o.worldId}`;
  if (!row || row.split === null) return null;
  const now = o.now ?? row.ms;
  let doc: WorldDoc;
  if (row.split && row.meta && row.recs) {
    // The item and the requests on it, joined into a document that holds only them (and the world's meta).
    const orders = port.orders();
    const rows = row.recs.map(([kind, id, ord, data]) => ({ kind, id, ord, data }));
    doc = port.join(readMeta(row.meta), rows.filter((r) => orders[r.kind] !== undefined).sort(byOrder(orders)));
  } else {
    // A world not yet kept as rows (until its first change after this version is deployed): the whole document.
    const loaded = await loadState(sql, sql, o.worldId, port);
    if (!loaded.state) return null;
    doc = docOfState(loaded.state, port);
  }
  const ref = port.run({ doc, people: [], now }, () => photoFor(doc, o.itemId, o.viewerId));
  if (!ref || (o.version !== undefined && o.version !== ref.v)) return null;
  if (o.etag !== undefined && o.etag === ref.v) {
    const [held] = await sql<{ version: string }[]>`
      SELECT version FROM item_photos WHERE world_id = ${o.worldId} AND item_id = ${o.itemId} AND version = ${ref.v}`;
    return held ? { notModified: true, version: held.version } : null;
  }
  const [photo] = await sql<{ mime: PhotoMime; bytes: Uint8Array; version: string }[]>`
    SELECT mime, bytes, version FROM item_photos WHERE world_id = ${o.worldId} AND item_id = ${o.itemId} AND version = ${ref.v}`;
  return photo ? { mime: photo.mime, bytes: photo.bytes, version: photo.version } : null;
}

/**
 * Marks the user's own notifications read: some by id, or "all". Scoped to the user in SQL, so another user's
 * ids change nothing. Takes no lock and doesn't change the version. Returns how many were marked.
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
 * and has no handle of its own (the engine's payNeededBy), with the user's profile row locked, so a listing they post meanwhile is
 * counted. Profiles are shared by all worlds.
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
  // The JSON goes in as text and is cast in SQL, as the records do (bound straight to jsonb, it would be encoded twice).
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
 * Whether something of the user's in the world still needs their saved methods (the engine's payNeededBy), read with the user's
 * profile row locked (bounded as a write's wait is): every change that lists, invites or offers for them locks that row too, so it is
 * ordered with this one. Says by which rule (the port's payNeededRule: open listings until invite to pay is switched on, then open
 * invitations and offers), or null when nothing does, or the world has no row yet.
 */
async function payStillNeeded(tx: Sql, sql: Sql, worldId: WorldId, userId: string, port: EnginePort, at?: number): Promise<"listing" | "exchange" | null> {
  await tx.unsafe(`SET LOCAL lock_timeout = '${DEFAULT_LOCK_TIMEOUT_MS}ms'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
  await lockPeople(tx, [userId]);
  const { ms, state } = await loadState(tx, sql, worldId, port);
  if (!state) return null;
  const now = at ?? ms; // the database's clock, read after the lock, as a write's is
  const doc = docOfState(state, port);
  return engine(() => port.run({ doc, people: [], now }, () => (port.payNeeded(doc, userId) > 0 ? (port.payNeededRule ? port.payNeededRule() : "listing") : null)));
}

/**
 * Review of PR #88: deletes what Handoff keeps about the user: their profile (name, email, payment methods), their notifications
 * and their entries in the actions log, in every world. Refused (DELETE_OPEN_ERROR) while something of theirs in `worldId` is still
 * going on, as the page shows it (the port's openOf): a listing that can still sell, an item still up, a live request or alert, or an
 * exchange with a classmate that isn't over. The market's records of their past trades stay, as their classmates' records too: the
 * views name them "A classmate" from then on, but what those records already say stays as it was (a trade's history line with
 * their public name, the payment method a ticket exchange showed its buyer), and so do classmates' notifications. A later change of
 * theirs makes a new profile.
 */
export async function deleteMyData(
  sql: Sql,
  o: { worldId: WorldId; userId: string; /** Tests only: the time to judge what's still open at (ms). */ now?: number },
  port: EnginePort = enginePort,
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWorldId(o.worldId);
  assertUserId(o.userId);
  assertNow(o.now);
  return sql.begin(async (raw): Promise<{ ok: true } | { ok: false; error: string }> => {
    const tx = asSql(raw);
    await tx.unsafe(`SET LOCAL lock_timeout = '${DEFAULT_LOCK_TIMEOUT_MS}ms'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    await lockPeople(tx, [o.userId]);
    const { ms, state } = await loadState(tx, sql, o.worldId, port);
    if (state && stillOpen(state, port, o.userId, o.now ?? ms)) return { ok: false, error: DELETE_OPEN_ERROR };
    await tx`DELETE FROM notifications WHERE user_id = ${o.userId}`;
    await tx`DELETE FROM actions WHERE actor_id = ${o.userId}`;
    await tx`DELETE FROM people WHERE user_id = ${o.userId}`;
    return { ok: true };
  });
}

/**
 * Whether anything of the user's is still going on: one of theirs, or a classmate's that waits on one of theirs (an exchange on their
 * listing). The port's openOf at `now`, or, for a port without it, the rows' own flags.
 */
function stillOpen(state: WorldState, port: EnginePort, userId: string, now: number): boolean {
  const count = port.openOf?.bind(port);
  if (count) {
    const doc = docOfState(state, port);
    const n = engine(() => port.run({ doc, people: [], now }, () => count(doc, userId)));
    return n.own + n.theirs > 0;
  }
  const rows = recordsOf(state, port);
  for (const r of rows.values()) {
    if (!r.open) continue;
    if (r.owner === userId) return true;
    for (const g of r.guards) if (rows.get(g)?.owner === userId) return true;
  }
  return false;
}

/**
 * Deletes a world's actions older than 7 days, its read notifications older than 90 days, and snapshots over their caps:
 * daily ones beyond the newest 7 or older than 7 days (except the newest 2), and before-upgrade ones beyond 3; manual ones are
 * kept. Writes run this too: the first write of each New York day, and every 50 versions.
 */
export async function pruneWorld(sql: Sql, worldId: WorldId, now?: number): Promise<PruneCounts> {
  assertWorldId(worldId);
  assertNow(now);
  return sql.begin(async (raw): Promise<PruneCounts> => {
    const tx = asSql(raw);
    return pruneIn(tx, worldId, now ?? (await clockMs(tx)));
  });
}

/**
 * The world as committed now, read straight from its rows (no cache): its version, the whole document, when it was created and
 * last written, and the next deadline still to sweep. Pass a transaction for a consistent read (the pilot report reads in a
 * REPEATABLE READ one). For tests, diagnostics and the report.
 */
export async function readStoredWorld(
  q: Sql,
  worldId: WorldId,
  port: EnginePort = enginePort,
): Promise<{ version: number; doc: WorldDoc; split: boolean; createdAt: number; updatedAt: number; nextDue: number | null } | undefined> {
  assertWorldId(worldId);
  const state = await readFull(q, worldId, port);
  if (!state) return undefined;
  const [row] = await q<{ created: number; updated: number }[]>`
    SELECT floor(extract(epoch FROM created_at) * 1000)::float8 AS created,
           floor(extract(epoch FROM greatest(updated_at, (SELECT max(updated_at) FROM records WHERE world_id = ${worldId}))) * 1000)::float8 AS updated
    FROM worlds WHERE id = ${worldId}`;
  return {
    version: state.version,
    doc: structuredClone(docOfState(state, port)) as WorldDoc, // the caller's own copy, not frozen
    split: state.split,
    createdAt: row?.created ?? 0,
    updatedAt: row?.updated ?? 0,
    nextDue: dueOf(state, port),
  };
}

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
  limits: { openRecords: number | null; perMinute: number | null };
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

/** The transaction's result. `version` is the world's version as this write left it (others may have committed since). */
type Written =
  /** `existing`: violations the saved document still has, all from before this action (logged, never refused). */
  | { kind: "applied"; res: ReduceResult; version: number; now: number; existing: string[] }
  | { kind: "refused"; res: ReduceResult; version: number; now: number }
  | { kind: "replay"; prior: PriorAction; now: number }
  | { kind: "mismatch"; now: number }
  | { kind: "limited"; now: number }
  | { kind: "unchanged"; now: number };

/** The action would leave the shared data in a state the rules forbid. Nothing is saved. */
class InvariantError extends Error {
  override name = "InvariantError";
  constructor(public readonly violations: string[]) {
    super("A newly introduced invariant violation.");
  }
}

/** A row changed under a write that should have held its lock (or, for the negative control, didn't take one). Tried again. */
class RecordConflict extends Error {
  override name = "RecordConflict";
}

/** A write kept meeting newly committed changes (MAX_PASSES). Tried again, then "busy". */
class Contention extends Error {
  override name = "Contention";
}

/** The world is still one document: it's split into rows first (ensureSplit), then the write runs again. */
class NotSplit extends Error {
  override name = "NotSplit";
}

/** The engine threw. Keeps only the original error's class, never its message or the action's payload. */
class EngineError extends Error {
  override name = "EngineError";
  constructor(public readonly inner: string) {
    super("The engine failed.");
  }
}

/** The write would make one record larger than RECORD_MAX_BYTES. */
class RecordTooLarge extends Error {
  override name = "RecordTooLarge";
  constructor(public readonly bytes: number) {
    super("A record is too large.");
  }
}

/** The world's row isn't there: deleted while a sweep was on its way. */
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

/** Runs the write's transaction, again after a deadlock or a conflict (with a short random wait), and splits a world first if it must. */
async function write(sql: Sql, w: WriteSpec, port: EnginePort): Promise<Written> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sql.begin((raw) => transact(asSql(raw), sql, w, port));
    } catch (e) {
      if (e instanceof NotSplit && attempt < WRITE_ATTEMPTS) {
        await ensureSplit(sql, w.worldId, port, w.lockTimeoutMs, w.now);
        continue;
      }
      if (attempt < WRITE_ATTEMPTS && retryable(e)) {
        await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20 * attempt)));
        continue;
      }
      if (e instanceof Contention || errorCode(e) === "40P01") throw Object.assign(new Error("Handoff is busy."), { code: "55P03" });
      throw e;
    }
  }
}

/** A deadlock (Postgres ends one of the two), a serialization failure, or a row that changed under the write: run it again. */
function retryable(e: unknown): boolean {
  if (e instanceof RecordConflict || e instanceof Contention) return true;
  const code = errorCode(e);
  return code === "40P01" || code === "40001";
}

/** The change a run of the rules makes to the stored rows. */
interface Change {
  /** New records, in the order they go in (so a list's order comes out as the engine keeps it). */
  inserts: MarketRecord[];
  updates: { rec: MarketRecord; prev: RecordRow }[];
  deletes: RecordRow[];
  /** The meta to store, when it changed (other than lastStamp: the clock the engine stamps from, which isn't worth a write). */
  meta: WorldDoc | null;
  /** The meta as the change left it, lastStamp and all: the rows it writes keep that stamp (see withStamp), the world's row the rest. */
  nextMeta: WorldDoc;
}

type EngineOut =
  | { refused: true; res: ReduceResult }
  | {
      refused: false; res: ReduceResult; notes: EngineNote[]; before: string[]; after: string[]; change: Change;
      /** The actor's open records before and after (the port's openOf, at this run's clock), when the limit applies and the port counts them. */
      open: { before: number; after: number } | null;
    };

/** The write's transaction (C-DESIGN §4.1 as revised: see the top of this file). */
async function transact(tx: Sql, pool: Sql, w: WriteSpec, port: EnginePort): Promise<Written> {
  await tx.unsafe(`SET LOCAL lock_timeout = '${w.lockTimeoutMs}ms'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
  const sweep = w.actorId === null;
  let hooked = false;
  const afterLock = async (): Promise<void> => {
    if (hooked) return;
    hooked = true;
    await w.hooks?.afterLock?.();
  };

  if (sweep) {
    // One sweep of a world at a time: a read that finds another one running waits for it (bounded by lock_timeout), then finds
    // nothing left to sweep and reads what it stored.
    await tx`SELECT pg_advisory_xact_lock(${lockKey(`handoff-sweep:${w.worldId}`)}::bigint)`;
  } else if (w.lock) {
    // The actor's own profile row: their changes run one at a time, so a retry finds its first outcome and their limits count right.
    await lockPeople(tx, [w.actorId!]);
  }

  // This actor's earlier outcome for the same request id, if this is a retry.
  const [prior] = await tx<{ ms: number; type: string; ids: Record<string, string> | null; ok: boolean; result: LoggedResult | null }[]>`
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms, type, ids, ok, result FROM actions
    WHERE world_id = ${w.worldId} AND actor_id = ${w.actorId ?? SYSTEM_ACTOR} AND request_id = ${w.requestId}`;
  if (prior) {
    await afterLock();
    const p: PriorAction = { type: prior.type, ids: prior.ids ?? {}, ok: prior.ok === true, result: prior.result ?? {} };
    const now = w.now ?? prior.ms;
    return sameAction(p, w.action.type, w.ids) ? { kind: "replay", prior: p, now } : { kind: "mismatch", now };
  }

  // Review of PR #88: one account's changes per minute (a retried click, answered above, doesn't count).
  if (!sweep && w.limits.perMinute !== null) {
    const [recent] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM actions
      WHERE world_id = ${w.worldId} AND actor_id = ${w.actorId!}
        AND at > coalesce(${w.now !== undefined ? new Date(w.now - 60_000) : null}::timestamptz, clock_timestamp() - interval '1 minute')`;
    if ((recent?.n ?? 0) >= w.limits.perMinute) {
      await afterLock();
      return { kind: "limited", now: w.now ?? (await clockMs(tx)) };
    }
  }

  let loaded = await loadState(tx, pool, w.worldId, port);
  if (!loaded.state) {
    if (sweep) throw new MissingWorld();
    // A world's first write creates its row here, inside the transaction, already kept as rows. A concurrent first write waits on
    // this INSERT (bounded by lock_timeout) until this transaction commits, then finds the row.
    await tx`
      INSERT INTO worlds (id, doc, split_at) VALUES (${w.worldId}, ${storedMetaJson(port.split(port.empty()).meta)}::text::jsonb, clock_timestamp())
      ON CONFLICT (id) DO NOTHING`;
    loaded = await loadState(tx, pool, w.worldId, port);
    if (!loaded.state) throw new MissingWorld();
  }
  if (!loaded.state.split) throw new NotSplit();
  let state = loaded.state;
  let now = w.now ?? loaded.ms;

  // A sweep checks again: another request may have swept already.
  if (sweep && !isDue(state, port, now)) {
    await afterLock();
    return { kind: "unchanged", now };
  }

  const held = { named: new Set<string>(), people: new Set<string>(sweep || !w.lock ? [] : [w.actorId!]), records: new Set<string>(), meta: false };
  // Profiles the engine may name: the actor, and the owners of the records the action names (the rest are read when needed).
  const people = new Map<string, PersonRow>();
  await readPeopleInto(tx, people, seedPeople(state, port, w));

  for (let pass = 1; ; pass++) {
    const out = runRules(state, people, now, w, port);
    // Profiles a run needed but didn't have: read them and run the rules again (nothing is locked or written for that).
    const missing = out.refused ? [] : peopleNamed(state, out.change, out.notes).filter((id) => !people.has(id));
    if (missing.length > 0) {
      const before = people.size;
      await readPeopleInto(tx, people, missing);
      if (people.size > before) {
        pass -= 1;
        continue;
      }
    }

    if (out.refused) {
      if (sweep) throw new EngineError("SweepRefused");
      await afterLock();
      await logAction(tx, w, now, { ok: false, result: loggedResult(out.res, false), before: state.version, after: state.version });
      await w.hooks?.beforeCommit?.();
      return { kind: "refused", res: out.res, version: state.version, now };
    }

    // Review of PR #88: the most open records one account may have (the change may close some of theirs, too). Counted as the page
    // shows them (the port's openOf: a sold-out listing or an item past its last day no longer counts), else by the rows' own flag.
    if (!sweep && w.limits.openRecords !== null) {
      const over = out.open
        ? out.open.after > out.open.before && out.open.after > w.limits.openRecords
        : ((opened) => opened > 0 && openCount(state, w.actorId!) + opened > w.limits.openRecords!)(openDelta(out.change, w.actorId!));
      if (over) {
        const res: ReduceResult = { state: docOfState(state, port), error: OPEN_LIMIT_ERROR };
        await afterLock();
        await logAction(tx, w, now, { ok: false, result: loggedResult(res, false), before: state.version, after: state.version });
        await w.hooks?.beforeCommit?.();
        return { kind: "refused", res, version: state.version, now };
      }
    }

    const change = out.change;
    if (sweep && out.notes.length === 0 && isEmptyChange(change)) {
      // Nothing expired after all (a deadline the rules don't act on): this app instance won't sweep this version again until later.
      state.sweptAt = Math.max(state.sweptAt, now);
      await afterLock();
      return { kind: "unchanged", now };
    }

    // What the change touches, locked in a fixed order: profiles, then rows, then the world's own row.
    if (w.lock) {
      const need = locksFor(state, change, w.actorId, out.notes.length > 0);
      const named2 = need.named.filter((n) => !held.named.has(n));
      const people2 = need.people.filter((id) => !held.people.has(id));
      const records2 = need.records.filter((key) => !held.records.has(key));
      const meta2 = need.meta && !held.meta;
      if (named2.length > 0 || people2.length > 0 || records2.length > 0 || meta2) {
        if (named2.length > 0) await lockNamed(tx, w.worldId, named2);
        if (people2.length > 0) await lockPeople(tx, people2);
        if (records2.length > 0) await lockRecords(tx, w.worldId, records2);
        if (meta2) await tx`SELECT 1 FROM worlds WHERE id = ${w.worldId} FOR NO KEY UPDATE`;
        for (const n of named2) held.named.add(n);
        for (const id of people2) held.people.add(id);
        for (const key of records2) held.records.add(key);
        if (meta2) held.meta = true;
        await afterLock();
        // Anything committed since the market was read? Then read it again and decide again, now with these rows locked.
        const again = await loadState(tx, pool, w.worldId, port);
        if (!again.state) throw new MissingWorld();
        if (!again.state.split) throw new NotSplit();
        if (again.state.version !== state.version || again.state.born !== state.born) {
          if (pass >= MAX_PASSES) throw new Contention();
          state = again.state;
          now = w.now ?? again.ms;
          if (sweep && !isDue(state, port, now)) return { kind: "unchanged", now };
          continue;
        }
      }
    }
    await afterLock();

    // Only violations this action introduced are refused; old damage never freezes the world (§4.6, J1-4).
    const introduced = introducedViolations(out.before, out.after);
    if (introduced.length > 0) throw new InvariantError(introduced);
    const version = await saveChange(tx, w, state, change, now, sweep, out.notes.length > 0);
    // §9s item 6: item_photos follows the document in this same transaction (the bytes this action brought; the rows it no longer refers to).
    await syncPhotos(tx, w, port, docOfState(state, port), out.res.state);
    await insertNotifications(tx, w.worldId, w.requestId, out.notes);
    await logAction(tx, w, now, { ok: true, result: loggedResult(out.res, true), before: state.version, after: version });
    // The day's first write takes its snapshot and prunes, so nothing outlives its limit by more than a day of writes.
    const firstToday = await maybeSnapshotDaily(tx, w.worldId, version, () => JSON.stringify(out.res.state), now);
    if (firstToday || Math.floor(version / PRUNE_EVERY_VERSIONS) > Math.floor(state.version / PRUNE_EVERY_VERSIONS)) await pruneIn(tx, w.worldId, now);
    await w.hooks?.beforeCommit?.();
    return { kind: "applied", res: out.res, version, now, existing: out.after };
  }
}

/** One run of the rules on the market as read: the outcome, and the rows it changes. Everything the engine does is in one synchronous run. */
function runRules(state: WorldState, people: ReadonlyMap<string, PersonRow>, now: number, w: WriteSpec, port: EnginePort): EngineOut {
  const doc = docOfState(state, port);
  const out = engine(() =>
    port.run({ doc, people: [...people.values()], now }, (): EngineOut | { refused: true; res: ReduceResult } => {
      const res = port.reduce(doc, w.actorId, w.action);
      if (typeof res.error === "string") return { refused: true, res };
      // Drained before the invariants are checked, so the new document is at rest like the stored one; otherwise
      // the at-rest rule "the document holds no notifications" (§4.6) would refuse every write that notifies.
      const notes = port.drain(res.state);
      const counted = w.actorId !== null && w.limits.openRecords !== null && port.openOf ? port.openOf.bind(port) : null;
      const open = counted ? { before: counted(doc, w.actorId!).own, after: counted(res.state, w.actorId!).own } : null;
      return { refused: false, res, notes, before: port.violations(doc), after: port.violations(res.state), change: EMPTY_CHANGE, open };
    }),
  );
  if (out.refused) return out;
  return { ...out, change: engine(() => changeOf(state, out.res.state, port)) };
}

const EMPTY_CHANGE: Change = Object.freeze({ inserts: [], updates: [], deletes: [], meta: null, nextMeta: { mode: "live" } }) as unknown as Change;

function isEmptyChange(c: Change): boolean {
  return c.inserts.length === 0 && c.updates.length === 0 && c.deletes.length === 0 && c.meta === null;
}

/**
 * The rows a new document changes against the stored ones: new records, records whose JSON changed (the engine copies the document
 * it's given, so an untouched record comes back exactly as it was read), and records it no longer has. New records must be where
 * the engine adds them (the front of a newest-first list, the end of an oldest-first one), or their order couldn't be kept.
 */
function changeOf(state: WorldState, next: WorldDoc, port: EnginePort): Change {
  const { meta, records } = port.split(next);
  const orders = port.orders();
  const inserts: MarketRecord[] = [];
  const updates: { rec: MarketRecord; prev: RecordRow }[] = [];
  const seen = new Set<string>();
  const byKind = new Map<string, { recs: MarketRecord[]; fresh: boolean[] }>();
  for (const rec of records) {
    const key = `${rec.kind}:${rec.id}`;
    if (seen.has(key)) throw new Error(`Handoff: two records are ${key}.`);
    seen.add(key);
    const prev = state.records.get(key);
    let list = byKind.get(rec.kind);
    if (!list) byKind.set(rec.kind, (list = { recs: [], fresh: [] }));
    list.recs.push(rec);
    list.fresh.push(!prev);
    if (prev && JSON.stringify(rec.data) !== rowJson(prev)) updates.push({ rec, prev });
  }
  for (const [kind, { recs, fresh }] of byKind) {
    const order = orders[kind];
    if (!order) throw new Error(`Handoff: "${kind}" isn't a kind of record this port keeps.`);
    const n = fresh.filter(Boolean).length;
    if (n === 0) continue;
    // Newest first: the new ones are the first n, and go in from the oldest of them, so the newest gets the highest ord.
    const ok = order === "newestFirst" ? fresh.slice(0, n).every(Boolean) : fresh.slice(recs.length - n).every(Boolean);
    if (!ok) throw new Error(`Handoff: a new ${kind} isn't where the engine adds them.`);
    const added = order === "newestFirst" ? recs.slice(0, n).reverse() : recs.slice(recs.length - n);
    inserts.push(...added);
  }
  const deletes = [...state.records.entries()].filter(([key]) => !seen.has(key)).map(([, row]) => row);
  const metaChanged = metaKey(meta) !== metaKey(state.meta);
  return { inserts, updates, deletes, meta: metaChanged ? meta : null, nextMeta: meta };
}

/** The meta as compared for a change: everything but lastStamp. */
function metaKey(meta: WorldDoc): string {
  return JSON.stringify({ ...meta, lastStamp: 0 });
}

/**
 * The engine's stamp clock (the meta's lastStamp: every stamp it gives is past the last one, C-DESIGN §5.1). It moves with nearly
 * every change, so rather than write the world's row each time, each row a change writes keeps the clock as that change left it
 * (records.stamp), and the meta read back takes the latest of them.
 */
function stampOf(meta: WorldDoc): number {
  const s = meta["lastStamp"];
  return typeof s === "number" && Number.isFinite(s) ? s : 0;
}

function withStamp(meta: WorldDoc, stamp: number | null): WorldDoc {
  return typeof meta["lastStamp"] === "number" && stamp !== null && stamp > meta["lastStamp"] ? { ...meta, lastStamp: stamp } : meta;
}

/** How many open records of the account's the change opens, less those it closes. */
function openDelta(c: Change, userId: string): number {
  let d = 0;
  for (const r of c.inserts) if (r.owner === userId && r.open) d += 1;
  for (const { rec, prev } of c.updates) d += (rec.owner === userId && rec.open ? 1 : 0) - (prev.owner === userId && prev.open ? 1 : 0);
  for (const r of c.deletes) if (r.owner === userId && r.open) d -= 1;
  return d;
}

function openCount(state: WorldState, userId: string): number {
  let n = 0;
  for (const r of state.records.values()) if (r.open && r.owner === userId) n += 1;
  return n;
}

/**
 * What a change must lock, in this order: the locks its new records name (the port's createLocks: new events go one at a time);
 * the profiles of the actor and of whoever the change gives a new record or makes hold something (a reservation: what one person
 * may hold is limited, so their changes are ordered); the stored rows it changes, and the stored rows those depend on (each
 * record's guards, and a new record's createGuards); and the world's row when that's written (metaWrite). A row not yet stored
 * can't be locked, and needn't be: nobody else can have it.
 */
function locksFor(
  state: WorldState,
  c: Change,
  actorId: string | null,
  notified: boolean,
): { named: string[]; people: string[]; records: string[]; meta: boolean } {
  const named = new Set<string>();
  const people = new Set<string>(actorId ? [actorId] : []);
  const records = new Set<string>();
  const guard = (keys: readonly string[] | undefined): void => {
    for (const k of keys ?? []) if (state.records.has(k)) records.add(k);
  };
  for (const r of c.inserts) {
    for (const n of r.createLocks ?? []) named.add(n);
    if (r.owner) people.add(r.owner);
    guard(r.guards);
    guard(r.createGuards);
  }
  for (const { rec, prev } of c.updates) {
    records.add(`${prev.kind}:${prev.id}`);
    if (rec.owner && ((rec.holds === true && !prev.holds) || rec.owner !== prev.owner)) people.add(rec.owner);
    guard(rec.guards);
    guard(prev.guards);
  }
  for (const r of c.deletes) {
    records.add(`${r.kind}:${r.id}`);
    if (r.owner) people.add(r.owner);
    guard(r.guards);
  }
  return { named: [...named].sort(), people: [...people].sort(), records: [...records].sort(), meta: metaWrite(c, notified) };
}

/** Takes a world's named locks (createLocks), in name order; each held until the transaction ends. */
async function lockNamed(tx: Sql, worldId: WorldId, names: readonly string[]): Promise<void> {
  for (const name of [...names].sort()) await tx`SELECT pg_advisory_xact_lock(${lockKey(`handoff:${worldId}:${name}`)}::bigint)`;
}

/** The owners of the records the action names, and of the records those depend on: the people its words most likely name. */
function seedPeople(state: WorldState, port: EnginePort, w: WriteSpec): string[] {
  const ids = new Set<string>(w.actorId ? [w.actorId] : []);
  const kinds = Object.keys(port.orders());
  for (const value of Object.values(w.ids)) {
    for (const kind of kinds) {
      const row = state.records.get(`${kind}:${value}`);
      if (!row) continue;
      if (row.owner) ids.add(row.owner);
      for (const g of row.guards) {
        const owner = state.records.get(g)?.owner;
        if (owner) ids.add(owner);
      }
    }
  }
  return [...ids];
}

/** Everyone a change's records and notifications name: their owners, the owners of what they depend on, and whom the notes go to. */
function peopleNamed(state: WorldState, c: Change, notes: readonly EngineNote[]): string[] {
  const ids = new Set<string>();
  const add = (id: string | null | undefined): void => {
    if (id) ids.add(id);
  };
  const guards = (keys: readonly string[] | undefined): void => {
    for (const k of keys ?? []) add(state.records.get(k)?.owner);
  };
  for (const r of c.inserts) {
    add(r.owner);
    guards(r.guards);
  }
  for (const { rec, prev } of c.updates) {
    add(rec.owner);
    add(prev.owner);
    guards(rec.guards);
  }
  for (const r of c.deletes) add(r.owner);
  for (const n of notes) add(n.userId);
  return [...ids];
}

/**
 * Writes the change: new rows (each taking the next ord), changed rows (a new revision: a row whose revision moved under the write
 * means it wasn't locked, and the write runs again), rows that went, and the meta. The world's version (worlds.version plus every
 * row's tally) goes up by exactly one for the change: on one of the rows it writes (its tally), or, when the meta changes, a row
 * goes or only notifications were made, on the world's own row (which then also takes the tallies of the rows that went, so the
 * version never goes back). So no row is written by every change, and the version still counts changes. Returns it.
 */
async function saveChange(tx: Sql, w: WriteSpec, state: WorldState, c: Change, now: number, sweep: boolean, notified: boolean): Promise<number> {
  const at = new Date(now);
  const json = (r: MarketRecord, prev?: RecordRow): string => {
    const s = JSON.stringify(r.data);
    const bytes = Buffer.byteLength(s, "utf8");
    // Past the limit, a record may only shrink (one stored before the limit, say), so it never stops its exchange.
    if (bytes > RECORD_MAX_BYTES && (!prev || bytes > Buffer.byteLength(rowJson(prev), "utf8"))) {
      // The expiry sweep is exempt: it stores only what time already decided, once (review INT-3).
      if (!sweep) throw new RecordTooLarge(bytes);
      console.warn(`[handoff] world ${w.worldId}: stored the expiry sweep although a ${r.kind} is ${bytes} bytes, past the ${RECORD_MAX_BYTES}-byte limit.`);
    }
    return s;
  };
  // Where the change is counted: the world's row when it's written anyway (the meta changed, a row went) or nothing else is, else
  // the first row written (an update before an insert).
  const onWorld = metaWrite(c, notified);
  const first = c.updates[0]?.prev ?? null;
  const counted = onWorld ? null : first ? `u:${first.kind}:${first.id}` : c.inserts[0] ? `i:${c.inserts[0].kind}:${c.inserts[0].id}` : null;
  const stamp = stampOf(c.nextMeta);
  const rowOf = (r: MarketRecord, tally: number, prev?: RecordRow): string =>
    `{"kind":${JSON.stringify(r.kind)},"id":${JSON.stringify(r.id)},${prev ? `"rev":${prev.rev},` : ""}"tally":${tally},"owner":${JSON.stringify(r.owner)},"open":${r.open},"parent":${JSON.stringify(r.parent)},"data":${json(r, prev)}}`;
  if (c.inserts.length > 0) {
    // In array order, so each takes the next ord in turn (changeOf put them in the order that keeps each list's order).
    const rows = c.inserts.map((r) => rowOf(r, counted === `i:${r.kind}:${r.id}` ? 1 : 0));
    const inserted = await tx`
      INSERT INTO records (world_id, kind, id, ord, rev, tally, stamp, owner_id, open, parent_id, data, updated_at)
      SELECT ${w.worldId}, x.kind, x.id, nextval('record_ord'), 1, x.tally, ${stamp}, x.owner, x.open, x.parent, x.data, ${at}
      FROM jsonb_to_recordset(${`[${rows.join(",")}]`}::text::jsonb)
        AS x(kind text, id text, tally int, owner text, open boolean, parent text, data jsonb)
      ON CONFLICT (world_id, kind, id) DO NOTHING`;
    if (inserted.count !== c.inserts.length) throw new RecordConflict();
  }
  if (c.updates.length > 0) {
    const rows = `[${c.updates.map(({ rec, prev }) => rowOf(rec, counted === `u:${prev.kind}:${prev.id}` ? 1 : 0, prev)).join(",")}]`;
    const updated = w.lock
      ? await tx`
          UPDATE records r SET data = x.data, rev = r.rev + 1, tally = r.tally + x.tally, stamp = greatest(r.stamp, ${stamp}), owner_id = x.owner,
            open = x.open, parent_id = x.parent, updated_at = ${at}
          FROM jsonb_to_recordset(${rows}::text::jsonb) AS x(kind text, id text, rev int, tally int, owner text, open boolean, parent text, data jsonb)
          WHERE r.world_id = ${w.worldId} AND r.kind = x.kind AND r.id = x.id AND r.rev = x.rev`
      : await tx`
          UPDATE records r SET data = x.data, rev = r.rev + 1, tally = r.tally + x.tally, stamp = greatest(r.stamp, ${stamp}), owner_id = x.owner,
            open = x.open, parent_id = x.parent, updated_at = ${at}
          FROM jsonb_to_recordset(${rows}::text::jsonb) AS x(kind text, id text, rev int, tally int, owner text, open boolean, parent text, data jsonb)
          WHERE r.world_id = ${w.worldId} AND r.kind = x.kind AND r.id = x.id`;
    if (w.lock && updated.count !== c.updates.length) throw new RecordConflict();
  }
  let gone = 0;
  if (c.deletes.length > 0) {
    const deleted = await tx<{ tally: number }[]>`
      DELETE FROM records r USING unnest(${c.deletes.map((d) => d.kind)}::text[], ${c.deletes.map((d) => d.id)}::text[]) AS k(kind, id)
      WHERE r.world_id = ${w.worldId} AND r.kind = k.kind AND r.id = k.id RETURNING r.tally`;
    if (w.lock && deleted.count !== c.deletes.length) throw new RecordConflict();
    gone = deleted.reduce((t, r) => t + r.tally, 0);
  }
  if (onWorld) {
    // The world's row (this write holds it: locksFor) takes the meta as the change left it, its stamp clock too.
    await tx`
      UPDATE worlds SET doc = ${storedMetaJson(c.nextMeta)}::text::jsonb, version = version + ${1 + gone}, updated_at = ${at}
      WHERE id = ${w.worldId}`;
  } else if (c.inserts.length === 0 && c.updates.length === 0) {
    return state.version; // nothing stored changed and nobody was told anything: the version stays
  }
  return state.version + 1;
}

/** Whether a change writes the world's own row: its meta changed, a row went, or it only notified (it changed no row to count on). */
function metaWrite(c: Change, notified: boolean): boolean {
  return c.meta !== null || c.deletes.length > 0 || (notified && c.inserts.length === 0 && c.updates.length === 0);
}

/**
 * Splits a world still kept as one document into rows (review of PR #88), once, under its row's lock: a before-upgrade snapshot of
 * the whole document first, then every record as its own row in the document's order, then the meta in place of the document. The
 * version stays: it's the same market. A document in a format this code doesn't read is left as it is (the port's run refuses it,
 * and the write fails as an internal error, as before the rows).
 */
async function ensureSplit(sql: Sql, worldId: WorldId, port: EnginePort, lockTimeoutMs: number, at?: number): Promise<void> {
  await sql.begin(async (raw) => {
    const tx = asSql(raw);
    await tx.unsafe(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'; SET LOCAL statement_timeout = '60s'`);
    const [row] = await tx<{ version: number; doc: WorldDoc; split: boolean; ms: number; due: number | null }[]>`
      SELECT version, doc, split_at IS NOT NULL AS split, floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms,
             floor(extract(epoch FROM next_due) * 1000)::float8 AS due
      FROM worlds WHERE id = ${worldId} FOR NO KEY UPDATE`;
    if (!row || row.split) return;
    const doc = row.doc;
    const now = at ?? row.ms;
    engine(() => port.run({ doc, people: [], now }, () => null)); // the port refuses a format it doesn't read
    // The rows count as stored just before the document's next deadline (next_due), so the first read after it still sweeps it.
    const stored = new Date(row.due !== null ? Math.min(row.due - 1, now) : now);
    const { meta, records } = port.split(doc);
    await tx`
      INSERT INTO world_snapshots (world_id, version, reason, doc) VALUES (${worldId}, ${row.version}, 'before-upgrade', ${JSON.stringify(doc)}::text::jsonb)
      ON CONFLICT (world_id, version, reason) DO NOTHING`;
    if (records.length > 0) {
      // Each list's order as ords: ascending along an oldest-first list, descending along a newest-first one.
      const ords = (await tx<{ v: number }[]>`SELECT nextval('record_ord')::float8 AS v FROM generate_series(1, ${records.length})`).map((r) => r.v).sort((a, b) => a - b);
      const orders = port.orders();
      const byKind = new Map<string, MarketRecord[]>();
      for (const r of records) {
        let list = byKind.get(r.kind);
        if (!list) byKind.set(r.kind, (list = []));
        list.push(r);
      }
      const rows: string[] = [];
      let next = 0;
      for (const [kind, list] of byKind) {
        if (!orders[kind]) throw new Error(`Handoff: "${kind}" isn't a kind of record this port keeps.`);
        const take = ords.slice(next, next + list.length);
        next += list.length;
        list.forEach((r, i) => {
          const ord = orders[kind] === "newestFirst" ? take[list.length - 1 - i]! : take[i]!;
          rows.push(`{"kind":${JSON.stringify(r.kind)},"id":${JSON.stringify(r.id)},"ord":${ord},"owner":${JSON.stringify(r.owner)},"open":${r.open},"parent":${JSON.stringify(r.parent)},"data":${JSON.stringify(r.data)}}`);
        });
      }
      const inserted = await tx`
        INSERT INTO records (world_id, kind, id, ord, rev, owner_id, open, parent_id, data, updated_at)
        SELECT ${worldId}, x.kind, x.id, x.ord, 1, x.owner, x.open, x.parent, x.data, ${stored}
        FROM jsonb_to_recordset(${`[${rows.join(",")}]`}::text::jsonb)
          AS x(kind text, id text, ord bigint, owner text, open boolean, parent text, data jsonb)`;
      if (inserted.count !== records.length) throw new Error("Handoff: not every record was split into its row.");
    }
    // The same market at the same version (every row's tally starts at 0): a tab showing it is still up to date.
    await tx`UPDATE worlds SET doc = ${storedMetaJson(meta)}::text::jsonb, split_at = clock_timestamp(), next_due = NULL WHERE id = ${worldId}`;
    await pruneSnapshots(tx, worldId, "before-upgrade", UPGRADE_SNAPSHOTS_KEPT);
    console.info(`[handoff] world ${worldId}: split ${records.length} record(s) into rows at version ${row.version}.`);
  });
}

/** The system's expiry sweep (no actor, not a client action), through the same write path. */
async function sweepWorld(sql: Sql, worldId: WorldId, now: number | undefined, port: EnginePort): Promise<void> {
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
      limits: { openRecords: null, perMinute: null },
      hooks: undefined,
    },
    port,
  );
  if (w.kind === "applied") logExistingViolations(worldId, w.version, w.existing);
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

/** Locks profile rows, in user id order (every write locks profiles before rows, so two writes can't wait on each other in a circle). */
async function lockPeople(tx: Sql, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx`SELECT user_id FROM people WHERE user_id = ANY(${[...ids].sort()}::text[]) ORDER BY user_id FOR UPDATE`;
}

/** Locks stored rows ("kind:id"), in key order. */
async function lockRecords(tx: Sql, worldId: WorldId, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const sorted = [...keys].sort();
  const kinds = sorted.map((k) => k.slice(0, k.indexOf(":")));
  const ids = sorted.map((k) => k.slice(k.indexOf(":") + 1));
  await tx`
    SELECT r.kind, r.id FROM records r JOIN unnest(${kinds}::text[], ${ids}::text[]) AS k(kind, id) ON r.kind = k.kind AND r.id = k.id
    WHERE r.world_id = ${worldId} ORDER BY r.kind, r.id FOR UPDATE OF r`;
}

/** A Postgres advisory lock key (a signed 64-bit integer, as text) for a name. */
function lockKey(name: string): string {
  return createHash("sha256").update(name, "utf8").digest().readBigInt64BE(0).toString();
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
 * The first write of each New York day keeps a snapshot of the whole document it saved. Returns whether this was that write (its
 * caller then prunes, which also caps the snapshots).
 */
async function maybeSnapshotDaily(tx: Sql, worldId: WorldId, version: number, json: () => string, now: number): Promise<boolean> {
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
    VALUES (${worldId}, ${version}, 'daily', ${json()}::text::jsonb, ${at})
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
  return { actions: actions.count, notifications: notifications.count, snapshots: daily + old + upgrade };
}

// ── The market as read (review of PR #88) ────────────────────────────────────────────────
//
// A world at one version: its meta and its rows. Each pool (one per app instance, as toolSql builds it) keeps the latest it read
// for each world, and reads only what changed since: one query for the version, and, when it moved, one for every row's revision
// and one for the rows whose revision it doesn't have. Every tab the instance serves then shares the same copy, the document joined
// from it, its next deadline and the guest view. Correctness never depends on the cache: the version is read from the database
// every time, and a world's version only ever grows (each committed change raises it by at least one), so one version is one
// market. Cached records are deep-frozen: the engine copies a document before changing it, and anything that tried to write into a
// cached one would throw (engine and store code are strict-mode modules) instead of silently changing what later writes start from.

/** One stored record: its kind and id, its place in its list (ord), its revision, who owns it, whether it's open, the record itself. */
interface RecordRow {
  kind: string;
  id: string;
  ord: number;
  rev: number;
  owner: string | null;
  open: boolean;
  /** Its guards ("kind:id"), as the port's split names them. */
  guards: readonly string[];
  /** Whether it holds something for its owner (the port's split: a reservation, a goods hold). */
  holds: boolean;
  data: Readonly<Record<string, unknown>>;
  /** The record's JSON, as compared with a change's (computed when first needed). */
  json: string | null;
}

/** A world as committed at one version. Its records and meta are deep-frozen; the rest is this pool's, filled in as needed. */
interface WorldState {
  worldId: WorldId;
  version: number;
  /** When the world's row was made (µs): a world deleted and made again is another world. */
  born: string;
  /** The world's row's xmin as read: any write to that row is another copy. */
  xmin: string;
  /** Kept as rows. False only until a world from before the rows is split (ensureSplit, at its first write). */
  split: boolean;
  meta: WorldDoc;
  records: ReadonlyMap<string, RecordRow>;
  /** The latest time a write stored a record: every deadline up to it has been swept (each write sweeps the whole market first). */
  processedAt: number;
  /** A world not yet kept as rows: its stored next_due. */
  storedDue: number | null;
  /** This pool's sweep at this version found nothing to store, at this time. */
  sweptAt: number;
  doc: WorldDoc | null;
  due: { at: number; value: number | null } | null;
  guest: { view: GuestView; builtAt: number } | null;
}

interface Loaded {
  /** The database's clock (ms), read with the version. */
  ms: number;
  state: WorldState | null;
}

/** The record's JSON as stored (and as an unchanged one comes back from the engine). */
function rowJson(row: RecordRow): string {
  if (row.json === null) row.json = JSON.stringify(row.data);
  return row.json;
}

/** Each kind's rows in their list's order: newest first by ord descending, oldest first by ord ascending. */
function byOrder(orders: Readonly<Record<string, string>>): (a: { kind: string; ord: number }, b: { kind: string; ord: number }) => number {
  return (a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : orders[a.kind] === "newestFirst" ? b.ord - a.ord : a.ord - b.ord);
}

/** The whole document, joined from the state's rows once (deep-frozen) and kept with it. */
function docOfState(state: WorldState, port: EnginePort): WorldDoc {
  if (!state.doc) {
    const rows = [...state.records.values()].sort(byOrder(port.orders()));
    state.doc = deepFreeze(port.join(state.meta, rows));
  }
  return state.doc;
}

/** Every record of the state with its owner, openness and guards (a world not yet split has them from its document). */
function recordsOf(state: WorldState, port: EnginePort): ReadonlyMap<string, Pick<RecordRow, "owner" | "open" | "guards">> {
  if (state.split) return state.records;
  return new Map(port.split(docOfState(state, port)).records.map((r) => [`${r.kind}:${r.id}`, r] as const));
}

/**
 * The next deadline the market holds after the time it was last swept to (null: none), as this pool last worked it out for this
 * version. A world not yet kept as rows has it stored (next_due).
 */
function dueOf(state: WorldState, port: EnginePort): number | null {
  if (!state.split) return state.storedDue;
  const at = Math.max(state.processedAt, state.sweptAt);
  if (state.due && state.due.at === at) return state.due.value;
  const doc = docOfState(state, port);
  const value = engine(() => port.run({ doc, people: [], now: at }, () => port.nextDue(doc)));
  const due = value !== null && Number.isFinite(value) ? value : null;
  if (value !== null && due === null) console.warn(`[handoff] world ${state.worldId}: nextDue returned a non-finite time; ignored.`);
  state.due = { at, value: due };
  return due;
}

function isDue(state: WorldState, port: EnginePort, now: number): boolean {
  const due = dueOf(state, port);
  return due !== null && due <= now;
}

/**
 * The world as committed now: this pool's copy when its version is the database's, otherwise read (only the rows that changed, when
 * this pool has an earlier version). `q` runs the queries (a transaction's, for a write); `pool` keys the cache.
 */
async function loadState(q: Sql, pool: Sql, worldId: WorldId, port: EnginePort): Promise<Loaded> {
  const cache = stateCache(pool);
  for (let attempt = 1; ; attempt++) {
    const head = first(
      await q<{ ms: number; meta_version: number | null; born: string | null; xmin: string | null; split: boolean | null; tallies: number | null }[]>`
        SELECT c.ms, w.version AS meta_version, (extract(epoch FROM w.created_at) * 1000000)::bigint::text AS born, w.xmin::text AS xmin,
               w.split_at IS NOT NULL AS split,
               (SELECT coalesce(sum(r.tally), 0) FROM records r WHERE r.world_id = w.id)::float8 AS tallies
        FROM (SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms) AS c
        LEFT JOIN worlds w ON w.id = ${worldId}`,
    );
    if (head.meta_version === null || head.born === null) return { ms: head.ms, state: null };
    const version = head.meta_version + (head.tallies ?? 0);
    const hit = cache.worlds.get(worldId);
    // The world's row's xmin too: any write to that row (the meta, or a manual fix to it) is another copy, whatever the version says.
    if (hit && hit.version === version && hit.born === head.born && hit.xmin === head.xmin && hit.split === head.split) {
      cache.hits += 1;
      touch(cache, worldId, hit);
      return { ms: head.ms, state: hit };
    }
    cache.misses += 1;
    const base = hit && hit.born === head.born && hit.split && head.split ? hit : null;
    const counted = (n: number): void => {
      cache.rowsRead += n;
    };
    const state = base ? await readChanged(q, worldId, port, base, counted) : await readFull(q, worldId, port, counted);
    if (state === "moved") {
      if (attempt < 3) continue;
      const full = await readFull(q, worldId, port, counted);
      if (full) remember(pool, full);
      return { ms: head.ms, state: full ?? null };
    }
    if (state) remember(pool, state);
    return { ms: head.ms, state: state ?? null };
  }
}

type MetaRow = {
  version: number;
  born: string;
  xmin: string;
  split: boolean;
  doc: WorldDoc;
  next_due: Date | null;
  processed: number | null;
  tallies: number;
  stamp: number | null;
};

/** The whole world in one query (one snapshot): its meta, or its document before the split, and every row. */
async function readFull(q: Sql, worldId: WorldId, port: EnginePort, counted?: (rows: number) => void): Promise<WorldState | undefined> {
  const [row] = await q<(MetaRow & { recs: [string, string, number, number, string | null, boolean, Record<string, unknown>][] })[]>`
    SELECT w.version, (extract(epoch FROM w.created_at) * 1000000)::bigint::text AS born, w.xmin::text AS xmin, w.split_at IS NOT NULL AS split,
           w.doc, w.next_due,
           (SELECT floor(extract(epoch FROM max(r.updated_at)) * 1000) FROM records r WHERE r.world_id = w.id)::float8 AS processed,
           (SELECT coalesce(sum(r.tally), 0) FROM records r WHERE r.world_id = w.id)::float8 AS tallies,
           (SELECT max(r.stamp) FROM records r WHERE r.world_id = w.id)::float8 AS stamp,
           (SELECT coalesce(json_agg(json_build_array(r.kind, r.id, r.ord, r.rev, r.owner_id, r.open, r.data)), '[]'::json)
            FROM records r WHERE r.world_id = w.id) AS recs
    FROM worlds w WHERE w.id = ${worldId}`;
  if (!row) return undefined;
  if (!row.split) return unsplitState(worldId, row, port);
  counted?.(row.recs.length);
  const factsOf = factsReader(port);
  const records = new Map<string, RecordRow>();
  for (const [kind, id, ord, rev, owner, open, data] of row.recs) {
    records.set(`${kind}:${id}`, { kind, id, ord, rev, owner, open, ...factsOf(kind, data), data: deepFreeze(data), json: null });
  }
  return splitState(worldId, row, row.version + row.tallies, records);
}

/**
 * The world's rows that changed since `base` (same world, kept as rows): every row's revision in one query, then the rows whose
 * revision `base` doesn't have. "moved" when a write committed between the two (a row came back at another revision): read again.
 */
async function readChanged(
  q: Sql,
  worldId: WorldId,
  port: EnginePort,
  base: WorldState,
  counted?: (rows: number) => void,
): Promise<WorldState | undefined | "moved"> {
  const [row] = await q<(MetaRow & { revs: [string, string, number][] })[]>`
    SELECT w.version, (extract(epoch FROM w.created_at) * 1000000)::bigint::text AS born, w.xmin::text AS xmin, w.split_at IS NOT NULL AS split,
           w.doc, w.next_due,
           (SELECT floor(extract(epoch FROM max(r.updated_at)) * 1000) FROM records r WHERE r.world_id = w.id)::float8 AS processed,
           (SELECT coalesce(sum(r.tally), 0) FROM records r WHERE r.world_id = w.id)::float8 AS tallies,
           (SELECT max(r.stamp) FROM records r WHERE r.world_id = w.id)::float8 AS stamp,
           (SELECT coalesce(json_agg(json_build_array(r.kind, r.id, r.rev)), '[]'::json) FROM records r WHERE r.world_id = w.id) AS revs
    FROM worlds w WHERE w.id = ${worldId}`;
  if (!row) return undefined;
  if (!row.split || row.born !== base.born) return readFull(q, worldId, port, counted);
  const want = new Map<string, number>();
  const records = new Map<string, RecordRow>();
  for (const [kind, id, rev] of row.revs) {
    const key = `${kind}:${id}`;
    const had = base.records.get(key);
    if (had && had.rev === rev) records.set(key, had);
    else want.set(key, rev);
  }
  // Most of the market changed (or this is a small one): one read of everything is cheaper.
  if (want.size > Math.max(50, row.revs.length / 2)) return readFull(q, worldId, port, counted);
  if (want.size > 0) {
    const keys = [...want.keys()];
    const fetched = await q<{ kind: string; id: string; ord: number; rev: number; owner_id: string | null; open: boolean; data: Record<string, unknown> }[]>`
      SELECT r.kind, r.id, r.ord::float8 AS ord, r.rev, r.owner_id, r.open, r.data
      FROM records r JOIN unnest(${keys.map((k) => k.slice(0, k.indexOf(":")))}::text[], ${keys.map((k) => k.slice(k.indexOf(":") + 1))}::text[]) AS k(kind, id)
        ON r.kind = k.kind AND r.id = k.id
      WHERE r.world_id = ${worldId}`;
    counted?.(fetched.length);
    const factsOf = factsReader(port);
    for (const f of fetched) {
      const key = `${f.kind}:${f.id}`;
      if (want.get(key) !== f.rev) return "moved";
      records.set(key, { kind: f.kind, id: f.id, ord: f.ord, rev: f.rev, owner: f.owner_id, open: f.open, ...factsOf(f.kind, f.data), data: deepFreeze(f.data), json: null });
    }
    if (fetched.length !== want.size) return "moved";
  }
  return splitState(worldId, row, row.version + row.tallies, records);
}

/** A record's guards, and whether it holds something for its owner, from its data, as the port's split says. */
function factsReader(port: EnginePort): (kind: string, data: Record<string, unknown>) => { guards: readonly string[]; holds: boolean } {
  return (kind, data) => (port.rowFacts ? port.rowFacts(kind, data) : { guards: [], holds: false });
}

function splitState(worldId: WorldId, row: MetaRow, version: number, records: Map<string, RecordRow>): WorldState {
  return {
    worldId,
    version,
    born: row.born,
    xmin: row.xmin,
    split: true,
    meta: deepFreeze(withStamp(readMeta(row.doc), row.stamp)),
    records,
    processedAt: row.processed ?? 0,
    storedDue: null,
    sweptAt: 0,
    doc: null,
    due: null,
    guest: null,
  };
}

/** A world from before the rows: its document is the market, read whole (it's split at its first write). */
function unsplitState(worldId: WorldId, row: MetaRow, port: EnginePort): WorldState {
  const doc = deepFreeze(row.doc);
  const { meta } = port.split(doc);
  return {
    worldId,
    version: row.version,
    born: row.born,
    xmin: row.xmin,
    split: false,
    meta: deepFreeze(meta),
    records: new Map(),
    processedAt: 0,
    storedDue: row.next_due ? row.next_due.getTime() : null,
    sweptAt: 0,
    doc,
    due: null,
    guest: null,
  };
}

/** worlds.doc for a world kept as rows: its meta, marked (ROWS_FORMAT) so code from before the rows refuses it. */
function storedMetaJson(meta: WorldDoc): string {
  return JSON.stringify({ ...meta, format: ROWS_FORMAT, rowsFormat: meta["format"] ?? null });
}

/** The meta as the engine reads it, from worlds.doc. */
function readMeta(stored: WorldDoc): WorldDoc {
  const { rowsFormat, ...rest } = stored as WorldDoc & { rowsFormat?: unknown };
  return (rest["format"] === ROWS_FORMAT ? { ...rest, format: rowsFormat ?? undefined } : rest) as WorldDoc;
}

/** Worlds cached per pool: "live", plus a few test worlds in development. */
export const DOC_CACHE_WORLDS = 8;

interface StateCache {
  worlds: Map<string, WorldState>;
  hits: number;
  misses: number;
  /** Record rows read (whole or changed): what a miss cost. */
  rowsRead: number;
}

const stateCaches = new WeakMap<Sql, StateCache>();

function stateCache(sql: Sql): StateCache {
  let cache = stateCaches.get(sql);
  if (!cache) {
    cache = { worlds: new Map(), hits: 0, misses: 0, rowsRead: 0 };
    stateCaches.set(sql, cache);
  }
  return cache;
}

/** Keeps the state as this pool's copy of the world, unless the pool already holds a later version of the same world. */
function remember(pool: Sql, state: WorldState): void {
  const cache = stateCache(pool);
  const current = cache.worlds.get(state.worldId);
  if (current && current.born === state.born && current.version > state.version) return;
  touch(cache, state.worldId, state);
}

/** Re-inserted last: the least recently used world is evicted first. */
function touch(cache: StateCache, worldId: string, state: WorldState): void {
  cache.worlds.delete(worldId);
  cache.worlds.set(worldId, state);
  while (cache.worlds.size > DOC_CACHE_WORLDS) {
    const oldest = cache.worlds.keys().next().value;
    if (oldest === undefined) break;
    cache.worlds.delete(oldest);
  }
}

/** How the pool's cache has done: for tests and diagnostics. */
export function documentCacheStats(sql: Sql): { worlds: number; hits: number; misses: number; rowsRead: number } {
  const cache = stateCache(sql);
  return { worlds: cache.worlds.size, hits: cache.hits, misses: cache.misses, rowsRead: cache.rowsRead };
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

/**
 * The viewer's view of the state (or of an empty market). Review of PR #88: only the profiles the view names are read (the port's
 * viewPeople), never every profile; and a viewer who has never changed anything has no profile row, so the view names them as the
 * session does, with no payment methods.
 */
async function buildView(
  sql: Sql,
  port: EnginePort,
  a: { worldId: WorldId; viewer: Actor; state: WorldState | null; now: number },
): Promise<View> {
  const doc = a.state ? docOfState(a.state, port) : port.empty();
  const version = a.state?.version ?? 0;
  const ids = port.run({ doc, people: [], now: a.now }, () => port.viewPeople(doc, a.viewer.id));
  if (!ids.includes(a.viewer.id)) ids.push(a.viewer.id);
  const people = await readProfiles(sql, ids, true);
  const byId = new Map(people.map((p) => [p.userId, p] as const));
  // The viewer's own name and email are the session's (their profile row keeps what it had at their last change); a viewer
  // without a row has no payment methods yet.
  const own = byId.get(a.viewer.id);
  const session = sessionPerson(a.viewer);
  byId.set(a.viewer.id, own ? { ...own, name: session.name, email: session.email } : session);
  const rows = await sql<
    { id: string; user_id: string; text: string; link: NotificationLink | null; at_ms: number; read: boolean; unread: number }[]
  >`
    SELECT id, user_id, text, link, round(extract(epoch FROM at) * 1000)::float8 AS at_ms, read_at IS NOT NULL AS read,
           (SELECT count(*)::int FROM notifications
            WHERE world_id = ${a.worldId} AND user_id = ${a.viewer.id} AND read_at IS NULL) AS unread
    FROM notifications
    WHERE world_id = ${a.worldId} AND user_id = ${a.viewer.id}
    ORDER BY at DESC, id DESC
    LIMIT ${NOTIFICATIONS_IN_VIEW}`;
  const notifications: ViewNotification[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    text: r.text,
    link: r.link,
    at: r.at_ms,
    read: r.read,
  }));
  const unreadCount = rows[0]?.unread ?? 0;
  // The engine runs without anyone's email; only the projection gets them, through its context.
  const enginePeople = [...byId.values()].map((p) => ({ ...p, email: null }));
  return port.run({ doc, people: enginePeople, now: a.now }, () =>
    port.project(doc, a.viewer.id, {
      worldId: a.worldId,
      version,
      now: a.now,
      people: byId,
      notifications,
      unreadCount,
    }),
  );
}

/** The viewer as the session names them (no profile row yet: they haven't changed anything). */
function sessionPerson(actor: Actor): PersonRow {
  return { userId: actor.id, name: cleanName(actor.name), email: cleanEmail(actor.email), payHandle: "", payMethods: [] };
}

/**
 * These profile rows (those that exist). payMethods (follow-on B1) are the saved methods, or a handle saved before B1 as one method
 * of kind "other", word for word (the engine's readPayMethods), or none: never anything taken from the email.
 */
async function readProfiles(q: Sql, ids: readonly string[], withEmail: boolean): Promise<PersonRow[]> {
  if (ids.length === 0) return [];
  type Row = { user_id: string; name: string; email: string | null; pay_handle: string; pay_methods: unknown };
  const list = [...new Set(ids)];
  const rows = withEmail
    ? await q<Row[]>`SELECT user_id, name, email, pay_handle, pay_methods FROM people WHERE user_id = ANY(${list}::text[]) ORDER BY user_id`
    : await q<Row[]>`SELECT user_id, name, NULL::text AS email, pay_handle, pay_methods FROM people WHERE user_id = ANY(${list}::text[]) ORDER BY user_id`;
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    payHandle: r.pay_handle,
    payMethods: readPayMethods(r.pay_methods, r.pay_handle),
  }));
}

/** Reads these profiles (without emails: the engine never sees them, §3.6) into `into`. Someone with no row stays out of it. */
async function readPeopleInto(q: Sql, into: Map<string, PersonRow>, ids: readonly string[]): Promise<void> {
  const want = ids.filter((id) => !into.has(id));
  for (const p of await readProfiles(q, want, false)) into.set(p.userId, p);
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
  if (e instanceof RecordTooLarge) {
    console.warn(`[handoff] world ${w.worldId}: refused "${w.action.type}", which would make a record ${e.bytes} bytes.`);
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

function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Handoff: a query that always returns a row returned none.");
  return row;
}

async function clockMs(q: Sql): Promise<number> {
  return first(await q<{ ms: number }[]>`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::float8 AS ms`).ms;
}
