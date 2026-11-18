// A stand-in engine for the store's database tests (C-DESIGN §10, batch C1). Its market is a few
// items, each with a stock count and holds: enough to exercise locking, retries, expiry sweeps,
// notifications, invariants and size limits before the real engine is wired in. C5 runs the same
// store and concurrency tests against the real engine.
//
// It keeps the real port's contract: the engine's state lives in module globals, so `run` is
// synchronous only, throws if its callback returns a Promise, and blanks the globals afterwards;
// `reduce` sweeps expired holds first and, when it refuses, returns the previous state untouched.
// Refusals use the real engine's wording.

import { randomBytes } from "node:crypto";
import type {
  EngineContext,
  EngineNote,
  EnginePort,
  GuestContext,
  LiveAction,
  ParseResult,
  ProjectContext,
  ReduceResult,
  WorldDoc,
} from "../../engine-port.js";
import type { GuestListing, GuestView, NotificationLink, PersonRow, View, ViewListing, ViewPerson } from "../../types.js";

export interface ToyHold {
  id: string;
  buyer: string;
  qty: number;
  at: number;
  /** When the hold lapses (ms), or null for one that never does. */
  until: number | null;
}

export interface ToyItem {
  seller: string;
  listed: number;
  holds: ToyHold[];
  withdrawnAt: number | null;
}

/** Listing-like records, to grow the document the way real data does (many small objects, not one string). */
export interface ToyPad {
  id: string;
  eventId: string;
  sellerId: string;
  listed: number;
  ask: number;
  note: string;
  history: { at: number; text: string }[];
}

export interface ToyDoc extends WorldDoc {
  mode: "live";
  lastStamp: number;
  stock: Record<string, ToyItem>;
  pad: ToyPad[];
  notifications: EngineNote[];
}

export const TOY_TEXT = {
  unknown: "Unknown action.",
  noItem: "This listing isn't available.",
  soldOut: "No tickets are left on this listing.",
  withdrawn: "This listing was withdrawn.",
  alreadyWithdrawn: "This listing was already withdrawn.",
  own: "You can't reserve your own listing.",
  notSeller: "Only the seller can do that.",
  noHold: "That reservation isn't on this listing.",
  taken: "Someone else is selling this item.",
} as const;

/**
 * Switches a test can flip (how many of the next projections, and of the next sweeps, throw), a count of sweeps
 * run, and a count of engine runs that were given someone's email (the store must never do that: only the
 * projection's context carries emails).
 */
export const toyControls = { failProject: 0, failSweep: 0, sweepRuns: 0, runsWithEmail: 0 };

const ITEM = /^i-[a-z0-9-]{1,24}$/;
const HOLD = /^h[0-9a-f]{16}$/;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;

let CLOCK = Number.NaN;
let PEOPLE: ReadonlyMap<string, PersonRow> = new Map();
let running = false;

export const toyPort: EnginePort = {
  empty(): ToyDoc {
    return { mode: "live", lastStamp: 0, stock: {}, pad: [], notifications: [] };
  },
  parse,
  actionIds(action: LiveAction): Record<string, string> {
    const ids: Record<string, string> = {};
    for (const key of ["item", "hold"]) {
      const v = action[key];
      if (typeof v === "string") ids[key] = v;
    }
    return ids;
  },
  run,
  reduce: (doc, actorId, action) => reduce(doc as ToyDoc, actorId, action),
  violations: (doc) => violations(doc as ToyDoc),
  nextDue: (doc) => nextDue(doc as ToyDoc),
  drain(doc) {
    const d = doc as ToyDoc;
    const out = d.notifications;
    d.notifications = [];
    return out;
  },
  project: (doc, viewerId, ctx) => project(doc as ToyDoc, viewerId, ctx),
  guest: (doc, ctx) => guest(doc as ToyDoc, ctx),
  // Follow-on B1, the toy way: the seller's items that aren't withdrawn and still have stock no hold has taken.
  payNeeded(doc, sellerId) {
    requireRun();
    return Object.values((doc as ToyDoc).stock).filter((it) => it.seller === sellerId && it.withdrawnAt === null && it.listed > held(it)).length;
  },
};

/** The violations a document has, as keys (the real engine's invariantViolations works the same way). */
export function violations(d: ToyDoc): string[] {
  const out: string[] = [];
  if (d.mode !== "live") out.push("mode");
  if (d.notifications.length > 0) out.push("notifications-at-rest");
  const holdIds = new Set<string>();
  for (const [id, it] of Object.entries(d.stock)) {
    if (held(it) > it.listed) out.push(`oversold:${id}`);
    for (const h of it.holds) {
      if (holdIds.has(h.id)) out.push(`duplicate-hold:${h.id}`);
      holdIds.add(h.id);
    }
  }
  return out;
}

function run<T>(ctx: EngineContext, fn: () => T): T {
  if (running) throw new Error("toy engine: run() is not re-entrant.");
  if (ctx.doc.mode !== "live") throw new Error("toy engine: not a live world.");
  if (!Number.isFinite(ctx.now)) throw new Error("toy engine: no clock.");
  running = true;
  CLOCK = ctx.now;
  if (ctx.people.some((p) => p.email !== null)) toyControls.runsWithEmail += 1;
  PEOPLE = new Map(ctx.people.map((p) => [p.userId, p] as const));
  try {
    const out = fn();
    if (isThenable(out)) {
      out.then(undefined, () => {}); // its failure is reported by the throw below, not as an unhandled rejection
      throw new Error("toy engine: run() callbacks must be synchronous.");
    }
    return out;
  } finally {
    running = false;
    CLOCK = Number.NaN;
    PEOPLE = new Map();
  }
}

function requireRun(): void {
  if (!running || !Number.isFinite(CLOCK)) throw new Error("toy engine: used outside run().");
}

function parse(raw: unknown): ParseResult {
  if (!isRecord(raw) || typeof raw["type"] !== "string") return { ok: false, error: TOY_TEXT.unknown };
  const type = raw["type"];
  const bad: ParseResult = { ok: false, error: "That action isn't valid." };
  const item = typeof raw["item"] === "string" && ITEM.test(raw["item"]) ? raw["item"] : null;
  const int = (key: string, lo: number, hi: number, fallback?: number): number | null => {
    const v = raw[key] === undefined ? fallback : raw[key];
    return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  };
  switch (type) {
    case "stock": {
      const listed = int("listed", 1, 1000);
      return item && listed !== null ? { ok: true, action: { type, item, listed } } : bad;
    }
    case "take": {
      const qty = int("qty", 1, 10, 1);
      const holdMs = raw["holdMs"] === undefined ? null : int("holdMs", 1, 86_400_000);
      if (!item || qty === null || (raw["holdMs"] !== undefined && holdMs === null)) return bad;
      return { ok: true, action: { type, item, qty, holdMs } };
    }
    case "release": {
      const hold = typeof raw["hold"] === "string" && HOLD.test(raw["hold"]) ? raw["hold"] : null;
      return item && hold ? { ok: true, action: { type, item, hold } } : bad;
    }
    case "withdraw":
    case "corrupt":
      return item ? { ok: true, action: { type, item } } : bad;
    case "note": {
      const to = raw["to"];
      const text = raw["text"];
      const copies = int("copies", 1, 3, 1);
      if (!isUserId(to)) return bad;
      if (typeof text !== "string" || text.length === 0 || text.length > 3000 || copies === null) return bad;
      return { ok: true, action: { type, to, text, copies, noLink: raw["noLink"] === true, badId: raw["badId"] === true } };
    }
    case "greet": {
      const to = raw["to"];
      return isUserId(to) ? { ok: true, action: { type, to } } : bad;
    }
    case "pad": {
      const bytes = int("bytes", 1, 8_000_000);
      return bytes !== null ? { ok: true, action: { type, bytes } } : bad;
    }
    case "trim":
      return { ok: true, action: { type } };
    case "boom":
      return { ok: true, action: item ? { type, item } : { type } };
    default:
      // "sweep" included: only the server runs it, with no actor.
      return { ok: false, error: TOY_TEXT.unknown };
  }
}

function reduce(prev: ToyDoc, actorId: string | null, a: LiveAction): ReduceResult {
  requireRun();
  const n = JSON.parse(JSON.stringify(prev)) as ToyDoc;
  const fail = (error: string): ReduceResult => ({ state: prev, error });
  sweepExpired(n);
  if (a.type === "sweep") {
    if (actorId !== null) return fail(TOY_TEXT.unknown);
    toyControls.sweepRuns += 1;
    if (toyControls.failSweep > 0) {
      toyControls.failSweep -= 1;
      throw new Error("toy sweep failed");
    }
    return { state: n };
  }
  if (actorId === null) return fail(TOY_TEXT.unknown);
  const itemId = typeof a["item"] === "string" ? a["item"] : "";
  const it = Object.hasOwn(n.stock, itemId) ? n.stock[itemId] : undefined;

  switch (a.type) {
    case "stock": {
      const listed = a["listed"] as number;
      if (it && it.seller !== actorId) return fail(TOY_TEXT.taken);
      n.stock[itemId] = it ? { ...it, listed } : { seller: actorId, listed, holds: [], withdrawnAt: null };
      return { state: n, toast: `Listed ${listed}.`, result: { id: itemId } };
    }
    case "take": {
      const qty = a["qty"] as number;
      const holdMs = a["holdMs"] as number | null;
      if (!it) return fail(TOY_TEXT.noItem);
      if (it.withdrawnAt !== null) return fail(TOY_TEXT.withdrawn);
      if (it.seller === actorId) return fail(TOY_TEXT.own);
      if (it.listed - held(it) < qty) return fail(TOY_TEXT.soldOut);
      const hold: ToyHold = { id: `h${hex(8)}`, buyer: actorId, qty, at: stamp(n), until: holdMs === null ? null : CLOCK + holdMs };
      it.holds.push(hold);
      note(n, it.seller, `${firstName(actorId)} reserved ${qty} of ${itemId}.`, { name: "activity", tab: "listings" });
      return { state: n, toast: `Reserved ${qty}.`, result: { id: hold.id } };
    }
    case "release": {
      if (!it) return fail(TOY_TEXT.noItem);
      if (it.seller !== actorId) return fail(TOY_TEXT.notSeller);
      const hold = it.holds.find((h) => h.id === a["hold"]);
      if (!hold) return fail(TOY_TEXT.noHold);
      it.holds = it.holds.filter((h) => h !== hold);
      note(n, hold.buyer, `${firstName(actorId)} released your reservation on ${itemId}.`, { name: "event", id: itemId });
      return { state: n, toast: "Released." };
    }
    case "withdraw": {
      if (!it) return fail(TOY_TEXT.noItem);
      if (it.seller !== actorId) return fail(TOY_TEXT.notSeller);
      if (it.withdrawnAt !== null) return fail(TOY_TEXT.alreadyWithdrawn);
      it.withdrawnAt = stamp(n);
      return { state: n, toast: "Withdrawn." };
    }
    case "note": {
      const to = a["to"] as string;
      const text = a["text"] as string;
      const link: NotificationLink | null = a["noLink"] === true ? null : { name: "activity" };
      const copies = a["copies"] as number;
      // An id the notifications table refuses stands in for an engine bug.
      if (a["badId"] === true) n.notifications.push({ id: "Not A Valid Id!", userId: to, text, link, at: stamp(n) });
      else if (copies === 1) note(n, to, text, link);
      // More than one copy stands in for an engine that doesn't dedupe within an action.
      else for (let i = 0; i < copies; i++) n.notifications.push({ id: hex(8), userId: to, text, link, at: stamp(n) });
      return { state: n, toast: "Noted." };
    }
    case "greet": {
      // Names another person from the engine's people, as the real engine's notification and history text does.
      const to = a["to"] as string;
      note(n, to, `Hello, ${firstName(to)}.`, { name: "activity" });
      return { state: n, toast: "Greeted." };
    }
    case "pad": {
      const target = a["bytes"] as number;
      let added = 0;
      for (let i = n.pad.length; added < target; i++) {
        const rec = padRecord(i);
        n.pad.push(rec);
        added += JSON.stringify(rec).length + 1;
      }
      return { state: n, toast: "Padded." };
    }
    case "trim":
      n.pad = [];
      return { state: n, toast: "Trimmed." };
    case "boom":
      throw new Error("toy engine exploded");
    case "corrupt": {
      if (!it) return fail(TOY_TEXT.noItem);
      it.listed = 0; // oversold once any hold exists: a newly introduced violation
      return { state: n, toast: "Corrupted." };
    }
    default:
      return fail(TOY_TEXT.unknown);
  }
}

function sweepExpired(n: ToyDoc): void {
  for (const [id, it] of Object.entries(n.stock)) {
    const lapsed = it.holds.filter((h) => h.until !== null && h.until <= CLOCK);
    if (lapsed.length === 0) continue;
    it.holds = it.holds.filter((h) => !lapsed.includes(h));
    for (const h of lapsed) note(n, h.buyer, `Your hold on ${id} expired.`, { name: "event", id });
  }
}

function nextDue(d: ToyDoc): number | null {
  requireRun();
  let due: number | null = null;
  for (const it of Object.values(d.stock)) {
    for (const h of it.holds) if (h.until !== null && h.until > CLOCK && (due === null || h.until < due)) due = h.until;
  }
  return due;
}

function project(d: ToyDoc, viewerId: string, ctx: ProjectContext): View {
  requireRun();
  if (toyControls.failProject > 0) {
    toyControls.failProject -= 1;
    throw new Error("toy projection failed");
  }
  const me = ctx.people.get(viewerId);
  if (!me) throw new Error("toy projection: the viewer has no profile row.");
  const people: Record<string, ViewPerson> = {
    [viewerId]: {
      name: me.name,
      first: me.name.split(" ")[0] ?? me.name,
      color: "#4b6",
      demo: true,
      ...(me.email !== null ? { contact: me.email } : {}),
    },
  };
  const listings: ViewListing[] = [];
  for (const [id, it] of Object.entries(d.stock)) {
    listings.push(listingOf(id, it));
    if (!people[it.seller]) {
      const p = ctx.people.get(it.seller);
      const first = p?.name.split(" ")[0] ?? "A classmate";
      people[it.seller] = { name: first, first, color: "#888", demo: true };
    }
  }
  return {
    protocol: 1,
    mode: "live",
    worldId: ctx.worldId,
    version: ctx.version,
    serverNow: ctx.now,
    nextRefreshAt: nextDue(d),
    unreadCount: ctx.unreadCount,
    viewer: { id: viewerId, name: me.name, email: me.email, payMethods: me.payMethods.map((m) => ({ ...m })) },
    v: 11,
    events: [],
    people,
    holdings: [],
    listings,
    requests: [],
    interests: [],
    closedRequests: [],
    responses: [],
    goods: [],
    goodsReqs: [],
    notifications: ctx.notifications,
    strikes: {},
    policies: {},
    alertPrefs: {},
    seen: {},
    feedSeen: {},
    suggestions: [],
    feedbackGiven: false,
    clockOffset: 0,
    tick: 0,
  };
}

/**
 * The guest view (C-CONTRACT §7), the toy way: each item anyone could take now, with what's left, and nothing else. Like the real
 * port, it counts only holds that haven't lapsed by the clock (guests never sweep), and gives no hold's end. It refuses to run
 * with anyone's profile row: the store never gives a guest view people.
 */
function guest(d: ToyDoc, ctx: GuestContext): GuestView {
  requireRun();
  if (PEOPLE.size > 0) throw new Error("toy engine: a guest view was run with profile rows.");
  const listings: GuestListing[] = [];
  for (const [id, it] of Object.entries(d.stock)) {
    const live = it.holds.filter((h) => h.until === null || h.until > CLOCK).reduce((t, h) => t + h.qty, 0);
    const available = it.withdrawnAt !== null ? 0 : Math.max(0, it.listed - live);
    if (available > 0) listings.push({ id, eventId: "ev-0000000000000000", tier: "t1", ask: 10, obo: false, available, createdAt: 0 });
  }
  return {
    protocol: 1,
    mode: "live",
    guest: true,
    viewer: null,
    worldId: ctx.worldId,
    version: ctx.version,
    serverNow: ctx.now,
    nextRefreshAt: null,
    events: [],
    listings,
    goods: [],
    wanted: [],
    closedWanted: [],
  };
}

function listingOf(id: string, it: ToyItem): ViewListing {
  const reserved = held(it);
  const untils = it.holds.map((h) => h.until).filter((u): u is number => u !== null && u > CLOCK);
  return {
    id,
    eventId: "ev-0000000000000000",
    sellerId: it.seller,
    listed: it.listed,
    ask: 10,
    paid: 10,
    tier: "t1",
    obo: false,
    note: "",
    createdAt: 0,
    ...(it.withdrawnAt !== null ? { withdrawnAt: it.withdrawnAt } : {}),
    numbers: { reserved, completed: 0, available: it.withdrawnAt !== null ? 0 : Math.max(0, it.listed - reserved) },
    numbersUntil: untils.length > 0 ? Math.min(...untils) : null,
    source: "self-reported",
  };
}

function held(it: ToyItem): number {
  return it.holds.reduce((t, h) => t + h.qty, 0);
}

/** The live engine's stamp rule (C-DESIGN §5.1): unique, ordered, and never ahead of real time. */
function stamp(n: ToyDoc): number {
  n.lastStamp = Math.max(CLOCK, n.lastStamp + 1);
  return n.lastStamp;
}

/** Like the engine's noteTo: an identical note the person already has in this document isn't added twice. */
function note(n: ToyDoc, userId: string, text: string, link: NotificationLink | null): void {
  if (n.notifications.some((x) => x.userId === userId && x.text === text)) return;
  n.notifications.push({ id: hex(8), userId, text, link, at: stamp(n) });
}

function firstName(userId: string): string {
  return PEOPLE.get(userId)?.name.split(" ")[0] ?? "Someone";
}

function padRecord(i: number): ToyPad {
  const id = i.toString(16).padStart(16, "0");
  return {
    id: `l${id}`,
    eventId: `ev-${id}`,
    sellerId: `pad-seller-${i % 50}`,
    listed: 2,
    ask: 35,
    note: "Padding that grows the document the way real listings do.",
    history: [{ at: CLOCK, text: "Listed 2 at $35 (self-reported)." }],
  };
}

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function isUserId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 64 && !HAS_CONTROL.test(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (typeof v === "object" || typeof v === "function") && v !== null && typeof (v as { then?: unknown }).then === "function";
}
