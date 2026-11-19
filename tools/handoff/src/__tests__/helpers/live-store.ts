// The store on a real Postgres with the real engine: the default port, as page.tsx and actions.ts use it (C5). For
// coreflow.test.ts and the real-engine parts of store.test.ts and concurrency.test.ts.
//
// Times are injected (applyAction's and getView's test-only `now`), so holds, deadlines and sweeps are deterministic. The
// people are labelled TEST accounts with made-up ids and @example.invalid emails, named like the minted test sessions
// (C-CONTRACT §6); no session and no sign-in of any kind. Every view a helper reads is checked against C-CONTRACT §2
// (helpers/contract.ts), so each test also proves who sees what.
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import * as E from "../../../engine/index.js";
import type { LiveWorld } from "../../../engine/index.js";
import { applyAction, ensurePerson, getView, readStoredWorld, type ApplyInput } from "../../store.js";
import type { ActOutcome, Actor, View, WorldId } from "../../types.js";
import { contractViolations } from "./contract.js";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** Tuesday, Nov 10, 2026, noon in Philadelphia. */
export const T0 = E.wallToMs("2026-11-10T12:00");

/** The three labelled TEST users of C-CONTRACT §6 (made-up ids here; the minted sessions use real users rows). */
export const TEST_A: Actor = { id: "handoff-test-a", name: "Handoff Test A", email: "handoff-test-a@example.invalid" };
export const TEST_B: Actor = { id: "handoff-test-b", name: "Handoff Test B", email: "handoff-test-b@example.invalid" };
export const TEST_C: Actor = { id: "handoff-test-c", name: "Handoff Test C", email: "handoff-test-c@example.invalid" };

/** No per-account limits (review of PR #88): what StoreWorld sends unless a test passes its own. */
export const NO_LIMITS = Object.freeze({ openRecords: null, perMinute: null });

export type Ok = Extract<ActOutcome, { ok: true }>;
export type Refused = Extract<ActOutcome, { code: "refused" }>;
/** An action as a client sends it (parseAction checks it inside applyAction). */
export type SentAction = { type: string; [field: string]: unknown };

/** A New York wall time `days` after `from` (ms), at hh:mm. */
export function wallAfter(from: number, days: number, hhmm = "19:00"): string {
  return `${E.nyIsoDate(from + days * DAY)}T${hhmm}`;
}
/** A New York date `days` after `from`. */
export function dateAfter(from: number, days: number): string {
  return E.nyIsoDate(from + days * DAY);
}

function describeOutcome(o: ActOutcome): string {
  if (o.ok) return `ok (${o.toast ?? "no toast"})`;
  return o.code === "unavailable" ? `unavailable (${o.reason})` : `${o.code}: ${o.error}`;
}

export function okOf(o: ActOutcome, what: string): Ok {
  if (!o.ok) throw new Error(`${what}: expected ok, got ${describeOutcome(o)}`);
  return o;
}

export function refusedOf(o: ActOutcome, what: string): Refused {
  if (o.ok || o.code !== "refused") throw new Error(`${what}: expected a refusal, got ${describeOutcome(o)}`);
  return o;
}

/** Throws unless the view keeps C-CONTRACT §2 for its viewer; returns it. */
export function checked(view: View, viewerId: string): View {
  const broken = contractViolations(view, viewerId);
  if (broken.length > 0) throw new Error(`The view for ${viewerId} breaks C-CONTRACT §2: ${broken.join("; ")}`);
  return view;
}

/** The action payloads the live UI sends (C-CONTRACT §3), with the defaults of the first journey. */
export const actions = {
  createEvent: (now: number, over: Record<string, unknown> = {}) => ({
    type: "createEvent", kind: "event", title: "[Test] Spring Formal", club: "Wharton Graduate Association", cat: "Parties",
    start: wallAfter(now, 10), attend: "all", tiers: [{ label: "General admission", price: "40" }], ...over,
  }),
  /** ListPage's addThen: add a ticket you hold and list it in one step. */
  list: (eventId: string, o: { qty: number; ask: string; paid: string; payHandle: string; obo?: boolean; minOffer?: string; note?: string }) => ({
    type: "addThen",
    add: { eventId, tier: "t1", qty: o.qty, paid: o.paid },
    then: {
      type: "list", qty: o.qty, ask: o.ask, note: o.note ?? "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false,
      file: null, payHandle: o.payHandle, membersOnly: false, obo: o.obo ?? false, ...(o.minOffer !== undefined ? { minOffer: o.minOffer } : {}),
    },
  }),
  take: (listingId: string, qty = 1) => ({ type: "take", listingId, qty, amount: "", msg: "", member: false }),
  offer: (listingId: string, amount: string, qty = 1) => ({ type: "offer", listingId, qty, amount, msg: "", member: false }),
  onRequest: (type: string, requestId: string) => ({ type, requestId }),
  request: (eventId: string, o: { qty: number; budget: string; note: string; expires: string }) => ({ type: "saveInterest", data: { eventId, ...o } }),
  postItem: (now: number, over: Record<string, unknown> = {}) => ({
    type: "postItem",
    data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, area: "Rittenhouse", until: dateAfter(now, 10), note: "", ...over },
  }),
};

/** One world in a test database, written through applyAction with the default (real) port, at an injected time. */
export class StoreWorld {
  now: number;

  constructor(
    readonly sql: Sql,
    readonly worldId: WorldId,
    now = T0,
  ) {
    this.now = now;
  }

  /**
   * Runs an action at the world's time. The per-account limits (review of PR #88) are off unless a test passes its own: these tests
   * send many changes from one account within a minute of the world's clock, which the limit tests check on purpose.
   */
  act(actor: Actor, action: unknown, extra: Partial<ApplyInput> = {}): Promise<ActOutcome> {
    return applyAction(this.sql, { worldId: this.worldId, actor, requestId: randomUUID(), action, now: this.now, limits: NO_LIMITS, ...extra });
  }

  async ok(actor: Actor, action: SentAction, extra: Partial<ApplyInput> = {}): Promise<Ok> {
    const o = okOf(await this.act(actor, action, extra), `${action.type} by ${actor.id}`);
    checked(o.view, actor.id);
    return o;
  }

  async refused(actor: Actor, action: SentAction, extra: Partial<ApplyInput> = {}): Promise<Refused> {
    const o = refusedOf(await this.act(actor, action, extra), `${action.type} by ${actor.id}`);
    checked(o.view, actor.id);
    return o;
  }

  /** The viewer's view now (through `sql`, another pool if given), checked against the contract. */
  async view(viewer: Actor, sql: Sql = this.sql): Promise<View> {
    return checked(await getView(sql, { worldId: this.worldId, viewer, now: this.now }), viewer.id);
  }

  advance(ms: number): void {
    this.now += ms;
  }

  /**
   * The world as stored, read straight from its rows (no cache): its version, the whole document joined from them, and the next
   * deadline still to sweep (next_due: what the first read after it sweeps; the store works it out from the rows since PR #88's
   * review, where it used to store it).
   */
  async row(): Promise<{ version: number; doc: LiveWorld; next_due: Date | null } | undefined> {
    const w = await readStoredWorld(this.sql, this.worldId);
    return w && { version: w.version, doc: w.doc as unknown as LiveWorld, next_due: w.nextDue === null ? null : new Date(w.nextDue) };
  }

  async createEvent(actor: Actor, over: Record<string, unknown> = {}): Promise<string> {
    const o = await this.ok(actor, actions.createEvent(this.now, over));
    if (!o.resultId) throw new Error("createEvent returned no id");
    return o.resultId;
  }

  /**
   * Lists as `actor`. Since protocol 2 a handle sent with a listing is dropped (parseAction), and buyers pay with the seller's profile: a
   * seller with no way to be paid gets the handle these tests always gave them, `@<id>`, saved on their profile as one from before B1
   * (so their exchanges copy it as "other", as before). A seller who saved methods keeps them.
   */
  async list(actor: Actor, eventId: string, o: { qty: number; ask: string; paid?: string; obo?: boolean; minOffer?: string }): Promise<string> {
    await givePayHandle(this.sql, actor);
    const done = await this.ok(actor, actions.list(eventId, { paid: "40", payHandle: `@${actor.id}`, ...o }));
    if (!done.resultId) throw new Error("addThen returned no id");
    return done.resultId;
  }
}

/**
 * Puts a whole document in place of a world's market, as a world from before the rows, or a manual fix to its document, would leave
 * it: one document in worlds.doc, not yet split into rows (the store splits it at its next write and keeps its version, as on the
 * first deploy of the rows: review of PR #88). The version stays what it was. For tests of damage already stored.
 */
export async function storeDocument(sql: Sql, worldId: WorldId, doc: unknown, opts: { nextDue?: number | null } = {}): Promise<void> {
  await sql.begin(async (raw) => {
    const tx = raw as unknown as Sql;
    const [row] = await tx<{ version: number }[]>`
      SELECT (w.version + coalesce((SELECT sum(r.tally) FROM records r WHERE r.world_id = w.id), 0))::int AS version
      FROM worlds w WHERE w.id = ${worldId} FOR UPDATE`;
    if (!row) throw new Error(`storeDocument: no world ${worldId}.`);
    await tx`DELETE FROM records WHERE world_id = ${worldId}`;
    const due = opts.nextDue === undefined || opts.nextDue === null ? null : new Date(opts.nextDue);
    await tx`UPDATE worlds SET doc = ${JSON.stringify(doc)}::text::jsonb, version = ${row.version}, split_at = NULL, next_due = ${due} WHERE id = ${worldId}`;
  });
}

/** A TEST seller's profile with the handle `@<id>` (one saved before B1, read as one "other" method), unless it has a way to be paid. */
export async function givePayHandle(sql: Sql, actor: Actor): Promise<void> {
  await ensurePerson(sql, actor);
  await sql`UPDATE people SET pay_handle = ${`@${actor.id}`} WHERE user_id = ${actor.id} AND pay_handle = '' AND pay_methods = '[]'::jsonb`;
}
