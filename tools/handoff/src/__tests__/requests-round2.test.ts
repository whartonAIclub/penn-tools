// Forms round 2 (USER-INSTRUCTIONS §9j item 1, step FORMS-F2), the engine half of "Request a ticket (ISO)":
// - A budget may be left blank on a ticket request. Blank is no budget: stored as null, never $0, never an offer or an agreement to pay.
//   The request then fits any otherwise eligible listing, whatever its price; nothing anyone reads names a budget. An explicit budget
//   still filters, and is still capped by the event's face value.
// - A deadline may be left out. The request then runs until the event's requests stop: its transfer deadline when it has one, a train's
//   departure, an event's start, or 11:59 PM Philadelphia time on a date-only event's day. An earlier date can still be chosen; an edit
//   that names no date keeps the request's own; an item request still names its date.
// - The price a buyer pays is the seller's, shown on the invitation before anything is reserved; a request for two that gets one stays
//   open for the other.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Interest } from "../../engine/index.js";
import { must, on, reqOf, resetEngine, reserve } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, HOUR, MIN, T0, dateAfter, wallAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
/** A date-only ordinary event, as the event form sends it: no ticket types, a face value only when given. */
const DATED = (date: string, over: Record<string, unknown> = {}) => act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: date, ...over });
/** A train as the event form sends it: one name and its departure. */
const TRAIN = (departs: string) => act({ type: "createEvent", kind: "train", title: "Amtrak Northeast Regional: Philadelphia → New York", start: departs });
/** Lists one or more tickets as the Sell form does (no "what you paid"). */
const sell = (eventId: string, ask: string, qty = 1, over: Record<string, unknown> = {}) => act({
  type: "addThen", add: { eventId, tier: "t1", qty },
  then: { type: "list", qty, ask, note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: "", ...over },
});
/** "Post request" as the short form sends it: the event and how many. A budget or a date only when the buyer added one. */
const post = (eventId: string, over: Record<string, unknown> = {}) => act({ type: "saveInterest", data: { eventId, qty: 1, note: "", ...over } });
const isoOf = (w: ServerWorld, id: string): Interest => must(w.doc.interests.find((i) => i.id === id), `request ${id}`);
const ny = (wall: string): number => E.wallToMs(wall);
const live = (w: ServerWorld, id: string): boolean => w.run(() => E.liveRequest(w.doc, isoOf(w, id)));

describe("a budget left blank (9j item 1)", () => {
  it("is accepted on a ticket request and stored as no budget: never $0, an offer or an agreement to pay", () => {
    for (const blank of [{}, { budget: "" }, { budget: null }]) {
      const w = new ServerWorld({ people: PEOPLE6 });
      const ev = must(w.ok(ANN.userId, DATED(dateAfter(T0, 12))).id, "event");
      const l = must(w.ok(ANN.userId, sell(ev, "450")).id, "listing");
      const done = w.ok(CAT.userId, post(ev, blank));
      const iso = must(done.id, "request");
      expect(isoOf(w, iso)).toMatchObject({ kind: "iso", status: "open", qty: 1, budget: null });
      expect(isoOf(w, iso).budget).not.toBe(0);
      // Nothing is asked, offered, invited or reserved by posting it.
      expect(w.doc.requests).toEqual([]);
      expect(w.run(() => E.listingNumbers(w.doc, must(w.doc.listings.find((x) => x.id === l), "listing")))).toMatchObject({ available: 1, reserved: 0 });
      // The seller hears who is looking, with no price in the sentence.
      expect(done.notes.map((n) => [n.userId, n.text])).toEqual([[ANN.userId, 'Cat M. is looking for 1 ticket for Rooftop Mixer. If your listing fits, share it with their request ("I have this").']]);
      expect(done.toast).toBe("Request posted. 1 seller with a listing for this event was told. Matches show at the bell and in My activity."); // §9q item 4: where matches show
    }
  });

  it("fits any otherwise eligible listing, whatever its price, and is alerted when one is listed", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, DATED(dateAfter(T0, 12))).id, "event");
    const dear = must(w.ok(ANN.userId, sell(ev, "450")).id, "listing");
    const iso = must(w.ok(CAT.userId, post(ev)).id, "request");
    w.run(() => {
      const i = isoOf(w, iso);
      expect(E.requestMatch(w.doc, i, must(w.doc.listings.find((x) => x.id === dear), "listing"))).toMatchObject({ ok: true, reasons: [] });
      expect(E.isoMatches(w.doc, i).map((x) => x.id)).toEqual([dear]);
    });
    // A later listing at any price alerts them, as a match.
    const later = w.ok(BOB.userId, sell(ev, "999"));
    expect(later.notes.filter((n) => n.userId === CAT.userId).map((n) => n.text)).toEqual(["A ticket opened up for Rooftop Mixer: Bob listed 1 ticket at $999."]);
    // Their own listing never matches their own request (otherwise eligible only).
    const own = must(w.ok(CAT.userId, sell(ev, "5")).id, "Cat's listing");
    w.run(() => expect(E.requestMatch(w.doc, isoOf(w, iso), must(w.doc.listings.find((x) => x.id === own), "listing")).ok).toBe(false));
  });

  it("shows no budget anywhere: the owner's view, a classmate's view, the guest view and the notification", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, DATED(dateAfter(T0, 12))).id, "event");
    w.ok(ANN.userId, sell(ev, "60"));
    const done = w.ok(CAT.userId, post(ev));
    const iso = must(done.id, "request");
    for (const p of [CAT, ANN, DAN]) expect(must(viewOf(w, p).interests.find((i) => i.id === iso), `${p.name}'s view`).budget).toBeNull();
    const g = guestViewOf(w);
    expect(JSON.stringify(g.wanted)).not.toMatch(/budget/);
    expect(done.notes.map((n) => n.text).join(" ")).not.toMatch(/\$|budget|up to/);
    // (The share message's check was removed in SELL5-M1: §9v item 3 removed outward Share, so there is no share message any more.)
  });

  it("leaves the price to the seller: an invitation names the asking price, and the buyer reserves at that price", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, DATED(dateAfter(T0, 12))).id, "event");
    const l = must(w.ok(ANN.userId, sell(ev, "60")).id, "listing");
    const iso = must(w.ok(CAT.userId, post(ev)).id, "request");
    const sent = w.ok(ANN.userId, act({ type: "inviteRequester", isoId: iso, listingId: l, qty: 1 }));
    const r = must(sent.id, "invitation");
    expect(reqOf(w, r)).toMatchObject({ status: "invited", price: 60, qty: 1, buyerId: CAT.userId, fromIso: iso });
    expect(sent.notes.filter((n) => n.userId === CAT.userId).map((n) => n.text)[0]).toMatch(/^Ann L\. invited you to pay \$60 each for 1 ticket for Rooftop Mixer, for your request\. It isn't held yet: reserve it by /);
    // The buyer's view carries the price before anything is reserved.
    expect(must(viewOf(w, CAT).requests.find((x) => x.id === r), "Cat's invitation")).toMatchObject({ status: "invited", price: 60 });
    reserve(w, CAT, r);
    expect(reqOf(w, r)).toMatchObject({ status: "accepted", price: 60 });
  });

  it("keeps an explicit budget's filter and the face-value cap; an explicit $0 stays $0", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, DATED(dateAfter(T0, 12), { face: "40" })).id, "event");
    const l40 = must(w.ok(ANN.userId, sell(ev, "40")).id, "the $40 listing");
    const l25 = must(w.ok(BOB.userId, sell(ev, "25")).id, "the $25 listing");
    expect(w.no(CAT.userId, post(ev, { budget: "41" }))).toBe("The face value is $40, so keep your budget at or below it.");
    const iso = must(w.ok(CAT.userId, post(ev, { budget: "30" })).id, "request");
    expect(isoOf(w, iso).budget).toBe(30);
    w.run(() => {
      const i = isoOf(w, iso);
      expect(E.isoMatches(w.doc, i).map((x) => x.id)).toEqual([l25]);
      expect(E.requestMatch(w.doc, i, must(w.doc.listings.find((x) => x.id === l40), "listing"))).toMatchObject({ ok: false, reasons: ["$40 per ticket is above Cat's $30 budget."] });
    });
    // A $35 listing doesn't alert a $30 budget; a $30 one does.
    expect(w.ok(DAN.userId, sell(ev, "35")).notes.filter((n) => n.userId === CAT.userId)).toEqual([]);
    expect(w.ok(EVE.userId, sell(ev, "30")).notes.filter((n) => n.userId === CAT.userId).map((n) => n.text)).toEqual(["A ticket opened up for Rooftop Mixer: Eve listed 1 ticket at $30."]);
    // The same request, edited to no budget: any price fits now.
    w.ok(CAT.userId, post(ev, { id: iso, budget: "" }));
    expect(isoOf(w, iso).budget).toBeNull();
    w.run(() => expect(E.isoMatches(w.doc, isoOf(w, iso)).length).toBe(4));
    // An explicit zero is a budget of $0, not a blank one.
    const zero = must(w.ok(DAN.userId, post(ev, { budget: "0" })).id, "Dan's request");
    expect(isoOf(w, zero).budget).toBe(0);
  });
});

describe("a deadline left out (9j item 1)", () => {
  it("a date-only event: the request runs to 11:59 PM Philadelphia time that day, 12 days away, with no budget", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 12);
    const ev = must(w.ok(ANN.userId, DATED(date)).id, "event");
    const iso = must(w.ok(CAT.userId, post(ev)).id, "request");
    expect(isoOf(w, iso)).toMatchObject({ expires: date, budget: null });
    w.run(() => {
      const e = must(E.EV[ev], "event");
      expect(E.requestUntil(e)).toBe(date);
      expect(E.requestEndMs(isoOf(w, iso), e)).toBe(ny(`${date}T23:59`));
      expect(E.fmtUntil(E.requestEndMs(isoOf(w, iso), e))).toBe("Sun, Nov 22, 11:59 PM");
    });
    // Still open a week on (the old form's default ended it then), and through 11:58 PM on the day; over at 11:59 PM.
    for (const days of [7, 8, 11]) { w.now = T0 + days * DAY; expect(live(w, iso), `day ${days}`).toBe(true); }
    w.now = ny(`${date}T23:59`) - MIN;
    expect(live(w, iso)).toBe(true);
    w.now = ny(`${date}T23:59`);
    expect(live(w, iso)).toBe(false);
    expect(w.run(() => E.isExpired(isoOf(w, iso)))).toBe(true);
  });

  it("an event with a start time: the request runs to the start", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const start = wallAfter(T0, 10, "19:00");
    const ev = w.addEvent(ANN, { start });
    const iso = must(w.ok(CAT.userId, post(ev)).id, "request");
    expect(isoOf(w, iso).expires).toBe(start.slice(0, 10));
    w.run(() => {
      const e = must(E.EV[ev], "event");
      expect(E.requestEndMs(isoOf(w, iso), e)).toBe(ny(start));
      expect(E.fmtUntil(E.requestEndMs(isoOf(w, iso), e))).toBe("Fri, Nov 20, 7:00 PM");
    });
    w.now = ny(start) - MIN;
    expect(live(w, iso)).toBe(true);
    w.now = ny(start);
    expect(live(w, iso)).toBe(false);
  });

  it("an earlier transfer deadline: the request runs to that deadline, not to the event", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 10), deadline = wallAfter(T0, 7, "17:00");
    const ev = must(w.ok(ANN.userId, DATED(date, { deadline })).id, "event");
    const iso = must(w.ok(CAT.userId, post(ev)).id, "request");
    expect(isoOf(w, iso).expires).toBe(deadline.slice(0, 10));
    w.run(() => {
      const e = must(E.EV[ev], "event");
      expect(E.requestUntil(e)).toBe(deadline.slice(0, 10));
      expect(E.requestEndMs(isoOf(w, iso), e)).toBe(ny(deadline));
      expect(E.fmtUntil(E.requestEndMs(isoOf(w, iso), e))).toBe("Tue, Nov 17, 5:00 PM");
    });
    w.now = ny(deadline) - MIN;
    expect(live(w, iso)).toBe(true);
    w.now = ny(deadline);
    expect(live(w, iso)).toBe(false);
  });

  it("a train: the request runs to its departure", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const departs = wallAfter(T0, 4, "09:05");
    const ev = must(w.ok(ANN.userId, TRAIN(departs)).id, "train");
    const iso = must(w.ok(CAT.userId, post(ev)).id, "request");
    expect(isoOf(w, iso).expires).toBe(departs.slice(0, 10));
    w.run(() => {
      const e = must(E.EV[ev], "train");
      expect(E.requestEndMs(isoOf(w, iso), e)).toBe(ny(departs));
      expect(E.fmtUntil(E.requestEndMs(isoOf(w, iso), e))).toBe("Sat, Nov 14, 9:05 AM");
    });
    w.now = ny(departs) - MIN;
    expect(live(w, iso)).toBe(true);
    w.now = ny(departs);
    expect(live(w, iso)).toBe(false);
  });

  it("an earlier exact date ends the request at the end of that day; a later one than the event allows is refused", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 12), early = dateAfter(T0, 3);
    const ev = must(w.ok(ANN.userId, DATED(date)).id, "event");
    const iso = must(w.ok(CAT.userId, post(ev, { expires: early })).id, "request");
    expect(isoOf(w, iso).expires).toBe(early);
    w.run(() => expect(E.fmtUntil(E.requestEndMs(isoOf(w, iso), must(E.EV[ev], "event")))).toBe("Fri, Nov 13, 11:59 PM"));
    w.now = ny(`${early}T23:59`) - MIN;
    expect(live(w, iso)).toBe(true);
    w.now = ny(`${early}T23:59`);
    expect(live(w, iso)).toBe(false);
    w.now = T0;
    expect(w.no(DAN.userId, post(ev, { expires: dateAfter(T0, 14) }))).toBe("A request can't outlast the event's transfer deadline.");
    expect(w.no(DAN.userId, post(ev, { expires: dateAfter(T0, -1) }))).toBe("Choose a deadline in the future.");
  });

  it("an edit that names no date keeps the request's own; posting again for the event once it has ended takes the event's", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 12), early = dateAfter(T0, 3);
    const ev = must(w.ok(ANN.userId, DATED(date)).id, "event");
    const iso = must(w.ok(CAT.userId, post(ev, { expires: early, budget: "20" })).id, "request");
    expect(w.ok(CAT.userId, post(ev, { id: iso, qty: 2, budget: "20" })).toast).toBe("Request updated. You have one request for this event.");
    expect(isoOf(w, iso)).toMatchObject({ expires: early, qty: 2, budget: 20 });
    // Its own date has passed: an edit without one runs it to the event's cutoff.
    w.now = ny(`${early}T23:59`) + HOUR;
    expect(w.ok(CAT.userId, post(ev, { id: iso, qty: 2, budget: "20" })).toast).toBe("Request renewed. You have one request for this event.");
    expect(isoOf(w, iso).expires).toBe(date);
  });

  it("an event that has closed refuses in its own words, and an item request still names its date", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 2);
    const ev = must(w.ok(ANN.userId, DATED(date)).id, "event");
    w.now = ny(`${date}T23:59`);
    expect(w.no(CAT.userId, post(ev))).toBe("The event is over.");
    w.now = T0;
    const item = { qty: 1, budget: "", note: "", goods: { title: "Desk lamp", cat: "Furniture" } };
    expect(w.no(CAT.userId, act({ type: "saveInterest", data: item }))).toBe("Choose a deadline in the future.");
    const id = must(w.ok(CAT.userId, act({ type: "saveInterest", data: { ...item, expires: dateAfter(T0, 9) } })).id, "item request");
    expect(isoOf(w, id)).toMatchObject({ expires: dateAfter(T0, 9), budget: null });
  });
});

describe("a request for two that gets one (9j item 1)", () => {
  it("stays open for the other, still with no budget and its own deadline; \"No longer looking\" then closes it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 12);
    const ev = must(w.ok(ANN.userId, DATED(date)).id, "event");
    const l = must(w.ok(ANN.userId, sell(ev, "60")).id, "listing");
    const iso = must(w.ok(CAT.userId, post(ev, { qty: 2 })).id, "request");
    const r = must(w.ok(ANN.userId, act({ type: "inviteRequester", isoId: iso, listingId: l, qty: 1 })).id, "invitation");
    reserve(w, CAT, r);
    w.ok(CAT.userId, on("markPaid", r));
    w.ok(ANN.userId, on("confirmPayment", r));
    w.ok(ANN.userId, on("markTransferred", r));
    w.ok(CAT.userId, on("buyerReceived", r));
    expect(reqOf(w, r).status).toBe("completed");
    expect(isoOf(w, iso)).toMatchObject({ status: "open", qty: 1, budget: null, expires: date });
    expect(live(w, iso)).toBe(true);
    expect(guestViewOf(w).wanted.map((x) => [x.id, x.qty])).toEqual([[iso, 1]]);
    // The page's "No longer looking" is the existing close (closeInterest, cancelled).
    expect(w.ok(CAT.userId, act({ type: "closeInterest", id: iso, reason: "cancelled" })).toast).toBe("Request cancelled. It's off Wanted now.");
    expect(isoOf(w, iso)).toMatchObject({ status: "closed", closedReason: "cancelled", qty: 1 });
    expect(guestViewOf(w).wanted).toEqual([]);
  });
});
