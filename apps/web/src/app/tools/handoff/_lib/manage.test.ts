// Manage listing for ordinary tickets (USER-INSTRUCTIONS §9q items 1 to 3), the page's rules (_lib/manage.js): which listings are
// ordinary tickets and which have a routine delivery, the short status that replaces the row of counters, whose cards go to the top,
// the step after the payment is confirmed, what the close confirmation says closing ends, and the listings shown as "Your listing" on
// their event's page. Pure functions over the engine: a small live market installed with a set clock; no DOM, no server, no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { closeEnds, closeText, listingStatus, needsSeller, ordinaryTicket, ownListings, routineTransfer, sendStep } from "./manage";

const T0 = Date.UTC(2026, 10, 16, 12, 0); // Mon Nov 16, 2026, 7:00 AM in Philadelphia
const SELLER = "u-test-seller", BUYER = "u-test-buyer", LATE = "u-test-late";
const stored = (id: string, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${id.padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const COMEDY = stored("1", "Comedy Night", "2026-11-25");
const GALA = stored("2", "Spring Gala", "2026-12-04", { club: "Wharton Social Committee", namesChecked: true });
const TRAIN = stored("3", "Amtrak Keystone: Philadelphia to New York", "2026-11-22T09:05", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const TREK = stored("4", "Patagonia Trek", "2026-12-20", { kind: "trek", cat: "Treks & trips", club: "Outdoors Club", perPerson: 2 });
const listing = (id: string, eventId: string, more: Record<string, unknown> = {}) => ({ id, eventId, sellerId: SELLER, holdingId: "h-" + id, listed: 1, ask: 25, paid: null, tier: "t1", viaOrganizer: false, obo: false, note: "", createdAt: T0 - 60e3, history: [], ...more });
const request = (id: string, listingId: string, status: string, more: Record<string, unknown> = {}) => ({ id, listingId, eventId: COMEDY.id, buyerId: BUYER, qty: 1, price: 25, flow: "quick", inviteFlow: true, status, createdAt: T0 - 30e3, expiresAt: T0 + 6 * 3600e3,
  ...(["invited", "accepted", "paid", "confirmed", "sent", "completed"].includes(status) ? { invitedAt: T0 - 20e3 } : {}),
  ...(["accepted", "paid", "confirmed", "sent", "completed"].includes(status) ? { acceptedAt: T0 - 10e3, holdUntil: T0 + 15 * 60e3, pay: [{ kind: "venmo", value: "sam-seller" }] } : {}), history: [], ...more });
const world = (listings: object[], requests: object[] = []) => {
  const w = { ...E.emptyWorld(), inviteSince: 1, events: [COMEDY, GALA, TRAIN, TREK], listings, requests,
    holdings: listings.map((l) => { const x = l as { id: string; eventId: string; listed: number }; return { id: "h-" + x.id, userId: SELLER, eventId: x.eventId, tier: "t1", qty: x.listed, paid: null, source: "self-reported" }; }),
    people: { [SELLER]: { name: "Sam Seller" }, [BUYER]: { name: "Bea Buyer" }, [LATE]: { name: "Lee Late" } } };
  E.setLiveClock(() => T0); E.applyWorld(w as unknown as Parameters<typeof E.applyWorld>[0]);
  return w as unknown as E.WorldState;
};
const ev = (stored: { id: string }) => E.EV[stored.id]!;
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("which listings are ordinary tickets (9q items 1 to 3 apply to these only)", () => {
  it("a ticket for an event is ordinary; a train's, a trek's and an add-on are not", () => {
    world([]);
    expect(ordinaryTicket(ev(COMEDY), { tier: "t1" })).toBe(true);
    expect(ordinaryTicket(ev(GALA), { tier: "t1" })).toBe(true); // names checked at the door: still an event's ticket
    expect(ordinaryTicket(ev(TRAIN), { tier: "t1" })).toBe(false);
    expect(ordinaryTicket(ev(TREK), { tier: "t1" })).toBe(false);
    expect(ordinaryTicket(null, { tier: "t1" })).toBe(false);
    expect(ordinaryTicket(ev(COMEDY), null)).toBe(false);
  });
  it("delivery is routine with no recorded method or the old form's PDF or QR code; a name change, an app transfer and a paper ticket are specific", () => {
    world([]);
    expect(routineTransfer(ev(COMEDY), { tier: "t1" })).toBe(true);
    expect(routineTransfer(ev(COMEDY), { tier: "t1", method: "file" })).toBe(true);
    expect(routineTransfer(ev(COMEDY), { tier: "t1", method: "app" })).toBe(false);
    expect(routineTransfer(ev(GALA), { tier: "t1", method: "name" })).toBe(false);
    expect(routineTransfer(ev(COMEDY), { tier: "t1", method: "inperson" })).toBe(false);
    expect(routineTransfer(ev(TRAIN), { tier: "t1", method: "file" })).toBe(false); // a train's eTicket is its carrier's rule, not routine
    expect(routineTransfer(ev(TREK), { tier: "t1", method: "name" })).toBe(false);
  });
});

describe("the short status that replaces the row of counters (9q item 1)", () => {
  const n = (over: Partial<Parameters<typeof listingStatus>[0]> = {}) => ({ listed: 1, available: 1, reserved: 0, completed: 0, ask: 25, ...over });
  it("a fresh listing leads with what's available and its price, and no zero counts", () => {
    expect(listingStatus(n())).toBe("1 ticket available · $25");
    expect(listingStatus(n({ listed: 2, available: 2 }))).toBe("2 tickets available · $25 each");
    expect(listingStatus(n())).not.toMatch(/held|transferred|listed|paused/);
  });
  it("shows held and transferred quantities only when there are some", () => {
    expect(listingStatus(n({ listed: 2, available: 1, reserved: 1 }))).toBe("1 ticket available · 1 held · $25 each");
    expect(listingStatus(n({ listed: 2, available: 1, completed: 1 }))).toBe("1 ticket available · 1 transferred · $25 each");
    expect(listingStatus(n({ listed: 3, available: 1, reserved: 1, completed: 1 }))).toBe("1 ticket available · 1 held · 1 transferred · $25 each");
    expect(listingStatus(n({ available: 0, reserved: 1 }))).toBe("1 ticket held · $25");
    expect(listingStatus(n({ available: 0, completed: 1 }))).toBe("1 ticket transferred · $25");
    expect(listingStatus(n({ listed: 2, available: 0, completed: 2 }))).toBe("2 tickets transferred · $25 each");
  });
  it("a listing paused before says how many the pause keeps off sale", () => {
    expect(listingStatus(n({ available: 0, paused: 1, ask: 30 }))).toBe("1 ticket paused · $30");
    expect(listingStatus(n({ listed: 2, available: 0, paused: 1, reserved: 1 }))).toBe("1 ticket paused · 1 held · $25 each");
  });
  it("a closed listing says so, with what's still held or was transferred", () => {
    expect(listingStatus(n({ available: 0, closed: true }))).toBe("Closed · $25");
    expect(listingStatus(n({ listed: 2, available: 0, reserved: 1, closed: true }))).toBe("Closed · 1 held · $25 each");
    expect(listingStatus(n({ listed: 2, available: 0, completed: 1, closed: true }))).toBe("Closed · 1 transferred · $25 each");
  });
  it("off sale with its event and nothing held: what was listed (the chip beside it says why)", () => {
    expect(listingStatus(n({ available: 0 }))).toBe("1 ticket listed · $25");
  });
  it("uses the unit it's given and a $0 price", () => {
    expect(listingStatus(n({ unit: "spot", ask: 0 }))).toBe("1 spot available · $0");
  });
});

describe("whose cards go to the top: what waits for the seller (9q item 1)", () => {
  it("a request to buy, a payment to confirm and a ticket to send wait for the seller; an invitation and an unpaid hold wait for the buyer", () => {
    const l = listing("l1", COMEDY.id, { listed: 4 });
    const s = world([l], [request("r-asked", "l1", "requested"), request("r-invited", "l1", "invited", { buyerId: LATE }), request("r-held", "l1", "accepted"), request("r-paid", "l1", "paid"), request("r-confirmed", "l1", "confirmed"),
      request("r-sent", "l1", "sent"), request("r-gone", "l1", "declined")]);
    expect(needsSeller(s, SELLER, l).sort()).toEqual(["r-asked", "r-confirmed", "r-paid"]);
    expect(needsSeller(s, BUYER, l)).toEqual([]); // the buyer's own steps are never the seller's
  });
  it("only this listing's", () => {
    const a = listing("l1", COMEDY.id), b = listing("l2", COMEDY.id);
    const s = world([a, b], [request("r1", "l1", "requested"), request("r2", "l2", "requested", { buyerId: LATE })]);
    expect(needsSeller(s, SELLER, a)).toEqual(["r1"]);
    expect(needsSeller(s, SELLER, b)).toEqual(["r2"]);
  });
  it("a fresh listing has none", () => {
    const l = listing("l1", COMEDY.id);
    expect(needsSeller(world([l]), SELLER, l)).toEqual([]);
  });
});

describe("the step after the seller confirms the payment (9q item 3)", () => {
  it("says who to send it to, then the existing “I've sent it”", () => {
    expect(sendStep("Bea", "ticket", true)).toBe("Send the ticket to Bea (their email is below), then tap “I've sent it”");
    expect(sendStep("Bea", "ticket", false)).toBe("Send the ticket to Bea, then tap “I've sent it”");
    expect(sendStep("Bea", "ticket", true)).not.toMatch(/PDF|QR|Ticketmaster|AXS/);
  });
});

describe("what the close confirmation says closing ends (9q item 2)", () => {
  it("counts pending requests and invitations, and says their buyers are told", () => {
    expect(closeEnds({ requests: 1 })).toBe("Closing ends 1 pending request: that buyer is told.");
    expect(closeEnds({ invitations: 1 })).toBe("Closing ends 1 invitation: that buyer is told.");
    expect(closeEnds({ requests: 2, invitations: 1 })).toBe("Closing ends 2 pending requests and 1 invitation: those buyers are told.");
    expect(closeEnds({ requests: 1, invitations: 2, offers: 1 })).toBe("Closing ends 1 pending request, 2 invitations and 1 open offer: those buyers are told.");
  });
  it("says nothing when nothing is pending", () => {
    expect(closeEnds({})).toBe("");
    expect(closeEnds()).toBe("");
  });
  it("the confirmation stays short: what comes back, what ends, and that reservations continue", () => {
    expect(closeText({ left: 1 })).toBe("Close this listing? 1 ticket comes back to you, and classmates can't ask to buy it.");
    expect(closeText({ left: 2 })).toBe("Close this listing? 2 tickets come back to you, and classmates can't ask to buy them.");
    expect(closeText({ left: 1, requests: 1, reserved: 1 })).toBe("Close this listing? 1 ticket comes back to you, and classmates can't ask to buy it. Closing ends 1 pending request: that buyer is told. Reservations already made continue; if one ends unpaid, it comes back to you.");
    expect(closeText({ left: 0, reserved: 1 })).toBe("Close this listing? Classmates can't ask to buy it any more. Reservations already made continue; if one ends unpaid, it comes back to you.");
    expect(closeText({ left: 1, invitations: 2 })).toBe("Close this listing? 1 ticket comes back to you, and classmates can't ask to buy it. Closing ends 2 invitations: those buyers are told.");
  });
});

describe("“Your listing” on the event's page, where a seller's own shared link opens (9q item 1)", () => {
  const ids = (xs: { id: string }[]) => xs.map((l) => l.id);
  it("shows the seller's own listing that's in play, and never another seller's", () => {
    const s = world([listing("l1", COMEDY.id), listing("l2", COMEDY.id, { sellerId: LATE })]);
    expect(ids(ownListings(s, SELLER, ev(COMEDY), null))).toEqual(["l1"]);
    expect(ids(ownListings(s, BUYER, ev(COMEDY), null))).toEqual([]);
    expect(ids(ownListings(s, BUYER, ev(COMEDY), "l1"))).toEqual([]); // someone else's link: no panel
  });
  it("a closed listing shows only when the link points at it, when it still holds a reservation, or when it was closed on this visit", () => {
    const s = world([listing("l1", COMEDY.id, { withdrawnAt: T0 - 5e3 })]);
    expect(ids(ownListings(s, SELLER, ev(COMEDY), null))).toEqual([]);
    expect(ids(ownListings(s, SELLER, ev(COMEDY), "l1"))).toEqual(["l1"]);
    expect(ids(ownListings(s, SELLER, ev(COMEDY), null, new Set(["l1"])))).toEqual(["l1"]);
    const held = world([listing("l1", COMEDY.id, { listed: 2, withdrawnAt: T0 - 5e3 })], [request("r1", "l1", "accepted")]);
    expect(ids(ownListings(held, SELLER, ev(COMEDY), null))).toEqual(["l1"]);
  });
  it("a paused listing shows (it still offers Resume or Close); a train's listing keeps its own panel in My activity", () => {
    const s = world([listing("l1", COMEDY.id, { pausedAt: T0 - 5e3 }), listing("l3", TRAIN.id, { method: "file" })]);
    expect(ids(ownListings(s, SELLER, ev(COMEDY), null))).toEqual(["l1"]);
    expect(ids(ownListings(s, SELLER, ev(TRAIN), "l3"))).toEqual([]);
  });
});
