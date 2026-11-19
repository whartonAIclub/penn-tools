// Invite to pay (follow-on Batch 5; FOLLOWON-PLAN §1.5, §2.5, §2.7), at the unit level: the engine's four new actions and the rules
// around them, sent the way the page sends them (through parseAction) and read back through the projection.
//
//   request to buy  ->  the seller invites (as many buyers as they like)  ->  one buyer reserves (the only step that holds stock)
//   requested           invited                                              accepted (15 minutes) -> paid -> confirmed -> sent -> completed
//
// The flow was built in step S1 and switched on for the live page in step S3. These tests run with the engine's own setting; the
// rules here hold either way, except where a test says so (posting without a payment method needs it on; a record from before
// invitations is made with it off, as it was then). Compatibility with records made before the flow is in
// invite-flow-compat.test.ts; the database-backed checks (the race for the last unit, retries, the last-method guard, email) are
// in invite-flow-store.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import {
  OPEN_UNTIL, ask, askAction, evalOf, historyOf, invite, inviteAction, invited, lastHistory, listWithoutHandle, listingOf, loadOf, market, must,
  noteRows, numbers, on, reqOf, reserve, reserveAction, reserved, resetEngine, setMethods, statusOf, textsFor, violationsOf,
} from "./helpers/invite.js";
import { FAY, PEOPLE6, ServerWorld, allText, emailOf, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, EVE, HOUR, MIN, T0, wallAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const DUE = E.fmtMs(OPEN_UNTIL);
const TODO = { name: "activity", tab: "todo" };
const LISTINGS = { name: "activity", tab: "listings" };
const REQUESTS = { name: "activity", tab: "requests" };
const MEMBERS = "This ticket is for Wharton Graduate Association members. Confirm you're a member to continue.";
const HELD_ELSEWHERE = `Another buyer is paying for it right now. Your invitation stays open until ${DUE} in case it comes back.`;
const UNPAID_FIRST = "You already have an unpaid reservation for this event. Pay for it or release it first.";
const NOT_YET = ["invitedAt", "acceptedAt", "holdUntil", "pay", "paidVia", "blockedAt"] as const;
/** Well-formed ids of records that don't exist. */
const NO_LISTING = `l${"0".repeat(16)}`;
const NO_REQUEST = `r${"0".repeat(16)}`;

describe("request to buy (B5.3)", () => {
  it("holds nothing, shows no destination, changes nothing anyone else sees, and tells the seller", () => {
    const { w, ev, l } = market({ qty: 2 });
    const guestBefore = guestViewOf(w, { version: 1 });
    const fayBefore = viewOf(w, FAY, { version: 1 });
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 2 });

    const sent = w.ok(BOB.userId, askAction(l));
    const r = must(sent.id, "the request's id");
    expect(sent.toast).toBe(`Request sent. Nothing is held: Ann has until ${DUE} to invite you to pay.`);
    expect(noteRows(sent.notes)).toEqual([[ANN.userId, `Bob D. wants 1 ticket for Spring Formal at $35 each. Invite them to pay, or decline, by ${DUE}.`, TODO, "buy.requested", r]]);

    const rec = reqOf(w, r);
    expect(rec).toMatchObject({ listingId: l, eventId: ev, buyerId: BOB.userId, qty: 1, topUp: 0, price: 35, flow: "quick", inviteFlow: true, status: "requested", expiresAt: OPEN_UNTIL, msg: "" });
    for (const k of [...NOT_YET, "isOffer"]) expect(rec).not.toHaveProperty(k);
    expect(lastHistory(rec)).toBe("Asked to buy 1 ticket at $35 each: nothing is held");

    // Nothing is held or counted: the listing's numbers, the buyer's per-person load, a guest's view and a bystander's view are as before.
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 2 });
    expect(loadOf(w, BOB, ev)).toBe(0);
    expect(guestViewOf(w, { version: 1 })).toEqual(guestBefore);
    expect(viewOf(w, FAY, { version: 1 })).toEqual(fayBefore);

    // Its two parties see it; neither sees a payment destination or the other's contact.
    const bob = viewOf(w, BOB); const ann = viewOf(w, ANN);
    expect(bob.requests.map((x) => x.id)).toEqual([r]);
    expect(ann.requests.map((x) => x.id)).toEqual([r]);
    expect(bob.requests[0]).not.toHaveProperty("pay");
    expect(must(bob.people[ANN.userId], "Ann, to Bob")).not.toHaveProperty("contact");
    expect(must(ann.people[BOB.userId], "Bob, to Ann")).not.toHaveProperty("contact");
    expect(allText(bob)).not.toContain("@ann-lee");
    expect(allText(bob)).not.toContain(emailOf(ANN));
    expect(allText(ann)).not.toContain(emailOf(BOB));
    expect(violationsOf(w)).toEqual([]);
  });

  it("can carry an offer where the seller takes them, and never where they don't", () => {
    const plain = market();
    expect(plain.w.no(BOB.userId, askAction(plain.l, { amount: "30" }))).toBe("This seller isn't taking offers. Ask to buy it at the asking price.");

    const { w, l } = market({ qty: 2, obo: true, minOffer: "30" });
    expect(w.no(BOB.userId, askAction(l, { amount: "35" }))).toBe("An offer has to be below the asking price ($35). To ask at that price, leave the offer out.");
    expect(w.no(BOB.userId, askAction(l, { amount: "0" }))).toBe("Offer: enter more than $0.");
    expect(w.no(BOB.userId, askAction(l, { amount: "29" }))).toBe("This seller takes offers from $30.");
    const sent = w.ok(BOB.userId, askAction(l, { amount: "32" }));
    const r = must(sent.id, "the request's id");
    expect(reqOf(w, r)).toMatchObject({ status: "requested", inviteFlow: true, isOffer: true, price: 32 });
    expect(lastHistory(reqOf(w, r))).toBe("Asked to buy 1 ticket, offering $32 each (asking $35): nothing is held");
    expect(noteRows(sent.notes)).toEqual([[ANN.userId, `Bob D. wants 1 ticket for Spring Formal and offers $32 each (you're asking $35). Invite them to pay, or decline, by ${DUE}.`, TODO, "buy.requested", r]]);

    // The seller invites at the offer by default, may invite higher (up to the asking price), and never lower than the offer.
    expect(w.no(ANN.userId, inviteAction(r, { price: "31" }))).toBe("Bob offered $32. Invite at that price or more.");
    expect(w.no(ANN.userId, inviteAction(r, { price: "36" }))).toBe("You're asking $35. Invite at that price or less, or change the listing's price first.");
    invite(w, ANN, r);
    expect(reqOf(w, r)).toMatchObject({ status: "invited", price: 32 });
    const higher = ask(w, CAT, l, { amount: "31" });
    const note = invite(w, ANN, higher, { price: "34" }).notes;
    expect(textsFor(note, CAT)).toEqual([`Ann invited you to pay $34 each for 1 ticket for Spring Formal. It isn't held yet: reserve it by ${DUE}, then you have up to 15 minutes to pay.`]);
    expect(reserve(w, CAT, higher).toast).toBe(`Reserved for 15 minutes. Pay Ann $34 now, then tap "I've sent payment".`);
  });

  it("is refused when there is nothing to ask for, and once per listing", () => {
    const { w, l } = market({ qty: 2 });
    expect(w.no(ANN.userId, askAction(l))).toBe("You can't buy your own listing.");
    expect(w.no(BOB.userId, askAction(NO_LISTING))).toBe("Listing not found.");
    expect(w.no(BOB.userId, askAction(l, { qty: 3 }))).toBe("Choose between 1 and 2 tickets.");
    const r = ask(w, BOB, l);
    expect(w.no(BOB.userId, askAction(l))).toBe("You've already asked to buy this.");
    invite(w, ANN, r);
    expect(w.no(BOB.userId, askAction(l))).toBe("You're already invited to pay for this. Reserve it to hold it.");
    reserve(w, BOB, r);
    expect(w.no(BOB.userId, askAction(l))).toBe("You've already reserved this listing.");
    expect(w.doc.requests).toHaveLength(1);

    // Everything left is held for other buyers: there is nothing to ask for until a hold ends.
    reserved(w, ANN, CAT, l);
    expect(w.no(DAN.userId, askAction(l))).toBe("No tickets are left on this listing.");
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    expect(w.no(DAN.userId, askAction(l))).toBe("The seller has paused this listing, so you can't ask to buy it right now.");
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    expect(w.no(DAN.userId, askAction(l))).toBe("This listing is closed.");
  });
});

describe("invite to pay (B5.4)", () => {
  it("consumes no stock, is nonexclusive, and tells the buyer what it means", () => {
    const { w, ev, l } = market();
    const rb = ask(w, BOB, l); const rc = ask(w, CAT, l);
    const guestBefore = guestViewOf(w, { version: 1 });
    const fayBefore = viewOf(w, FAY, { version: 1 });

    const sent = invite(w, ANN, rb);
    expect(sent.toast).toBe(`Invitation sent. Nothing is held: it's Bob's once they reserve it, by ${DUE}. You can invite others too.`);
    expect(noteRows(sent.notes)).toEqual([[BOB.userId, `Ann invited you to pay $35 each for 1 ticket for Spring Formal. It isn't held yet: reserve it by ${DUE}, then you have up to 15 minutes to pay.`, TODO, "buy.invited", rb]]);
    invite(w, ANN, rc); // the one ticket, to a second buyer

    for (const id of [rb, rc]) {
      const rec = reqOf(w, id);
      expect(rec).toMatchObject({ status: "invited", inviteFlow: true, qty: 1, price: 35, expiresAt: OPEN_UNTIL });
      expect(rec.invitedAt).toEqual(expect.any(Number));
      for (const k of ["acceptedAt", "holdUntil", "pay", "paidVia", "blockedAt"]) expect(rec).not.toHaveProperty(k);
      expect(lastHistory(rec)).toBe("Seller invited the buyer to pay $35 each for 1 ticket: not held until the buyer reserves it");
    }
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 1 });
    expect(loadOf(w, BOB, ev)).toBe(0);
    expect(guestViewOf(w, { version: 1 })).toEqual(guestBefore);
    expect(viewOf(w, FAY, { version: 1 })).toEqual(fayBefore);

    // Still no destination and no contact for an invited buyer.
    const bob = viewOf(w, BOB);
    expect(bob.requests.map((x) => [x.id, x.status])).toEqual([[rb, "invited"]]);
    expect(bob.requests[0]).not.toHaveProperty("pay");
    expect(must(bob.people[ANN.userId], "Ann, to Bob")).not.toHaveProperty("contact");
    expect(allText(bob)).not.toContain("@ann-lee");
    expect(allText(bob)).not.toContain(emailOf(ANN));
    expect(allText(bob)).not.toContain("Cat"); // one buyer never sees another's request
    expect(violationsOf(w)).toEqual([]);
  });

  it("is the seller's alone, once, and only on a new-flow request that is still open", () => {
    // Before the switch: the listing, and an offer made the old way.
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 2, obo: true });
    const legacy = must(w.ok(CAT.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "the offer's id");
    E.setInviteSwitch(null);
    const r = ask(w, BOB, l);
    expect(w.no(BOB.userId, inviteAction(r))).toBe("Only the seller can send an invitation.");
    expect(w.no(FAY.userId, inviteAction(r))).toBe("Request not found.");
    expect(w.no(ANN.userId, inviteAction(NO_REQUEST))).toBe("Request not found.");
    invite(w, ANN, r);
    expect(w.no(ANN.userId, inviteAction(r))).toBe("You've already invited Bob.");
    reserve(w, BOB, r);
    expect(w.no(ANN.userId, inviteAction(r))).toBe("It's already reserved.");

    // The offer made the old way is answered the old way.
    expect(w.no(ANN.userId, inviteAction(legacy))).toBe("This one came before invitations. Accept, counter or decline it instead.");

    const gone = ask(w, DAN, l);
    w.ok(DAN.userId, on("cancel", gone));
    expect(w.no(ANN.userId, inviteAction(gone))).toBe("This request is closed.");
  });

  it("can be for fewer than the buyer asked, and only for what is available right now", () => {
    const { w, l } = market({ qty: 2 });
    const two = ask(w, DAN, l, { qty: 2 });
    const one = reserved(w, ANN, BOB, l); // one of the two is held now
    expect(w.no(ANN.userId, inviteAction(two))).toBe("Only 1 ticket is available right now, and Dan asked for 2. Choose how many to invite them for.");
    expect(w.no(ANN.userId, inviteAction(two, { qty: 2 }))).toBe("Choose between 1 and 1 ticket.");
    invite(w, ANN, two, { qty: 1 });
    expect(reqOf(w, two)).toMatchObject({ status: "invited", qty: 1, wantedQty: 2 });
    expect(lastHistory(reqOf(w, two))).toBe("Seller invited the buyer to pay $35 each for 1 ticket (they asked for 2): not held until the buyer reserves it");
    reserve(w, DAN, two);
    expect(numbers(w, l)).toEqual({ reserved: 2, completed: 0, available: 0 });

    // Everything is held: a third buyer who asked earlier can't be invited until a hold ends.
    const m = market();
    const waiting = ask(m.w, CAT, m.l);
    reserved(m.w, ANN, BOB, m.l);
    expect(m.w.no(ANN.userId, inviteAction(waiting))).toBe(`Another buyer is paying for it right now. You can invite Cat if it comes back: their request stays open until ${DUE}.`);
    expect(statusOf(m.w, waiting)).toBe("requested");
    expect(statusOf(w, one)).toBe("accepted");
  });
});

describe("reserve (B5.5)", () => {
  it("holds it for 15 minutes, copies how to pay, and only then shows the destination", () => {
    const { w, ev, l } = market({ qty: 2 });
    const r = invited(w, ANN, BOB, l);
    const done = reserve(w, BOB, r);
    expect(done.toast).toBe(`Reserved for 15 minutes. Pay Ann $35 now, then tap "I've sent payment".`);
    expect(done.id).toBe(r);
    expect(noteRows(done.notes)).toEqual([[ANN.userId, `Bob D. reserved 1 ticket for Spring Formal at $35 each. They have 15 minutes to pay you and tap "I've sent payment".`, TODO, null, null]]);

    const rec = reqOf(w, r);
    const pay = E.readPayMethods(null, ANN.payHandle);
    expect(pay.length).toBeGreaterThan(0);
    expect(rec).toMatchObject({ status: "accepted", holdUntil: T0 + 15 * MIN, pay });
    expect(rec.acceptedAt).toEqual(expect.any(Number));
    expect(must(rec.acceptedAt, "acceptedAt")).toBeGreaterThanOrEqual(must(rec.invitedAt, "invitedAt"));
    expect(lastHistory(rec)).toBe("Buyer reserved it at $35 each: held 15 minutes for payment");
    expect(numbers(w, l)).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(loadOf(w, BOB, ev)).toBe(1);

    // Now, and not before: the buyer sees how to pay and each side sees the other's contact.
    const bob = viewOf(w, BOB); const ann = viewOf(w, ANN);
    expect(must(bob.requests[0], "Bob's request").pay).toEqual(pay);
    expect(must(bob.people[ANN.userId], "Ann, to Bob").contact).toBe(emailOf(ANN));
    expect(must(ann.people[BOB.userId], "Bob, to Ann").contact).toBe(emailOf(BOB));

    // Everyone else sees counts only.
    const fay = viewOf(w, FAY);
    expect(must(fay.listings.find((x) => x.id === l), "the listing, to Fay").numbers).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(fay.requests).toEqual([]);
    for (const secret of ["Bob", BOB.userId, "@ann-lee", emailOf(ANN), emailOf(BOB)]) expect(allText(fay)).not.toContain(secret);
    const guest = guestViewOf(w);
    for (const secret of ["Bob", BOB.userId, "@ann-lee", emailOf(ANN), emailOf(BOB)]) expect(allText(guest)).not.toContain(secret);
    expect(violationsOf(w)).toEqual([]);
  });

  it("is for the invited buyer only, and says where the record stands otherwise", () => {
    // Before the switch: the listing, and an offer made the old way.
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 3, obo: true });
    const legacy = must(w.ok(CAT.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "the offer's id");
    E.setInviteSwitch(null);
    const r = ask(w, BOB, l);
    expect(w.no(CAT.userId, reserveAction(r))).toBe("Invitation not found.");
    expect(w.no(ANN.userId, reserveAction(r))).toBe("Invitation not found.");
    expect(w.no(BOB.userId, reserveAction(NO_REQUEST))).toBe("Invitation not found.");
    expect(w.no(BOB.userId, reserveAction(r))).toBe("Ann hasn't invited you to pay yet.");
    expect(w.no(CAT.userId, reserveAction(legacy))).toBe("There's no invitation to reserve here.");
    expect(reqOf(w, r).status).toBe("requested");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 3 });
  });

  it("checks in the plan's order: the record's state, then the listing, a pause, membership, stock, the per-person cap, an unpaid hold", () => {
    // State before pause: a withdrawn invitation on a paused listing says it was withdrawn.
    const a = market({ qty: 2 });
    const gone = invited(a.w, ANN, BOB, a.l); const open = invited(a.w, ANN, CAT, a.l);
    a.w.ok(ANN.userId, on("decline", gone));
    a.w.ok(ANN.userId, { type: "pauseListing", listingId: a.l });
    expect(a.w.no(BOB.userId, reserveAction(gone))).toBe("The seller withdrew this invitation.");
    expect(a.w.no(CAT.userId, reserveAction(open))).toBe(`Ann has paused this listing, so you can't reserve it right now. Your invitation stays open until ${DUE}.`);

    // Pause before membership and stock; membership before stock.
    const m = market({ event: { attend: "members" } });
    const iso = m.w.requestFor(BOB, m.ev);
    const sent = m.w.ok(ANN.userId, { type: "inviteRequester", isoId: iso, listingId: m.l, qty: 1 });
    const rb = must(sent.id, "Bob's invitation");
    expect(textsFor(sent.notes, BOB)).toEqual([`Ann L. invited you to pay $35 each for 1 ticket for Spring Formal, for your request. It isn't held yet: reserve it by ${DUE}, then you have up to 15 minutes to pay. Members only: you'll confirm you're a Wharton Graduate Association member.`]);
    expect(m.w.no(CAT.userId, askAction(m.l))).toBe(MEMBERS);
    const rc = invited(m.w, ANN, CAT, m.l, { member: true });
    expect(reqOf(m.w, rc).memberConfirmed).toBe(true);
    m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l });
    expect(m.w.no(BOB.userId, reserveAction(rb))).toBe(`Ann has paused this listing, so you can't reserve it right now. Your invitation stays open until ${DUE}.`);
    m.w.ok(ANN.userId, { type: "resumeListing", listingId: m.l });
    reserve(m.w, CAT, rc); // Cat confirmed when asking: no second question
    expect(m.w.no(BOB.userId, reserveAction(rb))).toBe(MEMBERS); // not the stock words, though Cat holds it
    expect(m.w.no(BOB.userId, reserveAction(rb, true))).toBe(HELD_ELSEWHERE);
    expect(reqOf(m.w, rb)).not.toHaveProperty("memberConfirmed"); // a refused tap stores nothing
    m.w.ok(CAT.userId, on("cancel", rc));
    reserve(m.w, BOB, rb, true);
    expect(reqOf(m.w, rb)).toMatchObject({ status: "accepted", memberConfirmed: true });
    expect(historyOf(reqOf(m.w, rb))).toContain("Buyer confirmed they're a Wharton Graduate Association member (not checked by Handoff)");

    // Stock before the per-person cap.
    const s = market({ event: { perPerson: 2 } });
    const sb = invited(s.w, ANN, BOB, s.l); const sc = invited(s.w, ANN, CAT, s.l);
    s.w.ok(BOB.userId, { type: "addHolding", eventId: s.ev, tier: "t1", qty: 2, paid: "40" }); // Bob now holds the event's limit
    reserve(s.w, CAT, sc);
    expect(s.w.no(BOB.userId, reserveAction(sb))).toBe(HELD_ELSEWHERE);
    s.w.ok(CAT.userId, on("cancel", sc));
    expect(s.w.no(BOB.userId, reserveAction(sb))).toBe("That would take you over 2 per person for this event, counting tickets you hold or have reserved.");

    // The cap before the unpaid-hold rule.
    const c = market({ event: { perPerson: 2 } });
    const l2 = c.w.listTickets(EVE, c.ev, { qty: 2 });
    const c1 = invited(c.w, ANN, BOB, c.l); const c2 = invited(c.w, EVE, BOB, l2, { qty: 2 });
    reserve(c.w, BOB, c2);
    expect(c.w.no(BOB.userId, reserveAction(c1))).toBe("That would take you over 2 per person for this event, counting tickets you hold or have reserved.");

    // The unpaid-hold rule alone: one unpaid reservation per event at a time.
    const u = market();
    const ul2 = u.w.listTickets(EVE, u.ev);
    const u1 = invited(u.w, ANN, BOB, u.l); const u2 = invited(u.w, EVE, BOB, ul2);
    reserve(u.w, BOB, u1);
    expect(u.w.no(BOB.userId, reserveAction(u2))).toBe(UNPAID_FIRST);
    u.w.ok(BOB.userId, on("markPaid", u1));
    reserve(u.w, BOB, u2);
    expect([u1, u2].map((id) => statusOf(u.w, id))).toEqual(["paid", "accepted"]);
    for (const x of [a, m, s, c, u]) expect(violationsOf(x.w)).toEqual([]);
  });

  it("holds for less than 15 minutes when a cutoff comes first, and says how long", () => {
    const { w, l } = market({ event: { deadline: wallAfter(T0, 0, "12:10") } }); // transfers close ten minutes from now
    const cutoff = T0 + 10 * MIN;
    const sent = w.ok(BOB.userId, askAction(l));
    const r = must(sent.id, "the request's id");
    expect(sent.toast).toBe(`Request sent. Nothing is held: Ann has until ${E.fmtMs(cutoff)} to invite you to pay.`);
    invite(w, ANN, r);
    const other = invited(w, ANN, CAT, l);
    const done = reserve(w, BOB, r);
    expect(done.toast).toBe(`Reserved for 10 minutes. Pay Ann $35 now, then tap "I've sent payment".`);
    expect(reqOf(w, r)).toMatchObject({ status: "accepted", holdUntil: cutoff, expiresAt: cutoff });
    expect(textsFor(done.notes, ANN)).toEqual([`Bob D. reserved 1 ticket for Spring Formal at $35 each. They have 10 minutes to pay you and tap "I've sent payment".`]);

    // After the cutoff nothing new is committed: the other invitation has ended, and says so before anything else.
    w.now = cutoff + MIN;
    expect(w.no(CAT.userId, reserveAction(other))).toBe("This invitation has ended.");
    expect(evalOf(w, other).st).toBe("expired");
  });

  it("copies the seller's methods as they are when it's reserved, not when the invitation was sent", () => {
    const { w, l } = market();
    const r = invited(w, ANN, BOB, l);
    setMethods(w, ANN, [{ kind: "venmo", value: "ann-venmo" }]);
    reserve(w, BOB, r);
    expect(reqOf(w, r).pay).toEqual([{ kind: "venmo", value: "ann-venmo" }]);
    setMethods(w, ANN, [{ kind: "paypal", value: "ann@example.invalid" }]); // a later change doesn't move an agreed exchange
    expect(reqOf(w, r).pay).toEqual([{ kind: "venmo", value: "ann-venmo" }]);
    expect(must(viewOf(w, BOB).requests[0], "Bob's request").pay).toEqual([{ kind: "venmo", value: "ann-venmo" }]);
  });

  it("needs the seller's payment method at invite time: refused last, in words the page can collect one from (switched on)", () => {
    E.setInviteSwitch(true);
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = w.addEvent(ANN);
    const l = must(w.ok(CAT.userId, listWithoutHandle(ev)).id, "Cat's listing"); // Cat has no method: posting no longer asks for one
    expect(listingOf(w, l)).not.toHaveProperty("payHandle");
    const r = ask(w, BOB, l);
    const iso = w.requestFor(DAN, ev);

    expect(w.no(CAT.userId, inviteAction(r, { price: "36" }))).toBe("You're asking $35. Invite at that price or less, or change the listing's price first.");
    expect(w.no(CAT.userId, inviteAction(r))).toBe(E.NO_PAY_METHODS);
    expect(w.no(CAT.userId, { type: "inviteRequester", isoId: iso, listingId: l, qty: 1, price: "36" })).toBe("You're asking $35. Invite at that price or less, or change the listing's price first.");
    expect(w.no(CAT.userId, { type: "inviteRequester", isoId: iso, listingId: l, qty: 1 })).toBe(E.NO_PAY_METHODS);
    expect(statusOf(w, r)).toBe("requested");
    expect(w.doc.requests).toHaveLength(1);

    setMethods(w, CAT, [{ kind: "venmo", value: "cat-moore" }]); // saved inline; the same tap again
    invite(w, CAT, r);
    // Should the method be gone again before the buyer reserves, the reservation is refused rather than made without a destination.
    setMethods(w, CAT, []);
    expect(w.no(BOB.userId, reserveAction(r))).toBe("This seller hasn't added how to pay them yet.");
    setMethods(w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    reserve(w, BOB, r);
    expect(reqOf(w, r).pay).toEqual([{ kind: "venmo", value: "cat-moore" }]);
    expect(violationsOf(w)).toEqual([]);
  });
});

describe("releasing a hold (B5.6)", () => {
  it("the buyer releases an unpaid hold in one tap; the seller can't during it; the freed unit is offered once to who was waiting", () => {
    const { w, ev, l } = market();
    const rb = invited(w, ANN, BOB, l); const rc = invited(w, ANN, CAT, l);
    const held = reserve(w, BOB, rb);
    expect(held.notes.map((n) => n.userId)).toEqual([ANN.userId]); // Cat isn't told that someone else is paying
    expect(reqOf(w, rc).blockedAt).toEqual(expect.any(Number));
    expect(statusOf(w, rc)).toBe("invited");

    const until = E.fmtMs(T0 + 15 * MIN);
    const kept = `It's reserved for Bob until ${until}. If they don't pay by then, it comes back to you on its own.`;
    expect(w.no(ANN.userId, on("release", rb))).toBe(kept);
    expect(w.no(ANN.userId, on("decline", rb))).toBe(kept);
    expect(statusOf(w, rb)).toBe("accepted");

    const freed = w.ok(BOB.userId, on("cancel", rb));
    expect(freed.toast).toBe("Reservation released. It's back on sale.");
    expect(noteRows(freed.notes)).toEqual([ // newest first, as the document keeps them
      [CAT.userId, `The ticket Ann invited you to pay for, for Spring Formal, is available again. Reserve by ${DUE}: nothing is held until you do.`, { name: "event", id: ev }, null, null],
      [ANN.userId, "Bob D. released their reservation for Spring Formal without paying. It's back on sale.", LISTINGS, null, null],
    ]);
    expect(reqOf(w, rb)).toMatchObject({ status: "cancelled", reason: "Reservation released" });
    expect(reqOf(w, rc)).not.toHaveProperty("blockedAt");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 1 });
    expect(w.no(BOB.userId, reserveAction(rb))).toBe("You released this reservation.");

    // The rest is the flow that was already there: paid, confirmed, transferred, received.
    reserve(w, CAT, rc);
    const paid = w.ok(CAT.userId, on("markPaid", rc));
    expect(paid.notes.map((n) => [n.userId, n.kind])).toEqual([[ANN.userId, "payment.reported"]]);
    expect(w.ok(ANN.userId, on("confirmPayment", rc)).toast).toMatch(/^Payment confirmed\. Now /);
    const sent = w.ok(ANN.userId, on("markTransferred", rc));
    expect(sent.notes.map((n) => [n.userId, n.kind])).toEqual([[CAT.userId, "transfer.sent"]]);
    w.ok(CAT.userId, on("buyerReceived", rc));
    expect(reqOf(w, rc).status).toBe("completed");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 1, available: 0 });
    expect(textsFor(w.notes, CAT).filter((t) => t.includes("available again"))).toHaveLength(1);
    expect(violationsOf(w)).toEqual([]);
  });

  it("once it's marked paid, the payment-not-arrived safeguards apply as they always did", () => {
    const { w, l } = market();
    const r = reserved(w, ANN, BOB, l);
    w.ok(BOB.userId, on("markPaid", r));
    expect(w.no(BOB.userId, on("cancel", r))).toBe(`You've marked it paid, so it can't be cancelled here. If something's wrong, tap "There's a problem".`);
    expect(w.no(ANN.userId, on("decline", r))).toBe(`It's reserved and paid for, so it can't be declined. If something's wrong, tap "There's a problem".`);
    expect(w.no(ANN.userId, on("release", r))).toBe("The buyer says they paid. If the money hasn't arrived, tap “Payment hasn't arrived” first: they can then cancel, or you can release it after a while.");

    const missing = w.ok(ANN.userId, on("paymentMissing", r));
    expect(missing.notes.map((n) => [n.userId, n.kind])).toEqual([[BOB.userId, "payment.missing"]]);
    const after = must(reqOf(w, r).releaseAfter, "releaseAfter");
    expect(after).toBe(T0 + 24 * HOUR);
    expect(w.no(ANN.userId, on("release", r))).toBe(`You can release it after ${E.fmtMs(after)} if the payment still hasn't arrived. Bob can cancel before then.`);
    w.now = after + MIN;
    expect(w.ok(ANN.userId, on("release", r)).toast).toMatch(/^Released\. /);
    expect(reqOf(w, r)).toMatchObject({ status: "released", reason: "Released by the seller: the payment didn't arrive" });
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 1 });

    // Or the buyer cancels after the seller's report.
    const b = market();
    const rb = reserved(b.w, ANN, BOB, b.l);
    b.w.ok(BOB.userId, on("markPaid", rb));
    b.w.ok(ANN.userId, on("paymentMissing", rb));
    expect(b.w.ok(BOB.userId, on("cancel", rb)).toast).toBe("Reservation cancelled. It's back on sale. If you did pay, sort it out with Ann directly: Handoff can't see payments.");
    expect(reqOf(b.w, rb)).toMatchObject({ status: "cancelled", reason: "Buyer withdrew after the seller said the payment didn't arrive" });
    expect(violationsOf(w)).toEqual([]);
    expect(violationsOf(b.w)).toEqual([]);
  });
});

describe("cancel and decline mean what the stage says", () => {
  it("withdraw a request, decline a request, decline an invitation, withdraw an invitation", () => {
    const { w, ev, l } = market({ qty: 3 });
    const EVENT = { name: "event", id: ev };

    const r1 = ask(w, BOB, l);
    const c1 = w.ok(BOB.userId, on("cancel", r1));
    expect(c1.toast).toBe("Request withdrawn.");
    expect(noteRows(c1.notes)).toEqual([[ANN.userId, "Bob D. withdrew their request to buy for Spring Formal.", LISTINGS, null, null]]);
    expect(reqOf(w, r1)).toMatchObject({ status: "cancelled", reason: "Request withdrawn" });

    const r2 = ask(w, CAT, l);
    const d2 = w.ok(ANN.userId, on("decline", r2));
    expect(d2.toast).toBe("Request declined.");
    expect(noteRows(d2.notes)).toEqual([[CAT.userId, "Your request to buy for Spring Formal was declined.", EVENT, null, null]]);
    expect(reqOf(w, r2)).toMatchObject({ status: "declined", reason: "Declined by seller" });

    const r3 = invited(w, ANN, DAN, l);
    const c3 = w.ok(DAN.userId, on("cancel", r3));
    expect(c3.toast).toBe("Invitation declined.");
    expect(noteRows(c3.notes)).toEqual([[ANN.userId, "Dan N. declined your invitation for Spring Formal.", LISTINGS, null, null]]);
    expect(reqOf(w, r3)).toMatchObject({ status: "cancelled", reason: "Invitation declined" });

    const r4 = invited(w, ANN, EVE, l);
    const d4 = w.ok(ANN.userId, on("decline", r4));
    expect(d4.toast).toBe("Invitation withdrawn.");
    expect(noteRows(d4.notes)).toEqual([[EVE.userId, "Ann withdrew their invitation for Spring Formal.", EVENT, null, null]]);
    expect(reqOf(w, r4)).toMatchObject({ status: "declined", reason: "Invitation withdrawn by the seller" });

    // Each closed record answers a later tap in its own words, and nothing was ever held.
    expect(w.no(BOB.userId, reserveAction(r1))).toBe("You withdrew this request.");
    expect(w.no(CAT.userId, reserveAction(r2))).toBe("This request was declined.");
    expect(w.no(DAN.userId, reserveAction(r3))).toBe("You declined this invitation.");
    expect(w.no(EVE.userId, reserveAction(r4))).toBe("The seller withdrew this invitation.");
    expect(w.no(BOB.userId, on("cancel", r1))).toBe("This request is already closed.");
    expect(w.no(ANN.userId, inviteAction(r2))).toBe("This request is closed.");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 3 });
    ask(w, BOB, l); // a buyer who withdrew may ask again
    expect(violationsOf(w)).toEqual([]);
  });
});

describe("settling", () => {
  it("another buyer's hold only blocks an invitation, silently; a paid sale closes what can never be covered, with one note", () => {
    const { w, ev, l } = market({ qty: 2 });
    const EVENT = { name: "event", id: ev };
    const rb = invited(w, ANN, BOB, l, { qty: 2 }); // invited for both
    const rc = invited(w, ANN, CAT, l);             // invited for one
    const rd = ask(w, DAN, l, { qty: 2 });          // asked for two
    const re = ask(w, EVE, l);                      // asked for one

    // Cat reserves one: Bob's invitation for two can't be reserved right now. Nobody but the seller is told, and nothing is declined.
    const held = reserve(w, CAT, rc);
    expect(held.notes.map((n) => n.userId)).toEqual([ANN.userId]);
    expect(reqOf(w, rb).blockedAt).toEqual(expect.any(Number));
    expect([rb, rd, re].map((id) => statusOf(w, id))).toEqual(["invited", "requested", "requested"]);
    expect(w.no(BOB.userId, reserveAction(rb))).toBe(HELD_ELSEWHERE);

    // Cat pays: that unit is sold for good. Bob's invitation for two can never be covered, so it closes with a note. Dan's request
    // for two stays open (Ann may still invite him for one), and so does Eve's.
    const paid = w.ok(CAT.userId, on("markPaid", rc));
    expect(noteRows(paid.notes.filter((n) => n.userId !== ANN.userId))).toEqual([
      [BOB.userId, "Another buyer bought the ticket for Spring Formal first, so your invitation is closed.", EVENT, null, null],
    ]);
    expect(reqOf(w, rb)).toMatchObject({ status: "declined", reason: "Another buyer bought it first" });
    expect(reqOf(w, rb)).not.toHaveProperty("blockedAt");
    expect(lastHistory(reqOf(w, rb))).toBe("Closed: another buyer bought it first");
    expect(w.no(BOB.userId, reserveAction(rb))).toBe("Another buyer bought it first.");
    expect([rd, re].map((id) => statusOf(w, id))).toEqual(["requested", "requested"]);

    // Dan takes the last one; when he pays, Eve's request closes too.
    invite(w, ANN, rd, { qty: 1 });
    reserve(w, DAN, rd);
    expect(statusOf(w, re)).toBe("requested");
    const last = w.ok(DAN.userId, on("markPaid", rd));
    expect(noteRows(last.notes.filter((n) => n.userId !== ANN.userId))).toEqual([
      [EVE.userId, "Another buyer bought the ticket for Spring Formal first, so your request is closed.", EVENT, null, null],
    ]);
    expect(reqOf(w, re)).toMatchObject({ status: "declined", reason: "Another buyer bought it first" });
    expect(numbers(w, l)).toEqual({ reserved: 2, completed: 0, available: 0 });
    expect(violationsOf(w)).toEqual([]);
  });
});

describe("retries, double clicks and partial quantities (B5.7g)", () => {
  it("a second tap is refused in plain words and stores nothing twice", () => {
    const { w, l } = market({ qty: 2 });
    const r = ask(w, BOB, l, { qty: 2 });
    expect(w.no(BOB.userId, askAction(l, { qty: 2 }))).toBe("You've already asked to buy this.");
    invite(w, ANN, r, { qty: 1 }); // one of the two he asked for
    expect(w.no(ANN.userId, inviteAction(r, { qty: 1 }))).toBe("You've already invited Bob.");
    reserve(w, BOB, r);
    const before = w.doc;
    expect(w.no(BOB.userId, reserveAction(r))).toBe("You've already reserved it.");
    expect(w.doc).toBe(before);
    expect(w.doc.requests).toHaveLength(1);
    expect(reqOf(w, r)).toMatchObject({ status: "accepted", qty: 1, wantedQty: 2 });
    expect(numbers(w, l)).toEqual({ reserved: 1, completed: 0, available: 1 }); // inviting one of two leaves one on sale
    w.ok(BOB.userId, on("markPaid", r));
    expect(w.no(BOB.userId, reserveAction(r))).toBe("You've already reserved it.");
    expect(w.no(BOB.userId, on("markPaid", r))).toEqual(expect.any(String));
    expect(numbers(w, l)).toEqual({ reserved: 1, completed: 0, available: 1 });
  });
});

describe("stale invitations: price, pause, close, expiry (B5.7f, B5.7h)", () => {
  const edit = (l: string, price: string) => ({ type: "editListing", listingId: l, ask: price });

  it("the price can't drop below an open invitation or an offer that came with a request; an invitation keeps its price", () => {
    const { w, l } = market({ qty: 3, obo: true });
    const offer = ask(w, BOB, l, { amount: "32" });
    const plain = ask(w, CAT, l);
    expect(w.no(ANN.userId, edit(l, "31"))).toBe("There's an open offer of $32 on this listing. Keep the price at $32 or more, or answer the request first.");
    w.ok(ANN.userId, edit(l, "33")); // above the offer: fine, and a plain request follows the price down
    invite(w, ANN, plain);
    expect(reqOf(w, plain)).toMatchObject({ status: "invited", price: 33 });
    expect(w.no(ANN.userId, edit(l, "32"))).toBe("You've invited Cat at $33. Keep the price at $33 or more, or withdraw the invitation first.");

    // Raising it is allowed; the invitation stays at the price it was sent at, and so does the reservation.
    expect(w.ok(ANN.userId, edit(l, "35")).toast).toBe("Listing updated. Reservations and offers already made keep their prices.");
    expect(reserve(w, CAT, plain).toast).toBe(`Reserved for 15 minutes. Pay Ann $33 now, then tap "I've sent payment".`);
    expect(reqOf(w, plain).price).toBe(33);
    invite(w, ANN, offer);
    expect(reqOf(w, offer).price).toBe(32);

    // Once the invitation is withdrawn the floor goes with it.
    w.ok(ANN.userId, on("decline", offer));
    w.ok(ANN.userId, edit(l, "20"));
    expect(listingOf(w, l).ask).toBe(20);
    expect(violationsOf(w)).toEqual([]);
  });

  it("a pause stops Invite and Reserve, keeps deadlines, and tells each buyer; resuming tells them again", () => {
    const { w, l } = market({ qty: 2 });
    const asked = ask(w, BOB, l); const inv = invited(w, ANN, CAT, l);
    const paused = w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    // The toast and the listing's history name this flow's steps, as the seller's pause card does (the B5 fix round, F2).
    expect(paused.toast).toBe("Listing paused. Classmates can't ask to buy it or reserve it until you resume it. The 2 open requests and invitations stay open until their deadlines.");
    expect(lastHistory(listingOf(w, l))).toBe("Paused: no new requests or reservations until it's resumed");
    expect(noteRows(paused.notes)).toEqual([
      [BOB.userId, `Ann paused their listing for Spring Formal. Your request stays open until ${DUE}, but they can't invite you until they resume the listing.`, REQUESTS, null, null],
      [CAT.userId, `Ann paused their listing for Spring Formal, so you can't reserve it until they resume it. Your invitation stays open until ${DUE}.`, REQUESTS, null, null],
    ]);
    expect(w.no(ANN.userId, inviteAction(asked))).toBe(`You paused this listing. Resume it to invite Bob: their request stays open until ${DUE}.`);
    expect(w.no(CAT.userId, reserveAction(inv))).toBe(`Ann has paused this listing, so you can't reserve it right now. Your invitation stays open until ${DUE}.`);
    expect([asked, inv].map((id) => statusOf(w, id))).toEqual(["requested", "invited"]);
    expect([asked, inv].map((id) => reqOf(w, id).expiresAt)).toEqual([OPEN_UNTIL, OPEN_UNTIL]);

    const resumed = w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    expect(resumed.toast).toBe("Listing resumed. 2 tickets are available again.");
    expect(historyOf(listingOf(w, l)).slice(-2)).toEqual(["Paused: no new requests or reservations until it's resumed", "Resumed: open to requests and reservations again"]);
    expect(noteRows(resumed.notes)).toEqual([
      [BOB.userId, `Ann resumed their listing for Spring Formal, so they can invite you again. Your request is open until ${DUE}.`, REQUESTS, null, null],
      [CAT.userId, `Ann resumed their listing for Spring Formal, so you can reserve it again. Your invitation is open until ${DUE}.`, REQUESTS, null, null],
    ]);
    reserve(w, CAT, inv);
    invite(w, ANN, asked);

    // A hold made before a pause goes on; an invitation still waiting behind it hears so when the listing comes back.
    const m = market();
    const first = invited(m.w, ANN, BOB, m.l); const second = invited(m.w, ANN, CAT, m.l);
    reserve(m.w, BOB, first);
    expect(m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l }).toast).toBe("Listing paused. Classmates can't ask to buy it or reserve it until you resume it. Reservations already made continue. The open request or invitation stays open until its deadline.");
    const back = m.w.ok(ANN.userId, { type: "resumeListing", listingId: m.l });
    expect(back.toast).toBe("Listing resumed. Everything left is held for buyers right now; if a hold ends, it goes back on sale.");
    expect(textsFor(back.notes, CAT)).toEqual([`Ann resumed their listing for Spring Formal. Another buyer is paying for it right now; your invitation stays open until ${DUE} in case it comes back.`]);
    m.w.ok(BOB.userId, on("markPaid", first)); // paying on a paused-then-resumed listing is the existing flow
    expect(statusOf(m.w, first)).toBe("paid");
    expect(statusOf(m.w, second)).toBe("declined");
    expect(violationsOf(w)).toEqual([]);
    expect(violationsOf(m.w)).toEqual([]);
  });

  it("closing the listing declines open requests and invitations with a note each; a hold already made continues", () => {
    const { w, ev, l } = market({ qty: 3 });
    const EVENT = { name: "event", id: ev };
    const asked = ask(w, BOB, l); const inv = invited(w, ANN, CAT, l); const held = reserved(w, ANN, DAN, l);
    const closed = w.ok(ANN.userId, { type: "withdraw", listingId: l });
    expect(closed.toast).toBe("Listing closed. 2 tickets are back with you; reservations already made continue. 2 open requests and invitations were closed.");
    expect(noteRows(closed.notes)).toEqual([
      [BOB.userId, "Ann closed their listing for Spring Formal, so your request is closed.", EVENT, null, null],
      [CAT.userId, "Ann closed their listing for Spring Formal, so your invitation is closed.", EVENT, null, null],
    ]);
    for (const id of [asked, inv]) {
      expect(reqOf(w, id)).toMatchObject({ status: "declined", reason: "The seller closed this listing" });
      expect(lastHistory(reqOf(w, id))).toBe("Declined: the seller closed this listing");
    }
    expect(w.no(CAT.userId, reserveAction(inv))).toBe("The seller closed this listing.");
    expect(w.no(ANN.userId, inviteAction(asked))).toBe("This request is closed.");
    expect(w.no(EVE.userId, askAction(l))).toBe("This listing is closed.");

    // Dan's hold goes on to the end, as an agreement made before the close.
    expect(statusOf(w, held)).toBe("accepted");
    w.ok(DAN.userId, on("markPaid", held));
    w.ok(ANN.userId, on("confirmPayment", held));
    w.ok(ANN.userId, on("markTransferred", held));
    w.ok(DAN.userId, on("buyerReceived", held));
    expect(statusOf(w, held)).toBe("completed");
    expect(violationsOf(w)).toEqual([]);
  });

  it("a request or an invitation that runs out ends on its own, tells its buyer once, and can't be reserved", () => {
    const { w, ev, l } = market({ qty: 2 });
    const EVENT = { name: "event", id: ev };
    const asked = ask(w, BOB, l); const inv = invited(w, ANN, CAT, l);
    w.now = OPEN_UNTIL + MIN;
    // Before any sweep, the answers already follow the clock.
    expect(w.no(CAT.userId, reserveAction(inv))).toBe("This invitation has ended.");
    expect(w.no(BOB.userId, reserveAction(asked))).toBe("This request has ended.");
    expect(w.no(ANN.userId, inviteAction(asked))).toBe("This request has ended.");

    const swept = w.sweep();
    expect(noteRows(swept.notes)).toEqual([
      [BOB.userId, "The seller didn't invite you before your request for Spring Formal ended.", EVENT, null, null],
      [CAT.userId, "The invitation for Spring Formal ended before it was reserved.", EVENT, null, null],
    ]);
    expect(reqOf(w, asked)).toMatchObject({ status: "expired", reason: "The request ended before the seller sent an invitation." });
    expect(reqOf(w, inv)).toMatchObject({ status: "expired", reason: "The invitation ended before it was reserved." });
    expect(lastHistory(reqOf(w, inv))).toBe("Expired: The invitation ended before it was reserved.");
    expect(w.sweep().notes).toEqual([]); // told once
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 2 });
    ask(w, BOB, l); // the listing is still on sale: they may ask again
    expect(violationsOf(w)).toEqual([]);
  });

  it("a hold that runs out unpaid goes back on sale: both sides are told, and the buyer who was waiting hears once", () => {
    const { w, ev, l } = market();
    const EVENT = { name: "event", id: ev };
    const rb = invited(w, ANN, BOB, l); const rc = invited(w, ANN, CAT, l);
    reserve(w, BOB, rb);
    const until = T0 + 15 * MIN;
    w.now = until + 1;
    expect(evalOf(w, rb).st).toBe("expired");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 1 }); // back on sale by the clock, sweep or not
    const swept = w.sweep();
    expect(noteRows(swept.notes)).toEqual([ // newest first, as the document keeps them
      [CAT.userId, `The ticket Ann invited you to pay for, for Spring Formal, is available again. Reserve by ${DUE}: nothing is held until you do.`, EVENT, null, null],
      [ANN.userId, `Bob D.'s reservation of 1 ticket for Spring Formal ended at ${E.fmtMs(until)} without payment. It's back on sale.`, LISTINGS, null, null],
      [BOB.userId, `Your reservation for Spring Formal ended at ${E.fmtMs(until)} without payment, so it went back on sale. If you did pay Ann, contact them directly: Handoff can't see payments.`, EVENT, null, null],
    ]);
    expect(reqOf(w, rb)).toMatchObject({ status: "expired", reason: "The reservation ended without payment, so it went back on sale." });
    expect(w.no(BOB.userId, reserveAction(rb))).toBe("The reservation has ended.");
    expect(w.no(BOB.userId, on("markPaid", rb))).toEqual(expect.any(String)); // a lapsed hold can't be marked paid
    expect(statusOf(w, rb)).toBe("expired");
    reserve(w, CAT, rc);
    expect(reqOf(w, rc)).toMatchObject({ status: "accepted", holdUntil: until + 15 * MIN });
    expect(violationsOf(w)).toEqual([]);
  });
});

describe("a late payment report (B5.7i)", () => {
  const late = (id: string) => ({ type: "reportProblem", kind: "ticket", id, reason: E.LATE_PAYMENT });

  it("tells the seller, changes no stock, and leaves the buyer who has the unit now exactly as they were", () => {
    const { w, l } = market();
    const rb = invited(w, ANN, BOB, l); const rc = invited(w, ANN, CAT, l);
    reserve(w, BOB, rb);
    const until = T0 + 15 * MIN;
    w.now = until + MIN;
    w.sweep();
    reserve(w, CAT, rc); // the unit went to Cat
    const catBefore = reqOf(w, rc); const numbersBefore = numbers(w, l);
    expect(numbersBefore).toEqual({ reserved: 1, completed: 0, available: 0 });

    const told = w.ok(BOB.userId, late(rb));
    expect(told.toast).toBe("Reported. Ann has been told. Handoff can't see payments, so sort it out with them directly.");
    expect(noteRows(told.notes)).toEqual([[ANN.userId, `Bob D. says they paid for their reservation for Spring Formal, which ended at ${E.fmtMs(until)}. If the money arrived, sort it out with Bob directly: Handoff can't see payments, and nothing was re-reserved.`, LISTINGS, "payment.late", rb]]);
    expect(reqOf(w, rb)).toMatchObject({ status: "expired", problem: { by: BOB.userId, role: "buyer", reason: E.LATE_PAYMENT } });
    expect(lastHistory(reqOf(w, rb))).toBe("Problem reported by the buyer: I paid, but the reservation ended");
    expect(E.LATE_PAYMENT).toBe("I paid, but the reservation ended");

    // Nothing was reclaimed: the listing's numbers and Cat's reservation are the very same.
    expect(numbers(w, l)).toEqual(numbersBefore);
    expect(reqOf(w, rc)).toEqual(catBefore);
    expect(w.no(BOB.userId, late(rb))).toBe("A problem is already reported on this match.");
    expect(w.no(BOB.userId, reserveAction(rb))).toBe("The reservation has ended.");

    // Cat finishes; Bob marks his report resolved once he and Ann have sorted it out.
    w.ok(CAT.userId, on("markPaid", rc));
    w.ok(ANN.userId, on("confirmPayment", rc));
    expect(w.ok(BOB.userId, { type: "resolveProblem", kind: "ticket", id: rb }).toast).toBe("Marked resolved.");
    expect(statusOf(w, rc)).toBe("confirmed");
    expect(violationsOf(w)).toEqual([]);
  });

  it("is only for a new-flow reservation that ended, from its buyer", () => {
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 4, obo: true });
    const legacy = w.take(DAN, l);                    // the old flow: a reservation from before the switch
    E.setInviteSwitch(null);
    const never = invited(w, ANN, BOB, l);            // never reserved
    const live = reserved(w, ANN, CAT, l);            // still held
    const released = reserved(w, ANN, EVE, l);
    w.ok(EVE.userId, on("cancel", released));         // the buyer released it, then says they had paid
    expect(w.no(BOB.userId, late(never))).toBe("Choose what went wrong.");
    expect(w.no(CAT.userId, late(live))).toBe("Choose what went wrong.");
    expect(w.no(ANN.userId, late(released))).toBe("Choose what went wrong."); // the seller can't use the buyer's reason
    expect(w.no(FAY.userId, late(released))).toBe("Only the buyer or seller can report a problem.");
    const told = w.ok(EVE.userId, late(released));
    expect(textsFor(told.notes, ANN)).toEqual(["Eve P. says they paid for their reservation for Spring Formal after it ended. If the money arrived, sort it out with Eve directly: Handoff can't see payments, and nothing was re-reserved."]);
    w.now = T0 + 16 * MIN;
    w.sweep();
    expect(statusOf(w, legacy)).toBe("expired");
    expect(w.no(DAN.userId, late(legacy))).toBe("Choose what went wrong.");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 4 });
  });
});
