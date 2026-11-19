// Shared steps for the invite-to-pay tests (follow-on Batch 5, FOLLOWON-PLAN §2.5/§2.7): the four new actions as the page sends
// them (through parseAction, on a ServerWorld), small readers, and the test-only switch.
//
// The flow is built and switched off for the live page until step S3 (engine: INVITE_FLOW_LIVE). Tests that need it on call
// E.setInviteSwitch(true); every test file using these helpers resets it in afterEach (resetEngine).
import * as E from "../../../engine/index.js";
import type { Action, EngineNotification, Listing, ListingNumbers, LiveWorld, RequestEval, TicketRequest } from "../../../engine/index.js";
import { PEOPLE6, ServerWorld } from "./views.js";
import { ANN, HOUR, T0, type Done, type LiveTestWorld, type TestPerson } from "./worlds.js";

/** When a request or an invitation made at T0 for the default event (10 days ahead) ends: six hours on. */
export const OPEN_UNTIL = T0 + 6 * HOUR;

/** afterEach: the switch back to the engine's own setting, and nothing left applied. */
export function resetEngine(): void {
  E.setInviteSwitch(null);
  E.setLiveClock(null);
  E.applyWorld(null);
}

export function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}
export const reqOf = (w: LiveTestWorld, id: string): TicketRequest => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
export const listingOf = (w: LiveTestWorld, id: string): Listing => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
export const numbers = (w: LiveTestWorld, listingId: string): ListingNumbers => w.run(() => E.listingNumbers(w.doc, listingOf(w, listingId)));
/** The record's state as the engine reads it now (expiry is evaluated lazily). */
export const evalOf = (w: LiveTestWorld, id: string): RequestEval => w.run(() => E.rState(reqOf(w, id)));
export const statusOf = (w: LiveTestWorld, id: string): string => w.run(() => E.baseSt(E.rState(reqOf(w, id))));
export const loadOf = (w: LiveTestWorld, p: TestPerson, eventId: string): number => w.run(() => E.personLoad(w.doc, p.userId, eventId));
export const violationsOf = (w: LiveTestWorld, doc: LiveWorld = w.doc): string[] =>
  E.withEngine({ doc, people: w.people, now: w.now }, () => E.invariantViolations(doc));
export const textsFor = (notes: readonly EngineNotification[], p: TestPerson): string[] => notes.filter((n) => n.userId === p.userId).map((n) => n.text);
export const historyOf = (r: { history: readonly { text: string }[] }): string[] => r.history.map((h) => h.text);
export const lastHistory = (r: { history: readonly { text: string }[] }): string => must(r.history[r.history.length - 1], "a history line").text;
/** A note as the tests compare it: who, the sentence, where it links, and its email tag (null when untagged). */
export const noteRows = (notes: readonly EngineNotification[]): unknown[][] => notes.map((n) => [n.userId, n.text, n.link, n.kind ?? null, n.ref ?? null]);
/** A copy of the stored document that a test may damage (the world's own is frozen). */
export const copyOf = (w: LiveTestWorld): LiveWorld => structuredClone(w.doc) as LiveWorld;
/** Gives someone a profile payment method (or takes them all away) from now on, as saving the profile does. */
export function setMethods(w: LiveTestWorld, p: TestPerson, payMethods: E.PayMethod[], payHandle = ""): void {
  w.people = w.people.map((x) => (x.userId === p.userId ? { ...x, payHandle, payMethods } : x));
}

export interface Market { w: ServerWorld; ev: string; l: string }
/** Ann's event (10 days ahead, $40 tier) and her listing on it at $35. */
export function market(o: { qty?: number; obo?: boolean; minOffer?: string; ask?: string; event?: Record<string, unknown>; people?: readonly TestPerson[] } = {}): Market {
  const w = new ServerWorld({ people: o.people ?? PEOPLE6 });
  const ev = w.addEvent(ANN, o.event ?? {});
  const l = w.listTickets(ANN, ev, {
    qty: o.qty ?? 1, ...(o.obo !== undefined ? { obo: o.obo } : {}), ...(o.minOffer !== undefined ? { minOffer: o.minOffer } : {}), ...(o.ask !== undefined ? { ask: o.ask } : {}),
  });
  return { w, ev, l };
}

export const askAction = (listingId: string, o: { qty?: number; amount?: string; member?: boolean } = {}): Action =>
  ({ type: "requestToBuy", listingId, qty: o.qty ?? 1, ...(o.amount !== undefined ? { amount: o.amount } : {}), msg: "", member: o.member ?? false });
export const inviteAction = (requestId: string, o: { qty?: number; price?: string } = {}): Action => ({ type: "invite", requestId, ...o });
export const reserveAction = (requestId: string, member = false): Action => ({ type: "reserve", requestId, member });
export const on = (type: string, requestId: string): Action => ({ type, requestId });

/** Request to buy; returns the record's id. */
export const ask = (w: LiveTestWorld, buyer: TestPerson, listingId: string, o: { qty?: number; amount?: string; member?: boolean } = {}): string =>
  must(w.ok(buyer.userId, askAction(listingId, o)).id, "the request's id");
export const invite = (w: LiveTestWorld, seller: TestPerson, requestId: string, o: { qty?: number; price?: string } = {}): Done => w.ok(seller.userId, inviteAction(requestId, o));
export const reserve = (w: LiveTestWorld, buyer: TestPerson, requestId: string, member = false): Done => w.ok(buyer.userId, reserveAction(requestId, member));
/** Asks and is invited; returns the record's id. */
export function invited(w: LiveTestWorld, seller: TestPerson, buyer: TestPerson, listingId: string, o: { qty?: number; amount?: string; member?: boolean } = {}): string {
  const r = ask(w, buyer, listingId, o);
  invite(w, seller, r);
  return r;
}
/** Asks, is invited and reserves; returns the record's id. */
export function reserved(w: LiveTestWorld, seller: TestPerson, buyer: TestPerson, listingId: string, o: { qty?: number; amount?: string; member?: boolean } = {}): string {
  const r = invited(w, seller, buyer, listingId, o);
  reserve(w, buyer, r);
  return r;
}
/** Adds a holding and lists it with no payment handle of its own (what the page sends once posting no longer asks for one). */
export const listWithoutHandle = (eventId: string, qty = 1): Action => ({
  type: "addThen",
  add: { eventId, tier: "t1", qty, paid: "40" },
  then: { type: "list", qty, ask: "35", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false },
});
