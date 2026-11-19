// The logic of Handoff's server actions (C-DESIGN §2.4; C-CONTRACT.md §1), kept in the tool package so the tool's tests run it
// against a real database. The page folder's actions.ts ("use server") supplies three things, and each handler asks for them
// only when it needs them, in this order:
//   1. the session's user (getCurrentUser). Nobody signed in: "signed_out", for every call that changes anything and for a page
//      that had an account. The one exception is a refresh from a signed-out visitor's page (viewerId null), which goes on, through
//      the same steps 3 to 6, to the guest view (C-CONTRACT §7): no viewer, no profile row, nothing written.
//   2. The tab's viewerId is compared with that user. A mismatch: "account_changed", and nothing else happens. (A visitor's page,
//      viewerId null, whose visitor has since signed in is a mismatch too: it reloads into their own view.)
//   3. The tab's protocol is compared with HANDOFF_PROTOCOL. A mismatch (a new deploy): "reload".
//   4. The pool (toolSql("handoff")). None, because the server has no DATABASE_URL: "unavailable", reason "no-database".
//   5. The world (resolveWorldId on the handoff-world cookie, honored only in development).
//   6. The store does the work. Anything thrown becomes "unavailable" (setupErrorKind), "busy" (isBusy) or "internal"
//      ("Something went wrong. Nothing was changed."), logged with the call, the action's type and the error's class only.
// Identity comes only from the session: viewerId is compared, never used as the actor. No handler revalidates anything:
// every answer that changes what the page shows carries the fresh view.

import type { Sql } from "postgres";
import { HANDOFF_PROTOCOL } from "../engine/index.js";
import { errorCode, isBusy, setupErrorKind, unavailableMessage } from "./db-errors.js";
import { PHOTO_MAX_BYTES, readPhoto } from "./photo.js";
import type { Photo } from "./photo.js";
import {
  BUSY_ERROR,
  INTERNAL_ERROR,
  applyAction,
  deleteMyData,
  ensurePerson,
  getView,
  markNotificationsRead,
  readItemPhoto,
  refreshGuestView,
  refreshView,
  savePayMethods,
} from "./store.js";
import type { StoredPhoto } from "./store.js";
import type { ActOutcome, Actor, GuestRefreshOutcome, PayMethodInput, RefreshOutcome, SetupErrorKind, WorldId } from "./types.js";

// ── What the page folder supplies ────────────────────────────────────────────────────────

/** The signed-in user, as the platform's getCurrentUser returns it (only these fields are read). */
export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ActionContext {
  /** The session's user, or null when signed out. Asked first. */
  user(): Promise<SessionUser | null>;
  /** The tool's pool, or null when the server has no DATABASE_URL. Asked only once the guards pass. */
  sql(): Sql | null;
  /** The world this request uses. Asked only once the guards pass. */
  worldId(): WorldId;
}

// ── What the page sends and gets back (C-CONTRACT §1, §4) ────────────────────────────────

/** Every call carries the tab's account (to notice a switch, never to act as) and the client's protocol. */
export interface Guard {
  viewerId: string;
  protocol: number;
}
/** `photo` (§9s item 6): an image for "Post item" or setItemPhoto, as base64 (a JPEG or WebP the page made by resizing: photo.ts). */
export type ActInput = Guard & { requestId: string; action: unknown; photo?: string };
/**
 * `version` and `nextRefreshAt` are the ones of the view the tab shows (nextRefreshAt null: nothing in it changes with time).
 * A signed-out visitor's page sends viewerId null and gets the guest view (C-CONTRACT §7); only refresh accepts null.
 */
export type RefreshInput = Omit<Guard, "viewerId"> & { viewerId: string | null; version: number; nextRefreshAt: number | null };
export type MarkReadInput = Guard & { ids: string[] | "all" };
/**
 * saveMyProfile (C-CONTRACT §1): `payMethods`, 0 to 2 methods, the first preferred (follow-on B1). Since protocol 2 it's the only input:
 * the page before B1's one `payHandle` is gone with that page.
 */
export type SaveProfileInput = Guard & { payMethods: PayMethodInput[] };

export type StaleCode = "signed_out" | "account_changed" | "reload";
/** The tab no longer matches the session or the server: the page shows a neutral "Reloading…" and reloads. */
export type Stale = { ok: false; code: StaleCode; error: string };
/** The call couldn't be done; nothing was changed. */
export type Failure =
  | { ok: false; code: "unavailable"; reason: SetupErrorKind; error: string }
  | { ok: false; code: "busy" | "internal"; error: string };

export type ActAnswer = ActOutcome | Stale;
/** A signed-in page gets a RefreshOutcome; a signed-out visitor's page (viewerId null, no session) a GuestRefreshOutcome. */
export type RefreshAnswer = RefreshOutcome | GuestRefreshOutcome | Stale | Failure;
export type MarkReadAnswer = { ok: true } | { ok: false; code: StaleCode | Failure["code"] | "invalid" };

/** Neutral words for the stale answers: no names, no account details. */
export const STALE_ERRORS: Readonly<Record<StaleCode, string>> = Object.freeze({
  signed_out: "You're signed out. Reload the page to sign in again.",
  account_changed: "This browser is signed in to a different account now. Reload the page.",
  reload: "Handoff was updated. Reload the page.",
});
/** payMethods missing or not a list (a page before protocol 2 sent a payHandle instead): the page and the contract disagree. */
export const PAY_METHODS_INVALID = "Choose Venmo, Zelle or PayPal.";
/** More ids than any bell sends at once; the store marks at most 200 per call. */
const MAX_READ_IDS = 500;

// ── The handlers ─────────────────────────────────────────────────────────────────────────

/**
 * The most the act route (the page folder's act/route.ts, which takes the changes that carry a photo) reads of a request's body:
 * one photo at its largest as base64 (PHOTO_MAX_BYTES, a third larger), and the action and guard beside it. Review of PR #88: a
 * photo never goes through a server action, and the route refuses a larger body before holding it all (readBodyText).
 */
export const ACT_BODY_MAX_BYTES = Math.ceil(PHOTO_MAX_BYTES / 3) * 4 + 32 * 1024;
/** A photo sent to the server action instead of the act route (a page from before the route). */
export const PHOTO_ROUTE_ERROR = "Handoff was updated, and photos are sent another way now. Reload the page and try again.";

/**
 * Runs one client action for the session's user (applyAction). `photo: false` (the server action) refuses a change that carries a
 * photo: those go to the act route, which caps its body (ACT_BODY_MAX_BYTES).
 */
export async function handleAct(ctx: ActionContext, input: unknown, opts: { photo?: boolean } = {}): Promise<ActAnswer> {
  const g = await gate(ctx, input, "act");
  if (!g.ok) return g.answer;
  const i = fields(input);
  // §9s item 6: an image sent beside the action (base64) is checked by its bytes before anything is written; a file that isn't a
  // JPEG or WebP, or is too large, is refused in words (photo.ts), and nothing of the action is applied.
  let photo: Photo | undefined;
  if (i["photo"] !== undefined && i["photo"] !== null) {
    if (opts.photo === false) return { ok: false, code: "invalid", error: PHOTO_ROUTE_ERROR };
    const read = readPhoto(i["photo"]);
    if (!read.ok) return { ok: false, code: "invalid", error: read.error };
    photo = read.photo;
  }
  try {
    return await applyAction(g.sql, {
      worldId: g.worldId,
      actor: g.actor,
      requestId: typeof i["requestId"] === "string" ? i["requestId"] : "", // anything else is answered "invalid"
      action: i["action"],
      ...(photo ? { photo } : {}),
    });
  } catch (e) {
    return failure(e, "act", actionType(i["action"]));
  }
}

/**
 * What the photo route answers with: the image; or that the version the browser holds (its ETag) is still the one to show, without
 * reading the bytes again; or the status to send instead (404: nothing this viewer may see; 503: no database).
 */
export type PhotoAnswer =
  | { ok: true; photo: StoredPhoto }
  | { ok: true; notModified: true; version: string }
  | { ok: false; status: 404 | 500 | 503 };

/**
 * An item's photo for whoever asks (§9s item 6; the page folder's photo/[item]/route.ts). The viewer is the session's user, or nobody:
 * a signed-out visitor gets the photo of an item that is available now, an account that of any item that hasn't ended, as their
 * views show it (the store's readItemPhoto). Everything else is 404, whatever the reason: no such item, no photo, an item that is
 * on hold, paused, sold, closed or expired for this viewer, another photo's version, an id that isn't one. A plain GET: no tab, so no
 * viewerId or protocol to compare; it writes nothing.
 */
export async function handleGetPhoto(ctx: ActionContext, input: { itemId: unknown; version?: unknown; etag?: unknown }): Promise<PhotoAnswer> {
  try {
    if (typeof input.itemId !== "string" || (input.version !== undefined && input.version !== null && typeof input.version !== "string")) return { ok: false, status: 404 };
    const user = await ctx.user();
    const sql = ctx.sql();
    if (!sql) return { ok: false, status: 503 };
    const photo = await readItemPhoto(sql, {
      worldId: ctx.worldId(),
      itemId: input.itemId,
      viewerId: user ? user.id : null,
      ...(typeof input.version === "string" ? { version: input.version } : {}),
      ...(typeof input.etag === "string" ? { etag: input.etag } : {}),
    });
    if (!photo) return { ok: false, status: 404 };
    return "notModified" in photo ? { ok: true, notModified: true, version: photo.version } : { ok: true, photo };
  } catch (e) {
    if (setupErrorKind(e)) return { ok: false, status: 503 };
    console.error("[handoff] photo failed", { error: e instanceof Error ? e.name || "Error" : typeof e });
    return { ok: false, status: 500 };
  }
}

/**
 * "Unchanged" when the world is still at the tab's version, nothing is due, and the tab's view hasn't reached its own
 * nextRefreshAt; otherwise the viewer's whole view. A signed-out visitor's page (viewerId null, and no session) gets the same
 * answers about the guest view instead (C-CONTRACT §7): built with no viewer, writing nothing.
 */
export async function handleRefresh(ctx: ActionContext, input: unknown): Promise<RefreshAnswer> {
  const g = await gate(ctx, input, "refresh", true);
  if (!g.ok) return g.answer;
  const i = fields(input);
  const v = i["version"];
  const at = i["nextRefreshAt"];
  const version = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const nextRefreshAt = at === null || (typeof at === "number" && Number.isFinite(at)) ? at : undefined;
  // A version the tab can't have had (missing, negative, fractional), or a nextRefreshAt that is neither null nor a time
  // (missing too), just gets the whole view.
  const tab = version !== null && nextRefreshAt !== undefined ? { version, nextRefreshAt } : { version: -1, nextRefreshAt: null };
  try {
    if (g.actor === null) return await refreshGuestView(g.sql, { worldId: g.worldId, ...tab });
    return await refreshView(g.sql, { worldId: g.worldId, viewer: g.actor, ...tab });
  } catch (e) {
    return failure(e, "refresh");
  }
}

/** Marks the user's own notifications read (some by id, or "all"); no world lock and no new version. */
export async function handleMarkRead(ctx: ActionContext, input: unknown): Promise<MarkReadAnswer> {
  const g = await gate(ctx, input, "markRead");
  if (!g.ok) return { ok: false, code: g.answer.code };
  const raw = fields(input)["ids"];
  const ids = raw === "all" ? "all" : isIdList(raw) ? raw : null;
  if (ids === null) return { ok: false, code: "invalid" };
  try {
    await markNotificationsRead(g.sql, { worldId: g.worldId, userId: g.actor.id, ids });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: failure(e, "markRead").code };
  }
}

/**
 * Saves how the user is paid and answers with the fresh view (C-CONTRACT §1). `payMethods` (follow-on B1): 0 to 2 methods, checked by
 * the engine's checkPayMethods, replacing a handle saved before B1; removing the last one is refused while an open listing of theirs in
 * this world needs it. What the store refuses is "refused", in its words; a payload without a list of methods is "invalid" (since
 * protocol 2, a `payHandle` alone is too).
 */
export async function handleSaveMyProfile(ctx: ActionContext, input: unknown): Promise<ActAnswer> {
  const g = await gate(ctx, input, "saveMyProfile");
  if (!g.ok) return g.answer;
  const methods = fields(input)["payMethods"];
  if (!Array.isArray(methods)) return { ok: false, code: "invalid", error: PAY_METHODS_INVALID };
  try {
    await ensurePerson(g.sql, g.actor); // the profile row exists even if this is the first thing the user does
    const saved = await savePayMethods(g.sql, { userId: g.actor.id, payMethods: methods, worldId: g.worldId });
    const view = await getView(g.sql, { worldId: g.worldId, viewer: g.actor });
    if (!saved.ok) return { ok: false, code: "refused", error: saved.error, replay: false, view };
    const toast = methods.length > 0 ? "Payment methods saved." : "Payment methods removed.";
    return { ok: true, replay: false, toast, resultId: null, view };
  } catch (e) {
    return failure(e, "saveMyProfile");
  }
}

/**
 * Review of PR #88: deletes the user's Handoff data (deleteMyData: their profile, notifications and actions log entries), unless
 * something of theirs is still open, which is refused in words. Answers with the fresh view: a viewer with no profile row, as on a
 * first visit.
 */
export async function handleDeleteMyData(ctx: ActionContext, input: unknown): Promise<ActAnswer> {
  const g = await gate(ctx, input, "deleteMyData");
  if (!g.ok) return g.answer;
  try {
    const done = await deleteMyData(g.sql, { worldId: g.worldId, userId: g.actor.id });
    const view = await getView(g.sql, { worldId: g.worldId, viewer: g.actor });
    if (!done.ok) return { ok: false, code: "refused", error: done.error, replay: false, view };
    return { ok: true, replay: false, toast: DATA_DELETED, resultId: null, view };
  } catch (e) {
    return failure(e, "deleteMyData");
  }
}

/** What deleting one's data says when it's done. */
export const DATA_DELETED =
  "Your Handoff profile, notifications and activity log were deleted. Your past trades stay with the classmates you traded with, as they were recorded.";

// ── The guards (§2.4 steps 1 to 5) ───────────────────────────────────────────────────────

/** The guards passed: the session's user (null only for a signed-out visitor's refresh), the pool and the world. */
type Gate<A extends Actor | null> = { ok: true; actor: A; sql: Sql; worldId: WorldId } | { ok: false; answer: Stale | Failure };

/** Every call that needs a signed-in user: no session is "signed_out", whatever the page sends. */
function gate(ctx: ActionContext, input: unknown, call: string): Promise<Gate<Actor>>;
/** refresh only: a signed-out visitor's page (viewerId null, no session) passes with actor null, for the guest view. */
function gate(ctx: ActionContext, input: unknown, call: string, guests: true): Promise<Gate<Actor | null>>;
async function gate(ctx: ActionContext, input: unknown, call: string, guests = false): Promise<Gate<Actor | null>> {
  let user: SessionUser | null;
  try {
    user = await ctx.user();
  } catch (e) {
    return { ok: false, answer: failure(e, call) };
  }
  const i = fields(input);
  if (!user) {
    // No session. A page that had an account (any viewerId but null), and every call that changes anything, is signed out:
    // nothing else is asked for. Only a signed-out visitor's refresh goes on, to the guest view.
    if (!guests || i["viewerId"] !== null) return { ok: false, answer: stale("signed_out") };
  } else if (typeof i["viewerId"] !== "string" || i["viewerId"] !== user.id) {
    return { ok: false, answer: stale("account_changed") };
  }
  if (i["protocol"] !== HANDOFF_PROTOCOL) return { ok: false, answer: stale("reload") };
  let sql: Sql | null;
  let worldId: WorldId;
  try {
    sql = ctx.sql();
    if (!sql) return { ok: false, answer: unavailable("no-database") };
    worldId = ctx.worldId();
  } catch (e) {
    return { ok: false, answer: failure(e, call) };
  }
  return { ok: true, actor: user ? { id: user.id, name: user.name, email: user.email } : null, sql, worldId };
}

function stale(code: StaleCode): Stale {
  return { ok: false, code, error: STALE_ERRORS[code] };
}

function unavailable(reason: SetupErrorKind): Failure {
  return { ok: false, code: "unavailable", reason, error: unavailableMessage(reason) };
}

/** A thrown error as an answer. Only the call, the action's type, the error's class and its code are logged. */
function failure(e: unknown, call: string, type?: string): Failure {
  const kind = setupErrorKind(e);
  if (kind) return unavailable(kind);
  if (isBusy(e)) return { ok: false, code: "busy", error: BUSY_ERROR };
  const facts: Record<string, unknown> = { error: e instanceof Error ? e.name || "Error" : typeof e };
  if (type) facts["type"] = type;
  const code = errorCode(e);
  if (code) facts["code"] = code;
  console.error(`[handoff] ${call} failed`, facts);
  return { ok: false, code: "internal", error: INTERNAL_ERROR };
}

// ── Reading what a client sent ───────────────────────────────────────────────────────────

/** The input's own fields, or none when it isn't a plain object. */
function fields(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const proto: unknown = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null ? (input as Record<string, unknown>) : {};
}

function isIdList(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= MAX_READ_IDS && v.every((x) => typeof x === "string");
}

/** An action's type for a log line, only when it looks like one (never free text). */
function actionType(action: unknown): string | undefined {
  const t = fields(action)["type"];
  return typeof t === "string" && /^[A-Za-z]{1,40}$/.test(t) ? t : undefined;
}
