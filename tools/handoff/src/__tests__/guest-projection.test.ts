// The guest view (C-CONTRACT.md §7; project.ts's projectGuest): what a signed-out visitor gets. Privacy rests on its own
// allowlists, so this is strict:
// - Allowlists: exactly the guest keys on every record, at every step; a field nobody listed never leaves the server.
// - Canaries: names, ids, emails, payment handles, notes, venues, links, budgets, offers, messages, pickup areas and times, an
//   alert's max, a holding's price, a held reply, history lines and hold ends planted in one world never reach its guest view,
//   even with everyone's profile installed in the engine (which the store never does: the view is the same without them).
// - Counts: each guest listing's count is the one every signed-in viewer gets, right after holds, offers, sales and lapses, and a
//   listing nobody could take now isn't there at all. Items and public requests follow the same rule (Wanted's own).
// - Times: nextRefreshAt holds only published times, never a hold's end.
// - The seam: the browser can install a guest view, and its events read "A classmate".
// The people are labelled test accounts with made-up ids and @example.invalid emails; no database and no sign-in of any kind.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as E from "../../engine/index.js";
import type { LiveWorld, WorldState } from "../../engine/index.js";
import type { EnginePort, WorldDoc } from "../engine-port.js";
import { EVENT_KEEP_DAYS, projectGuest } from "../project.js";
import type { GuestView } from "../types.js";
import { CLOSED_REQUEST_KEYS, GUEST_EVENT_KEYS, GUEST_ITEM_KEYS, GUEST_LISTING_KEYS, GUEST_VIEW_KEYS, GUEST_WANTED_KEYS, guestContractViolations } from "./helpers/contract.js";
import { FAY, ServerWorld, emailOf, guestViewOf, viewOf } from "./helpers/views.js";
import { DAY, HOUR, LiveTestWorld, MIN, T0, type TestPerson, dateAfter, deepFreeze, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

afterEach(() => {
  vi.restoreAllMocks();
  E.setLiveClock(null);
  E.applyWorld(null);
});

// The real port takes projectGuest as it is (a compile-time check).
void (projectGuest satisfies EnginePort["guest"]);

/** The guest view, checked against C-CONTRACT §7 first: every test reads only guest views that meet it. */
function guest(w: LiveTestWorld, o: Parameters<typeof guestViewOf>[1] = {}): GuestView {
  const g = guestViewOf(w, o);
  expect(guestContractViolations(g), "the guest contract").toEqual([]);
  return g;
}

// ── The people and the canaries ──────────────────────────────────────────────────────────

/** Names no text in Handoff contains, so a scan for them finds only a leak. */
/** Quilla, the seller, has saved payment methods too (follow-on B1): her buyers' reservations copy them. */
const QUILLA: TestPerson = { userId: "user-quilla", name: "Quilla Vantablack", payHandle: "@QUILLA-PAY", email: "quilla.canary@example.invalid",
  payMethods: [{ kind: "venmo", value: "QUILLA-VENMO-CANARY" }, { kind: "zelle", value: "quilla.zelle.canary@example.invalid" }] };
const ROOK: TestPerson = { userId: "user-rook", name: "Rookwood Zephyrine", payHandle: "@ROOK-PAY", email: "rook.canary@example.invalid" };
const SAGE: TestPerson = { userId: "user-sage", name: "Sagewort Plimsoll", payHandle: "@SAGE-PAY", email: "sage.canary@example.invalid" };
const TARN: TestPerson = { userId: "user-tarn", name: "Tarnwell Oxbridge", payHandle: "@TARN-PAY", email: "tarn.canary@example.invalid" };
const UMBER: TestPerson = { userId: "user-umber", name: "Umberto Kestrelwing", payHandle: "", email: "umber.canary@example.invalid" };
const VALE: TestPerson = { userId: "user-vale", name: "Valerian Thistledown", payHandle: "@VALE-PAY", email: "vale.canary@example.invalid" };
const PEOPLE: readonly TestPerson[] = [QUILLA, ROOK, SAGE, TARN, UMBER, VALE];

/** Every way a person could be named or reached: full, first and last names, "First L.", the user id, the email, the handle, the methods. */
function personCanaries(p: TestPerson): string[] {
  const [first, last] = p.name.split(" ") as [string, string];
  return [p.name, first, last, E.publicName(p.name), p.userId, emailOf(p), ...(p.payHandle ? [p.payHandle] : []),
    ...(p.payMethods ?? []).flatMap((m) => [m.value, E.formatPayMethod(m)])];
}

/** Text typed with records, private amounts and arrangements: none of it may reach a guest. */
const CANARY = {
  eventNote: "CANARY-EVENT-NOTE call 215-555-0199",
  venue: "CANARY-VENUE 4521 Pine St Apt 3",
  link: "https://example.invalid/CANARY-LINK",
  listingNote: "CANARY-LISTING-NOTE",
  listingPay: "@CANARY-LISTING-PAY",
  minOffer: "21.37",
  takeMsg: "CANARY-TAKE-MSG",
  problem: "The seller hasn't sent it",
  offer: "123.45",
  offerMsg: "CANARY-OFFER-MSG",
  alertMax: "987.65",
  holdingPrice: "77.77",
  budget: "41.37",
  requestNote: "CANARY-REQUEST-NOTE",
  replyPay: "@CANARY-REPLY-PAY",
  replyNote: "CANARY-REPLY-NOTE",
  itemMinOffer: "11.11",
  area: "CANARY-AREA Grays Ferry",
  itemNote: "CANARY-ITEM-NOTE",
  goodsOffer: "12.34",
  goodsMsg: "CANARY-GOODS-MSG",
  pickupTime: "T17:23",
  area2: "CANARY-AREA2 Fishtown",
  itemNote2: "CANARY-ITEM2-NOTE",
  goodsBudget: "45.45",
  goodsNote: "CANARY-GOODS-NOTE",
  closedNote: "CANARY-CLOSED-NOTE",
} as const;

/**
 * Quilla's Winter Gala (GA $40, Patron $1,000; venue, link and notes she typed). She lists 2 GA at $35 OBO from $21.37 with a note:
 * Rook reserves one with a message, pays and reports a problem. She lists 1 Patron at $900 OBO: Sage offers $123.45 with a message.
 * Umber's private alert: 3 tickets up to $987.65. Tarn holds 3 Patron tickets at $77.77 she hasn't listed, and asks publicly for 1
 * at up to $41.37 with a note; Quilla shares her GA listing with it, and Sage holds a Patron ticket for it (a held reply) with a
 * note. Quilla's desk chair (OBO from $11.11; pickup area and note): Vale asks at $12.34 with a message, Quilla accepts, and they
 * set the pickup for 17:23 tomorrow. Her bookshelf is on sale (another area and note). Tarn asks for a mini fridge at up to $45.45
 * with a note. Quilla lists a train ticket for one departure, and removed an event; Tarn listed one of her tickets and withdrew it.
 * Umber posted a request and cancelled it.
 */
function canaryWorld() {
  const w = new ServerWorld({ people: PEOPLE });
  const now = w.now;
  const ev = must(w.ok(QUILLA.userId, { type: "createEvent", kind: "event", title: "Winter Gala", club: "Wharton Graduate Association", cat: "Parties",
    start: wallAfter(now, 10), deadline: wallAfter(now, 9, "12:00"), venue: CANARY.venue, officialUrl: CANARY.link, notes: CANARY.eventNote,
    tiers: [{ label: "GA", price: "40" }, { label: "Patron", price: "1000" }] }).id, "event");
  const l1 = must(w.ok(QUILLA.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 2, paid: "40" },
    then: { type: "list", qty: 2, ask: "35", method: "app", payHandle: CANARY.listingPay, file: null, note: CANARY.listingNote, obo: true, minOffer: CANARY.minOffer } }).id, "l1");
  const r1 = must(w.ok(ROOK.userId, { type: "take", listingId: l1, qty: 1, amount: "", msg: CANARY.takeMsg, member: false }).id, "r1");
  w.ok(ROOK.userId, { type: "markPaid", requestId: r1, via: "zelle" }); // Quilla takes two methods, so Rook says which he used
  w.ok(ROOK.userId, { type: "reportProblem", kind: "ticket", id: r1, reason: CANARY.problem });
  const l2 = must(w.ok(QUILLA.userId, { type: "addThen", add: { eventId: ev, tier: "t2", qty: 1, paid: "1000" },
    then: { type: "list", qty: 1, ask: "900", method: "app", payHandle: CANARY.listingPay, file: null, obo: true } }).id, "l2");
  const offer = must(w.ok(SAGE.userId, { type: "offer", listingId: l2, qty: 1, amount: CANARY.offer, msg: CANARY.offerMsg, member: false }).id, "offer");
  const alert = must(w.ok(UMBER.userId, { type: "joinAlert", eventId: ev, qty: 3, max: CANARY.alertMax }).id, "alert");
  const holding = must(w.ok(TARN.userId, { type: "addHolding", eventId: ev, tier: "t2", qty: 3, paid: CANARY.holdingPrice }).id, "Tarn's holding");
  const iso = must(w.ok(TARN.userId, { type: "saveInterest", data: { eventId: ev, qty: 1, budget: CANARY.budget, note: CANARY.requestNote, expires: dateAfter(now, 5) } }).id, "iso");
  const share = must(w.ok(QUILLA.userId, { type: "shareListing", isoId: iso, listingId: l1 }).id, "share");
  w.ok(SAGE.userId, { type: "addThen", add: { eventId: ev, tier: "t2", qty: 1, paid: "1000" },
    then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: CANARY.replyPay, note: CANARY.replyNote, membersOnly: false } });
  const heldReply = must(w.doc.listings.find((l) => l.isoReplyFor === iso), "held reply");
  const chair = w.postItem(QUILLA, { title: "Desk chair", price: "30", obo: true, minOffer: CANARY.itemMinOffer, area: CANARY.area, note: CANARY.itemNote });
  const greq = must(w.ok(VALE.userId, { type: "requestItem", id: chair, offer: CANARY.goodsOffer, msg: CANARY.goodsMsg, shareContact: true }).id, "goods request");
  w.ok(QUILLA.userId, { type: "acceptItemReq", id: greq, shareContact: true });
  w.ok(VALE.userId, { type: "setPickup", id: greq, at: wallAfter(now, 1, CANARY.pickupTime.slice(1)) });
  const shelf = w.postItem(QUILLA, { title: "Bookshelf", price: "25", area: CANARY.area2, note: CANARY.itemNote2 });
  const fridge = must(w.ok(TARN.userId, { type: "saveInterest", data: { qty: 1, budget: CANARY.goodsBudget, note: CANARY.goodsNote, expires: dateAfter(now, 10),
    goods: { title: "Mini fridge", cat: "Home & kitchen" } } }).id, "fridge request");
  const train = must(w.ok(QUILLA.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(now, 1, "06:00"),
    openUntil: wallAfter(now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
  const lt = must(w.ok(QUILLA.userId, { type: "addThen", add: { eventId: train, tier: "t1", qty: 1, paid: "89" },
    then: { type: "list", qty: 1, ask: "80", method: "file", payHandle: CANARY.listingPay, file: null, departsAt: wallAfter(now, 3, "14:11") } }).id, "train listing");
  const gone = must(w.ok(TARN.userId, { type: "list", holdingId: holding, qty: 1, ask: "36", method: "app", payHandle: TARN.payHandle, file: null }).id, "withdrawn listing");
  w.ok(TARN.userId, { type: "withdraw", listingId: gone });
  const removed = must(w.ok(QUILLA.userId, { type: "createEvent", kind: "event", title: "Removed Mixer", club: "Some Club", cat: "Parties", start: wallAfter(now, 12),
    tiers: [{ label: "GA", price: "10" }] }).id, "removed event");
  w.ok(QUILLA.userId, { type: "removeEvent", eventId: removed });
  const closed = must(w.ok(UMBER.userId, { type: "saveInterest", data: { qty: 1, budget: "20", note: CANARY.closedNote, expires: dateAfter(now, 4),
    goods: { title: "Coffee table", cat: "Furniture" } } }).id, "closed request");
  w.ok(UMBER.userId, { type: "closeInterest", id: closed, reason: "cancelled" });
  if (w.invalid.length > 0) throw new Error(`the input gate refused: ${w.invalid.map((x) => x.why).join("; ")}`);
  return { w, ev, l1, r1, l2, offer, alert, holding, iso, share, heldReply, chair, greq, shelf, fridge, train, lt, gone, removed, closed };
}

const byId = <T extends { id: string }>(xs: readonly T[]): T[] => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Everything that must never appear in a guest view of the canary world, by what it is. */
function forbidden(c: ReturnType<typeof canaryWorld>): [string, string][] {
  const doc = c.w.doc;
  const out: [string, string][] = [];
  for (const p of PEOPLE) for (const v of personCanaries(p)) out.push([`${p.userId}'s identity`, v]);
  for (const [k, v] of Object.entries(CANARY)) out.push([k, v]);
  // Private records' ids: requests, offers, goods requests, holdings, shares, alerts, a held reply. (SELL6-N1, §9x item 1: a closed public
  // request's id is no longer one of them. It was public while the request was open, and the guest view now names it, id and event
  // only, so its link says "This request is closed": the tests below pin exactly that, and its note stays a canary.)
  const ids: [string, string][] = [["r1", c.r1], ["offer", c.offer], ["goods request", c.greq], ["holding", c.holding], ["share", c.share], ["alert", c.alert],
    ["held reply", c.heldReply.id], ["withdrawn listing", c.gone], ["removed event", c.removed]];
  for (const l of doc.listings) ids.push([`listing ${l.id}'s holding`, l.holdingId]);
  for (const r of doc.requests) ids.push([`request ${r.id}`, r.id]);
  out.push(...ids);
  // Hold ends (ms): a reservation's and the item's (a day after the agreed pickup).
  for (const r of doc.requests) if (typeof r.holdUntil === "number") out.push([`hold end of ${r.id}`, String(r.holdUntil)]);
  for (const g of doc.goodsReqs) if (typeof g.holdUntil === "number") out.push([`hold end of ${g.id}`, String(g.holdUntil)]);
  for (const g of doc.goodsReqs) if (g.pickupAt) out.push([`pickup of ${g.id}`, g.pickupAt]);
  // History lines and messages the engine wrote into records.
  for (const l of doc.listings) for (const h of l.history) out.push([`history of ${l.id}`, h.text]);
  for (const it of doc.goods) for (const h of it.history) out.push([`history of ${it.id}`, h.text]);
  for (const r of doc.requests) for (const h of r.history) out.push([`history of ${r.id}`, h.text]);
  return out;
}

/** Key names a guest view never carries anywhere, whatever the record. */
const FORBIDDEN_KEYS = /"(sellerId|userId|buyerId|addedBy|createdBy|people|contact|email|pay|payHandle|payKinds|payMethods|paidVia|note|notes|blurb|sourcesNote|venue|officialUrl|area|msg|budget|max|paused|minOffer|paid|method|history|holdingId|isoReplyFor|numbers|numbersUntil|state|stateUntil|status|requests|interests|responses|holdings|goodsReqs|notifications|unreadCount|removedAt|canRemove|withdrawnAt|soldAt|photos?)":/;

describe("canaries: nothing private reaches a guest (C-CONTRACT §7)", () => {
  const c = canaryWorld();

  it("no name, id, email, handle, note, venue, link, budget, offer, message, pickup, alert, holding, held reply, history or hold end", () => {
    const text = JSON.stringify(guest(c.w));
    const leaks = forbidden(c).filter(([, v]) => text.includes(v)).map(([k, v]) => `${k}: ${v}`);
    expect(leaks).toEqual([]);
    expect(text).not.toMatch(FORBIDDEN_KEYS);
    // ...and the canaries are really in the world: a signed-in party's view has them (a scan for nothing would pass anything).
    const quilla = JSON.stringify(viewOf(c.w, QUILLA, { people: PEOPLE }));
    for (const v of [CANARY.listingNote, CANARY.takeMsg, CANARY.offer, CANARY.goodsMsg, CANARY.area, CANARY.venue, CANARY.eventNote, ROOK.name, emailOf(ROOK),
      "QUILLA-VENMO-CANARY", "quilla.zelle.canary@example.invalid", '"payKinds"', '"paidVia"']) {
      expect(quilla, v).toContain(v);
    }
    // Handles typed with a listing or a held reply (as the page before protocol 2 did) are dropped on the server's path: never stored,
    // so they can't reach anyone. Where to pay is the seller's saved methods (Quilla's, above), copied onto each exchange.
    for (const v of [CANARY.listingPay, CANARY.replyPay]) expect(JSON.stringify(c.w.doc), v).not.toContain(v);
  });

  it("is the same with everyone's profile installed in the engine (the store installs none): the allowlists alone keep names out", () => {
    const without = guest(c.w);
    const withPeople = guest(c.w, { withPeople: true });
    expect(withPeople).toEqual(without);
    // With the people installed, the engine's own event text names the person who added it; none of it is sent.
    const named = E.withEngine({ doc: c.w.doc, people: PEOPLE.map((p) => ({ userId: p.userId, name: p.name, payHandle: p.payHandle })), now: c.w.now }, () => must(E.EV[c.ev], "gala"));
    expect(named.sourcesNote).toBe("Added by Quilla V. · details not checked by Handoff");
    expect(named.blurb).toBe(`From Quilla V.: ${CANARY.eventNote}`);
  });

  it("publishes exactly the open market: the takeable listings with their counts, items on sale, live requests, live events", () => {
    const g = guest(c.w);
    const stamp = (id: string) => must(c.w.doc.listings.find((l) => l.id === id), id).createdAt;
    expect(byId(g.listings)).toEqual(byId([
      // GA: 2 listed, Rook's paid reservation holds 1. Patron: Sage's offer holds nothing. The train ticket: before its departure.
      // Not there: the withdrawn listing, and Sage's reply held for Tarn's request.
      { id: c.l1, eventId: c.ev, tier: "t1", ask: 35, obo: true, available: 1, createdAt: stamp(c.l1) },
      { id: c.l2, eventId: c.ev, tier: "t2", ask: 900, obo: true, available: 1, createdAt: stamp(c.l2) },
      { id: c.lt, eventId: c.train, tier: "t1", ask: 80, obo: false, available: 1, departsAt: wallAfter(T0, 3, "14:11"), createdAt: stamp(c.lt) },
    ]));
    // The desk chair is on hold for Vale: a guest doesn't see it at all (nor that it's held). The bookshelf is on sale.
    expect(g.goods).toEqual([{ id: c.shelf, title: "Bookshelf", cat: "Furniture", cond: "Good", price: 25, obo: false, until: dateAfter(T0, 10),
      createdAt: must(c.w.doc.goods.find((it) => it.id === c.shelf), "shelf").createdAt }]);
    // Tarn's two live requests, anonymized; not Umber's alert, nor Umber's cancelled request.
    const created = (id: string) => must(c.w.doc.interests.find((i) => i.id === id), id).createdAt;
    expect(byId(g.wanted)).toEqual(byId([
      { id: c.fridge, eventId: null, goods: { title: "Mini fridge", cat: "Home & kitchen" }, qty: 1, expires: dateAfter(T0, 10), createdAt: created(c.fridge) },
      { id: c.iso, eventId: c.ev, qty: 1, expires: dateAfter(T0, 5), createdAt: created(c.iso) },
    ]));
    // SELL6-N1 (§9x item 1): Umber's cancelled item request is named as closed, by its id alone (an item request has no event): not
    // who asked, what for, the budget, the note, or that it was cancelled. Umber's alert is never named.
    expect(g.closedWanted).toEqual([{ id: c.closed, eventId: null }]);
    // Not the removed event.
    expect(byId(g.events)).toEqual(byId([
      { id: c.ev, kind: "event", title: "Winter Gala", club: "Wharton Graduate Association", cat: "Parties", start: wallAfter(T0, 10), attend: "all",
        tiers: [{ id: "t1", label: "GA", price: 40 }, { id: "t2", label: "Patron", price: 1000 }], perPerson: 4, deadline: wallAfter(T0, 9, "12:00") },
      { id: c.train, kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", cat: "Travel", start: wallAfter(T0, 1, "06:00"),
        end: wallAfter(T0, 7, "23:00"), openUntil: wallAfter(T0, 7, "23:00"), attend: "all", tiers: [{ id: "t1", label: "Coach", price: 89 }], perPerson: 2, deadline: null },
    ]));
    expect(g).toMatchObject({ protocol: E.HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-c4", serverNow: c.w.now });
  });

  it("carries exactly the guest keys: the envelope and every record (helpers/contract.ts lists them)", () => {
    const g = guest(c.w);
    expect(Object.keys(g).sort()).toEqual([...GUEST_VIEW_KEYS].sort());
    for (const e of g.events) expect(Object.keys(e).every((k) => (GUEST_EVENT_KEYS as readonly string[]).includes(k)), e.id).toBe(true);
    for (const l of g.listings) expect(Object.keys(l).every((k) => (GUEST_LISTING_KEYS as readonly string[]).includes(k)), l.id).toBe(true);
    for (const it of g.goods) expect(Object.keys(it).every((k) => (GUEST_ITEM_KEYS as readonly string[]).includes(k)), it.id).toBe(true);
    for (const i of g.wanted) expect(Object.keys(i).every((k) => (GUEST_WANTED_KEYS as readonly string[]).includes(k)), i.id).toBe(true);
    for (const x of g.closedWanted) expect(Object.keys(x).sort(), x.id).toEqual([...CLOSED_REQUEST_KEYS].sort()); // SELL6-N1: exactly its id and its event
  });
});

// ── Counts: a guest's are every signed-in viewer's ───────────────────────────────────────

/**
 * Problems with the guest view at one step: the contract, and every count against the server's own figures (computed with every
 * request, as each signed-in viewer's numbers are) and a signed-in classmate's view. A listing is in the guest view exactly when
 * anyone signed in could take from it now, with that number; each event's total is what its page tells everyone (stockFor); items
 * are exactly those on sale; public requests exactly Wanted's (liveRequest), with each event's demand.
 */
function agree(w: LiveTestWorld, label: string): string[] {
  const g = guestViewOf(w);
  const problems = guestContractViolations(g).map((p) => `${label}: ${p}`);
  const fay = viewOf(w, FAY);
  const server = E.withEngine({ doc: w.doc, people: w.people, now: w.now }, () => {
    const takeable = new Map<string, number>();
    for (const l of w.doc.listings) {
      const ev = must(E.EV[l.eventId], l.eventId);
      takeable.set(l.id, !l.isoReplyFor && !l.withdrawnAt && !ev.removedAt && E.access(ev).ok ? E.listingNumbers(w.doc, l).available : 0);
    }
    const live = w.doc.events.map((e) => must(E.EV[e.id], e.id)).filter((ev) => !ev.removedAt);
    return {
      takeable,
      stock: new Map(live.map((ev) => [ev.id, E.stockFor(w.doc, ev)])),
      demand: new Map(live.map((ev) => [ev.id, E.demandFor(w.doc, ev)])),
      items: w.doc.goods.filter((it) => E.itemState(w.doc, it).key === "available").map((it) => it.id).sort(),
      wanted: w.doc.interests.filter((i) => E.liveRequest(w.doc, i)).map((i) => i.id).sort(),
    };
  });
  for (const [id, n] of server.takeable) {
    const gl = g.listings.find((l) => l.id === id);
    if ((gl?.available ?? 0) !== n) problems.push(`${label}: listing ${id}: guest ${gl ? gl.available : "absent"}, server ${n}`);
    const fl = fay.listings.find((l) => l.id === id);
    if (n > 0 && fl?.numbers.available !== n) problems.push(`${label}: listing ${id}: a signed-in classmate sees ${fl?.numbers.available}, server ${n}`);
  }
  for (const [id, stock] of server.stock) {
    const total = g.listings.filter((l) => l.eventId === id).reduce((t, l) => t + l.available, 0);
    if (total !== stock) problems.push(`${label}: event ${id}: guest total ${total}, the event page's ${stock}`);
  }
  for (const [id, d] of server.demand) {
    const reqs = g.wanted.filter((i) => i.eventId === id);
    // One open request per person per event (saveInterest updates it), so requests are people.
    if (reqs.length !== d.requests || reqs.length !== d.people || reqs.reduce((t, i) => t + i.qty, 0) !== d.units) {
      problems.push(`${label}: event ${id}: guest demand ${reqs.length}/${reqs.reduce((t, i) => t + i.qty, 0)}, server ${JSON.stringify(d)}`);
    }
  }
  const items = g.goods.map((it) => it.id).sort();
  if (JSON.stringify(items) !== JSON.stringify(server.items)) problems.push(`${label}: items: guest ${items.join(",")}, on sale ${server.items.join(",")}`);
  const wanted = g.wanted.map((i) => i.id).sort();
  if (JSON.stringify(wanted) !== JSON.stringify(server.wanted)) problems.push(`${label}: wanted: guest ${wanted.join(",")}, live ${server.wanted.join(",")}`);
  // Wanted for a signed-in classmate (wantedFor on their view, in the browser) lists the same requests.
  E.setLiveClock(() => fay.serverNow);
  E.applyWorld(fay);
  try {
    const fays = E.wantedFor(fay as unknown as WorldState, E.DISC0).map((i) => i.id).sort();
    if (JSON.stringify(fays) !== JSON.stringify(wanted)) problems.push(`${label}: Wanted: a signed-in classmate's ${fays.join(",")}, guest's ${wanted.join(",")}`);
  } finally {
    E.setLiveClock(null);
    E.applyWorld(null);
  }
  return problems;
}

const availableOf = (w: LiveTestWorld, id: string): number | undefined => guestViewOf(w).listings.find((l) => l.id === id)?.available;

describe("a guest's counts are every signed-in viewer's (coarse availability)", () => {
  it("tickets: right after a hold, a sale, an offer, an accepted offer, a lapse and the last unit; nothing anyone could take isn't there", () => {
    const w = new ServerWorld({ people: PEOPLE });
    const problems: string[] = [];
    const step = (label: string): void => { problems.push(...agree(w, label)); };
    const ev = w.addEvent(QUILLA, { deadline: wallAfter(w.now, 9, "12:00") });
    const l1 = w.listTickets(QUILLA, ev, { qty: 2, obo: true });
    step("listed 2");
    expect(availableOf(w, l1)).toBe(2);
    const r1 = w.take(ROOK, l1);
    step("1 held");
    expect(availableOf(w, l1)).toBe(1);
    w.ok(ROOK.userId, { type: "markPaid", requestId: r1, via: "venmo" }); // Quilla takes two methods (follow-on B1)
    w.ok(QUILLA.userId, { type: "confirmPayment", requestId: r1 });
    step("paid and confirmed");
    w.ok(QUILLA.userId, { type: "markTransferred", requestId: r1 });
    w.ok(ROOK.userId, { type: "buyerReceived", requestId: r1 });
    step("sold");
    expect(availableOf(w, l1)).toBe(1);
    const o = must(w.ok(SAGE.userId, { type: "offer", listingId: l1, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    step("an offer (holds nothing)");
    expect(availableOf(w, l1)).toBe(1);
    w.ok(QUILLA.userId, { type: "accept", requestId: o });
    step("the offer accepted: the last one held");
    expect(availableOf(w, l1)).toBeUndefined();
    const held = must(w.doc.requests.find((r) => r.id === o)?.holdUntil, "the accepted offer's hold end");
    w.advance(held - w.now + MIN);
    step("the accepted offer's hold lapsed, before any sweep");
    expect(availableOf(w, l1)).toBe(1);
    w.sweep();
    step("swept");
    const r2 = w.take(TARN, l1);
    step("the last one held again");
    expect(availableOf(w, l1)).toBeUndefined();
    w.ok(TARN.userId, { type: "cancel", requestId: r2 });
    step("cancelled");
    expect(availableOf(w, l1)).toBe(1);
    w.ok(QUILLA.userId, { type: "withdraw", listingId: l1 });
    step("withdrawn");
    expect(availableOf(w, l1)).toBeUndefined();
    expect(problems).toEqual([]);
  });

  it("closing times: a train's departure, an event's transfer cutoff; a removed event and a held reply never count", () => {
    const w = new ServerWorld({ people: PEOPLE });
    const problems: string[] = [];
    const step = (label: string): void => { problems.push(...agree(w, label)); };
    const now = w.now;
    const ev = w.addEvent(QUILLA, { deadline: wallAfter(now, 4, "12:00") });
    const l = w.listTickets(QUILLA, ev, { qty: 1 });
    const train = must(w.ok(QUILLA.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(now, 1, "06:00"),
      openUntil: wallAfter(now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
    const lt = w.listTickets(QUILLA, train, { qty: 1, ask: "80", paid: "89", method: "file", departsAt: wallAfter(now, 2, "14:11") });
    const iso = w.requestFor(TARN, ev, { budget: "40", days: 4 }); // a request can't outlast the transfer cutoff by more than a day
    w.ok(SAGE.userId, { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@sage", note: "", membersOnly: false } });
    const reply = must(w.doc.listings.find((x) => x.isoReplyFor === iso), "held reply");
    step("open");
    expect([availableOf(w, l), availableOf(w, lt), availableOf(w, reply.id)]).toEqual([1, 1, undefined]);
    w.advance(E.wallToMs(wallAfter(now, 2, "14:11")) - w.now + MIN);
    step("the train left");
    expect(availableOf(w, lt)).toBeUndefined();
    w.advance(E.wallToMs(wallAfter(now, 4, "12:00")) - w.now + MIN);
    step("the transfer cutoff passed");
    expect([availableOf(w, l), guestViewOf(w).wanted]).toEqual([undefined, []]);
    expect(guestViewOf(w).events.map((e) => e.id).sort()).toEqual([ev, train].sort()); // the events stay, as for everyone
    expect(problems).toEqual([]);
  });

  it("items: on sale, requested (still on sale), on hold (gone), the hold lapsed (back, before any sweep), picked up (gone)", () => {
    const w = new ServerWorld({ people: PEOPLE });
    const problems: string[] = [];
    const step = (label: string): void => { problems.push(...agree(w, label)); };
    const chair = w.postItem(QUILLA, { until: dateAfter(w.now, 10) });
    const onSale = (): boolean => guestViewOf(w).goods.some((it) => it.id === chair);
    step("posted");
    expect(onSale()).toBe(true);
    const g1 = must(w.ok(VALE.userId, { type: "requestItem", id: chair, msg: "", shareContact: false }).id, "goods request");
    step("requested");
    expect(onSale()).toBe(true);
    w.ok(QUILLA.userId, { type: "acceptItemReq", id: g1, shareContact: true });
    step("on hold");
    expect(onSale()).toBe(false);
    const until = must(w.doc.goodsReqs.find((g) => g.id === g1)?.holdUntil, "the hold's end");
    w.advance(until - w.now + MIN);
    step("the hold lapsed, before any sweep");
    expect(onSale()).toBe(true);
    w.sweep();
    const g2 = must(w.ok(ROOK.userId, { type: "requestItem", id: chair, msg: "", shareContact: true }).id, "goods request 2");
    w.ok(QUILLA.userId, { type: "acceptItemReq", id: g2, shareContact: true });
    w.ok(ROOK.userId, { type: "itemPickedUp", id: g2 });
    step("picked up");
    expect(onSale()).toBe(false);
    expect(problems).toEqual([]);
  });

  it("Wanted: live public requests only, anonymized; an alert never; an expired or closed request leaves; each event's demand matches", () => {
    const w = new ServerWorld({ people: PEOPLE });
    const problems: string[] = [];
    const step = (label: string): void => { problems.push(...agree(w, label)); };
    const ev = w.addEvent(QUILLA);
    const a = w.requestFor(ROOK, ev, { qty: 2, budget: "37.73", days: 3, note: "Two together, please." });
    const b = w.requestFor(TARN, ev, { qty: 1, budget: "39.93", days: 6 });
    w.ok(UMBER.userId, { type: "joinAlert", eventId: ev, qty: 4, max: "36.63" });
    const fridge = must(w.ok(VALE.userId, { type: "saveInterest", data: { qty: 1, budget: "48.84", note: "Any size.", expires: dateAfter(w.now, 8), goods: { title: "Mini fridge", cat: "Home & kitchen" } } }).id, "fridge");
    step("posted");
    const g = guestViewOf(w);
    expect(g.wanted.map((i) => i.id).sort()).toEqual([a, b, fridge].sort());
    expect(g.wanted.find((i) => i.id === a)).toEqual({ id: a, eventId: ev, qty: 2, expires: dateAfter(T0, 3), createdAt: must(w.doc.interests.find((i) => i.id === a), "a").createdAt });
    const text = JSON.stringify(g);
    for (const v of ["Two together", "Any size", "37.73", "39.93", "36.63", "48.84", "Rookwood", "Tarnwell", "Umberto", "Valerian", ROOK.userId, TARN.userId, UMBER.userId, VALE.userId]) {
      expect(text, v).not.toContain(v);
    }
    w.ok(TARN.userId, { type: "closeInterest", id: b, reason: "fulfilled" });
    step("one fulfilled");
    w.advance(3 * DAY + 12 * HOUR + MIN);
    step("one expired");
    expect(guestViewOf(w).wanted.map((i) => i.id)).toEqual([fridge]);
    expect(problems).toEqual([]);
  });
});

// ── Times ────────────────────────────────────────────────────────────────────────────────

describe("nextRefreshAt: published times only", () => {
  it("a transfer cutoff, a train's departure, a pickup-by date and a request's deadline; never a hold's end (whoever holds it)", () => {
    const w = new ServerWorld({ people: PEOPLE });
    const now = w.now;
    const ev = w.addEvent(QUILLA, { deadline: wallAfter(now, 9, "12:00") });
    const l = w.listTickets(QUILLA, ev, { qty: 3, obo: true });
    const cutoff = E.wallToMs(wallAfter(now, 9, "12:00"));
    expect(guest(w).nextRefreshAt).toBe(cutoff);
    // Two holds: "I'll take it" (minutes) and an accepted offer (hours). The guest's time doesn't move; the seller's does.
    w.take(ROOK, l);
    const o = must(w.ok(SAGE.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    w.ok(QUILLA.userId, { type: "accept", requestId: o });
    expect(guest(w).nextRefreshAt).toBe(cutoff);
    const seller = must(viewOf(w, QUILLA).nextRefreshAt, "the seller's next refresh");
    expect(seller).toBeLessThan(cutoff);
    expect(JSON.stringify(guest(w))).not.toContain(String(seller));
    // Published times, each earlier than the last: a request's deadline, an item's pickup-by date, a train's departure.
    w.requestFor(TARN, ev, { budget: "40", days: 6 });
    expect(guest(w).nextRefreshAt).toBe(E.atMs(dateAfter(now, 6)));
    w.postItem(QUILLA, { until: dateAfter(now, 5) });
    expect(guest(w).nextRefreshAt).toBe(E.atMs(dateAfter(now, 5)));
    const train = must(w.ok(QUILLA.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(now, 1, "06:00"),
      openUntil: wallAfter(now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
    w.listTickets(QUILLA, train, { qty: 1, ask: "80", paid: "89", method: "file", departsAt: wallAfter(now, 2, "14:11") });
    expect(guest(w).nextRefreshAt).toBe(E.wallToMs(wallAfter(now, 2, "14:11")));
  });
});

// ── Allowlists, purity, damage, the seam ─────────────────────────────────────────────────

describe("allowlists, not deletion; plain JSON; damage dropped; the browser installs it", () => {
  it("a field nobody listed never leaves the server, on any record or anything nested in one", () => {
    const c = canaryWorld();
    const doc = structuredClone(c.w.doc) as unknown as Record<string, unknown>;
    let planted = 0;
    const plant = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(plant);
      else if (v && typeof v === "object") {
        for (const x of Object.values(v)) plant(x);
        (v as Record<string, unknown>)["xSecret"] = "CANARY-FIELD";
        planted += 1;
      }
    };
    for (const key of ["events", "holdings", "listings", "requests", "interests", "responses", "goods", "goodsReqs"]) plant(doc[key]);
    expect(planted).toBeGreaterThanOrEqual(40);
    const w = new LiveTestWorld({ people: c.w.people, now: c.w.now, doc: deepFreeze(doc as unknown as LiveWorld) });
    const text = JSON.stringify(guest(w));
    expect(text.includes("CANARY-FIELD") || text.includes("xSecret")).toBe(false);
    expect(guest(w).listings.length).toBe(3); // the planted fields changed nothing else
  });

  it("is plain JSON (no undefined or NaN), never writes into the document, and runs only inside withEngine at its time", () => {
    const c = canaryWorld();
    const before = JSON.stringify(c.w.doc);
    const raw = E.withEngine({ doc: c.w.doc, people: [], now: c.w.now }, () => projectGuest(c.w.doc as unknown as WorldDoc, { worldId: "test-c4", version: 3, now: c.w.now }));
    expect(JSON.parse(JSON.stringify(raw))).toStrictEqual(raw);
    expect(JSON.stringify(c.w.doc)).toBe(before); // the document is deep-frozen too: a write would have thrown
    expect(raw.version).toBe(3);
    const doc = c.w.doc as unknown as WorldDoc;
    expect(() => projectGuest(doc, { worldId: "test-c4", version: 1, now: c.w.now })).toThrow();
    expect(() => E.withEngine({ doc: c.w.doc, people: [], now: c.w.now + 1 }, () => projectGuest(doc, { worldId: "test-c4", version: 1, now: c.w.now }))).toThrow(/at the view's time/);
  });

  it("an empty market: an empty guest view; events leave 30 days after they close, as for everyone", () => {
    const w = new ServerWorld({ people: PEOPLE });
    expect(guest(w, { version: 0 })).toEqual({ protocol: E.HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-c4", version: 0, serverNow: w.now,
      nextRefreshAt: null, events: [], listings: [], goods: [], wanted: [], closedWanted: [] }); // closedWanted: SELL6-N1 (§9x item 1)
    const start = wallAfter(w.now, 2);
    const ev = w.addEvent(QUILLA, { start });
    w.advance(E.atMs(start) + EVENT_KEEP_DAYS * DAY - HOUR - w.now);
    expect(guest(w).events.map((e) => e.id)).toEqual([ev]);
    w.advance(2 * HOUR);
    expect(guest(w).events).toEqual([]);
  });

  it("a listing whose event is gone, and a request on a missing event, are dropped and logged by id; nothing throws", () => {
    const c = canaryWorld();
    const doc = structuredClone(c.w.doc) as LiveWorld;
    must(doc.listings.find((l) => l.id === c.l2), "l2").eventId = "ev-00000000000000aa";
    must(doc.interests.find((i) => i.id === c.iso), "iso").eventId = "ev-00000000000000bb";
    const w = new LiveTestWorld({ people: c.w.people, now: c.w.now, doc: deepFreeze(doc) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = guest(w);
    expect(g.listings.map((l) => l.id)).not.toContain(c.l2);
    expect(g.wanted.map((i) => i.id)).not.toContain(c.iso);
    const logged = warn.mock.calls.map((args) => String(args[0])).join("\n");
    expect(logged).toContain("[handoff] guest view");
    for (const id of [c.l2, c.iso]) expect(logged).toContain(id);
    expect(logged).not.toMatch(/CANARY|@|\$/);
  });

  it("the browser can install a guest view: its events normalize to \"A classmate\" with no venue, notes or names", () => {
    const c = canaryWorld();
    const g = guest(c.w);
    E.setLiveClock(() => g.serverNow);
    E.applyWorld(g);
    try {
      expect(E.EVENTS.map((e) => e.id).sort()).toEqual(g.events.map((e) => e.id).sort());
      expect(Object.keys(E.PEOPLE)).toEqual([]);
      for (const e of E.EVENTS) {
        expect([e.sourcesNote, e.blurb, e.venue, e.officialUrl, e.notes], e.id).toEqual(["Added by A classmate · details not checked by Handoff", "", "", undefined, undefined]);
        expect((e.tiers ?? []).map((t) => t.src), e.id).toEqual((e.tiers ?? []).map(() => "entered by A classmate"));
      }
      const text = JSON.stringify(E.EVENTS);
      for (const [k, v] of forbidden(c)) expect(text.includes(v), k).toBe(false);
      // Each event's count, as its page would show it, from the guest listings alone.
      const gala = must(E.EV[c.ev], "gala");
      expect(E.access(gala).ok).toBe(true);
      expect(g.listings.filter((l) => l.eventId === c.ev).reduce((t, l) => t + l.available, 0)).toBe(2);
    } finally {
      E.setLiveClock(null);
      E.applyWorld(null);
    }
  });
});
