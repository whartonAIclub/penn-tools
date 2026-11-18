// SELL5-M3 (USER-INSTRUCTIONS §9v item 2), the page's rules for "I have this" on a ticket request that need no page (_lib/answer.js):
// - which answer the request page leads with (listAndInviteOffered): invite from a listing of yours that fits, or, with none (and no
//   exchange already open with them), "List and invite <first name>";
// - what the Sell form for a request sends (answerAction, inviteFromListing): one action, answerRequest, with the request and either the
//   ticket's own fields or the listing to invite from, never an event of its own;
// - what it says before the tap (answerSummary): how many the requester is invited for (one unless more are listed, never more than they
//   asked for), the total, a budget it goes over, and that inviting holds nothing;
// - where it lands (answerLanding): "Ticket listed. Invitation sent to Dan." or exactly why no invitation went out.
// Pure functions: no DOM, no server, no sign-in.
import { describe, expect, it } from "vitest";
import { answerAction, answerHint, answerLanding, answerSummary, inviteFromListing, listAndInviteOffered } from "./answer";

const ISO = "iso-0123456789abcdef", L = "l0123456789abcdef", H = "h0123456789abcdef";

describe("which answer the request page leads with", () => {
  it("List and invite only when no listing of yours fits and nothing is open with them already", () => {
    expect(listAndInviteOffered({ canCreate: true, invitable: 0, dealing: 0 })).toBe(true);
    expect(listAndInviteOffered({ canCreate: true, invitable: 1, dealing: 0 })).toBe(false); // invite from that listing instead
    expect(listAndInviteOffered({ canCreate: true, invitable: 0, dealing: 1 })).toBe(false); // you've invited them already
    expect(listAndInviteOffered({ canCreate: false, invitable: 0, dealing: 0 })).toBe(false); // nothing you could list here
  });
});

describe("what the form sends: one answerRequest", () => {
  it("a ticket being added, a ticket already held, and an invitation from a listing", () => {
    const body = { qty: 1, ask: "30", note: "", obo: false, restriction: "Black tie" };
    expect(answerAction({ isoId: ISO, body })).toEqual({ type: "answerRequest", isoId: ISO, qty: 1, ask: "30", note: "", obo: false, restriction: "Black tie" });
    expect(answerAction({ isoId: ISO, tier: "t2", body })).toEqual({ type: "answerRequest", isoId: ISO, tier: "t2", ...body });
    expect(answerAction({ isoId: ISO, holdingId: H, tier: "t2", body })).toEqual({ type: "answerRequest", isoId: ISO, holdingId: H, ...body });
    expect(inviteFromListing({ isoId: ISO, listingId: L, qty: 2, price: " 28 " })).toEqual({ type: "answerRequest", isoId: ISO, listingId: L, qty: 2, price: "28" });
  });
  it("never an event of its own or another type: the request's event is the one", () => {
    const a = answerAction({ isoId: ISO, body: { type: "postTicket", eventId: "ev-0123456789abcdef", event: { kind: "event", title: "X" }, holdingId: H, listingId: L, qty: 1, ask: "30" } });
    expect(a).toEqual({ type: "answerRequest", isoId: ISO, qty: 1, ask: "30" });
  });
});

describe("what it says before the tap: how many, and the total", () => {
  it("one ticket for a one-ticket request", () => {
    expect(answerSummary({ ask: "30", listQty: 1, isoQty: 1, budget: 40, first: "Dan", unit: "ticket" })).toEqual({
      qty: 1, total: 30, lead: "You'll invite Dan to pay $30", line: "for 1 ticket.", notes: [], hold: "Inviting holds nothing: your listing stays open to everyone until someone reserves it.",
    });
  });
  it("never more than they asked for; the rest stay open; what they asked for; a price over their budget", () => {
    expect(answerSummary({ ask: "25", listQty: 3, isoQty: 2, budget: null, first: "Dan", unit: "ticket" })).toMatchObject({
      qty: 2, total: 50, lead: "You'll invite Dan to pay $50", line: "for 2 tickets.", notes: ["The other ticket stays open to everyone."] });
    expect(answerSummary({ ask: "25", listQty: 4, isoQty: 2, budget: null, first: "Dan", unit: "ticket" })).toMatchObject({ notes: ["The other 2 tickets stay open to everyone."] });
    expect(answerSummary({ ask: "45", listQty: 1, isoQty: 2, budget: 40, first: "Dan", unit: "ticket" })).toMatchObject({
      qty: 1, total: 45, notes: ["Dan asked for 2.", "That's above Dan's budget of $40."] });
  });
  it("$0 is a price; nothing to say while the price isn't an amount", () => {
    expect(answerSummary({ ask: "0", listQty: 1, isoQty: 1, budget: 40, first: "Dan", unit: "ticket" })).toMatchObject({ qty: 1, total: 0, lead: "You'll invite Dan to take 1 ticket" }); // SELL6-N1 (§9x item 1): nobody is invited to pay $0 (was "You'll invite Dan to pay $0"); the free words: n1-free.test.ts
    for (const ask of ["", "  ", "abc", "-3"]) expect(answerSummary({ ask, listQty: 1, isoQty: 1, budget: 40, first: "Dan", unit: "ticket" }), ask).toBeNull();
  });
  it("no total for a price that can't be posted: above the event's face value (cap); at it, or with no face value, the total shows", () => {
    expect(answerSummary({ ask: "50", listQty: 1, isoQty: 1, budget: null, first: "Dan", unit: "ticket", cap: 35 })).toBeNull();
    expect(answerSummary({ ask: "35", listQty: 1, isoQty: 1, budget: null, first: "Dan", unit: "ticket", cap: 35 })).toMatchObject({ total: 35, lead: "You'll invite Dan to pay $35" });
    expect(answerSummary({ ask: "50", listQty: 1, isoQty: 1, budget: null, first: "Dan", unit: "ticket", cap: null })).toMatchObject({ total: 50 });
  });
  it("what it says instead of a total: enter a price, or fix the one entered", () => {
    expect(answerHint("", "Dan")).toBe("Enter your price to see what you'll invite Dan to pay.");
    expect(answerHint("  ", "Dan")).toBe("Enter your price to see what you'll invite Dan to pay.");
    for (const ask of ["50", "abc", "-3"]) expect(answerHint(ask, "Dan"), ask).toBe("Fix the price above to see what you'll invite Dan to pay.");
  });
});

describe("where it lands", () => {
  it("listed and invited, listed with no invitation (in the server's own words), or listed", () => {
    expect(answerLanding([{ type: "postTicket", ok: true, id: L }, { type: "inviteRequester", ok: true, id: "r0123456789abcdef" }], "Dan", "ticket"))
      .toEqual({ invited: true, note: "Ticket listed. Invitation sent to Dan." });
    const why = "Dan's request closed before it reached them, so no invitation went out.";
    expect(answerLanding([{ type: "postTicket", ok: true, id: L }, { type: "inviteRequester", ok: false, error: why }], "Dan", "ticket"))
      .toEqual({ invited: false, note: `Your ticket is listed. ${why}` });
    expect(answerLanding(undefined, "Dan", "ticket")).toEqual({ invited: false, note: "Ticket listed." });
  });
});
