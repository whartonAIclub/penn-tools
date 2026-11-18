// Follow-on Batch 2, simpler closeout (USER-INSTRUCTIONS §9 Batch 2; FOLLOWON-PLAN §1.2 B2.1-B2.6, §1.0 R1-R3, §2.2; C-CONTRACT §1-§3).
// What it shows:
// - "Close listing" and "Close item" are the existing withdrawal (withdraw, withdrawItem), with an optional reason (Sold elsewhere, No
//   longer selling) that's stored only when given, named in the seller's history and sent to the seller alone; closing is never a sale;
// - closing keeps what others committed to: reservations and paid exchanges go on through every step (even past a cutoff), open offers
//   are declined, a held item can't be closed (Pause is offered instead, in the words its panel shows), and nothing new can be taken;
// - what comes back after a close (a hold that lapses, a cancelled or released reservation) goes back to the seller, never on sale, and
//   exactly the freed tickets can be listed again from the same holding ("List again");
// - so does what comes back once nothing can be sold any more (the event started, the transfer window closed, the train left): the
//   seller's release and the buyer's cancel of a disputed payment say so, never "paused" or "back on sale" (W1 fix, OBS-2);
// - a request closes in one step (closeInterest is unchanged); a partial transfer leaves it live for the rest; private alerts stay apart;
// - the invariants close-reason and closed-new, and the store's path (parseAction, the views, the guest view) on a throwaway schema.
// The metrics report's closures and payment stages are in report.test.ts. Labelled test accounts with made-up ids; no sign-in of any kind.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { GoodsRequest, Interest, Item, Listing, LiveWorld, TicketRequest } from "../../engine/index.js";
import { seed } from "../../engine/preview.js";
import { INVALID_ACTION_ERROR } from "../live.js";
import { getGuestView } from "../store.js";
import type { ViewItem, ViewListing, View, WorldId } from "../types.js";
import { contractViolations, guestContractViolations } from "./helpers/contract.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { StoreWorld, TEST_A, TEST_B, TEST_C, actions } from "./helpers/live-store.js";
import { FAY, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, MIN, T0, dateAfter, wallAfter, type TestPerson } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

afterEach(() => {
  E.setLiveClock(null);
  E.applyWorld(null); // back to the preview's catalog between tests
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}
const PAID_ELSEWHERE = "If you did pay Ann, contact them directly: Handoff can't see payments.";
const listingOf = (w: ServerWorld, id: string): Listing => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
const requestOf = (w: ServerWorld, id: string): TicketRequest => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
const itemOf = (w: ServerWorld, id: string): Item => must(w.doc.goods.find((g) => g.id === id), `item ${id}`);
const goodsReqOf = (w: ServerWorld, id: string): GoodsRequest => must(w.doc.goodsReqs.find((g) => g.id === id), `goods request ${id}`);
const interestOf = (w: ServerWorld, id: string): Interest => must(w.doc.interests.find((i) => i.id === id), `interest ${id}`);
const numbers = (w: ServerWorld, l: string) => w.run(() => E.listingNumbers(w.doc, listingOf(w, l)));
/** Can anyone take from this listing now (the event page's own list, which checks the event too)? And its state's label. */
const onSale = (w: ServerWorld, l: string): boolean => w.run(() => E.availableListings(w.doc, listingOf(w, l).eventId).some((x) => x.id === l));
const stateLabel = (w: ServerWorld, l: string): string => w.run(() => E.listingState(w.doc, listingOf(w, l)).label);
const free = (w: ServerWorld, l: string) => w.run(() => E.holdingFree(w.doc, must(w.doc.holdings.find((h) => h.id === listingOf(w, l).holdingId), "holding")));
const lastHistory = (x: { history: { text: string }[] }): string => must(x.history[x.history.length - 1], "a history line").text;
const textsFor = (notes: readonly { userId: string; text: string }[], p: TestPerson): string[] => notes.filter((n) => n.userId === p.userId).map((n) => n.text);
const listingIn = (v: View, id: string): ViewListing | undefined => v.listings.find((l) => l.id === id);
const itemIn = (v: View, id: string): ViewItem | undefined => v.goods.find((g) => g.id === id);
const offer = (listingId: string, amount: string) => ({ type: "offer", listingId, qty: 1, amount, msg: "", member: false });
/** Ann's event (10 days ahead, one $40 tier) with `qty` of her tickets listed at $35, on the server's path. */
function market(qty: number, list: { obo?: boolean } = {}, event: Record<string, unknown> = {}) {
  const w = new ServerWorld();
  const ev = w.addEvent(ANN, event);
  const l = w.listTickets(ANN, ev, { qty, ...list });
  return { w, ev, l };
}
/** Bob reserves 1, then pays; returns the request. */
const takeAndPay = (w: ServerWorld, buyer: TestPerson, l: string): string => {
  const r = w.take(buyer, l);
  w.ok(buyer.userId, { type: "markPaid", requestId: r });
  return r;
};

// ── Close listing ────────────────────────────────────────────────────────────────────────

describe("Close listing: the withdrawal, with an optional reason only the seller sees (B2.2, B2.3)", () => {
  it("closes with each reason or none: stored only when given, named in the seller's history, 0 available, and never a sale", () => {
    for (const [reason, line] of [["soldElsewhere", "Closed by seller: sold elsewhere"], ["noLongerSelling", "Closed by seller: no longer selling"], [undefined, "Closed by seller"]] as const) {
      const { w, l } = market(2);
      const done = w.ok(ANN.userId, { type: "withdraw", listingId: l, ...(reason ? { reason } : {}) });
      expect(done.toast, String(reason)).toBe("Listing closed. 2 tickets are back with you.");
      const x = listingOf(w, l);
      expect(x.withdrawnAt, String(reason)).toBeGreaterThanOrEqual(w.now); // a stamp: the clock, past the last one
      expect("closeReason" in x, `stored only when given (${String(reason)})`).toBe(!!reason);
      if (reason) expect(x.closeReason).toBe(reason);
      expect(lastHistory(x)).toBe(line);
      expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 0 });
      expect(w.doc.requests).toEqual([]); // nothing completed or created: a close is never a sale
      expect(w.run(() => E.listingState(w.doc, x))).toEqual({ key: "withdrawn", label: "Closed", tone: "muted" });
      expect(guestViewOf(w).listings.find((g) => g.id === l)).toBeUndefined();
    }
  });

  it("keeps every reservation and paid exchange, declines open offers, and gives back only what nobody holds (B2.4, R3)", () => {
    const { w, l } = market(4, { obo: true });
    const held = w.take(BOB, l); // reserved, unpaid
    const paid = takeAndPay(w, CAT, l); // the buyer says they paid
    const dan = must(w.ok(DAN.userId, offer(l, "30")).id, "Dan's offer");
    const before = numbers(w, l);
    expect(before).toEqual({ reserved: 2, completed: 0, available: 2 });
    const done = w.ok(ANN.userId, { type: "withdraw", listingId: l, reason: "noLongerSelling" });
    expect(done.toast).toBe("Listing closed. 2 tickets are back with you; reservations already made continue. The open offer was declined.");
    expect(requestOf(w, held).status).toBe("accepted");
    expect(requestOf(w, paid).status).toBe("paid");
    expect(requestOf(w, dan)).toMatchObject({ status: "declined", reason: "Listing withdrawn" });
    expect(textsFor(done.notes, DAN)).toEqual(["A listing you made an offer on for Spring Formal was withdrawn."]);
    expect(textsFor(done.notes, BOB)).toEqual([]); // Bob's and Cat's exchanges go on: nobody tells them otherwise
    expect(textsFor(done.notes, CAT)).toEqual([]);
    expect(numbers(w, l)).toEqual({ reserved: 2, completed: 0, available: 0 }); // the holds are still the buyers'
    expect(free(w, l)).toBe(2); // only the two nobody held came back
    // Everything left held: closing says what continues, and gives nothing back.
    const all = market(1);
    all.w.take(BOB, all.l);
    expect(all.w.ok(ANN.userId, { type: "withdraw", listingId: all.l }).toast).toBe("Listing closed. Reservations already made continue; if one ends unpaid, it comes back to you.");
  });

  it("sends the reason to the seller alone: not to a buyer with a reservation on it, a stranger or a guest", () => {
    const { w, l } = market(2);
    w.take(BOB, l);
    w.ok(ANN.userId, { type: "withdraw", listingId: l, reason: "soldElsewhere" });
    const ann = viewOf(w, ANN), bob = viewOf(w, BOB), fay = viewOf(w, FAY);
    expect(listingIn(ann, l)).toMatchObject({ closeReason: "soldElsewhere", withdrawnAt: listingOf(w, l).withdrawnAt });
    expect(listingIn(bob, l)).toBeDefined();
    expect(listingIn(bob, l)).not.toHaveProperty("closeReason");
    expect(listingIn(fay, l)).not.toHaveProperty("closeReason");
    expect(JSON.stringify(bob)).not.toContain("soldElsewhere");
    expect(JSON.stringify(fay)).not.toContain("soldElsewhere");
    expect(JSON.stringify(guestViewOf(w))).not.toContain("soldElsewhere");
    for (const [v, p] of [[ann, ANN], [bob, BOB], [fay, FAY]] as const) expect(contractViolations(v, p.userId), p.name).toEqual([]);
    expect(guestContractViolations(guestViewOf(w))).toEqual([]);
    // The seller's history names it; nobody else gets a listing's history.
    expect(listingIn(ann, l)?.history?.map((h) => h.text)).toContain("Closed by seller: sold elsewhere");
    expect(listingIn(bob, l)).not.toHaveProperty("history");
  });

  it("refuses a reason that isn't one of the two, on the server's path and in the engine, and changes nothing", () => {
    const { w, l } = market(1);
    const before = w.doc;
    expect(w.no(ANN.userId, { type: "withdraw", listingId: l, reason: "gaveAway" })).toBe(INVALID_ACTION_ERROR);
    expect(w.invalid.map((x) => [x.action.type, x.why.split(":")[0]])).toEqual([["withdraw", "reason"]]); // parseAction: never reached the engine
    // The engine's own check, past the parser (the second line of defense).
    const engineOnly = new ServerWorld({ doc: w.doc, now: w.now });
    expect(engineOnly.run(() => E.reduce(engineOnly.doc, ANN.userId, { type: "withdraw", listingId: l, reason: "gaveAway" }).error)).toBe("Choose Sold elsewhere or No longer selling, or leave the reason out.");
    expect(w.doc).toBe(before);
    // null is "no reason", as the page may send it.
    expect(w.ok(ANN.userId, { type: "withdraw", listingId: l, reason: null }).toast).toBe("Listing closed. 1 ticket is back with you.");
    expect("closeReason" in listingOf(w, l)).toBe(false);
  });

  it("nothing new once closed: take, offer, edit, pause and resume say why; a second close says it's closed (R2)", () => {
    const { w, l } = market(2, { obo: true });
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    const before = w.doc;
    expect(w.no(BOB.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false })).toBe("This listing was withdrawn.");
    expect(w.no(BOB.userId, offer(l, "30"))).toBe("This listing was withdrawn.");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "30" })).toBe("This listing is closed, so it can't be edited.");
    expect(w.no(ANN.userId, { type: "pauseListing", listingId: l })).toBe("This listing is closed, so it can't be paused.");
    expect(w.no(ANN.userId, { type: "resumeListing", listingId: l })).toBe("This listing is closed, so it can't be resumed.");
    expect(w.no(ANN.userId, { type: "withdraw", listingId: l, reason: "soldElsewhere" })).toBe("This listing is already closed.");
    expect(w.no(BOB.userId, { type: "withdraw", listingId: l })).toBe("Listing not found."); // someone else's: as if it weren't there
    expect(w.doc).toBe(before); // no refusal changed anything
  });

  it("the preview keeps its words and stores no reason", () => {
    let s = seed();
    E.applyWorld(s);
    const demo = new Set(Object.entries(E.PEOPLE).filter(([, p]) => p.demo).map(([id]) => id));
    const l = must(s.listings.find((x) => demo.has(x.sellerId) && !x.withdrawnAt && !x.isoReplyFor && E.isQuick(E.EV[x.eventId])), "a demo account's quick listing");
    const res = E.reduce(s, l.sellerId, { type: "withdraw", listingId: l.id, reason: "soldElsewhere" });
    expect(res.toast).toBe("Listing withdrawn. Open offers were declined; reservations already made continue.");
    s = res.state;
    const x = must(s.listings.find((y) => y.id === l.id), "the listing");
    expect("closeReason" in x).toBe(false);
    expect(lastHistory(x)).toBe("Withdrawn by seller");
    E.applyWorld(s);
    expect(E.listingState(s, x).label).toMatch(/^Withdrawn/);
  });
});

// ── After a close ────────────────────────────────────────────────────────────────────────

describe("After a close, what comes back goes to the seller, never on sale (B2.4)", () => {
  it("a hold that lapses is stored as the seller having closed the listing; buyer and seller are told; nobody else", () => {
    const { w, l } = market(2);
    const r = w.take(BOB, l);
    w.advance(MIN);
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    const until = must(requestOf(w, r).holdUntil, "the hold's end");
    w.now = until + 1;
    const swept = w.sweep();
    expect(requestOf(w, r)).toMatchObject({ status: "expired", reason: "The reservation ended without payment. The seller has closed the listing." });
    const at = E.fmtMs(until);
    expect(textsFor(swept.notes, BOB)).toEqual([`Your reservation for Spring Formal ended at ${at} without payment. ${PAID_ELSEWHERE}`]);
    expect(textsFor(swept.notes, ANN)).toEqual([`Bob D.'s reservation of 1 ticket for Spring Formal ended at ${at} without payment. It's back with you.`]);
    expect(swept.notes).toHaveLength(2);
    expect(swept.notes.some((n) => /back on sale/.test(n.text))).toBe(false);
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 0 }); // never back on sale
    expect(free(w, l)).toBe(2); // both with the seller now
    expect(guestViewOf(w).listings.find((g) => g.id === l)).toBeUndefined();
  });

  it("the buyer's cancel and the seller's release say it goes back to the seller, not on sale", () => {
    const { w, l } = market(3);
    const b = w.take(BOB, l), c = w.take(CAT, l);
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    const cancelled = w.ok(BOB.userId, { type: "cancel", requestId: b });
    expect(cancelled.toast).toBe("Reservation cancelled.");
    expect(textsFor(cancelled.notes, ANN)).toEqual(["Bob D. cancelled their reservation for Spring Formal."]);
    expect(w.ok(ANN.userId, { type: "release", requestId: c }).toast).toBe("Hold released. It's back with you, and the listing stays closed.");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 0 });
    expect(free(w, l)).toBe(3);
  });

  it("List again: exactly the freed tickets can be listed again from the same holding; a held one only once its hold ends (B2.6)", () => {
    const { w, ev, l } = market(3);
    const r = w.take(BOB, l);
    w.ok(ANN.userId, { type: "withdraw", listingId: l, reason: "noLongerSelling" });
    const holdingId = listingOf(w, l).holdingId;
    expect(free(w, l)).toBe(2);
    const listAgain = (qty: number) => ({ type: "list", holdingId, qty, ask: "35", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false });
    expect(w.no(ANN.userId, listAgain(3))).toBe("You can list at most 2 tickets: that's what you hold and haven't already listed.");
    const again = must(w.ok(ANN.userId, listAgain(2)).id, "the listing again");
    expect(again).not.toBe(l); // a new listing: the closed one stays closed, with its reservation
    expect(numbers(w, again)).toEqual({ reserved: 0, completed: 0, available: 2 });
    expect(requestOf(w, r).status).toBe("accepted");
    expect(guestViewOf(w).listings.filter((g) => g.eventId === ev).map((g) => [g.id, g.available])).toEqual([[again, 2]]);
    // Bob's hold lapses: that ticket is the seller's to list once more, and only it.
    w.now = must(requestOf(w, r).holdUntil, "the hold's end") + 1;
    w.sweep();
    expect(free(w, l)).toBe(1);
    expect(w.no(ANN.userId, listAgain(2))).toBe("You can list at most 1 ticket: that's what you hold and haven't already listed.");
    expect(w.ok(ANN.userId, listAgain(1)).id).toBeDefined();
  });

  it("paid steps go on after a close, even once the transfer window has closed: Payment received, Transferred, Received, a problem (R1, R3)", () => {
    const { w, l } = market(2, {}, { deadline: wallAfter(T0, 0, "13:00") });
    const r = takeAndPay(w, BOB, l);
    w.advance(MIN);
    w.ok(ANN.userId, { type: "withdraw", listingId: l, reason: "soldElsewhere" });
    w.now = E.wallToMs(wallAfter(T0, 0, "13:05")); // past the transfer cutoff
    w.sweep();
    expect(requestOf(w, r).status).toBe("paid"); // never cancelled, refunded or relisted by a close or a sweep
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    expect(w.ok(BOB.userId, { type: "buyerReceived", requestId: r }).toast).toBe("Received. You're all set.");
    expect(requestOf(w, r).status).toBe("completed");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 1, available: 0 });
    w.ok(BOB.userId, { type: "reportProblem", kind: "ticket", id: r, reason: "The ticket didn't work" });
    expect(listingOf(w, l).closeReason).toBe("soldElsewhere"); // the reason is the seller's note, nothing more
  });
});

// ── After the sale ends ──────────────────────────────────────────────────────────────────

/** Ann's train (valid from 6 AM today for a week, one $89 eTicket type); returns its id. */
const trainEvent = (w: ServerWorld): string => must(w.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak",
  start: wallAfter(T0, 0, "06:00"), openUntil: wallAfter(T0, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
/** The buyer reserves and says they paid; Ann says the payment hasn't arrived (paymentMissing). Returns the request. */
const disputed = (w: ServerWorld, buyer: TestPerson, l: string): string => {
  const r = takeAndPay(w, buyer, l);
  w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
  return r;
};
const CANCELLED = "Reservation cancelled. If you did pay, sort it out with Ann directly: Handoff can't see payments.";

describe("Once nothing can be sold (the event started, the transfer window closed, the train left), what comes back stays with the seller (W1 fix: OBS-2)", () => {
  it("saleEndedWhy: the closure in words, or null while the listing could still sell; only time ends a sale, never a policy", () => {
    const { w, ev, l } = market(1, {}, { start: wallAfter(T0, 1, "08:00"), deadline: wallAfter(T0, 0, "18:00") });
    const why = (over: Partial<E.EngineEvent> = {}) => w.run(() => E.saleEndedWhy({ ...must(E.EV[ev], "the event"), ...over }, listingOf(w, l)));
    expect(why()).toBeNull();
    expect(why({ policy: "official" })).toBeNull(); // the preview's policy change can change back: not an end
    expect(why({ nonTransferable: true })).toBeNull();
    w.now = E.wallToMs(wallAfter(T0, 0, "18:01"));
    expect(why()).toBe(w.run(() => `The transfer window closed ${E.fmtWhen(wallAfter(T0, 0, "18:00"))}.`));
    w.now = E.wallToMs(wallAfter(T0, 1, "08:01"));
    expect(why()).toBe("The event has started.");
    // A train's listing: its train leaves long before the tickets' validity window ends.
    const t = new ServerWorld();
    const train = trainEvent(t);
    const lt = t.listTickets(ANN, train, { paid: "89", ask: "80", method: "file", departsAt: wallAfter(T0, 0, "15:00") });
    const tw = () => t.run(() => E.saleEndedWhy(must(E.EV[train], "the train"), listingOf(t, lt)));
    expect(tw()).toBeNull();
    t.now = E.wallToMs(wallAfter(T0, 0, "15:00"));
    expect(tw()).toBe("The train has left.");
  });

  it("the seller's release after the event starts says it's back with them: never \"back with the seller\", \"paused\" or on sale; so does a paused listing's", () => {
    const { w, l } = market(2, {}, { start: wallAfter(T0, 1, "08:00") }); // 20 hours away: a disputed payment's wait is an hour
    const rb = disputed(w, BOB, l), rc = disputed(w, CAT, l);
    const ev2 = w.addEvent(ANN, { title: "Winter Formal", start: wallAfter(T0, 1, "09:00") });
    const l2 = w.listTickets(ANN, ev2, { qty: 1 });
    const rd = disputed(w, DAN, l2);
    w.ok(ANN.userId, { type: "pauseListing", listingId: l2 }); // paused before the start: the start still ends the sale
    w.now = E.wallToMs(wallAfter(T0, 1, "09:05")); // both events have started; the hour's wait is long over
    const released = w.ok(ANN.userId, { type: "release", requestId: rb });
    expect(released.toast).toBe("Released. It's back with you (the event has started).");
    expect(requestOf(w, rb)).toMatchObject({ status: "released", reason: "Released by the seller: the payment didn't arrive" });
    expect(textsFor(released.notes, BOB)).toEqual(["Ann released the reservation for Spring Formal, saying the payment didn't arrive. If you did pay, contact them directly: Handoff can't see payments."]);
    expect(w.ok(ANN.userId, { type: "release", requestId: rd }).toast).toBe("Released. It's back with you (the event has started).");
    // The buyer's cancel after the start says nothing about it going back on sale.
    expect(w.ok(CAT.userId, { type: "cancel", requestId: rc }).toast).toBe(CANCELLED);
    // Nothing is held, and nothing is on sale: listingNumbers counts tickets, not the event's state, so "on sale" is availableListings'.
    expect(numbers(w, l)).toMatchObject({ reserved: 0, completed: 0 });
    expect(numbers(w, l2)).toMatchObject({ reserved: 0, completed: 0 });
    expect([onSale(w, l), onSale(w, l2)]).toEqual([false, false]);
    expect([stateLabel(w, l), stateLabel(w, l2)]).toEqual(["Event started", "Event started"]);
    expect(guestViewOf(w).listings.find((g) => g.id === l || g.id === l2)).toBeUndefined();
  });

  it("after the transfer window closes, and after the train leaves: the release and the cancel say so in the same way", () => {
    // The transfer window closes at 1 PM today; the event is 10 days off, so a disputed payment's wait is a day.
    const { w, l } = market(2, {}, { deadline: wallAfter(T0, 0, "13:00") });
    const rb = disputed(w, BOB, l), rc = disputed(w, CAT, l);
    w.advance(DAY + MIN);
    const closed = w.run(() => `the transfer window closed ${E.fmtWhen(wallAfter(T0, 0, "13:00"))}`);
    expect(w.ok(ANN.userId, { type: "release", requestId: rb }).toast).toBe(`Released. It's back with you (${closed}).`);
    expect(w.ok(CAT.userId, { type: "cancel", requestId: rc }).toast).toBe(CANCELLED);
    expect(onSale(w, l)).toBe(false);
    expect(stateLabel(w, l)).toBe("Transfer window closed");
    // A train whose listing departs at 3 PM today: the wait is an hour, and the train leaves before anyone can buy again.
    const t = new ServerWorld();
    const lt = t.listTickets(ANN, trainEvent(t), { qty: 2, paid: "89", ask: "80", method: "file", departsAt: wallAfter(T0, 0, "15:00") });
    const tb = disputed(t, BOB, lt), tc = disputed(t, CAT, lt);
    t.now = E.wallToMs(wallAfter(T0, 0, "15:05"));
    expect(t.ok(ANN.userId, { type: "release", requestId: tb }).toast).toBe("Released. It's back with you (the train has left)."); // it said "It's available again."
    expect(t.ok(CAT.userId, { type: "cancel", requestId: tc }).toast).toBe(CANCELLED);
    expect(numbers(t, lt).available).toBe(0);
    expect([onSale(t, lt), stateLabel(t, lt)]).toEqual([false, "Train departed"]);
  });

  it("while the listing can still sell, the words are as before: available again, back on sale", () => {
    const { w, l } = market(3);
    const rb = disputed(w, BOB, l), rc = disputed(w, CAT, l);
    w.now = must(requestOf(w, rb).releaseAfter, "the release time");
    expect(w.ok(ANN.userId, { type: "release", requestId: rb }).toast).toBe("Released. It's available again.");
    expect(w.ok(CAT.userId, { type: "cancel", requestId: rc }).toast).toBe("Reservation cancelled. It's back on sale. If you did pay, sort it out with Ann directly: Handoff can't see payments.");
    expect(numbers(w, l).available).toBe(3);
    expect(onSale(w, l)).toBe(true);
  });
});

// ── Close item ───────────────────────────────────────────────────────────────────────────

describe("Close item: never a shortcut past a buyer's hold (B2.4)", () => {
  it("is refused while a buyer holds it, in the words its panel shows; Pause still works; once the hold ends it closes", () => {
    const w = new ServerWorld();
    const it = w.postItem(ANN);
    const g = must(w.ok(BOB.userId, { type: "requestItem", id: it, msg: "", shareContact: true }).id, "Bob's request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    const until = must(goodsReqOf(w, g).holdUntil, "the hold's end");
    const before = w.doc;
    const why = `On hold for Bob until ${E.fmtMs(until)}. You can close it once the hold ends; Pause stops new requests now.`;
    expect(w.no(ANN.userId, { type: "withdrawItem", id: it, reason: "soldElsewhere" })).toBe(why);
    expect(w.doc).toBe(before);
    expect(w.run(() => E.closeHeldWhy(itemOf(w, it), goodsReqOf(w, g)))).toBe(why); // the page's words are the engine's
    w.ok(ANN.userId, { type: "pauseItem", id: it });
    expect(w.no(ANN.userId, { type: "withdrawItem", id: it })).toBe(`On hold for Bob until ${E.fmtMs(until)}. You can close it once the hold ends.`);
    expect(goodsReqOf(w, g).status).toBe("accepted"); // Bob's hold is untouched
    w.ok(BOB.userId, { type: "cancelItemReq", id: g });
    const done = w.ok(ANN.userId, { type: "withdrawItem", id: it, reason: "noLongerSelling" });
    expect(done.toast).toBe("Item closed.");
    expect(itemOf(w, it)).toMatchObject({ closeReason: "noLongerSelling", withdrawnAt: expect.any(Number) });
    expect(lastHistory(itemOf(w, it))).toBe("Closed by seller: no longer selling");
    // A hold that lapses ends it too.
    const lapse = new ServerWorld();
    const it2 = lapse.postItem(ANN);
    const g2 = must(lapse.ok(CAT.userId, { type: "requestItem", id: it2, msg: "", shareContact: true }).id, "Cat's request");
    lapse.ok(ANN.userId, { type: "acceptItemReq", id: g2, shareContact: true });
    lapse.now = must(goodsReqOf(lapse, g2).holdUntil, "the hold's end") + 1;
    lapse.sweep();
    expect(lapse.ok(ANN.userId, { type: "withdrawItem", id: it2 }).toast).toBe("Item closed.");
  });

  it("declines open requests, keeps the reason for the seller only, and sells nothing", () => {
    const w = new ServerWorld();
    const it = w.postItem(ANN, { obo: true });
    const c = must(w.ok(CAT.userId, { type: "requestItem", id: it, msg: "", shareContact: true }).id, "Cat's request");
    const d = must(w.ok(DAN.userId, { type: "requestItem", id: it, offer: "25", msg: "", shareContact: false }).id, "Dan's offer");
    const done = w.ok(ANN.userId, { type: "withdrawItem", id: it, reason: "soldElsewhere" });
    expect(done.toast).toBe("Item closed. 2 open requests were declined.");
    expect([goodsReqOf(w, c).status, goodsReqOf(w, d).status]).toEqual(["declined", "declined"]);
    expect(textsFor(done.notes, CAT)).toEqual(['"Desk chair" was withdrawn by the seller.']);
    const x = itemOf(w, it);
    expect(x.soldAt).toBeUndefined();
    expect(w.doc.goodsReqs.some((g) => g.status === "completed")).toBe(false);
    const ann = viewOf(w, ANN), cat = viewOf(w, CAT);
    expect(itemIn(ann, it)).toMatchObject({ closeReason: "soldElsewhere", state: { key: "withdrawn", label: "Closed" } });
    expect(itemIn(cat, it)).not.toHaveProperty("closeReason");
    expect(itemIn(cat, it)?.state.label).toBe("Closed");
    expect(JSON.stringify(cat)).not.toContain("soldElsewhere");
    expect(guestViewOf(w).goods.find((g) => g.id === it)).toBeUndefined();
    for (const [v, p] of [[ann, ANN], [cat, CAT]] as const) expect(contractViolations(v, p.userId), p.name).toEqual([]);
    expect(w.no(ANN.userId, { type: "withdrawItem", id: it })).toBe("This item is already closed.");
    expect(w.no(ANN.userId, { type: "resumeItem", id: it })).toBe("This item is closed, so it can't be resumed.");
  });
});

// ── Requests ─────────────────────────────────────────────────────────────────────────────

describe("Requests close in one step; what's still wanted stays live; alerts stay apart (B2.5)", () => {
  it("3 asked, 1 received: the request stays live for 2 and the alert keeps its own; Mark fulfilled closes only the request", () => {
    const { w, ev, l } = market(3);
    const iso = w.requestFor(DAN, ev, { qty: 3, budget: "40" });
    const alert = must(w.ok(DAN.userId, { type: "joinAlert", eventId: ev, qty: 3, max: "" }).id, "Dan's alert");
    const r = takeAndPay(w, DAN, l);
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    w.ok(DAN.userId, { type: "buyerReceived", requestId: r });
    expect(interestOf(w, iso)).toMatchObject({ status: "open", qty: 2 });
    expect(interestOf(w, alert)).toMatchObject({ status: "open", qty: 2, kind: "alert" });
    expect(w.run(() => E.liveRequest(w.doc, interestOf(w, iso)))).toBe(true);
    expect(guestViewOf(w).wanted.map((x) => [x.id, x.qty])).toEqual([[iso, 2]]);
    // One step, no confirmation: closeInterest as before.
    expect(w.ok(DAN.userId, { type: "closeInterest", id: iso, reason: "fulfilled" }).toast).toBe("Marked fulfilled. It's off Wanted now.");
    expect(interestOf(w, iso)).toMatchObject({ status: "closed", closedReason: "fulfilled", closedAt: expect.any(Number) });
    expect(interestOf(w, alert)).toMatchObject({ status: "open", qty: 2 }); // the private alert is apart: still on
    expect(guestViewOf(w).wanted).toEqual([]);
    expect(viewOf(w, ANN).interests.some((i) => i.id === alert)).toBe(false); // nobody else ever sees an alert
    expect(w.ok(DAN.userId, { type: "setAlert", id: alert, paused: true }).toast).toBe("Alert paused. It won't alert you until you resume it.");
    expect(w.ok(DAN.userId, { type: "closeInterest", id: alert }).toast).toBe("Alert removed. You won't get alerts for it.");
  });

  it("Cancel request closes a request at once; a second press is refused in words; nothing reserved changes", () => {
    const w = new ServerWorld();
    const iso = must(w.ok(DAN.userId, { type: "saveInterest", data: { qty: 1, budget: "20", note: "", expires: dateAfter(w.now, 5), goods: { title: "Desk lamp", cat: "Furniture" } } }).id, "Dan's request");
    const before = JSON.stringify([w.doc.listings, w.doc.requests, w.doc.goods, w.doc.goodsReqs]);
    expect(w.ok(DAN.userId, { type: "closeInterest", id: iso, reason: "cancelled" }).toast).toBe("Request cancelled. It's off Wanted now.");
    expect(w.no(DAN.userId, { type: "closeInterest", id: iso, reason: "cancelled" })).toBe("Already closed.");
    expect(JSON.stringify([w.doc.listings, w.doc.requests, w.doc.goods, w.doc.goodsReqs])).toBe(before);
  });
});

// ── Invariants ───────────────────────────────────────────────────────────────────────────

describe("Invariants: a close reason only on a closed record, and nothing taken after a close", () => {
  it("flags close-reason and closed-new, which the store refuses when a change introduces them", () => {
    const { w, l } = market(2);
    const r = w.take(BOB, l);
    const it = w.postItem(ANN);
    const g = must(w.ok(CAT.userId, { type: "requestItem", id: it, msg: "", shareContact: true }).id, "Cat's request");
    const doc = JSON.parse(JSON.stringify(w.doc)) as LiveWorld & { listings: (Listing & { closeReason?: unknown })[]; goods: (Item & { closeReason?: unknown })[] };
    const check = () => E.withEngine({ doc, people: [], now: w.now }, () => E.invariantViolations(doc));
    expect(check()).toEqual([]);
    must(doc.listings.find((x) => x.id === l), "listing").closeReason = "soldElsewhere"; // a reason on an open listing
    expect(check()).toContain(`close-reason:${l}`);
    const x = must(doc.listings.find((y) => y.id === l), "listing");
    x.withdrawnAt = w.now; (x as { closeReason?: unknown }).closeReason = "gaveAway"; // a reason that isn't one
    expect(check()).toContain(`close-reason:${l}`);
    x.closeReason = "noLongerSelling";
    expect(check()).not.toContain(`close-reason:${l}`);
    // Bob's reservation, made after the close: nothing new is taken once closed.
    x.withdrawnAt = must(doc.requests.find((q) => q.id === r), "request").createdAt - 1;
    expect(check()).toContain(`closed-new:${r}`);
    const item = must(doc.goods.find((y) => y.id === it), "item");
    item.withdrawnAt = must(doc.goodsReqs.find((q) => q.id === g), "goods request").createdAt - 1;
    expect(check()).toContain(`closed-new:${g}`);
    item.closeReason = "soldElsewhere";
    expect(check()).not.toContain(`close-reason:${it}`);
  });
});

// ── Through the store (Postgres) ─────────────────────────────────────────────────────────

describe.skipIf(!databaseUrl)("Close through the store: parsed, stored, and sent to the seller only (Postgres)", () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb("closeout"); }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("stores the reason, gives the seller's view the reason, the buyer's and the guest's none; refusals add no version", async () => {
    const w = new StoreWorld(db.sql, "test-closeout" as WorldId, T0);
    const ev = await w.createEvent(TEST_A);
    const l = await w.list(TEST_A, ev, { qty: 3, ask: "35" });
    w.advance(MIN);
    const r = must((await w.ok(TEST_B, actions.take(l))).resultId, "B's reservation");
    w.advance(MIN);
    const bad = await w.act(TEST_A, { type: "withdraw", listingId: l, reason: "gaveAway" });
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    const v0 = (await w.row())?.version;
    const done = await w.ok(TEST_A, { type: "withdraw", listingId: l, reason: "soldElsewhere" });
    expect(done.toast).toBe("Listing closed. 2 tickets are back with you; reservations already made continue.");
    const row = must(await w.row(), "the world");
    expect(row.version).toBe((v0 ?? 0) + 1);
    expect(must(row.doc.listings.find((x) => x.id === l), "stored listing")).toMatchObject({ closeReason: "soldElsewhere" });
    const a = await w.view(TEST_A), b = await w.view(TEST_B), c = await w.view(TEST_C); // each checked against C-CONTRACT §2
    expect(listingIn(a, l)).toMatchObject({ closeReason: "soldElsewhere", numbers: { reserved: 1, completed: 0, available: 0 } });
    expect(listingIn(b, l)).not.toHaveProperty("closeReason");
    expect(b.requests.find((x) => x.id === r)?.status).toBe("accepted"); // B's reservation goes on
    expect(listingIn(c, l)).not.toHaveProperty("closeReason");
    const guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    expect(guest.listings.some((x) => x.id === l)).toBe(false);
    expect(JSON.stringify([b, c, guest])).not.toContain("soldElsewhere");
    // A second close from a tab that hadn't caught up: refused in words, with the fresh view, and no new version.
    const again = await w.refused(TEST_A, { type: "withdraw", listingId: l, reason: "noLongerSelling" });
    expect(again.error).toBe("This listing is already closed.");
    expect((await w.row())?.version).toBe(row.version);
    expect(listingIn(again.view, l)).toMatchObject({ closeReason: "soldElsewhere" });
  });
});
