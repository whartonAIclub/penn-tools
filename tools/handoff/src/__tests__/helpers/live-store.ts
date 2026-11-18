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
import { applyAction, ensurePerson, getView, type ApplyInput } from "../../store.js";
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

  act(actor: Actor, action: unknown, extra: Partial<ApplyInput> = {}): Promise<ActOutcome> {
    return applyAction(this.sql, { worldId: this.worldId, actor, requestId: randomUUID(), action, now: this.now, ...extra });
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

  /** The stored row, read straight from the table. */
  async row(): Promise<{ version: number; doc: LiveWorld; next_due: Date | null } | undefined> {
    const [row] = await this.sql<{ version: number; doc: LiveWorld; next_due: Date | null }[]>`
      SELECT version, doc, next_due FROM worlds WHERE id = ${this.worldId}`;
    return row;
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

/** A TEST seller's profile with the handle `@<id>` (one saved before B1, read as one "other" method), unless it has a way to be paid. */
export async function givePayHandle(sql: Sql, actor: Actor): Promise<void> {
  await ensurePerson(sql, actor);
  await sql`UPDATE people SET pay_handle = ${`@${actor.id}`} WHERE user_id = ${actor.id} AND pay_handle = '' AND pay_methods = '[]'::jsonb`;
}
