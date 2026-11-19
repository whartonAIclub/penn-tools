// SELL5-M3 (USER-INSTRUCTIONS §9v item 2): "I have this" on a ticket request, answered in one submission (answerRequest).
// - A seller with no listing that fits lists a ticket for the request and invites the requester to pay for it, in one change: one
//   listing, open to everyone (nothing is held until someone reserves it), and one invitation at the listing's price, for one ticket
//   unless more were listed (never more than the request asked for). Every rule of Sell (the face-value cap, $0, restrictions) and of an
//   invitation (the seller's payment method, a train leaving by the request's deadline) applies, and a refusal keeps nothing.
// - A seller whose listing fits invites the requester from it: no new listing.
// - A double tap or a resend makes one listing and one invitation: a second answer with a new ticket is refused while the first one's
//   listing is still open (the same request id is answered from the actions log: m3-answer-store.test.ts).
// - When the request closed, was filled or ended before the answer applies, a new listing is still posted, as the seller asked, and the
//   answer says exactly that no invitation went out; from an existing listing nothing changes, and the refusal says why.
// - The requester reserves straight from the invitation (the payment snapshot and the member confirmation as for any invitation), and
//   hears once, by the invitation's own note and email tag.
// - The views: the seller, the requester, a third account and a signed-out visitor each see what they may; nothing says which request a
//   listing was made for.
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, Listing, TicketRequest } from "../../engine/index.js";
import { INVALID_ACTION_ERROR, actionIds, parseAction } from "../live.js";
import { contractViolations, guestContractViolations } from "./helpers/contract.js";
import { must, numbers, reqOf, resetEngine, setMethods, statusOf } from "./helpers/invite.js";
import { FAY, PEOPLE6, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as Action;
/** "List and invite": the Sell form for a request, as the page sends it (a price; everything else as Sell leaves it). */
const answer = (isoId: string, more: Record<string, unknown> = {}) => act({ type: "answerRequest", isoId, ask: "30", note: "", obo: false, ...more });
interface M { w: ServerWorld; ev: string; iso: string }
/** Ann's "Oysters Night" (no face value, 9 days ahead) and Dan's public request for it: one ticket, up to $40, needed within 5 days. */
function market(o: { qty?: number; budget?: string; event?: Record<string, unknown> } = {}): M {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters Night", start: dateAfter(T0, 9), ...o.event })).id, "event");
  const iso = w.requestFor(DAN, ev, { qty: o.qty ?? 1, budget: o.budget ?? "40", days: 5 });
  return { w, ev, iso };
}
const listingsOn = (w: ServerWorld, ev: string): Listing[] => w.doc.listings.filter((l) => l.eventId === ev);
const invitationsFor = (w: ServerWorld, iso: string): TicketRequest[] => w.doc.requests.filter((r) => r.fromIso === iso);
const stored = (w: ServerWorld, id: string) => must(w.doc.listings.find((l) => l.id === id), "listing") as unknown as Record<string, unknown>;
/** Bob's own ticket for the event, posted the ordinary way (Sell). */
const bobsListing = (m: M, more: Record<string, unknown> = {}) => must(m.w.ok(BOB.userId, act({ type: "postTicket", eventId: m.ev, qty: 2, ask: "30", note: "", obo: false, ...more })).id, "Bob's listing");

describe("a ticket listed for the request and its invitation, in one change", () => {
  it("Bob, with no listing, lists one ticket for Dan's request and invites Dan to pay for it: one listing, one invitation, nothing held", () => {
    const { w, ev, iso } = market();
    const done = w.ok(BOB.userId, answer(iso));
    const ls = listingsOn(w, ev), inv = invitationsFor(w, iso);
    expect(ls.map((l) => [l.sellerId, l.listed, l.ask])).toEqual([[BOB.userId, 1, 30]]);
    expect(inv.map((r) => [r.buyerId, r.listingId, r.qty, r.price, r.status, r.inviteFlow])).toEqual([[DAN.userId, ls[0]!.id, 1, 30, "invited", true]]);
    expect(done.id).toBe(ls[0]!.id);
    expect(done.steps).toEqual([{ type: "postTicket", ok: true, id: ls[0]!.id }, { type: "inviteRequester", ok: true, id: inv[0]!.id }]);
    expect(done.toast).toMatch(/^Ticket listed\. Invitation sent to Dan\. Nothing is held until someone reserves it: Dan has until .+\.$/); // SELL5-M4 (§9w): the words, recorded
    expect(numbers(w, ls[0]!.id)).toMatchObject({ available: 1, reserved: 0 }); // the invitation holds nothing
    // Dan hears once, by the invitation (the listing's "a ticket opened up" for his own request is dropped in the same change).
    const toDan = done.notes.filter((n) => n.userId === DAN.userId);
    expect(toDan.map((n) => [n.kind, n.ref])).toEqual([["buy.invited", inv[0]!.id]]);
    expect(toDan[0]!.text).toMatch(/^Bob D\. invited you to pay \$30 each for 1 ticket for Oysters Night, for your request\. It isn't held yet/);
    // The listing remembers the request it was made for (never shown: the views below), and its history says what happened.
    expect(stored(w, ls[0]!.id).forIso).toBe(iso);
    expect(ls[0]!.history.map((h) => h.text)).toEqual(["Listed 1 ticket at $30", "Invited Dan N. to pay, for their request"]);
  });

  it("one ticket unless the seller lists more, and the invitation never covers more than the request asked for", () => {
    const a = market({ qty: 2 });
    a.w.ok(BOB.userId, answer(a.iso));
    expect(listingsOn(a.w, a.ev).map((l) => l.listed)).toEqual([1]);
    expect(invitationsFor(a.w, a.iso).map((r) => r.qty)).toEqual([1]);
    const b = market({ qty: 2 });
    b.w.ok(BOB.userId, answer(b.iso, { qty: 3 }));
    const l = must(listingsOn(b.w, b.ev)[0], "listing");
    expect([l.listed, invitationsFor(b.w, b.iso).map((r) => r.qty), numbers(b.w, l.id).available]).toEqual([3, [2], 3]);
  });

  it("a ticket the seller already holds unlisted is listed from that holding", () => {
    const m = market();
    const first = bobsListing(m, { qty: 1 });
    m.w.ok(BOB.userId, act({ type: "withdraw", listingId: first })); // "Close listing": the ticket comes back to Bob
    const h = must(m.w.doc.holdings.find((x) => x.userId === BOB.userId && x.eventId === m.ev), "Bob's holding").id;
    const done = m.w.ok(BOB.userId, answer(m.iso, { holdingId: h, qty: 1, ask: "28" }));
    const l = must(m.w.doc.listings.find((x) => x.id === done.id), "the new listing");
    expect([l.holdingId, l.ask, done.steps?.map((s) => [s.type, s.ok])]).toEqual([h, 28, [["list", true], ["inviteRequester", true]]]);
  });

  it("Sell's rules apply, and a refusal keeps nothing: the face-value cap, the seller's own ticket, their own request", () => {
    const m = market({ event: { face: "25" }, budget: "20" });
    const before = JSON.stringify(m.w.doc);
    expect(m.w.no(BOB.userId, answer(m.iso, { ask: "30" }))).toBe("Asking price can't be more than the face value ($25).");
    expect(m.w.no(DAN.userId, answer(m.iso, { ask: "20" }))).toBe("That's your own request.");
    expect(m.w.no(BOB.userId, answer("iso-0000000000000001", { ask: "20" }))).toBe("Request not found.");
    expect(JSON.stringify(m.w.doc)).toBe(before);
    const cats = must(m.w.ok(CAT.userId, act({ type: "addHolding", eventId: m.ev, tier: "t1", qty: 1 })).id, "Cat's ticket");
    const afterCat = JSON.stringify(m.w.doc);
    expect(m.w.no(BOB.userId, answer(m.iso, { holdingId: cats, qty: 1, ask: "20" }))).toBe("Choose a ticket you hold.");
    expect(JSON.stringify(m.w.doc)).toBe(afterCat);
  });

  it("$0 is a price, and a restriction in the seller's own words goes with the listing", () => {
    const m = market();
    const done = m.w.ok(BOB.userId, answer(m.iso, { ask: "0", restriction: "Black tie required" }));
    const l = stored(m.w, must(done.id, "listing"));
    expect([l.ask, l.restriction]).toEqual([0, "Black tie required"]);
    expect(invitationsFor(m.w, m.iso).map((r) => r.price)).toEqual([0]);
  });
});

describe("payment and eligibility, as for any invitation", () => {
  it("a seller with no way to be paid is asked first: refused, nothing kept; with a method saved it goes through", () => {
    const m = market();
    const before = JSON.stringify(m.w.doc);
    expect(m.w.no(CAT.userId, answer(m.iso))).toBe(E.NO_PAY_METHODS);
    expect(m.w.no(CAT.userId, answer(m.iso, { ask: "1" }))).toBe(E.NO_PAY_METHODS); // every paid invitation needs a way to be paid, as invite's rule (SELL6-N1, §9x item 1: a free one, at $0, needs none: n1-free.test.ts)
    expect(JSON.stringify(m.w.doc)).toBe(before); // no listing, no ticket, no invitation
    setMethods(m.w, CAT, [{ kind: "venmo", value: "@cat-moore" }]);
    const done = m.w.ok(CAT.userId, answer(m.iso));
    expect(invitationsFor(m.w, m.iso).map((r) => [r.listingId, r.status])).toEqual([[done.id, "invited"]]);
  });

  it("a members-only ticket: Dan confirms he's a member as he reserves, and the server refuses without it", () => {
    const m = market({ event: { club: "GCC" } });
    m.w.ok(BOB.userId, answer(m.iso, { membersOnly: true }));
    const r = must(invitationsFor(m.w, m.iso)[0], "the invitation").id;
    expect(m.w.no(DAN.userId, act({ type: "reserve", requestId: r }))).toMatch(/GCC member/);
    m.w.ok(DAN.userId, act({ type: "reserve", requestId: r, member: true }));
    expect(statusOf(m.w, r)).toBe("accepted");
  });

  it("the per-person limit is Dan's to meet as he reserves (an invitation holds nothing and says nothing about what he has)", () => {
    const m = market({ event: { perPerson: 1 } });
    setMethods(m.w, CAT, [{ kind: "venmo", value: "@cat-moore" }]);
    const cats = must(m.w.ok(CAT.userId, act({ type: "postTicket", eventId: m.ev, qty: 1, ask: "25", note: "", obo: false })).id, "Cat's listing");
    const fromCat = must(m.w.ok(DAN.userId, act({ type: "requestToBuy", listingId: cats, qty: 1, msg: "" })).id, "Dan asks Cat");
    m.w.ok(CAT.userId, act({ type: "invite", requestId: fromCat }));
    m.w.ok(DAN.userId, act({ type: "reserve", requestId: fromCat })); // Dan now has the one ticket a person may have here
    m.w.ok(BOB.userId, answer(m.iso)); // Bob can't know that, and the invitation holds nothing
    const r = must(invitationsFor(m.w, m.iso)[0], "Bob's invitation").id;
    expect(m.w.no(DAN.userId, act({ type: "reserve", requestId: r }))).toBe("That would take you over 1 per person for this event, counting tickets you hold or have reserved.");
  });

  it("Dan reserves straight from the invitation; until someone reserves, anyone else could ask to buy it", () => {
    const m = market();
    const lid = must(m.w.ok(BOB.userId, answer(m.iso)).id, "listing");
    const rid = must(invitationsFor(m.w, m.iso)[0], "the invitation").id;
    const cats = must(m.w.ok(CAT.userId, act({ type: "requestToBuy", listingId: lid, qty: 1, msg: "" })).id, "Cat asks to buy it"); // still open to everyone
    m.w.ok(DAN.userId, act({ type: "reserve", requestId: rid }));
    expect([statusOf(m.w, rid), numbers(m.w, lid).available, numbers(m.w, lid).reserved]).toEqual(["accepted", 0, 1]);
    expect(reqOf(m.w, rid).pay).toEqual([{ kind: "other", value: "@bob-diaz" }]); // Bob's way to be paid, copied as Dan reserved
    expect(m.w.no(BOB.userId, act({ type: "invite", requestId: cats }))).toMatch(/^Another buyer is paying for it right now/);
  });
});

describe("a listing that already fits", () => {
  it("Bob invites Dan from his open listing: no new listing, one invitation, at a price Bob may lower", () => {
    const m = market();
    const lid = bobsListing(m);
    const done = m.w.ok(BOB.userId, answer(m.iso, { listingId: lid, qty: 1, price: "28" }));
    const inv = invitationsFor(m.w, m.iso);
    expect([listingsOn(m.w, m.ev).length, done.id, inv.map((r) => [r.listingId, r.qty, r.price])]).toEqual([1, lid, [[lid, 1, 28]]]);
    expect(done.steps).toEqual([{ type: "inviteRequester", ok: true, id: inv[0]!.id }]);
    expect(done.toast).toMatch(/^Invitation sent to Dan\. Nothing is held/);
  });

  it("only from the seller's own listing", () => {
    const m = market();
    const lid = bobsListing(m);
    setMethods(m.w, CAT, [{ kind: "venmo", value: "@cat-moore" }]);
    expect(m.w.no(CAT.userId, answer(m.iso, { listingId: lid }))).toBe("Choose one of your listings.");
  });
});

describe("one submission: one listing and one invitation", () => {
  it("a second answer with a new ticket while the first listing is open is refused and changes nothing", () => {
    const m = market();
    m.w.ok(BOB.userId, answer(m.iso));
    const before = JSON.stringify(m.w.doc);
    expect(m.w.no(BOB.userId, answer(m.iso))).toBe("You've already listed a ticket for Dan's request.");
    expect(JSON.stringify(m.w.doc)).toBe(before);
    expect([listingsOn(m.w, m.ev).length, invitationsFor(m.w, m.iso).length]).toEqual([1, 1]);
  });

  it("from an existing listing, a second invitation is refused as before", () => {
    const m = market();
    const lid = bobsListing(m);
    m.w.ok(BOB.userId, answer(m.iso, { listingId: lid }));
    expect(m.w.no(BOB.userId, answer(m.iso, { listingId: lid }))).toBe("You've already invited Dan on this listing.");
    expect(invitationsFor(m.w, m.iso)).toHaveLength(1);
  });

  it("once that listing is closed, the seller may answer again", () => {
    const m = market();
    const first = must(m.w.ok(BOB.userId, answer(m.iso)).id, "first");
    m.w.ok(BOB.userId, act({ type: "withdraw", listingId: first })); // closes the invitation too; the ticket is back with Bob
    const h = must(m.w.doc.holdings.find((x) => x.userId === BOB.userId && x.eventId === m.ev), "Bob's holding").id; // the Sell form lists a held ticket from its holding
    const again = must(m.w.ok(BOB.userId, answer(m.iso, { holdingId: h, qty: 1, ask: "26" })).id, "again");
    expect(listingsOn(m.w, m.ev).map((l) => [l.id, !!l.withdrawnAt])).toEqual([[again, false], [first, true]]);
    expect(invitationsFor(m.w, m.iso).map((r) => [r.listingId, r.status])).toEqual([[again, "invited"], [first, "declined"]]);
  });
});

describe("the request closed before the answer applied", () => {
  const cases: [string, (m: M) => void, string][] = [
    ["closed", (m) => { m.w.ok(DAN.userId, act({ type: "closeInterest", id: m.iso, reason: "cancelled" })); }, "Dan's request closed before it reached them, so no invitation went out."],
    ["filled", (m) => { m.w.ok(DAN.userId, act({ type: "closeInterest", id: m.iso, reason: "fulfilled" })); }, "Dan's request was filled before it reached them, so no invitation went out."],
    ["ended", (m) => { m.w.advance(6 * DAY); }, "Dan's request ended before it reached them, so no invitation went out."],
  ];
  it.each(cases)("%s: the ticket is listed as asked, no invitation goes out, and the answer says so exactly", (_, close, words) => {
    const m = market();
    close(m);
    const done = m.w.ok(BOB.userId, answer(m.iso));
    const ls = listingsOn(m.w, m.ev);
    expect(ls.map((l) => [l.id, l.sellerId, l.listed, !!l.withdrawnAt])).toEqual([[done.id, BOB.userId, 1, false]]);
    expect(invitationsFor(m.w, m.iso)).toEqual([]);
    expect(done.toast).toBe(`Your ticket is listed. ${words}`);
    expect(done.steps).toEqual([{ type: "postTicket", ok: true, id: done.id }, { type: "inviteRequester", ok: false, error: words }]);
    expect(done.notes.filter((n) => n.userId === DAN.userId)).toEqual([]);
    expect(numbers(m.w, must(done.id, "listing")).available).toBe(1); // open to everyone
    expect(m.w.no(BOB.userId, answer(m.iso))).toBe("You've already listed a ticket for Dan's request."); // a resend: still one listing
  });

  it("from an existing listing, nothing is sent and nothing changes", () => {
    const m = market();
    const lid = bobsListing(m);
    m.w.ok(DAN.userId, act({ type: "closeInterest", id: m.iso, reason: "cancelled" }));
    const before = JSON.stringify(m.w.doc);
    expect(m.w.no(BOB.userId, answer(m.iso, { listingId: lid }))).toBe("Dan's request closed before your invitation reached them, so nothing was sent.");
    expect(JSON.stringify(m.w.doc)).toBe(before);
  });
});

describe("the views", () => {
  it("the seller, the requester, a third account and a signed-out visitor each see what they may", () => {
    const m = market();
    const lid = must(m.w.ok(BOB.userId, answer(m.iso)).id, "listing");
    const rid = must(invitationsFor(m.w, m.iso)[0], "the invitation").id;
    const seller = viewOf(m.w, BOB), dan = viewOf(m.w, DAN), fay = viewOf(m.w, FAY), guest = guestViewOf(m.w);
    for (const [v, who] of [[seller, BOB], [dan, DAN], [fay, FAY]] as const) expect(contractViolations(v, who.userId), who.name).toEqual([]);
    expect(guestContractViolations(guest)).toEqual([]);
    // Everyone sees the listing, open: the invitation holds nothing.
    for (const v of [seller, dan, fay]) expect(must(v.listings.find((l) => l.id === lid), "listing").numbers.available).toBe(1);
    expect(must(guest.listings.find((l) => l.id === lid), "guest listing").available).toBe(1);
    // The invitation reaches its two parties only.
    expect(seller.requests.filter((r) => r.id === rid).map((r) => [r.buyerId, r.status, r.fromIso])).toEqual([[DAN.userId, "invited", m.iso]]);
    expect(dan.requests.filter((r) => r.id === rid).map((r) => [r.status, r.price, r.qty])).toEqual([["invited", 30, 1]]);
    expect(fay.requests.some((r) => r.id === rid)).toBe(false);
    expect(dan.notifications.map((n) => n.text)).toEqual([expect.stringMatching(/^Bob D\. invited you to pay \$30 each for 1 ticket for Oysters Night, for your request\./)]);
    // Nothing says which request a listing was made for, and a visitor gets no names and no invitation.
    for (const v of [seller, dan, fay, guest]) expect(JSON.stringify(v)).not.toContain("forIso");
    expect(JSON.stringify(guest)).not.toMatch(new RegExp(`${rid}|Bob Diaz|Dan Ng`));
    // Once Dan reserves, every other viewer sees it taken.
    m.w.ok(DAN.userId, act({ type: "reserve", requestId: rid }));
    expect(must(viewOf(m.w, FAY).listings.find((l) => l.id === lid), "listing").numbers.available).toBe(0);
    expect(guestViewOf(m.w).listings.find((l) => l.id === lid)?.available ?? 0).toBe(0); // a visitor isn't offered it (none left to take)
  });
});

describe("the input gate and the protocol", () => {
  it("parseAction takes the page's two shapes, drops what it doesn't know, and refuses a listing and a ticket at once", () => {
    const iso = "iso-00000000000000a1", l = "l00000000000000a2", h = "h00000000000000a3";
    const fresh = parseAction({ type: "answerRequest", isoId: iso, qty: 1, ask: "30", note: "Can send tonight", obo: false, restriction: "Black tie", club: null, membersOnly: false, simulate: true, sellerId: "x" });
    expect(fresh).toMatchObject({ ok: true, action: { type: "answerRequest", isoId: iso, qty: 1, ask: "30", restriction: "Black tie" } });
    expect(fresh.ok && "simulate" in fresh.action).toBe(false);
    expect(fresh.ok && "sellerId" in fresh.action).toBe(false);
    expect(parseAction({ type: "answerRequest", isoId: iso, listingId: l, qty: 1, price: "" })).toMatchObject({ ok: true });
    expect(parseAction({ type: "answerRequest", isoId: iso, holdingId: h, qty: 1, ask: "30" })).toMatchObject({ ok: true });
    expect(parseAction({ type: "answerRequest", isoId: iso, listingId: l, holdingId: h, qty: 1, ask: "30" })).toMatchObject({ ok: false, error: INVALID_ACTION_ERROR });
    expect(parseAction({ type: "answerRequest", isoId: "@0", ask: "30" })).toMatchObject({ ok: false, error: INVALID_ACTION_ERROR });
    const parsed = parseAction({ type: "answerRequest", isoId: iso, listingId: l, qty: 1, price: "28" });
    if (!parsed.ok) throw new Error(parsed.why);
    expect(actionIds(parsed.action)).toEqual({ isoId: iso, listingId: l }); // ids only: never the price or anything typed
  });

  it("the page protocol is 9 (open pages reload); answerRequest is a live type, sent by itself, never a seq step", () => {
    expect(E.HANDOFF_PROTOCOL).toBe(10); // 9 with this step; SELL6-N1 (§9x item 1) made it 10, so a page of 8 still reloads
    expect(E.LIVE_TYPES).toContain("answerRequest");
    expect(E.SEQ_STEP_TYPES).not.toContain("answerRequest");
  });
});
