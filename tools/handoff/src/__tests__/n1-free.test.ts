// SELL6-N1 (USER-INSTRUCTIONS §9x item 1, "$0 tickets"): a free ticket needs no payment method and skips the payment steps.
// - No way to be paid is needed to invite someone to a free ticket: "List and invite" (answerRequest), an invitation from a listing
//   (inviteRequester) and the answer to a request to buy (invite). A paid invitation still needs one, exactly as before.
// - Reserving a free invitation skips payment entry and both payment steps: no payment details are copied onto the exchange, nothing is
//   "paid" or "payment confirmed", and the seller's next step is to send the ticket. The invitation, the reservation (availability, the
//   per-person limit, the member confirmation) and the receipt (the buyer's "Received", the holding, the request closing as fulfilled)
//   are unchanged.
// - The words fit a free ticket: nobody is asked to pay, and nothing says a payment was made or confirmed.
// - Until the seller sends it, the buyer may release a free reservation (nothing was paid), and it goes back on sale.
// - A $0 reservation made before this change (reserved, or marked paid) still takes the old steps: stored actions replay.
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, LiveWorld, TicketRequest } from "../../engine/index.js";
import { contractViolations } from "./helpers/contract.js";
import { ask, copyOf, historyOf, invite, must, numbers, on, reqOf, reserve, resetEngine, setMethods, statusOf, textsFor, violationsOf } from "./helpers/invite.js";
import { PEOPLE6, ServerWorld, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as Action;
const answer = (isoId: string, more: Record<string, unknown> = {}) => act({ type: "answerRequest", isoId, ask: "0", note: "", obo: false, ...more });
const post = (eventId: string, askPrice: string, more: Record<string, unknown> = {}) => act({ type: "postTicket", eventId, qty: 1, ask: askPrice, note: "", obo: false, ...more });
interface M { w: ServerWorld; ev: string; iso: string }
/** Ann's "Oysters Night" (no face value, 9 days ahead) and Dan's public request for one ticket. Cat has no way to be paid; Bob has one. */
function market(event: Record<string, unknown> = {}): M {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters Night", start: dateAfter(T0, 9), ...event })).id, "event");
  const iso = w.requestFor(DAN, ev, { qty: 1, budget: "40", days: 5 });
  return { w, ev, iso };
}
const invitationFor = (w: ServerWorld, iso: string): TicketRequest => must(w.doc.requests.find((r) => r.fromIso === iso), "the invitation");

describe("no payment method is needed to invite someone to a free ticket", () => {
  it("List and invite at $0: Cat, with no way to be paid, lists a free ticket and invites Dan; at $30 she's still asked first", () => {
    const m = market();
    expect(m.w.no(CAT.userId, answer(m.iso, { ask: "30" }))).toBe(E.NO_PAY_METHODS);
    const done = m.w.ok(CAT.userId, answer(m.iso));
    const l = must(m.w.doc.listings.find((x) => x.id === done.id), "the listing"), r = invitationFor(m.w, m.iso);
    expect([l.sellerId, l.listed, l.ask]).toEqual([CAT.userId, 1, 0]);
    expect([r.buyerId, r.listingId, r.qty, r.price, r.status, r.inviteFlow]).toEqual([DAN.userId, l.id, 1, 0, "invited", true]);
    expect(done.steps?.map((s) => [s.type, s.ok])).toEqual([["postTicket", true], ["inviteRequester", true]]);
    expect(numbers(m.w, l.id)).toMatchObject({ available: 1, reserved: 0 }); // the invitation holds nothing
    // Dan is invited to take it, not to pay; the seller's words and the histories say the same.
    const toDan = done.notes.filter((n) => n.userId === DAN.userId);
    expect(toDan.map((n) => [n.kind, n.ref])).toEqual([["buy.invited", r.id]]);
    expect(toDan[0]!.text).toMatch(/^Cat M\. invited you to take 1 ticket for Oysters Night for free, for your request\. It isn't held yet: reserve it by .+\. There's nothing to pay\.$/);
    expect(done.toast).toMatch(/^Ticket listed\. Invitation sent to Dan\. Nothing is held until someone reserves it: Dan has until .+\.$/);
    expect(historyOf(r)).toEqual(["Cat M. invited the poster of a request to take 1 ticket for free: not held until the buyer reserves it"]);
    expect(l.history.map((h) => h.text)).toEqual(["Listed 1 ticket at $0", "Invited Dan N., for their request"]);
  });

  it("an invitation from a free listing Cat already has, and her answer to a request to buy it, need none either", () => {
    const m = market();
    const l = must(m.w.ok(CAT.userId, post(m.ev, "0", { qty: 2 })).id, "Cat's free listing");
    const fromListing = m.w.ok(CAT.userId, act({ type: "answerRequest", isoId: m.iso, listingId: l, qty: 1 }));
    expect(fromListing.steps).toEqual([{ type: "inviteRequester", ok: true, id: invitationFor(m.w, m.iso).id }]);
    const r = ask(m.w, BOB, l);
    const asked = m.w.notes.filter((n) => n.userId === CAT.userId && n.ref === r);
    expect(asked.map((n) => n.text)).toEqual([expect.stringMatching(/^Bob D\. wants 1 ticket for Oysters Night, which you listed for free\. Invite them, or decline, by .+\.$/)]);
    const sent = invite(m.w, CAT, r);
    expect(statusOf(m.w, r)).toBe("invited");
    expect(textsFor(sent.notes, BOB)).toEqual([expect.stringMatching(/^Cat invited you to take 1 ticket for Oysters Night for free\. It isn't held yet: reserve it by .+\. There's nothing to pay\.$/)]);
    for (const t of [...textsFor(sent.notes, BOB), ...historyOf(reqOf(m.w, r))]) expect(t).not.toMatch(/invited (you|the buyer) to pay|then you have up to|\$0/);
  });

  it("a paid ticket still needs one: the request to buy a $25 ticket can't be answered with an invitation until Cat adds how to be paid", () => {
    const m = market();
    const l = must(m.w.ok(CAT.userId, post(m.ev, "25")).id, "Cat's listing");
    const r = ask(m.w, BOB, l);
    expect(m.w.no(CAT.userId, act({ type: "invite", requestId: r }))).toBe(E.NO_PAY_METHODS);
    expect(m.w.no(CAT.userId, act({ type: "answerRequest", isoId: m.iso, listingId: l, qty: 1 }))).toBe(E.NO_PAY_METHODS);
    setMethods(m.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    invite(m.w, CAT, r);
    expect(statusOf(m.w, r)).toBe("invited");
  });

  it("a free invitation doesn't keep a seller's last payment method; a paid one does", () => {
    const m = market();
    setMethods(m.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    m.w.ok(CAT.userId, answer(m.iso));
    expect(m.w.run(() => E.payNeededBy(m.w.doc, CAT.userId))).toBe(0);
    const paid = market();
    setMethods(paid.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    paid.w.ok(CAT.userId, answer(paid.iso, { ask: "30" }));
    expect(paid.w.run(() => E.payNeededBy(paid.w.doc, CAT.userId))).toBe(1);
  });
});

describe("a free reservation skips payment entry and both payment steps", () => {
  /** Cat (no way to be paid) answers Dan's request with a free ticket; returns the listing and the invitation. */
  function invited(event: Record<string, unknown> = {}) {
    const m = market(event);
    const l = must(m.w.ok(CAT.userId, answer(m.iso)).id, "the listing");
    return { ...m, l, r: invitationFor(m.w, m.iso).id };
  }

  it("Dan reserves: it's his, nothing is to be paid, and Cat's next step is to send the ticket", () => {
    const m = invited();
    const done = reserve(m.w, DAN, m.r);
    const r = reqOf(m.w, m.r);
    expect(r.status).toBe("confirmed"); // past both payment steps: the seller sends it next
    expect([r.pay, r.paidAt, r.paidVia, r.paymentConfirmedAt]).toEqual([undefined, undefined, undefined, undefined]);
    expect(typeof r.acceptedAt).toBe("number");
    expect(numbers(m.w, m.l)).toMatchObject({ available: 0, reserved: 1, completed: 0 }); // held, as any reservation
    expect(violationsOf(m.w)).toEqual([]);
    expect(done.toast).toBe("Reserved. It's free, so there's nothing to pay. Next: Cat sends you the ticket.");
    expect(textsFor(done.notes, CAT)).toEqual(["Dan N. reserved 1 ticket for Oysters Night. It's free, so there's nothing to pay. Now send the ticket to Dan, then tap “I've sent it”."]);
    expect(historyOf(r).slice(-1)).toEqual(["Buyer reserved it, free: nothing to pay"]);
    // What needs whom: the seller sends it; the buyer waits.
    expect(m.w.run(() => E.needsAction(m.w.doc, CAT.userId)).map((t) => [t.role, t.why])).toEqual([["seller", "send the ticket"]]);
    expect(m.w.run(() => E.needsAction(m.w.doc, DAN.userId))).toEqual([]);
    expect(m.w.run(() => E.requestDeadlines(r))).toMatchObject({ next: null, who: "seller" }); // nothing lapses on its own, as after a confirmed payment
  });

  it("the payment steps don't apply to it, and the receipt is as for any ticket: sent, received, Dan holds it, his request is fulfilled", () => {
    const m = invited();
    reserve(m.w, DAN, m.r);
    expect(m.w.no(DAN.userId, on("markPaid", m.r))).toBe("It's free, so there's nothing to pay.");
    expect(m.w.no(CAT.userId, on("confirmPayment", m.r))).toBe("It's free, so there's no payment to confirm.");
    expect(m.w.no(CAT.userId, on("paymentMissing", m.r))).toBe("This is only for a reservation the buyer marked paid and you haven't confirmed.");
    m.w.ok(CAT.userId, on("markTransferred", m.r));
    expect(statusOf(m.w, m.r)).toBe("sent");
    m.w.ok(DAN.userId, on("buyerReceived", m.r));
    const r = reqOf(m.w, m.r);
    expect([r.status, r.paidAt, r.paymentConfirmedAt, r.pay]).toEqual(["completed", undefined, undefined, undefined]);
    expect(m.w.doc.holdings.filter((h) => h.userId === DAN.userId && h.eventId === m.ev).map((h) => [h.qty, h.paid, h.source])).toEqual([[1, 0, "transferred"]]);
    const iso = must(m.w.doc.interests.find((i) => i.id === m.iso), "Dan's request");
    expect([iso.status, iso.closedReason]).toEqual(["closed", "fulfilled"]); // recorded by the receipt, never by the answer
    expect(numbers(m.w, m.l)).toMatchObject({ available: 0, reserved: 0, completed: 1 });
    expect(violationsOf(m.w)).toEqual([]);
    for (const h of historyOf(r)) expect(h).not.toMatch(/said they paid|confirmed the payment/);
  });

  it("answering alone completes nothing: Dan's request stays open until a receipt (or he closes it)", () => {
    const m = invited();
    const open = () => must(m.w.doc.interests.find((i) => i.id === m.iso), "Dan's request");
    expect([open().status, open().closedReason]).toEqual(["open", undefined]);
    reserve(m.w, DAN, m.r);
    m.w.ok(CAT.userId, on("markTransferred", m.r));
    expect([open().status, open().closedReason]).toEqual(["open", undefined]); // reserved and sent: still not fulfilled
  });

  it("the views carry no payment details for it, and the two see each other's email from the reservation, as for any ticket", () => {
    const m = invited();
    setMethods(m.w, CAT, [{ kind: "venmo", value: "cat-moore" }]); // even when the seller has saved one since
    reserve(m.w, DAN, m.r);
    for (const viewer of [DAN, CAT]) {
      const v = viewOf(m.w, viewer);
      expect(contractViolations(v, viewer.userId)).toEqual([]);
      const r = must(v.requests.find((x) => x.id === m.r), "the exchange");
      expect([r.status, r.pay, r.paidAt, r.paymentConfirmedAt]).toEqual(["confirmed", undefined, undefined, undefined]);
      expect(JSON.stringify(v.requests)).not.toMatch(/cat-moore/);
    }
    expect(viewOf(m.w, DAN).people[CAT.userId]).toMatchObject({ contact: "user-cat@example.invalid" });
    expect(viewOf(m.w, CAT).people[DAN.userId]).toMatchObject({ contact: "user-dan@example.invalid" });
    expect(viewOf(m.w, BOB).people[CAT.userId]).not.toHaveProperty("contact");
  });

  it("the reservation's own rules are unchanged: the member confirmation, availability, and one buyer for the last ticket", () => {
    const club = invited({ club: "GCC" });
    const lid = club.l;
    // A members-only free ticket: Dan confirms he's a member as he reserves.
    const m2 = market({ club: "GCC" });
    const l2 = must(m2.w.ok(CAT.userId, answer(m2.iso, { membersOnly: true })).id, "the members-only listing");
    const r2 = invitationFor(m2.w, m2.iso).id;
    expect(m2.w.no(DAN.userId, act({ type: "reserve", requestId: r2, member: false }))).toBe("This ticket is for GCC members. Confirm you're a member to continue.");
    reserve(m2.w, DAN, r2, true);
    expect([reqOf(m2.w, r2).status, reqOf(m2.w, r2).memberConfirmed, numbers(m2.w, l2).available]).toEqual(["confirmed", true, 0]);
    // The last ticket goes to the first who reserves. A free reservation is firm at once (no payment to wait for), so the other
    // invitation closes, as it does once a paid one is paid for, in words that fit: nobody "bought" it.
    const rb = ask(club.w, BOB, lid); invite(club.w, CAT, rb);
    const got = reserve(club.w, DAN, club.r);
    expect([reqOf(club.w, rb).status, reqOf(club.w, rb).reason]).toEqual(["declined", "Another buyer reserved it first"]);
    expect(textsFor(got.notes, BOB)).toEqual(["Another buyer reserved the ticket for Oysters Night first, so your invitation is closed."]);
    expect(club.w.no(BOB.userId, act({ type: "reserve", requestId: rb, member: false }))).toBe("Another buyer reserved it first.");
    expect(numbers(club.w, lid)).toMatchObject({ available: 0, reserved: 1 });
  });

  it("until Cat sends it, Dan may release a free reservation, and it goes back on sale; once it's sent he can't", () => {
    const m = invited();
    reserve(m.w, DAN, m.r);
    const out = m.w.ok(DAN.userId, on("cancel", m.r));
    expect(out.toast).toBe("Reservation released. It's back on sale.");
    expect([reqOf(m.w, m.r).status, reqOf(m.w, m.r).reason]).toEqual(["cancelled", "Reservation released"]);
    expect(textsFor(out.notes, CAT)).toEqual(["Dan N. released their reservation for Oysters Night. It's back on sale."]);
    expect(numbers(m.w, m.l)).toMatchObject({ available: 1, reserved: 0 });
    expect(violationsOf(m.w)).toEqual([]);
    const again = invited();
    reserve(again.w, DAN, again.r);
    again.w.ok(CAT.userId, on("markTransferred", again.r));
    expect(again.w.no(DAN.userId, on("cancel", again.r))).toMatch(/can't be cancelled here/);
  });

  it("a paid reservation is exactly as before: reserved with the payment details, then paid, confirmed, sent, received", () => {
    const m = market();
    setMethods(m.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    m.w.ok(CAT.userId, answer(m.iso, { ask: "30" }));
    const r = invitationFor(m.w, m.iso).id;
    const done = reserve(m.w, DAN, r);
    expect(done.toast).toMatch(/^Reserved for 15 minutes\. Pay Cat \$30 now, then tap /);
    expect([reqOf(m.w, r).status, reqOf(m.w, r).pay]).toEqual(["accepted", [{ kind: "venmo", value: "cat-moore" }]]);
    for (const [who, step] of [[DAN, "markPaid"], [CAT, "confirmPayment"], [CAT, "markTransferred"], [DAN, "buyerReceived"]] as const) m.w.ok(who.userId, on(step, r));
    expect([reqOf(m.w, r).status, typeof reqOf(m.w, r).paidAt, typeof reqOf(m.w, r).paymentConfirmedAt]).toEqual(["completed", "number", "number"]);
    // A paid, confirmed reservation can't be released by its buyer (as before).
    const p = market();
    setMethods(p.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    p.w.ok(CAT.userId, answer(p.iso, { ask: "30" }));
    const rp = invitationFor(p.w, p.iso).id;
    reserve(p.w, DAN, rp); p.w.ok(DAN.userId, on("markPaid", rp)); p.w.ok(CAT.userId, on("confirmPayment", rp));
    expect(p.w.no(DAN.userId, on("cancel", rp))).toMatch(/^You've marked it paid, so it can't be cancelled here\./);
  });
});

describe("a $0 reservation made before this change still takes the old steps", () => {
  it("reserved with its payment details (status accepted): the buyer may still mark it paid and the seller confirm it", () => {
    const m = market();
    setMethods(m.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    m.w.ok(CAT.userId, answer(m.iso));
    const rid = invitationFor(m.w, m.iso).id;
    reserve(m.w, DAN, rid);
    // As the older code stored it: reserved and waiting for payment, with the seller's methods copied.
    const doc = copyOf(m.w) as LiveWorld;
    const old = must(doc.requests.find((r) => r.id === rid), "the stored request") as unknown as Record<string, unknown>;
    old.status = "accepted"; old.pay = [{ kind: "venmo", value: "cat-moore" }];
    const w = new ServerWorld({ people: m.w.people, doc, now: m.w.now });
    expect(violationsOf(w)).toEqual([]);
    w.ok(DAN.userId, on("markPaid", rid));
    expect([reqOf(w, rid).status, reqOf(w, rid).paidVia]).toEqual(["paid", "venmo"]);
    w.ok(CAT.userId, on("confirmPayment", rid));
    w.ok(CAT.userId, on("markTransferred", rid));
    w.ok(DAN.userId, on("buyerReceived", rid));
    expect(reqOf(w, rid).status).toBe("completed");
  });
});

describe("the words for a free ticket", () => {
  it("transferWords: a free listing's rule doesn't wait for a payment; a priced one reads as before", () => {
    const free = { ask: 0 }, priced = { ask: 25 };
    expect(E.transferWords(free as never, "seller")).toBe("Send the ticket to the buyer once they reserve it.");
    expect(E.transferWords(free as never, "buyer")).toBe("The seller sends you the ticket once you reserve it.");
    expect(E.transferWords(free as never, null)).toBe("The seller sends the ticket to the buyer once it's reserved.");
    expect(E.transferWords(priced as never, "seller")).toBe(E.SEND_AFTER_PAYMENT);
    expect(E.transferWords(priced as never, "buyer")).toBe("The seller sends you the ticket after payment.");
    expect(E.transferWords(priced as never, "buyer", true)).toBe("The seller sends you the ticket once you reserve it."); // the exchange's own price decides on its card
    expect(E.transferWords({ ask: 0, method: "app" } as never, "seller")).toBeNull(); // a recorded method keeps its own words
  });

  it("what waits on whom: a free invitation is reserved, not paid for; a request for a free ticket is answered with an invitation", () => {
    const m = market();
    const l = must(m.w.ok(CAT.userId, post(m.ev, "0", { qty: 2 })).id, "Cat's free listing");
    const r = ask(m.w, BOB, l);
    expect(m.w.run(() => E.needsAction(m.w.doc, CAT.userId)).map((t) => t.why)).toEqual(["invite them, or decline"]);
    invite(m.w, CAT, r);
    expect(m.w.run(() => E.needsAction(m.w.doc, BOB.userId)).map((t) => t.why)).toEqual(["reserve it"]);
    expect(E.freeDeal(reqOf(m.w, r))).toBe(true);
    expect(E.freeDeal({ price: 25, flow: "quick" } as never)).toBe(false);
  });

  it("the status and the buyer's own label at each stage name no purchase and no payment; a priced ticket's read as before", () => {
    const stage = (w: ServerWorld, id: string) => w.run(() => { const r = reqOf(w, id); return [E.rStatus(r, E.rState(r))?.label, E.myReqLabel(r)]; });
    const m = market();
    const l = must(m.w.ok(CAT.userId, post(m.ev, "0")).id, "Cat's free listing");
    const r = ask(m.w, BOB, l);
    expect(stage(m.w, r)).toEqual(["Request · seller to answer", "You asked for this"]);
    invite(m.w, CAT, r);
    expect(stage(m.w, r)).toEqual(["Invited · not held yet", "You're invited"]);
    reserve(m.w, BOB, r);
    expect(stage(m.w, r)).toEqual(["Reserved · transfer next", "You reserved this"]);
    m.w.ok(CAT.userId, on("markTransferred", r));
    expect(stage(m.w, r)).toEqual(["Delivered · buyer to confirm", "You reserved this"]);
    const p = market();
    setMethods(p.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    const lp = must(p.w.ok(CAT.userId, post(p.ev, "25")).id, "Cat's listing");
    const rp = ask(p.w, BOB, lp);
    expect(stage(p.w, rp)).toEqual(["Request to buy · seller to answer", "You asked to buy this"]);
    invite(p.w, CAT, rp);
    expect(stage(p.w, rp)).toEqual(["Invited to pay · not held yet", "You're invited to pay"]);
    reserve(p.w, BOB, rp);
    expect(stage(p.w, rp)).toEqual(["Reserved · awaiting payment", "You reserved this"]);
  });
});
