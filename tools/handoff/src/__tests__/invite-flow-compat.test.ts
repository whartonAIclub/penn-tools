// Invite to pay beside everything that came before it (follow-on Batch 5; FOLLOWON-PLAN §1.5 rows B5.1, B5.7c, B5.7d, B5.7e, B5.8, B5.9;
// §2.6, §2.7). The flow was built in step S1 and switched on for the live page in step S3 (INVITE_FLOW_LIVE, HANDOFF_PROTOCOL 3). These
// tests pin both sides of that switch:
//
//   on (the engine's own setting since S3)  a direct-payment exchange can start only the new way, while every exchange begun before
//                    it finishes on its own terms (an accepted offer keeps its 2-hour hold), an unmarked record made after it is an
//                    invariant violation, Goods behave the same, and the preview's organizer and premium paths answer exactly as before;
//   off (E.setInviteSwitch(false), how every record from before the switch was made)  the old actions work as they did, nothing is
//                    stamped on the world, and only the new records are marked.
//
// A test that says nothing runs with the engine's own setting; one about the time before the switch turns it off itself.
//
// The engine on frozen live documents through parseAction (helpers/views.ts); labelled test people with made-up ids; no database and
// no sign-in. The flow's own rules are in invite-flow.test.ts; the database-backed checks in invite-flow-store.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, EngineNotification, LiveWorld } from "../../engine/index.js";
import { runSelfTests, seed } from "../../engine/preview.js";
import {
  OPEN_UNTIL, ask, copyOf, invite, inviteAction, invited, lastHistory, listWithoutHandle, listingOf, market, must, noteRows, numbers, on,
  reqOf, reserve, reserveAction, reserved, resetEngine, statusOf, textsFor, violationsOf,
} from "./helpers/invite.js";
import { FAY, PEOPLE6, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, EVE, HOUR, MIN, T0, dateAfter, type LiveTestWorld, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

const DUE = E.fmtMs(OPEN_UNTIL);
const TODO = { name: "activity", tab: "todo" };
const INVITE_INSTEAD = "Invite them to pay instead.";
const RESERVE_IT = "You're already invited to pay for this. Reserve it to hold it.";
const NOTHING_TO_ANSWER = "There's nothing to answer.";
const ASK_FIRST = "Handoff now asks the seller first. Tap Request to buy.";
const INVITE_REPLY = "Reply by inviting them to pay on one of your listings.";
const NOT_SENT = "This change couldn't be sent. Reload the page and try again.";
const OLD_STATUSES = ["pending", "countered", "proposed"];

const take = (listingId: string): Action => ({ type: "take", listingId, qty: 1, amount: "", msg: "", member: false });
const offer = (listingId: string, amount: string): Action => ({ type: "offer", listingId, qty: 1, amount, msg: "", member: false });
const counter = (requestId: string, amount: string): Action => ({ type: "counter", requestId, amount });
const respond = (requestId: string, accept: boolean): Action => ({ type: "respond", requestId, accept, member: false });
/** A reply held for a public request, as the page sent it before the switch (a ticket added and held in one step). */
const heldReply = (eventId: string, isoId: string): Action => ({
  type: "addThen",
  add: { eventId, tier: "t1", qty: 1, paid: "40" },
  then: { type: "isoReply", isoId, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@eve-park", note: "", membersOnly: false },
});
const publicRequest = (w: LiveTestWorld, eventId: string): Action => ({ type: "saveInterest", data: { eventId, qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 5) } });
const inviteRequester = (isoId: string, listingId: string, o: { qty?: number; price?: string } = {}): Action => ({ type: "inviteRequester", isoId, listingId, qty: o.qty ?? 1, ...(o.price !== undefined ? { price: o.price } : {}) });

/** A note as two runs with different random ids can compare it: who, the sentence, where it links (no ids) and its email tag. */
const plainNotes = (notes: readonly EngineNotification[]): unknown[][] => notes.map((n) => [n.userId, n.text, n.link?.name ?? null, n.link?.tab ?? null, n.kind ?? null]);

/** Runs a script on a world, keeping every answer and note in order (ids left out, so two runs can be compared). */
class Script {
  readonly log: unknown[][] = [];
  constructor(readonly w: LiveTestWorld) {}
  /** One step; returns the id it made, if any. */
  step(who: TestPerson | null, action: Action): string | undefined {
    const o = who ? this.w.act(who.userId, action) : this.w.sweep();
    const said = o.res.error !== undefined ? `refused: ${o.res.error}` : (o.res.toast ?? null);
    this.log.push([who?.name ?? "the sweep", action.type, said, plainNotes(o.notes)]);
    return o.res.error === undefined ? o.res.result?.id : undefined;
  }
  /** A step that must make a record. */
  made(who: TestPerson, action: Action): string {
    return must(this.step(who, action), `${action.type}'s id`);
  }
}

/** How long a reservation was held for, in minutes (its own stamps, so a shifted millisecond doesn't matter). */
/** When the world began the invite flow: 0 (a new world's value) or absent (an older stored world) until the switch's first change. */
const sinceOf = (w: LiveTestWorld): number => w.doc.inviteSince ?? 0;

const heldMinutes = (w: LiveTestWorld, id: string): number | null => {
  const r = reqOf(w, id);
  return typeof r.holdUntil === "number" && typeof r.acceptedAt === "number" ? Math.round((r.holdUntil - r.acceptedAt) / MIN) : null;
};

describe("the switch itself (B5.1, step S3)", () => {
  it("is on in the engine: with nothing set, a new exchange starts only the new way and an older page is told to reload", () => {
    expect(E.INVITE_FLOW_LIVE).toBe(true);
    expect(E.inviteFlowOn()).toBe(true);
    expect(E.HANDOFF_PROTOCOL).toBe(10); // a tab loaded before the switch sends 2 and is refused until it reloads (guest-access.test.ts); forms round 2 made it 4, one-form Sell (§9l) 5, the Sell and Request follow-up (§9m, §9n) 6, simplified Goods (§9q item 6) 7, Sell's restrictions and a listing's club (§9v items 4 and 5, SELL5-M2) 8, "I have this" in one submission (§9v item 2, SELL5-M3) 9, free tickets and closed requests (§9x item 1, SELL6-N1) 10
    expect(E.payNeededRule()).toBe("exchange");

    // No test switch anywhere in this test: the engine as the live page loads it.
    const { w, ev, l } = market({ qty: 2, obo: true });
    expect(sinceOf(w)).toBe(T0); // stamped by the world's first change
    const iso = must(w.ok(FAY.userId, publicRequest(w, ev)).id, "the public request");
    const before = w.doc;
    expect(w.no(BOB.userId, take(l))).toBe(ASK_FIRST);
    expect(w.no(BOB.userId, offer(l, "30"))).toBe(ASK_FIRST);
    expect(w.no(EVE.userId, heldReply(ev, iso))).toBe(INVITE_REPLY);
    expect(w.doc).toBe(before);
    // Posting no longer needs a way to be paid; the first invitation does.
    const posted = must(w.ok(CAT.userId, listWithoutHandle(ev)).id, "Cat's listing"); // Cat has saved no way to be paid
    const wants = ask(w, BOB, posted);
    expect(w.no(CAT.userId, inviteAction(wants))).toBe(E.NO_PAY_METHODS);
    // And the new way works from start to hold, marked.
    const r = reserved(w, ANN, DAN, l);
    expect(reqOf(w, r)).toMatchObject({ status: "accepted", inviteFlow: true, holdUntil: w.now + 15 * MIN });
    expect(violationsOf(w)).toEqual([]);
  });

  it("a test may turn it off or on; null puts the engine's own setting back", () => {
    E.setInviteSwitch(false);
    expect(E.inviteFlowOn()).toBe(false);
    expect(E.payNeededRule()).toBe("listing");
    E.setInviteSwitch(true);
    expect(E.inviteFlowOn()).toBe(true);
    E.setInviteSwitch(false);
    E.setInviteSwitch(null);
    expect(E.inviteFlowOn()).toBe(E.INVITE_FLOW_LIVE);
    expect(E.inviteFlowOn()).toBe(true);
  });
});

describe("switched off, as it was before step S3 (B5.1)", () => {
  beforeEach(() => {
    E.setInviteSwitch(false);
  });

  it("leaves the old actions as they were, marks only the new records, and stamps nothing on the world", () => {
    expect(E.inviteFlowOn()).toBe(false);
    expect(E.payNeededRule()).toBe("listing");

    const { w, l } = market({ qty: 3, obo: true });
    const taken = w.ok(BOB.userId, take(l));
    const rt = must(taken.id, "the reservation");
    expect(taken.toast).toBe(`Reserved for 15 minutes. Pay Ann $35 now, then tap "I've sent payment".`);
    expect(reqOf(w, rt)).toMatchObject({ status: "accepted", flow: "quick", holdUntil: T0 + 15 * MIN });
    expect(reqOf(w, rt)).not.toHaveProperty("inviteFlow");

    const offered = w.ok(CAT.userId, offer(l, "30"));
    const ro = must(offered.id, "the offer");
    expect(offered.toast).toBe("Offer sent. Ann has 6 hours to accept, counter or decline.");
    expect(reqOf(w, ro)).toMatchObject({ status: "pending", isOffer: true, price: 30 });
    expect(reqOf(w, ro)).not.toHaveProperty("inviteFlow");

    // An older offer the seller accepts keeps its 2-hour hold.
    const accepted = w.ok(ANN.userId, on("accept", ro));
    expect(accepted.toast).toBe("Offer accepted. Cat has 2 hours to pay you. Other offers it can't cover are declined.");
    expect(textsFor(accepted.notes, CAT)).toEqual([`Ann accepted your offer of $30 for Spring Formal. It's reserved for you for 2 hours: pay, then tap "I've sent payment".`]);
    expect(reqOf(w, ro)).toMatchObject({ status: "accepted", holdUntil: T0 + 2 * HOUR });
    expect(reqOf(w, ro)).not.toHaveProperty("inviteFlow");

    // A request to buy beside them is the only marked record.
    const rn = ask(w, DAN, l);
    expect(w.doc.requests.filter((r) => r.inviteFlow !== undefined).map((r) => r.id)).toEqual([rn]);
    expect(reqOf(w, rn).inviteFlow).toBe(true);
    expect(sinceOf(w)).toBe(0);
    expect(violationsOf(w)).toEqual([]);
  });

  it("still asks for a way to be paid when posting", () => {
    const { w, ev } = market();
    const before = w.doc;
    expect(w.no(CAT.userId, listWithoutHandle(ev))).toBe(E.NO_PAY_METHODS);
    expect(w.doc).toBe(before);
  });

  it("keeps a held reply for a public request working", () => {
    const { w, ev } = market();
    const iso = must(w.ok(FAY.userId, publicRequest(w, ev)).id, "the public request");
    const sent = w.ok(EVE.userId, heldReply(ev, iso));
    const held = must(sent.id, "the held reply");
    expect(sent.toast).toBe("Sent to Fay. If they accept within 6 hours, it's reserved for them for 15 minutes while they pay you.");
    expect(reqOf(w, held)).toMatchObject({ status: "proposed", isoReply: true, buyerId: FAY.userId });
    expect(reqOf(w, held)).not.toHaveProperty("inviteFlow");
    expect(w.ok(FAY.userId, respond(held, true)).toast).toBe(`Reserved for 15 minutes. Pay Eve $40 now, then tap "I've sent payment".`);
  });
});

describe("the old answers on a new-flow record (B5.7c)", () => {
  it("accept, counter and respond are refused at every stage, and the later steps wait for a reservation", () => {
    const { w, l } = market({ qty: 2, obo: true });
    const r = ask(w, BOB, l, { amount: "30" });
    const answers = (): string[] => [
      w.no(ANN.userId, on("accept", r)), w.no(ANN.userId, counter(r, "34")), w.no(BOB.userId, respond(r, true)), w.no(BOB.userId, respond(r, false)),
    ];

    // Asked: nothing to accept, counter or answer; nothing to pay for, confirm, send or release.
    const asked = w.doc;
    expect(answers()).toEqual([INVITE_INSTEAD, INVITE_INSTEAD, NOTHING_TO_ANSWER, NOTHING_TO_ANSWER]);
    expect(w.no(BOB.userId, on("markPaid", r))).toBe("Only a reserved ticket can be marked paid.");
    expect(w.no(ANN.userId, on("confirmPayment", r))).toBe("The buyer hasn't marked it paid yet.");
    expect(w.no(ANN.userId, on("markTransferred", r))).toBe("Confirm the payment first.");
    expect(w.no(BOB.userId, on("buyerReceived", r))).toBe("There's nothing to confirm yet: the seller hasn't marked it as sent.");
    expect(w.no(ANN.userId, on("paymentMissing", r))).toBe("This is only for a reservation the buyer marked paid and you haven't confirmed.");
    expect(w.no(ANN.userId, on("release", r))).toBe("Only a hold that hasn't been sent or gone to the organizer can be released.");
    expect(w.doc).toBe(asked);

    // Invited: the same, and the buyer is pointed at the one step that holds it.
    invite(w, ANN, r);
    const invitedDoc = w.doc;
    expect(answers()).toEqual([INVITE_INSTEAD, INVITE_INSTEAD, RESERVE_IT, RESERVE_IT]);
    expect(w.no(BOB.userId, on("markPaid", r))).toBe("Only a reserved ticket can be marked paid.");
    expect(w.no(ANN.userId, on("release", r))).toBe("Only a hold that hasn't been sent or gone to the organizer can be released.");
    expect(w.doc).toBe(invitedDoc);

    // Reserved, then paid: still nothing to accept, counter or answer.
    reserve(w, BOB, r);
    expect(answers()).toEqual([INVITE_INSTEAD, INVITE_INSTEAD, NOTHING_TO_ANSWER, NOTHING_TO_ANSWER]);
    w.ok(BOB.userId, on("markPaid", r));
    expect(answers()).toEqual([INVITE_INSTEAD, INVITE_INSTEAD, NOTHING_TO_ANSWER, NOTHING_TO_ANSWER]);

    // No new-flow record was ever an offer, a counter or a held reply, in any state the world went through.
    for (const o of w.outcomes) for (const x of o.res.state.requests) if (x.inviteFlow !== undefined) expect(OLD_STATUSES).not.toContain(x.status);
    expect(violationsOf(w)).toEqual([]);
  });

  it("the new steps don't apply to a record from before invitations", () => {
    E.setInviteSwitch(false); // the time before the switch, when an offer or a reservation could still be made beside a request to buy
    const { w, l } = market({ qty: 3, obo: true });
    const pending = must(w.ok(BOB.userId, offer(l, "30")).id, "the offer");
    const taken = must(w.ok(CAT.userId, take(l)).id, "the reservation");
    const before = w.doc;
    expect(w.no(ANN.userId, inviteAction(pending))).toBe("This one came before invitations. Accept, counter or decline it instead.");
    expect(w.no(ANN.userId, inviteAction(taken))).toBe("This one came before invitations. Accept, counter or decline it instead.");
    expect(w.no(BOB.userId, reserveAction(pending))).toBe("There's no invitation to reserve here.");
    expect(w.no(CAT.userId, reserveAction(taken))).toBe("There's no invitation to reserve here.");
    // One open record per buyer and listing, whichever flow it's in.
    expect(w.no(BOB.userId, { type: "requestToBuy", listingId: l, qty: 1, msg: "", member: false })).toBe("You already have an active offer on this listing.");
    expect(w.no(CAT.userId, { type: "requestToBuy", listingId: l, qty: 1, msg: "", member: false })).toBe("You've already reserved this listing.");
    // And the other way round: an old-style reservation or offer can't be put on top of a request to buy.
    const r = ask(w, DAN, l);
    expect(w.no(DAN.userId, take(l))).toBe("You've already asked to buy this.");
    expect(w.no(DAN.userId, offer(l, "30"))).toBe("You've already asked to buy this.");
    invite(w, ANN, r);
    expect(w.no(DAN.userId, take(l))).toBe(RESERVE_IT);
    expect(w.doc.requests.map((x) => x.id).sort()).toEqual([pending, taken, r].sort());
    expect(before.requests).toHaveLength(2);
  });
});

describe("inviting the poster of a public request (inviteRequester)", () => {
  it("invites them on a listing that stays open to everyone, and holds nothing", () => {
    const { w, ev, l } = market({ qty: 2 });
    const iso = must(w.ok(BOB.userId, publicRequest(w, ev)).id, "Bob's public request");
    const guestBefore = guestViewOf(w, { version: 1 });
    const fayBefore = viewOf(w, FAY, { version: 1 });

    const sent = w.ok(ANN.userId, inviteRequester(iso, l));
    const r = must(sent.id, "the invitation");
    expect(sent.toast).toBe(`Invitation sent to Bob. Nothing is held: it's theirs once they reserve it, by ${DUE}.`);
    expect(noteRows(sent.notes)).toEqual([[BOB.userId, `Ann L. invited you to pay $35 each for 1 ticket for Spring Formal, for your request. It isn't held yet: reserve it by ${DUE}, then you have up to 15 minutes to pay.`, TODO, "buy.invited", r]]);

    const rec = reqOf(w, r);
    expect(rec).toMatchObject({ listingId: l, eventId: ev, buyerId: BOB.userId, qty: 1, price: 35, flow: "quick", inviteFlow: true, fromIso: iso, status: "invited", expiresAt: OPEN_UNTIL });
    for (const k of ["acceptedAt", "holdUntil", "pay", "paidVia", "isoReply", "memberConfirmed", "isOffer"]) expect(rec).not.toHaveProperty(k);
    expect(lastHistory(rec)).toBe("Ann L. invited the poster of a request to pay $35 each for 1 ticket: not held until the buyer reserves it");
    expect(lastHistory(listingOf(w, l))).toBe("Invited Bob D. to pay, for their request");

    // Nothing is held and the listing is still everyone's: no reply listing was made, and a guest and a bystander see what they saw.
    expect(w.doc.listings).toHaveLength(1);
    expect(listingOf(w, l)).not.toHaveProperty("isoReplyFor");
    expect(numbers(w, l)).toEqual({ reserved: 0, completed: 0, available: 2 });
    expect(guestViewOf(w, { version: 1 })).toEqual(guestBefore);
    expect(viewOf(w, FAY, { version: 1 })).toEqual(fayBefore);
    expect(viewOf(w, BOB).requests.find((x) => x.id === r)).not.toHaveProperty("pay");
    const other = ask(w, DAN, l);
    expect(statusOf(w, other)).toBe("requested");

    // The requester reserves it like any invitation.
    expect(reserve(w, BOB, r).toast).toBe(`Reserved for 15 minutes. Pay Ann $35 now, then tap "I've sent payment".`);
    expect(numbers(w, l)).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(violationsOf(w)).toEqual([]);
  });

  it("is refused where there is nobody to invite or nothing to invite them to", () => {
    const { w, ev, l } = market({ qty: 2 });
    const iso = must(w.ok(BOB.userId, publicRequest(w, ev)).id, "Bob's public request");
    expect(w.no(BOB.userId, inviteRequester(iso, l))).toBe("Choose one of your listings.");
    expect(w.no(EVE.userId, inviteRequester(iso, l))).toBe("Choose one of your listings.");
    expect(w.no(ANN.userId, inviteRequester(`iso-${"0".repeat(16)}`, l))).toBe("Request not found.");
    expect(w.no(ANN.userId, inviteRequester(iso, l, { qty: 2 }))).toBe("Choose between 1 and 1 ticket.");
    expect(w.no(ANN.userId, inviteRequester(iso, l, { price: "36" }))).toBe("You're asking $35. Invite at that price or less, or change the listing's price first.");
    // A reference to an earlier step means something only inside a combined change.
    expect(w.no(ANN.userId, inviteRequester(iso, "@0"))).toBe(NOT_SENT);

    // A listing for another event.
    const ev2 = w.addEvent(ANN, { title: "Winter Ball" });
    const l2 = w.listTickets(ANN, ev2);
    expect(w.no(ANN.userId, inviteRequester(iso, l2))).toBe("That listing is for a different event.");

    // Paused: nothing new starts on it.
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    expect(w.no(ANN.userId, inviteRequester(iso, l))).toBe("You paused this listing. Resume it to invite them.");
    w.ok(ANN.userId, { type: "resumeListing", listingId: l });

    // Once per requester and listing; a lower price is the seller's to give.
    const r = must(w.ok(ANN.userId, inviteRequester(iso, l, { price: "30" })).id, "the invitation");
    expect(reqOf(w, r)).toMatchObject({ status: "invited", price: 30 });
    expect(w.no(ANN.userId, inviteRequester(iso, l))).toBe("You've already invited Bob on this listing.");
    // Someone who already asked to buy this listing is invited from that request.
    const catIso = must(w.ok(CAT.userId, publicRequest(w, ev)).id, "Cat's public request");
    ask(w, CAT, l);
    expect(w.no(ANN.userId, inviteRequester(catIso, l))).toBe("Cat has already asked to buy this listing. Invite them from their request.");
    // A closed listing.
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    expect(w.no(ANN.userId, inviteRequester(iso, l))).toBe("Only a listing that's open to everyone can be used for an invitation.");
  });

  it("is a step after listing, in one change: the requester gets one notification, the invitation", () => {
    const { w, ev } = market();
    const iso = must(w.ok(BOB.userId, publicRequest(w, ev)).id, "Bob's public request");
    const list: Action = { type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" }, then: { type: "list", qty: 1, ask: "35", method: "app", file: null, note: "" } };
    const done = w.ok(EVE.userId, { type: "seq", steps: [{ action: list }, { action: inviteRequester(iso, "@0"), optional: true }] });
    const [first, second] = must(done.steps, "the steps");
    expect(first).toMatchObject({ type: "addThen", ok: true, id: done.id });
    expect(second).toMatchObject({ type: "inviteRequester", ok: true, toast: `Invitation sent to Bob. Nothing is held: it's theirs once they reserve it, by ${DUE}.` });
    const r = must(second?.id, "the invitation");
    expect(reqOf(w, r)).toMatchObject({ listingId: done.id, buyerId: BOB.userId, status: "invited", inviteFlow: true, fromIso: iso });
    expect(textsFor(done.notes, BOB)).toEqual([`Eve P. invited you to pay $35 each for 1 ticket for Spring Formal, for your request. It isn't held yet: reserve it by ${DUE}, then you have up to 15 minutes to pay.`]);
    expect(numbers(w, must(done.id, "the listing"))).toEqual({ reserved: 0, completed: 0, available: 1 });

    // When the invitation can't be sent and the step is required, nothing is kept: no listing either.
    const m = market();
    const closed = must(m.w.ok(BOB.userId, publicRequest(m.w, m.ev)).id, "a public request");
    m.w.ok(BOB.userId, { type: "closeInterest", id: closed });
    const before = m.w.doc;
    expect(m.w.no(EVE.userId, { type: "seq", steps: [{ action: { ...list, add: { eventId: m.ev, tier: "t1", qty: 1, paid: "40" } } }, { action: inviteRequester(closed, "@0") }] })).toBe("This request has expired or closed.");
    expect(m.w.doc).toBe(before);
  });
});

describe("once it's switched on, a new exchange starts only the new way (B5.7d)", () => {
  it("refuses the old reservation, offer and held reply for everyone, storing nothing", () => {
    E.setInviteSwitch(true);
    expect(E.inviteFlowOn()).toBe(true);
    expect(E.payNeededRule()).toBe("exchange");
    const { w, ev, l } = market({ qty: 2, obo: true });
    const iso = must(w.ok(FAY.userId, publicRequest(w, ev)).id, "the public request");
    const before = w.doc;

    for (const who of [BOB, CAT, FAY]) {
      expect(w.no(who.userId, take(l))).toBe(ASK_FIRST);
      expect(w.no(who.userId, offer(l, "30"))).toBe(ASK_FIRST);
    }
    expect(w.no(ANN.userId, take(l))).toBe(ASK_FIRST); // before any other check: the old way is gone, whoever asks
    expect(w.no(EVE.userId, heldReply(ev, iso))).toBe(INVITE_REPLY);
    const steps = w.act(EVE.userId, { type: "seq", steps: [{ action: { type: "addHolding", eventId: ev, tier: "t1", qty: 1, paid: "40" } }, { action: { type: "isoReply", holdingId: "@0", isoId: iso, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, note: "", membersOnly: false } }] });
    expect(steps.res.error).toBe(INVITE_REPLY);

    // Nothing was stored and nothing was malformed: the engine refused them, not the parser.
    expect(w.doc).toBe(before);
    expect(w.invalid).toEqual([]);
    expect(w.doc.requests).toEqual([]);
    expect(w.doc.holdings.filter((h) => h.userId === EVE.userId)).toEqual([]);

    // The new way works on the same listing, and its records are marked.
    const r = reserved(w, ANN, BOB, l);
    expect(reqOf(w, r)).toMatchObject({ status: "accepted", inviteFlow: true, holdUntil: w.now + 15 * MIN });
    const viaRequest = must(w.ok(ANN.userId, inviteRequester(iso, l)).id, "the invitation");
    expect(reqOf(w, viaRequest)).toMatchObject({ status: "invited", inviteFlow: true, fromIso: iso });
    expect(w.doc.requests.every((x) => x.inviteFlow === true)).toBe(true);
    expect(violationsOf(w)).toEqual([]);
  });

  it("stamps the world once, on the first change after the switch, and never moves the stamp", () => {
    E.setInviteSwitch(true);
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(sinceOf(w)).toBe(0);
    const ev = w.addEvent(ANN);
    const since = sinceOf(w);
    expect(since).toBe(T0);
    w.advance(HOUR);
    const l = w.listTickets(ANN, ev, { qty: 2 });
    reserved(w, ANN, BOB, l);
    w.advance(HOUR);
    w.sweep();
    expect(w.doc.inviteSince).toBe(since);
    // A refused action stamps nothing.
    const fresh = new ServerWorld({ people: PEOPLE6 });
    fresh.no(BOB.userId, take(`l${"0".repeat(16)}`));
    expect(sinceOf(fresh)).toBe(0);
  });

  it("tells a requester to ask to buy a shared listing, where it used to say reserve it or make an offer", () => {
    const share = (switchOn: boolean) => {
      E.setInviteSwitch(switchOn);
      const { w, ev, l } = market();
      const iso = must(w.ok(BOB.userId, publicRequest(w, ev)).id, "Bob's public request");
      const done = w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l });
      return { toast: done.toast, note: must(textsFor(done.notes, BOB)[0], "Bob's note") };
    };
    expect(share(false)).toEqual({
      toast: "Shared with Bob. Nothing is held: they reserve it or make an offer like anyone else.",
      note: "Ann L. shared a listing for Spring Formal with your request: 1 ticket at $35. It isn't held for you: reserve it or make an offer on the event page.",
    });
    expect(share(true)).toEqual({
      toast: "Shared with Bob. Nothing is held: they ask to buy it like anyone else.",
      note: "Ann L. shared a listing for Spring Formal with your request: 1 ticket at $35. It isn't held for you: ask to buy it on the event page.",
    });
  });
});

describe("exchanges begun before the switch finish on their own terms (B5.7e)", () => {
  /**
   * Four exchanges begun the old way with the switch off: Bob's reservation, Cat's offer, Dan's offer with Ann's counter, and Eve's reply
   * held for Fay's public request. Then every one is finished, with the switch still off or turned on first.
   */
  function legacy(switchOnBeforeFinishing: boolean) {
    E.setInviteSwitch(false);
    const { w, ev, l } = market({ qty: 4, obo: true });
    const s = new Script(w);
    const taken = s.made(BOB, take(l));
    const offered = s.made(CAT, offer(l, "30"));
    const haggled = s.made(DAN, offer(l, "28"));
    s.step(ANN, counter(haggled, "33"));
    const iso = s.made(FAY, publicRequest(w, ev));
    const held = s.made(EVE, heldReply(ev, iso));
    const begun = w.doc;

    if (switchOnBeforeFinishing) E.setInviteSwitch(true);
    w.advance(MIN);
    for (const [who, type] of [[BOB, "markPaid"], [ANN, "confirmPayment"], [ANN, "markTransferred"], [BOB, "buyerReceived"]] as const) s.step(who, on(type, taken));
    s.step(ANN, on("accept", offered)); // the seller accepts the older offer: 2 hours, as it always was
    s.step(DAN, respond(haggled, true)); // the buyer accepts the counter: 15 minutes at $33
    s.step(FAY, respond(held, true)); // the requester accepts the held reply: 15 minutes
    s.step(CAT, on("markPaid", offered));
    s.step(ANN, on("paymentMissing", offered));
    s.step(CAT, on("cancel", offered));
    s.step(DAN, on("cancel", haggled));
    w.advance(16 * MIN);
    s.step(null, { type: "sweep" }); // Fay's 15 minutes ran out
    const ids = { taken, offered, haggled, held };
    const final = Object.fromEntries(Object.entries(ids).map(([name, id]) => {
      const r = reqOf(w, id);
      return [name, { status: statusOf(w, id), price: r.price, qty: r.qty, reason: r.reason ?? null, heldMinutes: heldMinutes(w, id), marked: r.inviteFlow !== undefined, history: r.history.map((h) => h.text) }];
    }));
    return { w, l, ids, begun, log: s.log, final, numbers: numbers(w, l), violations: violationsOf(w) };
  }

  it("with the same answers, notes, holds and outcomes as when the switch stays off", () => {
    const off = legacy(false);
    const onRun = legacy(true);
    expect(onRun.log).toEqual(off.log);
    expect(onRun.final).toEqual(off.final);
    expect(onRun.numbers).toEqual(off.numbers);
    expect(off.violations).toEqual([]);
    expect(onRun.violations).toEqual([]);

    // What "their own terms" means, pinned: nothing was refused, the accepted offer had 2 hours, the others 15 minutes.
    expect(off.log.filter((row) => String(row[2]).startsWith("refused"))).toEqual([]);
    expect(off.log).toHaveLength(18);
    expect(off.final).toMatchObject({
      taken: { status: "completed", price: 35, heldMinutes: 15, marked: false },
      offered: { status: "cancelled", price: 30, heldMinutes: 120, marked: false, reason: "Buyer withdrew after the seller said the payment didn't arrive" },
      haggled: { status: "cancelled", price: 33, heldMinutes: 15, marked: false, reason: "Buyer cancelled the reservation" },
      held: { status: "expired", price: 40, heldMinutes: 15, marked: false },
    });
    const said = (row: unknown[] | undefined): unknown => must(row, "a step")[2];
    expect(said(off.log.find((row) => row[1] === "accept"))).toBe("Offer accepted. Cat has 2 hours to pay you. Other offers it can't cover are declined.");
    expect(said(off.log.find((row) => row[0] === DAN.name && row[1] === "respond"))).toBe(`Reserved for 15 minutes. Pay Ann $33 now, then tap "I've sent payment".`);
    expect(off.numbers).toEqual({ reserved: 0, completed: 1, available: 3 });

    // The world was stamped only in the run that switched, after every one of those records was made; none of them is marked.
    expect(sinceOf(off.w)).toBe(0);
    const since = sinceOf(onRun.w);
    expect(since).toBe(T0 + MIN);
    for (const id of Object.values(onRun.ids)) expect(reqOf(onRun.w, id).createdAt).toBeLessThan(since);
    expect(onRun.w.doc.requests.some((r) => r.inviteFlow !== undefined)).toBe(false);
  });

  it("while nothing new can be added to them the old way", () => {
    const { w, l, ids } = (() => {
      E.setInviteSwitch(false);
      const m = market({ qty: 4, obo: true });
      const offered = must(m.w.ok(CAT.userId, offer(m.l, "30")).id, "the offer");
      E.setInviteSwitch(true);
      return { w: m.w, l: m.l, ids: { offered } };
    })();
    // The older offer's buyer can't replace it with an old-style reservation, or ask again beside it.
    expect(w.no(CAT.userId, take(l))).toBe(ASK_FIRST);
    expect(w.no(CAT.userId, { type: "requestToBuy", listingId: l, qty: 1, msg: "", member: false })).toBe("You already have an active offer on this listing.");
    // Its seller still answers it the old way, and it can't be turned into an invitation.
    expect(w.no(ANN.userId, inviteAction(ids.offered))).toBe("This one came before invitations. Accept, counter or decline it instead.");
    expect(w.ok(ANN.userId, counter(ids.offered, "33")).toast).toBe("Counter sent: $33 each. Cat has 6 hours to accept or decline.");
    expect(w.ok(CAT.userId, respond(ids.offered, false)).toast).toBe("Declined.");
    // After which Cat asks the new way.
    const r = ask(w, CAT, l);
    expect(reqOf(w, r)).toMatchObject({ status: "requested", inviteFlow: true });
    expect(violationsOf(w)).toEqual([]);
  });
});

describe("the invariants the store refuses on (B5.8; FOLLOWON-PLAN §2.7)", () => {
  /** The world's violations after `damage` is applied to a copy of its document. */
  function damaged(w: LiveTestWorld, damage: (doc: LiveWorld) => void): string[] {
    const doc = copyOf(w);
    damage(doc);
    return violationsOf(w, doc);
  }
  const rec = (doc: LiveWorld, id: string) => must(doc.requests.find((r) => r.id === id), `request ${id}`);

  it("legacy-new: an unmarked direct-payment record made after the switch", () => {
    E.setInviteSwitch(true);
    const { w, l } = market({ qty: 2 });
    const r = reserved(w, ANN, BOB, l);
    const since = sinceOf(w);
    expect(since).toBe(T0);
    expect(reqOf(w, r).createdAt).toBeGreaterThan(since);
    expect(violationsOf(w)).toEqual([]);
    // The same record without its mark is what an old endpoint would have written: refused.
    expect(damaged(w, (doc) => { delete rec(doc, r).inviteFlow; })).toEqual([`legacy-new:${r}`]);
    // One made before the stamp is an older record and keeps its rules.
    expect(damaged(w, (doc) => { const x = rec(doc, r); delete x.inviteFlow; x.createdAt = since - 1; x.acceptedAt = since - 1; x.holdUntil = since - 1 + 15 * MIN; delete x.invitedAt; })).toEqual([]);
    // A world that never switched has no such rule.
    expect(damaged(w, (doc) => { delete rec(doc, r).inviteFlow; delete doc.inviteSince; })).toEqual([]);
    expect(damaged(w, (doc) => { delete rec(doc, r).inviteFlow; doc.inviteSince = 0; })).toEqual([]);
  });

  it("legacy-new is silent while the flow is switched off, whatever the old actions write", () => {
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 3, obo: true });
    w.ok(BOB.userId, take(l));
    w.ok(CAT.userId, offer(l, "30"));
    ask(w, DAN, l);
    expect(sinceOf(w)).toBe(0);
    expect(violationsOf(w)).toEqual([]);
  });

  it("invite-shape: a marked record has the new flow's shape and nothing else", () => {
    const { w, l } = market({ qty: 4, obo: true });
    const asked = ask(w, BOB, l);
    const open = invited(w, ANN, CAT, l);
    const held = reserved(w, ANN, DAN, l);
    expect(violationsOf(w)).toEqual([]);
    const shape = (id: string, damage: (r: ReturnType<typeof rec>) => void): string[] => damaged(w, (doc) => damage(rec(doc, id)));

    // A hold longer than 15 minutes (an accepted offer's 2 hours) is never a new-flow hold.
    expect(shape(held, (r) => { r.holdUntil = must(r.acceptedAt, "reserved at") + 2 * HOUR; })).toEqual([`invite-shape:${held}`]);
    expect(shape(held, (r) => { r.holdUntil = must(r.acceptedAt, "reserved at") + 15 * MIN; })).toEqual([]);
    // Reserved without ever being invited, or before it was.
    expect(shape(held, (r) => { delete r.invitedAt; })).toEqual([`invite-shape:${held}`]);
    expect(shape(held, (r) => { r.acceptedAt = must(r.invitedAt, "invited at") - 1; })).toContain(`invite-shape:${held}`);
    // The older statuses never carry the mark.
    for (const status of OLD_STATUSES) expect(shape(asked, (r) => { r.status = status as typeof r.status; })).toContain(`invite-shape:${asked}`);
    // A request to buy has no invitation stamp; an invitation has one and no reservation yet.
    expect(shape(asked, (r) => { r.invitedAt = r.createdAt; })).toEqual([`invite-shape:${asked}`]);
    expect(shape(open, (r) => { delete r.invitedAt; })).toEqual([`invite-shape:${open}`]);
    expect(shape(open, (r) => { r.acceptedAt = must(r.invitedAt, "invited at") + 1; })).toContain(`invite-shape:${open}`);
    // Payment instructions exist only once it's reserved.
    const pay = must(reqOf(w, held).pay, "the reservation's payment instructions");
    expect(shape(open, (r) => { r.pay = structuredClone(pay) as typeof pay; })).toContain(`invite-shape:${open}`);
    expect(shape(asked, (r) => { r.holdUntil = T0 + 15 * MIN; })).toEqual([`invite-shape:${asked}`]);
    // The mark is true or absent, and only on a direct-payment record. In a world stamped by the switch (this one), a record whose
    // mark isn't true is also an unmarked record made after it: both rules name it.
    expect(sinceOf(w)).toBe(T0);
    expect(shape(asked, (r) => { (r as { inviteFlow?: unknown }).inviteFlow = false; })).toEqual([`legacy-new:${asked}`, `invite-shape:${asked}`]);
    expect(shape(asked, (r) => { (r as { flow: string }).flow = "peer"; })).toContain(`invite-shape:${asked}`);
  });

  it("invite-shape in a world from before the switch: the same rule, and no legacy-new beside it", () => {
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 2 });
    const asked = ask(w, BOB, l);
    expect(sinceOf(w)).toBe(0);
    expect(damaged(w, (doc) => { (rec(doc, asked) as { inviteFlow?: unknown }).inviteFlow = false; })).toEqual([`invite-shape:${asked}`]);
    expect(damaged(w, (doc) => { rec(doc, asked).invitedAt = rec(doc, asked).createdAt; })).toEqual([`invite-shape:${asked}`]);
  });

  it("paused-new and closed-new: nothing is invited or reserved on a listing after it was paused or closed", () => {
    const { w, l } = market({ qty: 3 });
    const asked = ask(w, BOB, l);
    const open = invited(w, ANN, CAT, l);
    w.advance(MIN);
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    const pausedAt = must(listingOf(w, l).pausedAt, "pausedAt");
    expect(violationsOf(w)).toEqual([]);
    // The engine refuses both steps while it's paused (invite-flow.test.ts); a document that has them anyway is refused by the store.
    expect(damaged(w, (doc) => { const r = rec(doc, asked); r.status = "invited"; r.invitedAt = pausedAt + 1; })).toEqual([`paused-new:${asked}`]);
    expect(damaged(w, (doc) => { const r = rec(doc, open); r.status = "accepted"; r.acceptedAt = pausedAt + 1; r.holdUntil = pausedAt + 1 + 15 * MIN; })).toContain(`paused-new:${open}`);

    w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    w.advance(MIN);
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    const closedAt = must(listingOf(w, l).withdrawnAt, "withdrawnAt");
    expect(violationsOf(w)).toEqual([]);
    expect(damaged(w, (doc) => { const r = rec(doc, open); r.status = "invited"; r.invitedAt = closedAt + 1; delete r.reason; })).toContain(`closed-new:${open}`);
  });
});

describe("Goods are untouched", () => {
  /** One item from posted to picked up, with a backup request, on a world of its own. */
  function goods(switchOn: boolean) {
    E.setInviteSwitch(switchOn);
    const w = new ServerWorld({ people: PEOPLE6 });
    const s = new Script(w);
    const item = s.made(ANN, { type: "postItem", data: { title: "Desk chair", cat: "Furniture", cond: "Good", price: "30", obo: false, area: "Rittenhouse", until: dateAfter(w.now, 10), note: "" } });
    const first = s.made(BOB, { type: "requestItem", id: item, msg: "", shareContact: true });
    s.step(ANN, { type: "acceptItemReq", id: first, shareContact: true });
    const backup = s.made(CAT, { type: "requestItem", id: item, msg: "", shareContact: true });
    s.step(DAN, { type: "requestToBuy", listingId: item, qty: 1, msg: "", member: false }); // an item isn't a listing, either way
    s.step(BOB, { type: "itemPickedUp", id: first });
    const shape = (x: object): string[] => Object.keys(x).sort();
    return {
      w, log: s.log,
      item: { sold: typeof must(w.doc.goods.find((g) => g.id === item), "the item").soldAt === "number", keys: shape(must(w.doc.goods.find((g) => g.id === item), "the item")) },
      requests: [first, backup].map((id) => { const g = must(w.doc.goodsReqs.find((x) => x.id === id), "a goods request"); return { status: g.status, keys: shape(g), history: g.history.map((h) => h.text) }; }),
      violations: violationsOf(w),
    };
  }

  it("the same answers, notes, records and outcomes with the switch off and on", () => {
    const off = goods(false);
    const onRun = goods(true);
    expect(onRun.log).toEqual(off.log);
    expect(onRun.item).toEqual(off.item);
    expect(onRun.requests).toEqual(off.requests);
    expect(off.violations).toEqual([]);
    expect(onRun.violations).toEqual([]);
    // Pinned: sold to the first buyer, the backup closed, and the ticket action refused as malformed (an item's id isn't a listing's).
    expect(off.item.sold).toBe(true);
    expect(off.requests.map((r) => r.status)).toEqual(["completed", "declined"]);
    expect(off.log.map((row) => row[2])).toEqual([
      "Item posted.", "Request sent to Ann. If they accept, it's held for you.", expect.stringMatching(/^Held for Bob at \$30\. /),
      expect.stringMatching(/^Request sent to Ann\. It's held for someone else/), `refused: ${NOT_SENT}`, "Picked up. It's marked sold.",
    ]);
    for (const k of ["inviteFlow", "invitedAt", "fromIso", "wantedQty", "blockedAt"]) for (const r of off.requests) expect(r.keys).not.toContain(k);
    expect(onRun.w.doc.requests).toEqual([]);
  });
});

describe("the preview's organizer, premium and quick paths are untouched", () => {
  /** Every open seed listing, asked for by each demo account the way the preview does it: what was said, and the record it made. */
  function preview(switchOn: boolean): string[] {
    E.setInviteSwitch(switchOn);
    const s = seed();
    E.applyWorld(s);
    const demo = Object.keys(E.PEOPLE).filter((id) => E.PEOPLE[id]?.demo === true).sort();
    const out: string[] = [];
    for (const l of s.listings) {
      const ev = E.EV[l.eventId];
      if (!ev || l.withdrawnAt) continue;
      const path = E.isQuick(ev) ? "quick" : ev.premium ? "premium" : ev.organizerRequired ? "organizer" : "club";
      for (const who of demo) {
        if (l.sellerId === who) continue;
        E.applyWorld(s);
        const action: Action = E.isQuick(ev)
          ? { type: "take", listingId: l.id, qty: 1, amount: "", msg: "", member: true }
          : { type: "request", listingId: l.id, qty: 1, confirmEligible: true, shareContact: true, msg: "" };
        const res = E.reduce(s, who, action);
        const made = res.error === undefined && res.result ? res.state.requests.find((r) => r.id === res.result?.id) : undefined;
        out.push([l.id, path, who, res.error !== undefined ? `refused: ${res.error}` : res.toast ?? "", made ? `${made.status}/${made.flow ?? "-"}/${made.inviteFlow === undefined ? "unmarked" : "marked"}` : "-"].join(" | "));
      }
    }
    // The four new actions don't exist in the preview.
    E.applyWorld(s);
    const first = must(demo[0], "a demo account");
    for (const a of [
      { type: "requestToBuy", listingId: "l12", qty: 1, msg: "", member: false }, { type: "invite", requestId: "r1" },
      { type: "inviteRequester", isoId: "i1", listingId: "l12", qty: 1 }, { type: "reserve", requestId: "r1", member: false },
    ]) out.push(`${a.type} | ${E.reduce(s, first, a).error ?? "accepted"}`);
    E.applyWorld(null);
    return out;
  }

  it("every listing answers the same with the switch off and on, and no preview record is marked", () => {
    const off = preview(false);
    const onRun = preview(true);
    expect(onRun).toEqual(off);
    // Each path is in the comparison, with the words it has always had.
    expect(off).toContain(`l12 | quick | u_priya | Reserved for 15 minutes. Pay Leah $60 now, then tap "Paid". | accepted/quick/unmarked`);
    expect(off).toContain("l9 | premium | u_priya | Request sent to Jordan. If they accept, it's held for you. | pending/-/unmarked");
    expect(off.filter((row) => row.includes(" | organizer | ") && row.includes(" | Request sent to ")).length).toBeGreaterThan(0);
    expect(off.filter((row) => row.includes(" | premium | ")).length).toBeGreaterThan(0);
    expect(off.filter((row) => row.includes(" | quick | ")).length).toBeGreaterThan(0);
    expect(off.some((row) => row.endsWith("/marked"))).toBe(false);
    expect(off.slice(-4)).toEqual(["requestToBuy | Unknown action.", "invite | Unknown action.", "inviteRequester | Unknown action.", "reserve | Unknown action."]);
  });

  it("the preview's own rule checks all pass with the switch on", () => {
    const off = runSelfTests(seed());
    E.setInviteSwitch(true);
    const onRun = runSelfTests(seed());
    expect(onRun.filter((t) => !t.pass)).toEqual([]);
    expect(onRun.map((t) => t.name)).toEqual(off.map((t) => t.name));
    expect(onRun).toHaveLength(96);
  }, 30_000);
});

describe("who still needs a way to be paid (the last-method guard's rule, FOLLOWON-PLAN §2.6)", () => {
  const needed = (w: LiveTestWorld, p: TestPerson): number => w.run(() => E.payNeededBy(w.doc, p.userId));

  it("while it's off: an open listing needs one, as before", () => {
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 2 });
    expect(E.payNeededRule()).toBe("listing");
    expect(needed(w, ANN)).toBe(1);
    expect(needed(w, BOB)).toBe(0);
    const r = invited(w, ANN, BOB, l);
    expect(needed(w, ANN)).toBe(1); // counted by listing, not by exchange
    reserve(w, BOB, r);
    w.ok(ANN.userId, { type: "withdraw", listingId: l });
    expect(needed(w, ANN)).toBe(0);
  });

  it("once it's on: an open invitation or an older open offer needs one; a listing or a request to buy alone doesn't", () => {
    E.setInviteSwitch(false);
    const { w, l } = market({ qty: 4, obo: true });
    const older = must(w.ok(EVE.userId, offer(l, "30")).id, "the older offer");
    E.setInviteSwitch(true);
    expect(E.payNeededRule()).toBe("exchange");
    expect(needed(w, ANN)).toBe(1); // the older offer: accepting it copies the seller's methods
    w.ok(ANN.userId, on("decline", older));
    expect(needed(w, ANN)).toBe(0); // an open listing alone: posting doesn't need a method any more

    const r = ask(w, BOB, l);
    expect(needed(w, ANN)).toBe(0); // a request to buy: the seller adds a method when they invite
    invite(w, ANN, r);
    expect(needed(w, ANN)).toBe(1); // an open invitation: reserving it copies the seller's methods
    const second = invited(w, ANN, CAT, l);
    expect(needed(w, ANN)).toBe(2);
    reserve(w, BOB, r);
    expect(needed(w, ANN)).toBe(1); // reserved: the reservation carries its own copy
    w.ok(CAT.userId, on("cancel", second));
    expect(needed(w, ANN)).toBe(0); // declined by the buyer

    // An invitation that ended on its own needs nothing either.
    invited(w, ANN, DAN, l);
    expect(needed(w, ANN)).toBe(1);
    w.advance(7 * HOUR);
    expect(needed(w, ANN)).toBe(0);
    expect(needed(w, BOB)).toBe(0);
  });
});
