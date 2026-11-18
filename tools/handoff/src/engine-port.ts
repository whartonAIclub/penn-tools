// The seam between the store and the engine. store.ts reaches the marketplace rules only through
// an EnginePort, so its SQL, locking, retry and expiry logic can also be tested with a small stand-in
// (src/__tests__/helpers/toy-port.ts).
//
// `enginePort` (below) is the real port, and the store's default: withEngine, reduce, invariantViolations
// and nextDue from engine/index.js, parseAction and actionIds from live.ts, and project from project.ts.
//
// Every engine call is synchronous and runs inside `run`, because the engine keeps the clock,
// the people and the catalog in module state (C-DESIGN §1.1). Never await inside `run`.

import {
  emptyWorld,
  invariantViolations,
  nextDue as engineNextDue,
  payNeededBy,
  payNeededRule,
  photoRefs,
  reduce as engineReduce,
  withEngine,
} from "../engine/index.js";
import type { Action, EngineNotification, LiveWorld } from "../engine/index.js";
import { actionIds as liveActionIds, parseAction } from "./live.js";
import type { LiveAction as ParsedAction } from "./live.js";
import type { PhotoRef } from "./photo.js";
import { itemPhotoFor, project, projectGuest } from "./project.js";
import type { GuestView, NotificationLink, PersonRow, SeqStep, View, ViewNotification, WorldId } from "./types.js";

/** The world document as stored in worlds.doc (format 1, C-DESIGN §2.6). Engine-owned: the store reads only `mode`. */
export interface WorldDoc {
  mode: "live";
  [key: string]: unknown;
}

/** An action that passed `parse`. live.ts (C4) narrows this to the union of live actions. */
export interface LiveAction {
  type: string;
  [field: string]: unknown;
}

export type ParseResult = { ok: true; action: LiveAction } | { ok: false; error: string };

/** What `reduce` returns: the next state, or an error (the refusal shown to the actor) with the state unchanged. */
export interface ReduceResult {
  state: WorldDoc;
  error?: string | undefined;
  toast?: string | undefined;
  result?: { id: string } | undefined;
  steps?: SeqStep[] | undefined;
}

/** A notification the engine wrote into the document. `drain` hands it to the store for the notifications table. */
export interface EngineNote {
  id: string;
  userId: string;
  text: string;
  link?: NotificationLink | null | undefined;
  /** The engine's stamp (ms since the epoch). */
  at: number;
  /**
   * Follow-on B4: the note's email tag (the engine's noteTo meta), on a note that may also go by email: its kind, such as
   * "offer.received" (NOTE_KIND), and `ref`, the id of the record it's about (NOTE_REF). Both or neither. The store makes an email job
   * from it only after email/kinds.ts emailJobRows checks it again; the notifications table and every view leave it out.
   */
  kind?: string | undefined;
  ref?: string | undefined;
}

/** email_jobs' CHECK on a job's kind (schema.sql, follow-on B4): two or three lowercase words joined by dots, at most NOTE_KIND_MAX long. */
export const NOTE_KIND = /^[a-z]+(\.[a-z]+){1,2}$/;
export const NOTE_KIND_MAX = 40;
/** email_jobs' CHECK on a job's ref: a record id of lowercase letters, digits and hyphens, 1 to 48 characters. */
export const NOTE_REF = /^[0-9a-z-]{1,48}$/;

/** What the engine runs with: the document, every person's profile row and the time (ms). */
export interface EngineContext {
  doc: WorldDoc;
  /** Every profile row, with `email` always null: the engine never sees emails (C-DESIGN §3.6). */
  people: PersonRow[];
  now: number;
}

/** What the store knows when it asks for a view. */
export interface ProjectContext {
  worldId: WorldId;
  version: number;
  now: number;
  /**
   * Every profile row, with emails. Only the projection receives emails; it decides which ids, and which of
   * their fields, a view may carry (C-CONTRACT §2).
   */
  people: Map<string, PersonRow>;
  /** The viewer's newest notifications, newest first. */
  notifications: ViewNotification[];
  /** Every unread notification the viewer has in this world, for the view's unreadCount. */
  unreadCount: number;
}

/** What the store knows when it asks for a guest view: the world and the time. No viewer and no people (C-CONTRACT §7). */
export interface GuestContext {
  worldId: WorldId;
  version: number;
  now: number;
}

export interface EnginePort {
  /** The document a new world starts with (version 0). */
  empty(): WorldDoc;
  /**
   * Checks a client's action before any lock: the allowlist of types, shapes, ids and sizes. It's part of the port
   * so the store has no action vocabulary of its own (the real port uses live.ts's parseAction; the tests' stand-in
   * has its own actions).
   */
  parse(raw: unknown): ParseResult;
  /** The action's record ids only, for the actions log: never free text, amounts or contact details. */
  actionIds(action: LiveAction): Record<string, string>;
  /** Runs fn with the engine set up for ctx. Synchronous only: it throws if fn returns a Promise. */
  run<T>(ctx: EngineContext, fn: () => T): T;
  /** The rules: the next state for this actor's action, or a refusal. A null actor is the system's expiry sweep. */
  reduce(doc: WorldDoc, actorId: string | null, action: LiveAction): ReduceResult;
  /**
   * Every invariant the document breaks, as stable keys such as "oversold:l…" (C-DESIGN §4.6). The store compares
   * the document before and after an action: it refuses only violations the action introduced, and logs the ones
   * that were already there.
   */
  violations(doc: WorldDoc): string[];
  /** The earliest future deadline in the document (ms), or null. The first read after it sweeps. */
  nextDue(doc: WorldDoc): number | null;
  /** Empties the document's notifications and returns them. */
  drain(doc: WorldDoc): EngineNote[];
  /**
   * Follow-on B1: how many of the seller's listings could still take a new buyer and would be paid through the seller's saved methods
   * (no handle of their own). The store keeps the seller's last method while any does.
   */
  payNeeded(doc: WorldDoc, sellerId: string): number;
  /**
   * Follow-on B5: what payNeeded counts, for the store's words. "listing": the seller's open listings (until invite to pay is switched
   * on). "exchange": open invitations, older open offers and held replies, and reservations without their own copy of the methods.
   * A port without it counts listings.
   */
  payNeededRule?(): "listing" | "exchange";
  /** The viewer's view, built from allowlists. */
  project(doc: WorldDoc, viewerId: string, ctx: ProjectContext): View;
  /**
   * What a signed-out visitor sees (C-CONTRACT §7), built from its own allowlists: no viewer, no people. The store runs it with
   * no one's profile row, so no name or payment handle is even at hand.
   */
  guest(doc: WorldDoc, ctx: GuestContext): GuestView;
  /**
   * §9s item 6 (a Goods item's one photo). The three below go together; a port without them takes no photos.
   * attachPhoto: the action with the server's reference to the accepted image put where the engine reads it, or null when this
   * action takes no photo. Only the store calls it, after `parse`, so a reference never comes from a client.
   */
  attachPhoto?(action: LiveAction, ref: PhotoRef): LiveAction | null;
  /** Every item in the document that has a photo: its id and the photo's version. The store keeps item_photos in step with it. */
  photoRefs?(doc: WorldDoc): { id: string; v: string }[];
  /** The photo's reference when this viewer's view shows the item with it (viewerId null: a signed-out visitor), else null. Inside `run`. */
  photoFor?(doc: WorldDoc, itemId: string, viewerId: string | null): PhotoRef | null;
}

// ── The real port ────────────────────────────────────────────────────────────────────────

/**
 * The world document format this code reads and writes (C-DESIGN §2.6). A document in any other format is refused before the
 * engine sees it: during a deploy an older app instance must never rewrite a document a newer one has upgraded, and a newer
 * one upgrades (after a before-upgrade snapshot) rather than guessing.
 */
export const WORLD_FORMAT = 1;

/** The engine's own type for the documents the store keeps opaque (WorldDoc); both describe the same JSON. */
const asLive = (doc: WorldDoc): LiveWorld => doc as unknown as LiveWorld;
const asDoc = (doc: LiveWorld): WorldDoc => doc as unknown as WorldDoc;

/**
 * The marketplace rules behind the store (C-DESIGN §2.3), and the store's default port. Every method except empty, parse and
 * actionIds runs inside `run`, as store.ts calls them.
 */
export const enginePort: EnginePort = Object.freeze({
  empty: (): WorldDoc => asDoc(emptyWorld()),

  parse: (raw: unknown): ParseResult => parseAction(raw),

  // Only called on actions that parse returned, which are live.ts's.
  actionIds: (action: LiveAction): Record<string, string> => liveActionIds(action as ParsedAction),

  run<T>(ctx: EngineContext, fn: () => T): T {
    const format = (ctx.doc as { format?: unknown }).format;
    if (format !== WORLD_FORMAT) {
      throw new Error(`Handoff: this code reads world format ${WORLD_FORMAT}, not ${typeof format === "number" ? format : "a document without one"}.`);
    }
    // The engine gets names and how people are paid only (a legacy handle, and the payment methods listings use and reservations copy:
    // follow-on B1). It never reads emails, and this way it never receives them (§3.6).
    const people = ctx.people.map((p) => ({ userId: p.userId, name: p.name, payHandle: p.payHandle, payMethods: p.payMethods }));
    return withEngine({ doc: asLive(ctx.doc), people, now: ctx.now }, fn);
  },

  reduce(doc: WorldDoc, actorId: string | null, action: LiveAction): ReduceResult {
    const res = engineReduce(asLive(doc), actorId, action as Action);
    // A refusal returns the state it was given, unchanged (the engine's fail re-applies it).
    return {
      state: asDoc(res.state),
      ...(typeof res.error === "string" ? { error: res.error } : {}),
      ...(typeof res.toast === "string" ? { toast: res.toast } : {}),
      ...(res.result ? { result: { id: res.result.id } } : {}),
      ...(res.steps ? { steps: res.steps } : {}),
    };
  },

  violations: (doc: WorldDoc): string[] => invariantViolations(asLive(doc)),

  nextDue: (doc: WorldDoc): number | null => engineNextDue(asLive(doc)),

  drain(doc: WorldDoc): EngineNote[] {
    const live = asLive(doc);
    const notes: readonly EngineNotification[] = Array.isArray(live.notifications) ? live.notifications : [];
    live.notifications = [];
    // Only the fields the notifications table keeps: never `read` or `via` (alert preferences don't exist in live). An email tag
    // (follow-on B4) goes with them only as a pair in email_jobs' patterns, so a job can't trip that table's CHECKs and roll back the
    // action; a malformed tag is dropped and its note stays in the app.
    return notes.map((n) => {
      const tag = noteTag(n);
      return { id: n.id, userId: n.userId, text: n.text, link: noteLink(n.link), at: n.at, ...(tag ? { kind: tag.kind, ref: tag.ref } : {}) };
    });
  },

  payNeeded: (doc: WorldDoc, sellerId: string): number => payNeededBy(asLive(doc), sellerId),

  payNeededRule: (): "listing" | "exchange" => payNeededRule(),

  project: (doc: WorldDoc, viewerId: string, ctx: ProjectContext): View => project(doc, viewerId, ctx),

  guest: (doc: WorldDoc, ctx: GuestContext): GuestView => projectGuest(doc, ctx),

  // A photo goes with "Post item" (alone, or as the first step of the seq that also shares it with a request) and with setItemPhoto.
  // The reference sits beside the action's own fields (`pic`), where the engine's postItem and setItemPhoto read it.
  attachPhoto(action: LiveAction, ref: PhotoRef): LiveAction | null {
    const pic = { v: ref.v, w: ref.w, h: ref.h };
    if (action.type === "postItem" || action.type === "setItemPhoto") return { ...action, pic };
    const steps = action["steps"];
    if (action.type !== "seq" || !Array.isArray(steps)) return null;
    const first = steps[0] as { action?: LiveAction } | undefined;
    if (!first || !first.action || first.action.type !== "postItem") return null;
    return { ...action, steps: [{ ...first, action: { ...first.action, pic } }, ...steps.slice(1)] };
  },

  photoRefs: (doc: WorldDoc): { id: string; v: string }[] => photoRefs(asLive(doc)),

  photoFor: (doc: WorldDoc, itemId: string, viewerId: string | null): PhotoRef | null => itemPhotoFor(doc, itemId, viewerId),
});

/** A note's email tag (follow-on B4), checked field by field: both kind and ref as strings in email_jobs' patterns, or null. */
function noteTag(n: { kind?: unknown; ref?: unknown }): { kind: string; ref: string } | null {
  const { kind, ref } = n;
  if (typeof kind !== "string" || typeof ref !== "string") return null;
  if (kind.length > NOTE_KIND_MAX || !NOTE_KIND.test(kind) || !NOTE_REF.test(ref)) return null;
  return { kind, ref };
}

/** A notification's link, field by field (the projection allowlists it again for the view). */
function noteLink(link: unknown): NotificationLink | null {
  if (typeof link !== "object" || link === null || Array.isArray(link)) return null;
  const l = link as Record<string, unknown>;
  if (typeof l["name"] !== "string") return null;
  return {
    name: l["name"],
    ...(typeof l["id"] === "string" ? { id: l["id"] } : {}),
    ...(typeof l["tab"] === "string" ? { tab: l["tab"] } : {}),
    ...(typeof l["listing"] === "string" ? { listing: l["listing"] } : {}),
  };
}
