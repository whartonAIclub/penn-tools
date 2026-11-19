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
  EV,
  FINAL,
  GFINAL,
  access,
  demandAllowed,
  departed,
  emptyWorld,
  gState,
  invariantViolations,
  isLive,
  itemOf,
  listingNumbers,
  nextDue as engineNextDue,
  payNeededBy,
  payNeededRule,
  photoRefs,
  pickupOver,
  rState,
  reduce as engineReduce,
  withEngine,
} from "../engine/index.js";
import type { Action, EngineNotification, LiveWorld } from "../engine/index.js";
import { actionIds as liveActionIds, parseAction } from "./live.js";
import type { LiveAction as ParsedAction } from "./live.js";
import type { PhotoRef } from "./photo.js";
import { itemPhotoFor, project, projectGuest, viewPersonIds } from "./project.js";
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
}


/** What the engine runs with: the document, every person's profile row and the time (ms). */
export interface EngineContext {
  doc: WorldDoc;
  /** Every profile row, with `email` always null: the engine never sees emails (C-DESIGN §3.6). */
  people: PersonRow[];
  now: number;
}

/**
 * One record of the market as the store keeps it (review of PR #88): every listing, exchange, item, request, event and holding is its
 * own row, so a change writes only the rows it touched and two changes conflict only when they touch the same row or its guard.
 */
export interface MarketRecord {
  /** The record's kind (a short word, such as "listing"), and its id: together its key ("listing:l…"). */
  kind: string;
  id: string;
  /** The record itself, exactly as the engine keeps it. */
  data: Record<string, unknown>;
  /** Whose record it is (its seller, buyer, requester or creator), or null. The per-account limit counts an owner's open records. */
  owner: string | null;
  /**
   * Whether it's open by its own fields alone (not closed, sold or over), whatever the time. The store counts an account's open
   * records with the port's openOf, which also knows the clock and the records around it; this is what it counts for a port without.
   */
  open: boolean;
  /** The record it hangs off, if any (an exchange's listing, a goods request's item): the photo route reads an item with its own. */
  parent: string | null;
  /**
   * The records ("listing:l…") a change to this one depends on, which the store locks with it: an exchange guards its listing, so two
   * buyers reserving the last ticket queue on that listing and the second is decided on the first's result.
   */
  guards: string[];
  /** Records it depends on only when it's new (a new listing on its event, which can't be removed meanwhile). */
  createGuards?: string[];
  /**
   * Names of locks a new record of this kind takes in its world, for rules across records no row stands for: a new event is
   * checked against every other event (two classmates adding the same night at once get one event), so new events take one lock.
   */
  createLocks?: string[];
  /**
   * Whether it holds something for its owner (a reservation, a goods hold): the rules limit what one person holds (one unpaid
   * reservation per event, the per-person caps), so a change that makes a record hold for someone locks that person too.
   */
  holds?: boolean;
}

/** How a kind's records are ordered in the document: newest first (the engine adds to the front) or oldest first (to the end). */
export type RecordOrder = "newestFirst" | "oldestFirst";

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
   * Splits a document into its records and the rest (`meta`: the document with every record list emptied), as the store keeps them
   * (review of PR #88). Records come in the document's own order within each kind. Pure; no engine run needed.
   */
  split(doc: WorldDoc): { meta: WorldDoc; records: MarketRecord[] };
  /** The document again from `meta` and the records, each kind's in the order `orders` names (the store sorts them first). Pure. */
  join(meta: WorldDoc, records: readonly { kind: string; id: string; data: Record<string, unknown> }[]): WorldDoc;
  /** Each kind's order in the document. A kind not listed here isn't a record kind. */
  orders(): Readonly<Record<string, RecordOrder>>;
  /** A stored record's guards and whether it holds something for its owner (as split says), from its kind and data alone. */
  rowFacts?(kind: string, data: Record<string, unknown>): { guards: string[]; holds: boolean };
  /**
   * The user ids a viewer's view may name (its people, and the sellers whose payment kinds it shows): the store reads only these
   * profiles for the view (review of PR #88). Inside `run`.
   */
  viewPeople(doc: WorldDoc, viewerId: string): string[];
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
  /**
   * Review of PR #88: what of one account's is still going on, as the page shows it, at the engine's clock (inside `run`). `own`: their
   * listings that can still sell (the page offers Close listing), their items still up (Close item), their live requests and alerts,
   * their open shares on a live request, and their exchanges and goods requests that aren't over. The per-account limit counts these.
   * `theirs`: classmates' exchanges and goods requests on the account's listings and items that aren't over. Deleting one's data waits
   * for both to be none. A port without it counts the rows' own `open`.
   */
  openOf?(doc: WorldDoc, userId: string): { own: number; theirs: number };
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

  split: (doc: WorldDoc): { meta: WorldDoc; records: MarketRecord[] } => splitLive(doc),

  join: (meta: WorldDoc, records: readonly { kind: string; id: string; data: Record<string, unknown> }[]): WorldDoc => joinLive(meta, records),

  orders: (): Readonly<Record<string, RecordOrder>> => LIVE_ORDERS,

  rowFacts(kind: string, data: Record<string, unknown>): { guards: string[]; holds: boolean } {
    const r = liveRecord(kind, data);
    return { guards: r?.guards ?? [], holds: r?.holds === true };
  },

  viewPeople: (doc: WorldDoc, viewerId: string): string[] => viewPersonIds(doc, viewerId),

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
    // Only the fields the notifications table keeps: never `read` or `via` (alert preferences don't exist in live), and never the
    // engine's kind and ref tags (outbound email was removed from this tool; review of PR #88).
    return notes.map((n) => ({ id: n.id, userId: n.userId, text: n.text, link: noteLink(n.link), at: n.at }));
  },

  payNeeded: (doc: WorldDoc, sellerId: string): number => payNeededBy(asLive(doc), sellerId),

  payNeededRule: (): "listing" | "exchange" => payNeededRule(),

  openOf: (doc: WorldDoc, userId: string): { own: number; theirs: number } => liveOpenOf(asLive(doc), userId),

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


// ── The real document as rows (review of PR #88) ─────────────────────────────────────────

/** The document's record lists: each its own kind of row, in the order the engine keeps it (it adds events and holdings at the end). */
const LIVE_LISTS: readonly (readonly [list: string, kind: string, order: RecordOrder])[] = Object.freeze([
  ["events", "event", "oldestFirst"],
  ["holdings", "holding", "oldestFirst"],
  ["listings", "listing", "newestFirst"],
  ["requests", "request", "newestFirst"],
  ["interests", "interest", "newestFirst"],
  ["responses", "response", "newestFirst"],
  ["goods", "good", "newestFirst"],
  ["goodsReqs", "goodsReq", "newestFirst"],
] as const);
const LIVE_ORDERS: Readonly<Record<string, RecordOrder>> = Object.freeze(Object.fromEntries(LIVE_LISTS.map(([, kind, order]) => [kind, order])));
const LIST_OF_KIND: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(LIVE_LISTS.map(([list, kind]) => [kind, list])));
/** An exchange's or goods request's statuses once it's over (the engine's FINAL and GFINAL). */
const FINAL_STATUSES: ReadonlySet<string> = new Set(["completed", "declined", "cancelled", "released", "expired"]);
/** An exchange's statuses while it holds tickets for its buyer (reserved, through sent: the engine's reserves). */
const HOLDING_STATUSES: ReadonlySet<string> = new Set(["accepted", "paid", "confirmed", "sent"]);

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * The port's openOf, with the engine's own tests for each kind, as the page applies them: a listing is open while the page offers
 * "Close listing" (not closed, its event still taking listings, its train not gone, not every ticket handed off), an item while it
 * offers "Close item" (not sold or closed, its last day not past), a request or alert while it's live and its event still takes
 * them, a share while it's open on a live request, and an exchange or goods request until the engine counts it over (rState and
 * gState, which also end it when its event starts or its hold lapses). A record whose event or item is missing counts as open.
 */
function liveOpenOf(d: LiveWorld, userId: string): { own: number; theirs: number } {
  let own = 0;
  let theirs = 0;
  const listings = new Set<string>();
  const items = new Set<string>();
  const live = new Set<string>();
  for (const l of d.listings ?? []) {
    if (l.sellerId !== userId) continue;
    listings.add(l.id);
    const ev = EV[l.eventId];
    if (!l.withdrawnAt && (!ev || (access(ev).ok && !departed(l) && listingNumbers(d, l).completed < l.listed))) own += 1;
  }
  for (const it of d.goods ?? []) {
    if (it.sellerId !== userId) continue;
    items.add(it.id);
    if (!it.soldAt && !it.withdrawnAt && !pickupOver(it)) own += 1;
  }
  for (const i of d.interests ?? []) {
    const ev = i.eventId ? EV[i.eventId] : undefined;
    if (!isLive(i) || (i.eventId && ev && !demandAllowed(ev))) continue;
    live.add(i.id);
    if (i.userId === userId) own += 1;
  }
  for (const s of d.responses ?? []) if (s.sellerId === userId && s.status === "open" && live.has(s.isoId)) own += 1;
  const over = (finals: readonly string[], st: string): boolean => finals.includes(st);
  for (const r of d.requests ?? []) {
    if (over(FINAL, EV[r.eventId] ? rState(r).st : r.status)) continue;
    if (r.buyerId === userId) own += 1;
    else if (listings.has(r.listingId)) theirs += 1;
  }
  for (const g of d.goodsReqs ?? []) {
    const it = itemOf(d, g);
    if (over(GFINAL, it ? gState(g, it).st : g.status)) continue;
    if (g.buyerId === userId) own += 1;
    else if (items.has(g.itemId)) theirs += 1;
  }
  return { own, theirs };
}

/**
 * One stored record as its row: who owns it, whether it's still open, what it hangs off, and what a change to it depends on (the
 * engine's invariants across records, C-DESIGN §4.6): an exchange on its listing (oversold), a goods request on its item (one hold),
 * a share on the request and listing or item it links, a listing on the holding it's listed from (overlisted), and a new listing,
 * holding or interest on its event (which can't be removed while anything refers to it), and a new event on the others (no twins:
 * createLocks). What depends on one person's records (one unpaid reservation per event, the per-person caps) is covered by the store
 * locking the profile of whoever a change makes hold something (holds) or gives a new record, and of the actor.
 */
function liveRecord(kind: string, r: Record<string, unknown>): MarketRecord | null {
  const id = str(r["id"]);
  if (!id) return null;
  const done = (s: unknown): boolean => typeof s === "string" && FINAL_STATUSES.has(s);
  const onEvent = (): string[] => {
    const ev = str(r["eventId"]);
    return ev ? [`event:${ev}`] : [];
  };
  switch (kind) {
    case "event":
      // A new event is checked against the others (no twin of one already there), so new events go one at a time.
      return { kind, id, data: r, owner: str(r["createdBy"]) ?? str(r["addedBy"]), open: false, parent: null, guards: [], createLocks: ["new-event"] };
    case "holding":
      return { kind, id, data: r, owner: str(r["userId"]), open: false, parent: str(r["eventId"]), guards: [], createGuards: onEvent() };
    case "listing": {
      const holding = str(r["holdingId"]), reply = str(r["isoReplyFor"]);
      return {
        kind, id, data: r, owner: str(r["sellerId"]), open: r["withdrawnAt"] == null, parent: str(r["eventId"]),
        guards: holding ? [`holding:${holding}`] : [],
        createGuards: [...onEvent(), ...(reply ? [`interest:${reply}`] : [])],
      };
    }
    case "request": {
      // An exchange guards its listing: every reservation, invitation and step on a listing is checked against the others on it.
      const listing = str(r["listingId"]);
      return {
        kind, id, data: r, owner: str(r["buyerId"]), open: !done(r["status"]), parent: listing, guards: listing ? [`listing:${listing}`] : [],
        holds: typeof r["status"] === "string" && HOLDING_STATUSES.has(r["status"]),
      };
    }
    case "interest":
      return { kind, id, data: r, owner: str(r["userId"]), open: r["status"] === "open", parent: str(r["eventId"]), guards: [], createGuards: onEvent() };
    case "response": {
      const iso = str(r["isoId"]), listing = str(r["listingId"]), item = str(r["itemId"]);
      const guards = [iso ? `interest:${iso}` : null, listing ? `listing:${listing}` : null, item ? `good:${item}` : null].filter((g): g is string => g !== null);
      return { kind, id, data: r, owner: str(r["sellerId"]), open: r["status"] === "open", parent: iso, guards };
    }
    case "good":
      return { kind, id, data: r, owner: str(r["sellerId"]), open: r["soldAt"] == null && r["withdrawnAt"] == null, parent: null, guards: [] };
    case "goodsReq": {
      // A goods request guards its item, as an exchange guards its listing: one buyer's hold at a time.
      const item = str(r["itemId"]);
      return { kind, id, data: r, owner: str(r["buyerId"]), open: !done(r["status"]), parent: item, guards: item ? [`good:${item}`] : [], holds: r["status"] === "accepted" };
    }
    default:
      return null;
  }
}

function splitLive(doc: WorldDoc): { meta: WorldDoc; records: MarketRecord[] } {
  const meta: Record<string, unknown> = { ...doc };
  const records: MarketRecord[] = [];
  for (const [list, kind] of LIVE_LISTS) {
    const items = doc[list];
    meta[list] = [];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error(`Handoff: a ${kind} in the document isn't a record.`);
      const rec = liveRecord(kind, item as Record<string, unknown>);
      if (!rec) throw new Error(`Handoff: a ${kind} in the document has no id.`);
      records.push(rec);
    }
  }
  return { meta: meta as WorldDoc, records };
}

function joinLive(meta: WorldDoc, records: readonly { kind: string; id: string; data: Record<string, unknown> }[]): WorldDoc {
  const doc: Record<string, unknown> = { ...meta };
  for (const [list] of LIVE_LISTS) doc[list] = [];
  for (const r of records) {
    const list = LIST_OF_KIND[r.kind];
    if (!list) throw new Error(`Handoff: "${r.kind}" isn't a kind of record this code keeps.`);
    (doc[list] as unknown[]).push(r.data);
  }
  return doc as WorldDoc;
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
