// A seller's Edit and Pause/Resume for their own ticket listings and Goods items (USER-INSTRUCTIONS §7 item 4 and §8;
// C-CONTRACT.md §8; DEVIATIONS.md D65), on the server's path: parseAction, then the engine as the signed-in user, with every view
// projected as store.ts builds it and checked against the contract. What it shows:
// - only the seller edits, pauses or resumes (authorization.test.ts has the table; here the records stay unchanged too);
// - an edit is for what happens next: reservations, accepted offers, open offers, counters and goods requests keep their prices,
//   and the price rules still apply (the original-price cap, the lowest offer, an open offer the price can't drop to);
// - a pause stops new availability: nothing can be reserved, offered on, requested, accepted or countered; it isn't counted or
//   shown as available to anyone else, signed in or a guest, nor matched; the seller sees it paused;
// - what was already agreed stays actionable while paused, and a ticket or item that comes back stays off sale until the resume;
// - open offers and requests stay open with their own deadlines, their buyers are told, and on resume they can be accepted again;
// - resume only when still eligible, with a reason when not; it tells classmates who started looking meanwhile, once;
// - history records each edit, pause and resume, for the seller only.
// The people are labelled test accounts with made-up ids; no database and no sign-in (edit-pause-store.test.ts has the database).
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { GoodsRequest, Item, Listing, TicketRequest, WorldState } from "../../engine/index.js";
import { actionIds, parseAction } from "../live.js";
import type { GuestView, View } from "../types.js";
import { contractViolations, guestContractViolations } from "./helpers/contract.js";
import { FAY, PEOPLE6, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, HOUR, MIN, type TestPerson, dateAfter, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

afterEach(() => {
  E.setLiveClock(null);
  E.applyWorld(null);
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}
const listingOf = (w: ServerWorld, id: string): Listing => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
const requestOf = (w: ServerWorld, id: string): TicketRequest => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
const itemOf = (w: ServerWorld, id: string): Item => must(w.doc.goods.find((x) => x.id === id), `item ${id}`);
const goodsReqOf = (w: ServerWorld, id: string): GoodsRequest => must(w.doc.goodsReqs.find((g) => g.id === id), `goods request ${id}`);
const offer = (w: ServerWorld, who: TestPerson, listingId: string, amount: string, qty = 1): string =>
  must(w.ok(who.userId, { type: "offer", listingId, qty, amount, msg: "", member: false }).id, "offer");
const requestItem = (w: ServerWorld, who: TestPerson, id: string, offerAmount?: string): string =>
  must(w.ok(who.userId, { type: "requestItem", id, ...(offerAmount ? { offer: offerAmount } : {}), msg: "", shareContact: true }).id, "goods request");
/** The viewer's view, checked against C-CONTRACT §2. */
function view(w: ServerWorld, who: TestPerson): View {
  const v = viewOf(w, who);
  expect(contractViolations(v, who.userId), `${who.name}'s view`).toEqual([]);
  return v;
}
/** The guest view, checked against C-CONTRACT §7. */
function guest(w: ServerWorld): GuestView {
  const g = guestViewOf(w);
  expect(guestContractViolations(g)).toEqual([]);
  return g;
}
/** What a page computes from a view in the browser (setLiveClock, applyWorld), as the live UI does. */
function inBrowser<T>(v: View, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => v.serverNow);
  E.applyWorld(v);
  try {
    return fn(v as unknown as WorldState);
  } finally {
    E.setLiveClock(null);
    E.applyWorld(null);
  }
}
const textsFor = (w: ServerWorld, who: TestPerson): string[] => w.notesFor(who.userId).map((n) => n.text);

/** Ann's Spring Formal ($40 face value), with `qty` tickets she paid $40 for listed at $35, taking offers from $20. */
function market(qty = 2, o: Parameters<ServerWorld["listTickets"]>[2] = {}) {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = w.addEvent(ANN);
  const l = w.listTickets(ANN, ev, { qty, obo: true, minOffer: "20", ...o });
  return { w, ev, l };
}
/** Ann's desk chair at $30, taking offers from $15. */
function goodsMarket() {
  const w = new ServerWorld({ people: PEOPLE6 });
  const it = w.postItem(ANN, { obo: true, minOffer: "15", note: "Barely used." });
  return { w, it };
}

describe("editListing: the seller's own listing, for what happens next", () => {
  it("only the seller can edit it; a buyer with a reservation, one with an open offer and a stranger are refused, and nothing changes", () => {
    const { w, l } = market();
    w.take(BOB, l);
    offer(w, CAT, l, "25");
    const before = JSON.stringify(w.doc);
    for (const who of [BOB, CAT, FAY]) expect(w.no(who.userId, { type: "editListing", listingId: l, ask: "20", note: "mine now" })).toBe("Listing not found.");
    expect(JSON.stringify(w.doc)).toBe(before);
    expect(w.invalid).toEqual([]); // the engine refused them: the shape was fine, only the actor wasn't
  });

  it("changes the asking price and note for new reservations and offers only: every existing one keeps its price", () => {
    const { w, ev, l } = market(4);
    const taken = w.take(BOB, l); // a reservation at $35
    const accepted = offer(w, DAN, l, "28");
    w.ok(ANN.userId, { type: "accept", requestId: accepted }); // an accepted offer at $28
    const open = offer(w, EVE, l, "26"); // an open offer
    const countered = offer(w, CAT, l, "25");
    w.ok(ANN.userId, { type: "counter", requestId: countered, amount: "30" }); // a counter at $30
    const before = { taken: requestOf(w, taken), accepted: requestOf(w, accepted), open: requestOf(w, open), countered: requestOf(w, countered) };

    const done = w.ok(ANN.userId, { type: "editListing", listingId: l, ask: "38", obo: true, minOffer: "20", note: "Row C, on the aisle." });
    expect(done.toast).toBe("Listing updated. Reservations and offers already made keep their prices.");
    expect(done.notes).toEqual([]); // an edit tells nobody
    expect(listingOf(w, l)).toMatchObject({ ask: 38, note: "Row C, on the aisle.", obo: true, minOffer: 20, createdAt: listingOf(w, l).createdAt });
    for (const [k, r] of Object.entries(before)) expect(requestOf(w, r.id), k).toEqual(r); // not a field changed, history included

    // Bob pays what he reserved at; the next buyer takes at the new price.
    w.ok(BOB.userId, { type: "markPaid", requestId: taken });
    expect(requestOf(w, taken).history.at(-1)?.text).toBe("Buyer said they paid $35 (self-reported)");
    const next = w.take(FAY, l);
    expect(requestOf(w, next).price).toBe(38);
    // Eve's open offer is accepted at what she offered; that was the last ticket, so Cat's counter closes, still at $30.
    expect(w.ok(ANN.userId, { type: "accept", requestId: open }).toast).toMatch(/^Offer accepted\./);
    expect(requestOf(w, open).price).toBe(26);
    expect(requestOf(w, countered)).toMatchObject({ status: "declined", reason: "Another buyer reserved it first", price: 25, counterPrice: 30 });
    // Every viewer's counts agree, and the seller's view says what was changed.
    const ann = view(w, ANN);
    expect(ann.listings.find((x) => x.id === l)).toMatchObject({ ask: 38, note: "Row C, on the aisle.", numbers: { reserved: 4, completed: 0, available: 0 } });
    expect(ann.listings.find((x) => x.id === l)?.history?.map((h) => h.text)).toEqual(["Listed 4 tickets at $35", "Edited: price $35 to $38, description"]);
    expect(view(w, BOB).requests.find((r) => r.id === taken)?.price).toBe(35);
    expect(view(w, FAY).listings.find((x) => x.id === l)).not.toHaveProperty("history"); // history is the seller's
    void ev;
  });

  it("lowering: never to an open offer or counter (answer it first), and an offer above the new price can't exist", () => {
    const { w, l } = market(2);
    const o = offer(w, CAT, l, "25");
    w.ok(ANN.userId, { type: "counter", requestId: o, amount: "30" });
    offer(w, DAN, l, "27");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "30" })).toBe("You countered an offer at $30. Keep the price above $30 until the buyer answers it.");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "22" })).toBe("You countered an offer at $30. Keep the price above $30 until the buyer answers it.");
    w.ok(CAT.userId, { type: "respond", requestId: o, accept: false }); // Cat declines the counter
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "27" })).toBe("There's an open offer of $27 on this listing. Keep the price above $27, or answer the offer first.");
    expect(w.ok(ANN.userId, { type: "editListing", listingId: l, ask: "28" }).toast).toBe("Listing updated. Reservations and offers already made keep their prices.");
    // A new offer is checked against the new price.
    expect(w.no(EVE.userId, { type: "offer", listingId: l, qty: 1, amount: "29", msg: "", member: false })).toMatch(/^An offer has to be below the asking price \(\$28\)/);
  });

  it("keeps the price rules: the face-value cap, the lowest offer, a real amount; offers end at $0; a field left out keeps its value", () => {
    const { w, l } = market(2, { paid: "30", ask: "28" }); // paid $30 for a $40 ticket
    // Forms round 2: an edit is capped by the face value ($40) alone; what was paid ($30) no longer caps it.
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "41" })).toBe("Asking price can't be more than the face value ($40).");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "" })).toBe("Asking price: Enter an amount.");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "3.333" })).toBe("Asking price: Enter a non-negative amount with at most two decimals.");
    // The lowest offer ($20) has to stay below the price, whether it's kept or sent.
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "20" })).toBe("Lowest offer has to be above $0 and below your asking price ($20).");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, ask: "25", minOffer: "25" })).toBe("Lowest offer has to be above $0 and below your asking price ($25).");
    w.ok(ANN.userId, { type: "editListing", listingId: l, ask: "20", minOffer: "" });
    expect(listingOf(w, l)).toMatchObject({ ask: 20, obo: true });
    expect(listingOf(w, l)).not.toHaveProperty("minOffer");
    // The note alone: the price stays; nothing changed is refused.
    expect(w.ok(ANN.userId, { type: "editListing", listingId: l, note: "Front row." }).toast).toBe("Listing updated.");
    expect(listingOf(w, l)).toMatchObject({ ask: 20, note: "Front row." });
    expect(w.no(ANN.userId, { type: "editListing", listingId: l, note: "Front row." })).toBe("Nothing changed: the listing already has that price and description.");
    expect(w.no(ANN.userId, { type: "editListing", listingId: l })).toBe("Nothing changed: the listing already has that price and description.");
    // Free at $0: offers end, as when listing.
    w.ok(ANN.userId, { type: "editListing", listingId: l, ask: "0", obo: true, minOffer: "5" });
    expect(listingOf(w, l)).toMatchObject({ ask: 0, obo: false });
    expect(listingOf(w, l).history.map((h) => h.text)).toEqual(["Listed 2 tickets at $28", "Edited: price $28 to $20, no lowest offer", "Edited: description", "Edited: price $20 to $0, offers off"]);
  });

  it("is refused, saying why, on a held reply and on a listing that can't sell anything more", () => {
    // A held reply: withdraw it instead.
    const m = market(1);
    const iso = m.w.requestFor(DAN, m.ev, { budget: "40" });
    const held = must(m.w.ok(EVE.userId, { type: "addThen", add: { eventId: m.ev, tier: "t1", qty: 1, paid: "40" }, then: { type: "isoReply", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@eve-park", note: "", membersOnly: false } }).id, "held reply");
    const reply = requestOf(m.w, held).listingId;
    expect(m.w.no(EVE.userId, { type: "editListing", listingId: reply, ask: "30" })).toBe("This is a reply held for one request, so it can't be edited. Withdraw it if it needs to change.");
    expect(m.w.no(EVE.userId, { type: "pauseListing", listingId: reply })).toBe("This is a reply held for one request, so it can't be paused. Withdraw it if it needs to change.");
    // Closed ("Close listing", follow-on B2's words); every ticket transferred.
    m.w.ok(ANN.userId, { type: "withdraw", listingId: m.l });
    expect(m.w.no(ANN.userId, { type: "editListing", listingId: m.l, ask: "30" })).toBe("This listing is closed, so it can't be edited.");
    const t = market(1);
    const r = t.w.take(BOB, t.l);
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) t.w.ok(who.userId, { type, requestId: r });
    expect(t.w.no(ANN.userId, { type: "editListing", listingId: t.l, ask: "30" })).toBe("All the tickets on this listing have been transferred, so it can't be edited.");
    // The event started.
    const s = market(1);
    s.w.advance(11 * DAY);
    expect(s.w.no(ANN.userId, { type: "editListing", listingId: s.l, ask: "30" })).toBe("The event has started, so this listing can't be edited.");
  });
});

describe("pauseListing: nothing new until it's resumed", () => {
  /** Ann's 3 tickets: Bob reserved one, Cat has an open $30 offer, and Dan's $25 offer has Ann's $28 counter. Then Ann pauses. */
  function paused() {
    const m = market(3);
    const r = m.w.take(BOB, m.l);
    const catOffer = offer(m.w, CAT, m.l, "30");
    const danOffer = offer(m.w, DAN, m.l, "25");
    m.w.ok(ANN.userId, { type: "counter", requestId: danOffer, amount: "28" });
    const before = { r: requestOf(m.w, r), catOffer: requestOf(m.w, catOffer), danOffer: requestOf(m.w, danOffer) };
    const done = m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l });
    return { ...m, r, catOffer, danOffer, before, done };
  }

  it("stops new reservations, offers, accepting and countering; what was agreed, and the open offers, stay as they were", () => {
    const { w, l, r, catOffer, danOffer, before, done } = paused();
    expect(done.toast).toBe("Listing paused. Classmates can't reserve it or make offers until you resume it. Reservations already made continue. The 2 open offers stay open, but can't be accepted until you resume it.");
    // The two buyers with an open offer or counter are told; nobody else (Bob's reservation goes on, so nothing changes for him).
    expect(Object.fromEntries(done.notes.map((n) => [n.userId, [n.text, n.link]]))).toEqual({
      [DAN.userId]: ["Ann paused their listing for Spring Formal, so you can't accept their counter-offer until they resume it. You can still decline it.", { name: "activity", tab: "requests" }],
      [CAT.userId]: ["Ann paused their listing for Spring Formal. Your offer stays open, but they can't accept it until they resume the listing.", { name: "activity", tab: "requests" }],
    });
    for (const [k, x] of Object.entries(before)) expect(requestOf(w, x.id), k).toEqual(x); // statuses, prices, deadlines unchanged
    const PAUSED = "The seller has paused this listing, so it can't be reserved or offered on right now.";
    expect(w.no(EVE.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false })).toBe(PAUSED);
    expect(w.no(EVE.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false })).toBe(PAUSED);
    expect(w.no(ANN.userId, { type: "accept", requestId: catOffer })).toBe("You paused this listing. Resume it to accept offers.");
    const third = requestOf(w, catOffer);
    expect(third.status).toBe("pending");
    expect(w.no(DAN.userId, { type: "respond", requestId: danOffer, accept: true, member: false })).toBe("The seller has paused this listing, so you can't accept the counter-offer right now. You can still decline it.");
    expect(w.no(ANN.userId, { type: "pauseListing", listingId: l })).toBe("This listing is already paused.");
    // Bob's reservation goes on.
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    w.ok(BOB.userId, { type: "buyerReceived", requestId: r });
    expect(requestOf(w, r).status).toBe("completed");
    expect(listingOf(w, l).history.map((h) => h.text)).toContain("Paused: no new reservations or offers until it's resumed");
  });

  it("a counter can still be declined, an offer withdrawn or declined, and an open offer lapses at its own deadline", () => {
    const { w, catOffer, danOffer } = paused();
    expect(w.no(ANN.userId, { type: "counter", requestId: catOffer, amount: "33" })).toBe("You paused this listing. Resume it to counter offers.");
    w.ok(DAN.userId, { type: "respond", requestId: danOffer, accept: false });
    expect(requestOf(w, danOffer).status).toBe("declined");
    // Cat's offer lapses at its own deadline, with the usual words.
    w.advance(must(requestOf(w, catOffer).expiresAt, "expiresAt") - w.now + MIN);
    w.sweep();
    expect(requestOf(w, catOffer)).toMatchObject({ status: "expired", reason: "The offer expired before the seller answered." });
    // On a fresh pause, the seller can decline an open offer, and the buyer can withdraw theirs.
    const m = market(2);
    const a = offer(m.w, CAT, m.l, "30");
    const b = offer(m.w, DAN, m.l, "26");
    m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l });
    expect(m.w.ok(ANN.userId, { type: "decline", requestId: a }).toast).toBe("Offer declined.");
    expect(m.w.ok(DAN.userId, { type: "cancel", requestId: b }).toast).toBe("Offer withdrawn.");
  });

  it("isn't counted or shown as available to anyone else, signed in or a guest, nor matched; the seller sees it paused", () => {
    const { w, ev, l, catOffer } = paused();
    const iso = w.requestFor(EVE, ev, { qty: 1, budget: "40" }); // posted while it's paused: Ann isn't pinged about it
    w.ok(FAY.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" });
    expect(textsFor(w, ANN).filter((t) => t.includes("is looking for"))).toEqual([]);
    // Ann: paused, with the counts; her card says so.
    const ann = view(w, ANN);
    const mine = must(ann.listings.find((x) => x.id === l), "Ann's listing");
    expect(mine).toMatchObject({ pausedAt: listingOf(w, l).pausedAt, numbers: { reserved: 1, completed: 0, available: 0 } });
    inBrowser(ann, (s) => {
      const own = must(s.listings.find((x) => x.id === l), "the view's listing"); // the view's copy, as the page reads it
      expect(E.listingState(s, own)).toEqual({ key: "sellerPaused", label: "Paused", tone: "warn" });
      expect([E.listingPaused(s, own), E.pausedUnits(s, own)]).toEqual([true, 2]);
      const sum = E.eventSummary(s, must(E.EV[ev], "event"), ANN.userId);
      // Forms round 2: a live card names the face value, never what the seller paid.
      expect([sum.state.label, sum.ownPaused, sum.ownAvail, E.priceParts(must(E.EV[ev], "event"), sum).sub]).toEqual(["Your listing is paused", 2, 0, "1 ticket held for a buyer · 2 tickets paused · face value $40"]);
      expect(E.needsAction(s, ANN.userId).map((x) => [x.x.id, x.why])).toEqual([[catOffer, "resume the listing to accept, or decline"]]);
    });
    // A stranger with an alert, a requester, and the two buyers with an open offer: in view, paused, never available or a match.
    const card: Record<string, string> = { [FAY.userId]: "2 listed tickets paused", [EVE.userId]: "2 listed tickets paused", [CAT.userId]: "Your offer is open", [DAN.userId]: "A counter is waiting for you" };
    for (const who of [FAY, EVE, CAT, DAN]) {
      const v = view(w, who);
      const theirs = must(v.listings.find((x) => x.id === l), `${who.name}'s copy`);
      expect(theirs.pausedAt, who.name).toBe(listingOf(w, l).pausedAt);
      expect(theirs.numbers.available, who.name).toBe(0);
      inBrowser(v, (s) => {
        const evt = must(E.EV[ev], "event");
        const copy = must(s.listings.find((x) => x.id === l), "the view's listing");
        expect(E.listingState(s, copy).key).toBe("sellerPaused");
        expect(E.stockFor(s, evt)).toBe(0);
        expect(E.availableListings(s, ev)).toEqual([]);
        expect(E.availableFor(s, who.userId, E.DISC0).cards).toEqual([]);
        const sum = E.eventSummary(s, evt, who.userId);
        expect([sum.state.label, sum.otherSpots, sum.pausedOthers], who.name).toEqual([card[who.userId], 0, 2]);
        if (who === FAY) expect(E.priceParts(evt, sum).sub).toBe("2 listed tickets paused");
        expect(E.feedItems(s, who.userId).filter((x) => x.listingId === l)).toEqual([]);
        for (const i of s.interests.filter((x) => x.userId === who.userId && x.eventId === ev)) {
          expect(E.isoMatches(s, i), `${who.name}'s ${i.kind}`).toEqual([]);
          expect((i.kind === "alert" ? E.alertMatch(s, i, copy) : E.requestMatch(s, i, copy)).reasons).toContain("It's paused.");
        }
      });
    }
    // Ann can't point Eve's request at it.
    expect(w.no(ANN.userId, { type: "shareListing", isoId: iso, listingId: l })).toBe("This listing doesn't fit the request. It's paused.");
    // A guest sees the event, and no listing.
    const g = guest(w);
    expect(g.events.map((e) => e.id)).toEqual([ev]);
    expect(g.listings).toEqual([]);
    expect(JSON.stringify(g)).not.toContain(l);
  });

  it("a ticket that comes back while paused stays off sale: cancelled, released, or a hold that lapsed", () => {
    const m = market(3);
    const [b, c, d] = [m.w.take(BOB, m.l), m.w.take(CAT, m.l), m.w.take(DAN, m.l)];
    m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l });
    expect(m.w.ok(BOB.userId, { type: "cancel", requestId: b }).toast).toBe("Reservation cancelled.");
    expect(m.w.ok(ANN.userId, { type: "release", requestId: c }).toast).toBe("Hold released. It's back with you, and the listing stays paused until you resume it.");
    m.w.advance(16 * MIN);
    m.w.sweep();
    expect(requestOf(m.w, d)).toMatchObject({ status: "expired", reason: "The reservation ended without payment. The seller has paused the listing, so it isn't on sale right now." });
    expect(m.w.run(() => E.listingNumbers(m.w.doc, listingOf(m.w, m.l)))).toEqual({ reserved: 0, completed: 0, available: 0 });
    expect(guest(m.w).listings).toEqual([]);
    // Not paused, the same steps keep their words.
    const n = market(2);
    const e = n.w.take(BOB, n.l);
    expect(n.w.ok(BOB.userId, { type: "cancel", requestId: e }).toast).toBe("Reservation cancelled. It's back on sale.");
    const f = n.w.take(CAT, n.l);
    n.w.advance(16 * MIN);
    n.w.sweep();
    expect(requestOf(n.w, f).reason).toBe("The reservation ended without payment, so it went back on sale.");
  });

  it("keeps every exchange step actionable while paused: a problem, a disputed payment, the buyer's cancel, the seller's release", () => {
    const m = market(3);
    const [b, c] = [m.w.take(BOB, m.l), m.w.take(CAT, m.l)];
    m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l });
    for (const [who, type] of [[BOB, "markPaid"], [CAT, "markPaid"]] as const) m.w.ok(who.userId, { type, requestId: who === BOB ? b : c });
    m.w.ok(BOB.userId, { type: "reportProblem", kind: "ticket", id: b, reason: "The seller hasn't sent it" });
    m.w.ok(BOB.userId, { type: "resolveProblem", kind: "ticket", id: b });
    m.w.ok(ANN.userId, { type: "paymentMissing", requestId: b });
    expect(m.w.ok(BOB.userId, { type: "cancel", requestId: b }).toast).toBe("Reservation cancelled. If you did pay, sort it out with Ann directly: Handoff can't see payments.");
    m.w.ok(ANN.userId, { type: "paymentMissing", requestId: c });
    m.w.advance(25 * HOUR);
    expect(m.w.ok(ANN.userId, { type: "release", requestId: c }).toast).toBe("Released. It's back with you, and the listing stays paused until you resume it.");
    expect(m.w.run(() => E.listingNumbers(m.w.doc, listingOf(m.w, m.l)))).toEqual({ reserved: 0, completed: 0, available: 0 });
    expect(m.w.ok(ANN.userId, { type: "resumeListing", listingId: m.l }).toast).toBe("Listing resumed. 3 tickets are available again.");
  });

  it("can be edited while paused, and stays paused until resumed (pause, fix the price, resume)", () => {
    const { w, l } = market(2);
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    expect(w.ok(ANN.userId, { type: "editListing", listingId: l, ask: "30", note: "Back row." }).toast).toBe("Listing updated. Reservations and offers already made keep their prices.");
    expect(listingOf(w, l)).toMatchObject({ ask: 30, note: "Back row.", pausedAt: expect.any(Number) });
    expect(w.no(BOB.userId, { type: "take", listingId: l, qty: 1, amount: "", msg: "", member: false })).toBe("The seller has paused this listing, so it can't be reserved or offered on right now.");
    w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    expect(requestOf(w, w.take(BOB, l)).price).toBe(30);
  });

  it("is refused, saying why, when the listing can't sell anything more", () => {
    const t = market(1);
    const r = t.w.take(BOB, t.l);
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) t.w.ok(who.userId, { type, requestId: r });
    expect(t.w.no(ANN.userId, { type: "pauseListing", listingId: t.l })).toBe("All the tickets on this listing have been transferred, so it can't be paused.");
    const s = market(1, {});
    s.w.advance(11 * DAY);
    expect(s.w.no(ANN.userId, { type: "pauseListing", listingId: s.l })).toBe("The event has started, so this listing can't be paused.");
  });
});

describe("resumeListing: only while it's still eligible", () => {
  it("opens it again: offers can be accepted and countered, the buyers who offered are told, and classmates who started looking meanwhile hear about it once", () => {
    const { w, ev, l } = market(2);
    const early = w.requestFor(BOB, ev, { qty: 1, budget: "40" }); // made before the pause: Bob heard nothing new while paused
    const catOffer = offer(w, CAT, l, "30");
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    w.advance(10 * MIN);
    w.requestFor(DAN, ev, { qty: 3, budget: "40" }); // started looking while it was paused
    w.ok(FAY.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "" }); // a private alert, set while it was paused
    w.ok(EVE.userId, { type: "joinAlert", eventId: ev, qty: 1, max: "15" }); // below even the lowest offer ($20): no match
    const done = w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    expect(done.toast).toBe("Listing resumed. 2 tickets are available again. 1 classmate with a matching request was told."); // Fay's alert is told, never counted
    const sent = Object.fromEntries(done.notes.map((n) => [n.userId, [n.text, n.link]]));
    expect(sent).toEqual({
      [CAT.userId]: ["Ann resumed their listing for Spring Formal, so they can accept your offer again.", { name: "activity", tab: "requests" }],
      [DAN.userId]: ["A ticket for Spring Formal is available: Ann has 2 tickets at $35. It covers 2 of the 3 you asked for.", { name: "event", id: ev, listing: l }],
      [FAY.userId]: ["A ticket for Spring Formal is available: Ann has 2 tickets at $35.", { name: "event", id: ev, listing: l }],
    });
    expect(textsFor(w, BOB).filter((t) => t.includes("is available"))).toEqual([]);
    expect(listingOf(w, l)).not.toHaveProperty("pausedAt");
    expect(w.ok(ANN.userId, { type: "accept", requestId: catOffer }).toast).toMatch(/^Offer accepted\./);
    expect(view(w, FAY).listings.find((x) => x.id === l)).not.toHaveProperty("pausedAt");
    expect(guest(w).listings.map((x) => [x.id, x.available])).toEqual([[l, 1]]);
    // A second pause and resume tells only those who started looking since.
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    expect(w.ok(ANN.userId, { type: "resumeListing", listingId: l }).notes).toEqual([]);
    expect(listingOf(w, l).history.map((h) => h.text)).toEqual(["Listed 2 tickets at $35", "Paused: no new reservations or offers until it's resumed", "Resumed: open to reservations and offers again",
      "Paused: no new reservations or offers until it's resumed", "Resumed: open to reservations and offers again"]);
    void early;
  });

  it("with everything left held for buyers, says so; a counter can be accepted again", () => {
    const { w, l } = market(1);
    const o = offer(w, CAT, l, "25");
    w.ok(ANN.userId, { type: "counter", requestId: o, amount: "30" });
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    const done = w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    expect(done.notes.map((n) => n.text)).toEqual(["Ann resumed their listing for Spring Formal, so you can accept their counter-offer again."]);
    w.ok(CAT.userId, { type: "respond", requestId: o, accept: true, member: false });
    expect(requestOf(w, o)).toMatchObject({ status: "accepted", price: 30 });
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    expect(w.ok(ANN.userId, { type: "resumeListing", listingId: l }).toast).toBe("Listing resumed. Everything left is held for buyers right now; if a hold ends, it goes back on sale.");
  });

  it("never revives a withdrawn, departed, closed, cutoff-passed or fully transferred listing, or one that isn't paused; each refusal says why", () => {
    const NOT_PAUSED = "This listing isn't paused.";
    // Not paused; withdrawn while paused.
    const a = market(1);
    expect(a.w.no(ANN.userId, { type: "resumeListing", listingId: a.l })).toBe(NOT_PAUSED);
    a.w.ok(ANN.userId, { type: "pauseListing", listingId: a.l });
    a.w.ok(ANN.userId, { type: "withdraw", listingId: a.l });
    expect(a.w.no(ANN.userId, { type: "resumeListing", listingId: a.l })).toBe("This listing is closed, so it can't be resumed."); // B2's words for a closed listing
    expect(a.w.no(BOB.userId, { type: "resumeListing", listingId: a.l })).toBe("Listing not found.");
    const never = market(1); // withdrawn without a pause: a stale tab's Resume hears what happened
    never.w.ok(ANN.userId, { type: "withdraw", listingId: never.l });
    expect(never.w.no(ANN.userId, { type: "resumeListing", listingId: never.l })).toBe("This listing is closed, so it can't be resumed.");
    // The event started while it was paused.
    const b = market(1);
    b.w.ok(ANN.userId, { type: "pauseListing", listingId: b.l });
    b.w.advance(11 * DAY);
    expect(b.w.no(ANN.userId, { type: "resumeListing", listingId: b.l })).toBe("The event has started, so this listing can't be resumed.");
    // The transfer window closed.
    const c = new ServerWorld({ people: PEOPLE6 });
    const cev = c.addEvent(ANN, { deadline: wallAfter(c.now, 5, "12:00") });
    const cl = c.listTickets(ANN, cev, { qty: 1 });
    c.ok(ANN.userId, { type: "pauseListing", listingId: cl });
    c.advance(6 * DAY);
    expect(c.no(ANN.userId, { type: "resumeListing", listingId: cl })).toMatch(/^The transfer window closed .+, so this listing can't be resumed\.$/);
    // A train that left.
    const d = new ServerWorld({ people: PEOPLE6 });
    const train = must(d.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(d.now, 1, "06:00"), openUntil: wallAfter(d.now, 7, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
    const dl = d.listTickets(ANN, train, { qty: 1, ask: "80", paid: "89", method: "file", departsAt: wallAfter(d.now, 2, "14:11") });
    d.ok(ANN.userId, { type: "pauseListing", listingId: dl });
    d.advance(3 * DAY);
    expect(d.no(ANN.userId, { type: "resumeListing", listingId: dl })).toBe("That train has already left, so this listing can't be resumed.");
    // Every ticket transferred while it was paused.
    const e = market(1);
    const r = e.w.take(BOB, e.l);
    e.w.ok(ANN.userId, { type: "pauseListing", listingId: e.l });
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) e.w.ok(who.userId, { type, requestId: r });
    expect(e.w.no(ANN.userId, { type: "resumeListing", listingId: e.l })).toBe("All the tickets on this listing have been transferred, so it can't be resumed.");
    // Every one of those listings reads as closed, never as paused, and offers nothing anyone can take.
    for (const [x, id] of [[b.w, b.l], [c, cl], [d, dl], [e.w, e.l]] as const) {
      x.run(() => {
        const listing = listingOf(x, id);
        expect(E.listingPaused(x.doc, listing)).toBe(false);
        expect(E.listingState(x.doc, listing).key).not.toBe("sellerPaused");
        expect(E.listingNumbers(x.doc, listing).available).toBe(0);
      });
    }
    // The event can't be removed under a paused listing (listings are public records).
    expect(b.w.no(ANN.userId, { type: "removeEvent", eventId: b.ev })).toBe("This event can't be removed: listings or public requests refer to it.");
  });

  it("a paused listing whose transfer window closed or whose event started meanwhile reads as that closure, as an unpaused one does: never \"Closed\" or \"Transferred\" while tickets are left (EPV E3)", () => {
    // Ann's listing is paused, Dan's on the same event isn't; each has 3 tickets, 1 of them transferred to Bob. Then the window closes.
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN, { deadline: wallAfter(w.now, 5, "12:00") });
    const paused = w.listTickets(ANN, ev, { qty: 3 });
    const open = w.listTickets(DAN, ev, { qty: 3 });
    for (const [l, seller] of [[paused, ANN], [open, DAN]] as const) {
      const r = w.take(BOB, l);
      for (const [who, type] of [[BOB, "markPaid"], [seller, "confirmPayment"], [seller, "markTransferred"], [BOB, "buyerReceived"]] as const) w.ok(who.userId, { type, requestId: r });
    }
    w.ok(ANN.userId, { type: "pauseListing", listingId: paused });
    w.run(() => expect(E.listingState(w.doc, listingOf(w, paused))).toEqual({ key: "sellerPaused", label: "Paused", tone: "warn" }));
    const state = (id: string) => w.run(() => E.listingState(w.doc, listingOf(w, id)));
    const inSellerView = (who: TestPerson, id: string) => inBrowser(view(w, who), (s) => E.listingState(s, must(s.listings.find((x) => x.id === id), `listing ${id} in the view`)));
    w.advance(6 * DAY); // the transfer window closed a day ago; the event is in 4 days
    const WINDOW_CLOSED = { key: "closed", label: "Transfer window closed", tone: "muted" };
    expect(state(open)).toEqual(WINDOW_CLOSED);
    expect(state(paused)).toEqual(WINDOW_CLOSED); // it read "Transferred" (1 of 3 went), as if nothing were left
    expect(inSellerView(ANN, paused)).toEqual(WINDOW_CLOSED); // the page reads the server's numbers: the same
    expect(inSellerView(DAN, open)).toEqual(WINDOW_CLOSED);
    w.advance(5 * DAY); // the event has started
    expect(state(paused)).toEqual({ key: "closed", label: "Event started", tone: "muted" });
    expect(state(paused)).toEqual(state(open));
    // Nothing transferred: it read "Closed".
    const one = market(1);
    one.w.ok(ANN.userId, { type: "pauseListing", listingId: one.l });
    one.w.advance(11 * DAY);
    one.w.run(() => expect(E.listingState(one.w.doc, listingOf(one.w, one.l))).toEqual({ key: "closed", label: "Event started", tone: "muted" }));
    // Everything transferred while paused, then closed: nothing is left, so it reads "Transferred", as before.
    const all = market(1);
    const r = all.w.take(BOB, all.l);
    all.w.ok(ANN.userId, { type: "pauseListing", listingId: all.l });
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) all.w.ok(who.userId, { type, requestId: r });
    all.w.advance(11 * DAY);
    all.w.run(() => expect(E.listingState(all.w.doc, listingOf(all.w, all.l))).toEqual({ key: "transferred", label: "Transferred", tone: "muted" }));
  });
});

describe("Goods: editItem, pauseItem and resumeItem", () => {
  it("only the seller; an edit is for what happens next, and an open request or offer keeps its price", () => {
    const { w, it } = goodsMarket();
    const bob = requestItem(w, BOB, it); // at the asking price, $30
    const cat = requestItem(w, CAT, it, "20"); // an offer
    const before = { bob: goodsReqOf(w, bob), cat: goodsReqOf(w, cat) };
    for (const who of [BOB, FAY]) expect(w.no(who.userId, { type: "editItem", id: it, price: "10" })).toBe("Item not found.");
    expect(w.no(ANN.userId, { type: "editItem", id: it, price: "28" })).toBe("A classmate asked for this item at $30. Keep the price at $30 or more, or answer their request first.");
    const done = w.ok(ANN.userId, { type: "editItem", id: it, price: "35", note: "Barely used, with the cushion." });
    expect([done.toast, done.notes]).toEqual(["Item updated. Requests and offers already made keep their prices.", []]);
    expect(itemOf(w, it)).toMatchObject({ price: 35, note: "Barely used, with the cushion.", obo: true, minOffer: 15 });
    for (const [k, g] of Object.entries(before)) expect(goodsReqOf(w, g.id), k).toEqual(g);
    // Bob's request is accepted at the price he asked at.
    expect(w.ok(ANN.userId, { type: "acceptItemReq", id: bob, shareContact: true }).toast).toMatch(/^Held for Bob at \$30\./);
    // Offers: never down to one; the lowest offer stays below the price.
    const o = goodsMarket();
    requestItem(o.w, CAT, o.it, "25");
    expect(o.w.no(ANN.userId, { type: "editItem", id: o.it, price: "25" })).toBe("There's an open offer of $25 on this item. Keep the price above $25, or answer the offer first.");
    expect(o.w.no(ANN.userId, { type: "editItem", id: o.it, price: "abc" })).toBe("Price: Enter a non-negative amount with at most two decimals.");
    expect(o.w.no(ANN.userId, { type: "editItem", id: o.it, price: "26", minOffer: "26" })).toBe("Lowest offer has to be above $0 and below your asking price ($26).");
    o.w.ok(ANN.userId, { type: "editItem", id: o.it, price: "26" });
    expect(o.w.no(ANN.userId, { type: "editItem", id: o.it, price: "26" })).toBe("Nothing changed: the item already has that price and description.");
    expect(itemOf(o.w, o.it).history.map((h) => h.text)).toEqual(["Posted at $30 OBO", "Edited: price $30 to $26"]);
  });

  it("a pause stops new requests and accepting; open requests stay, their buyers are told, and nobody else sees it available", () => {
    const { w, it } = goodsMarket();
    const bob = requestItem(w, BOB, it);
    const cat = requestItem(w, CAT, it, "20");
    const wanted = must(w.ok(EVE.userId, { type: "saveInterest", data: { qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 10), goods: { title: "Desk chair", cat: "Furniture" } } }).id, "Eve's request");
    const done = w.ok(ANN.userId, { type: "pauseItem", id: it });
    expect(done.toast).toBe("Item paused. Classmates can't request it until you resume it. The 2 open requests stay open, but can't be accepted until you resume it.");
    expect(Object.fromEntries(done.notes.map((n) => [n.userId, n.text]))).toEqual({
      [BOB.userId]: "Ann paused \"Desk chair\". Your request stays open, but they can't accept it until they resume it.",
      [CAT.userId]: "Ann paused \"Desk chair\". Your offer stays open, but they can't accept it until they resume it.",
    });
    expect(w.no(DAN.userId, { type: "requestItem", id: it, msg: "" })).toBe("The seller has paused this item, so it can't be requested right now.");
    expect(w.no(ANN.userId, { type: "acceptItemReq", id: bob, shareContact: true })).toBe("You paused this item. Resume it to accept requests.");
    expect(w.no(ANN.userId, { type: "shareItem", isoId: wanted, itemId: it })).toBe("This item doesn't fit the request. It isn't available (paused).");
    expect(w.no(ANN.userId, { type: "pauseItem", id: it })).toBe("This item is already paused.");
    expect(goodsReqOf(w, bob).status).toBe("pending");
    // The seller sees it paused; Eve (who wants one), a stranger and a guest don't see it as available or as a match.
    inBrowser(view(w, ANN), (s) => {
      const mine = must(s.goods.find((x) => x.id === it), "item");
      expect([E.itemState(s, mine), E.itemPaused(mine)]).toEqual([{ key: "sellerPaused", label: "Paused", tone: "warn" }, true]);
      expect(E.needsAction(s, ANN.userId).map((x) => x.why)).toEqual(["resume the item to accept, or decline", "resume the item to accept, or decline"]);
    });
    for (const who of [EVE, FAY]) {
      const v = view(w, who);
      expect(v.goods.find((x) => x.id === it)?.state.key).toBe("sellerPaused");
      inBrowser(v, (s) => {
        expect(E.availableFor(s, who.userId, { ...E.DISC0, cat: "goods" }).cards).toEqual([]);
        for (const i of s.interests.filter((x) => x.userId === who.userId)) expect(E.goodsMatches(s, i)).toEqual([]);
      });
    }
    expect(guest(w).goods).toEqual([]);
    // Bob can still cancel, and Ann can decline Cat's offer.
    w.ok(BOB.userId, { type: "cancelItemReq", id: bob });
    expect(w.ok(ANN.userId, { type: "declineItemReq", id: cat }).toast).toBe("Offer declined.");
  });

  it("a hold agreed before the pause goes on to pickup; the item then can't be resumed", () => {
    const { w, it } = goodsMarket();
    const g = requestItem(w, BOB, it);
    w.ok(ANN.userId, { type: "acceptItemReq", id: g, shareContact: true });
    const done = w.ok(ANN.userId, { type: "pauseItem", id: it });
    expect(done.toast).toBe("Item paused. Classmates can't request it until you resume it. The current hold continues.");
    expect(view(w, FAY).goods.find((x) => x.id === it)?.state.key).toBe("reserved"); // the hold is what others see while it lasts
    w.ok(BOB.userId, { type: "setPickup", id: g, at: wallAfter(w.now, 2, "17:00") });
    w.ok(ANN.userId, { type: "setPickup", id: g, at: wallAfter(w.now, 2, "18:00") });
    w.ok(BOB.userId, { type: "reportProblem", kind: "goods", id: g, reason: "Something else" });
    w.ok(BOB.userId, { type: "resolveProblem", kind: "goods", id: g });
    w.ok(BOB.userId, { type: "itemPickedUp", id: g });
    expect(itemOf(w, it).soldAt).toBeTypeOf("number");
    expect(w.no(ANN.userId, { type: "resumeItem", id: it })).toBe("This item was sold, so it can't be resumed.");
    expect(w.no(ANN.userId, { type: "editItem", id: it, price: "20" })).toBe("This item was sold, so it can't be edited.");
  });

  it("backups wait while it's paused: a hold that ends doesn't make it available; resume makes them active and tells who started looking", () => {
    const { w, it } = goodsMarket();
    const bob = requestItem(w, BOB, it);
    w.ok(ANN.userId, { type: "acceptItemReq", id: bob, shareContact: true });
    const cat = requestItem(w, CAT, it); // a backup
    const dan = requestItem(w, DAN, it, "20"); // another backup
    w.ok(ANN.userId, { type: "pauseItem", id: it });
    expect(w.ok(ANN.userId, { type: "releaseItemReq", id: bob }).toast).toBe("Hold released. The item stays paused until you resume it.");
    expect([goodsReqOf(w, cat).status, goodsReqOf(w, dan).status]).toEqual(["waiting", "waiting"]);
    expect(view(w, FAY).goods.find((x) => x.id === it)?.state.key).toBe("sellerPaused");
    w.advance(HOUR);
    const eve = must(w.ok(EVE.userId, { type: "saveInterest", data: { qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 10), goods: { title: "Desk chair", cat: "Furniture" } } }).id, "Eve's request");
    const done = w.ok(ANN.userId, { type: "resumeItem", id: it });
    expect(done.toast).toBe("Item resumed. Classmates can request it again. 2 backup requests are active again for you to accept or decline.");
    expect([goodsReqOf(w, cat).status, goodsReqOf(w, dan).status]).toEqual(["pending", "pending"]);
    const told = Object.fromEntries(done.notes.filter((n) => n.userId !== ANN.userId).map((n) => [n.userId, n.text]));
    expect(told).toEqual({
      [CAT.userId]: "\"Desk chair\" is available again and your request is active. Ann can accept or decline it.",
      [DAN.userId]: "\"Desk chair\" is available again and your offer is active. Ann can accept or decline it.",
      [EVE.userId]: "Possible match for your request \"Desk chair\": Ann is selling \"Desk chair\" for $30 OBO.",
    });
    expect(w.ok(ANN.userId, { type: "acceptItemReq", id: cat, shareContact: true }).toast).toMatch(/^Held for Cat at \$30\./);
    void eve;
  });

  it("a hold that lapses while paused keeps its backups waiting; resume refuses a sold, withdrawn or expired item, or one that isn't paused", () => {
    const { w, it } = goodsMarket();
    const bob = requestItem(w, BOB, it);
    w.ok(ANN.userId, { type: "acceptItemReq", id: bob, shareContact: true });
    const cat = requestItem(w, CAT, it);
    w.ok(ANN.userId, { type: "pauseItem", id: it });
    w.advance(49 * HOUR); // no pickup time agreed: the hold ends
    w.sweep();
    expect(goodsReqOf(w, bob).status).toBe("expired");
    expect(goodsReqOf(w, cat).status).toBe("waiting");
    expect(textsFor(w, CAT).filter((t) => t.includes("available again"))).toEqual([]);
    w.ok(ANN.userId, { type: "resumeItem", id: it });
    expect(goodsReqOf(w, cat).status).toBe("pending");
    expect(w.no(ANN.userId, { type: "resumeItem", id: it })).toBe("This item isn't paused.");
    // Withdrawn while paused, or never paused (a stale tab's Resume hears what happened); past its pickup window while paused.
    const a = goodsMarket();
    a.w.ok(ANN.userId, { type: "pauseItem", id: a.it });
    a.w.ok(ANN.userId, { type: "withdrawItem", id: a.it });
    expect(a.w.no(ANN.userId, { type: "resumeItem", id: a.it })).toBe("This item is closed, so it can't be resumed."); // B2's words for a closed item
    const never = goodsMarket();
    never.w.ok(ANN.userId, { type: "withdrawItem", id: never.it });
    expect(never.w.no(ANN.userId, { type: "resumeItem", id: never.it })).toBe("This item is closed, so it can't be resumed.");
    const b = goodsMarket();
    b.w.ok(ANN.userId, { type: "pauseItem", id: b.it });
    b.w.advance(11 * DAY);
    expect(b.w.no(ANN.userId, { type: "resumeItem", id: b.it })).toBe("Its pickup window is over, so it can't be resumed.");
    expect(b.w.no(ANN.userId, { type: "pauseItem", id: b.it })).toBe("Its pickup window is over, so it can't be paused.");
    expect(b.w.no(BOB.userId, { type: "resumeItem", id: b.it })).toBe("Item not found.");
    b.w.run(() => expect([E.itemState(b.w.doc, itemOf(b.w, b.it)).key, E.itemPaused(itemOf(b.w, b.it))]).toEqual(["closed", false]));
  });
});

describe("the input gate for edit, pause and resume", () => {
  it("passes what the seller's panels send, drops what the engine doesn't read, and keeps amounts and notes out of the log's ids", () => {
    const L = "l0123456789abcdef", G = "g0123456789abcdef";
    for (const a of [
      { type: "editListing", listingId: L, ask: "35", obo: true, minOffer: "20", note: "Row C." },
      { type: "editListing", listingId: L, minOffer: null },
      { type: "pauseListing", listingId: L }, { type: "resumeListing", listingId: L },
      { type: "editItem", id: G, price: "30", obo: false, minOffer: "", note: "" },
      { type: "pauseItem", id: G }, { type: "resumeItem", id: G },
    ]) {
      const r = parseAction({ ...a, quantity: 5, sellerId: "user-ann" });
      expect(r.ok && r.action, a.type).toEqual(a);
      if (r.ok) expect(Object.values(actionIds(r.action))).toEqual([a.type.endsWith("Item") ? G : L]);
    }
    // Not a seq step; a bad id, a number for an amount, a note too long or unsafe are refused before any lock.
    expect(parseAction({ type: "seq", steps: [{ action: { type: "pauseListing", listingId: L } }] })).toMatchObject({ ok: false });
    for (const bad of [{ type: "pauseItem", id: L }, { type: "editListing", listingId: L, ask: 35 }, { type: "editItem", id: G, note: "x".repeat(1001) }, { type: "editListing", listingId: L, note: "a\u0000b" }, { type: "resumeListing" }]) {
      expect(parseAction(bad).ok, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });
});
