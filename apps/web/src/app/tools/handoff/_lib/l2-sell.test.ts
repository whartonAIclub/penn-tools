// SELL4-L2 (USER-INSTRUCTIONS §9s items 3 and 4), the page's rules for Sell a ticket (_lib/sell.js) that need no page:
// - what the search field offers: before typing, the seller's own unlisted tickets first, then the soonest; after typing, the best
//   match first, whatever the word order and with half-typed words ("night oys" finds Oysters Night), each seating and departure
//   its own row (sellOptions, over the engine's search);
// - the asking price: it can be entered before any event, a price the seller entered follows every change of event while a
//   starting value doesn't (askAfterEvent); $0 is a price; a price above the chosen event's face value is said at the price
//   (askIssue), never by changing what was typed;
// - where things sit: a new ordinary event's date beside the price (dateBesideAsk), and its club or organizer (clubPlace: §9y, on the
//   form itself; §9s item 4 had it in Optional details until a restriction needed it).
// Pure functions over a small live market with a set clock: no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { NEW0, NEW_MORE, askAfterEvent, askIssue, clubPlace, dateBesideAsk, newMoreUsed, optionMeta, sellMode, sellOptions } from "./sell";

const T0 = Date.UTC(2026, 10, 15, 20, 0); // Sun Nov 15, 2026, 3:00 PM in Philadelphia
const stored = (n: number, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${String(n).padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const COMEDY = stored(1, "Comedy Night", "2026-11-20");
const OYSTERS = stored(2, "Oysters Night", "2026-11-25");
const MARKET = stored(3, "Night Market", "2026-11-22");
const IMPROV_7 = stored(4, "Improv Hour", "2026-11-27T19:00");
const IMPROV_930 = stored(5, "Improv Hour", "2026-11-27T21:30");
const TRAIN_AM = stored(6, "Acela PHL to NYC", "2026-11-21T09:05", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const TRAIN_PM = stored(7, "Acela PHL to NYC", "2026-11-21T15:10", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const BALL = stored(8, "Winter Ball", "2026-12-15"); // the latest of all: the seller holds an unlisted ticket for it
const EVENTS = [COMEDY, OYSTERS, MARKET, IMPROV_7, IMPROV_930, TRAIN_AM, TRAIN_PM, BALL];
const ids = (xs: { id: string }[]) => xs.map((e) => e.id);
const heldBall = (e: { id: string }) => (e.id === BALL.id ? 1 : 0);
const heldOysters = (e: { id: string }) => (e.id === OYSTERS.id ? 2 : 0);

beforeEach(() => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld(), events: EVENTS } as unknown as Parameters<typeof E.applyWorld>[0]); });
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("What ticket are you selling? Before typing (9s item 4)", () => {
  it("the seller's own unlisted tickets first, then the soonest upcoming", () => {
    expect(ids(sellOptions("", "", heldBall))).toEqual([BALL.id, COMEDY.id, TRAIN_AM.id, TRAIN_PM.id, MARKET.id]);
    expect(ids(sellOptions("", ""))).toEqual([COMEDY.id, TRAIN_AM.id, TRAIN_PM.id, MARKET.id, OYSTERS.id]); // nothing held: the soonest five
  });
});

describe("What ticket are you selling? After typing: the best match first (9s item 4)", () => {
  it("\"night oys\" finds Oysters Night", () => {
    expect(ids(sellOptions("night oys", ""))[0]).toBe(OYSTERS.id);
    expect(optionMeta(sellOptions("night oys", "")[0]!)).toBe("Wed, Nov 25");
  });
  it("whatever the word order, and with the half-typed word first", () => {
    expect(ids(sellOptions("oys night", ""))).toEqual([OYSTERS.id, COMEDY.id, MARKET.id]); // the full match before the sooner half matches
    expect(ids(sellOptions("oyst nigh", ""))[0]).toBe(OYSTERS.id);
    expect(ids(sellOptions("market night", ""))[0]).toBe(MARKET.id);
  });
  it("two half-typed short words still find it, so the form doesn't take the name for a new event", () => {
    const rows = sellOptions("oy ni", "");
    expect(ids(rows)).toEqual([OYSTERS.id]);
    expect(sellMode({ picked: false, isNew: false, text: "oy ni", matches: rows.length, when: "" })).toBe("search");
  });
  it("match quality comes before the seller's own tickets, which lead only among equal matches", () => {
    expect(ids(sellOptions("night", "", heldOysters))).toEqual([OYSTERS.id, COMEDY.id, MARKET.id]); // three equal matches: the seller's own first
    expect(ids(sellOptions("night", ""))).toEqual([COMEDY.id, MARKET.id, OYSTERS.id]); // none held: the soonest first
    expect(ids(sellOptions("market night", "", heldOysters))[0]).toBe(MARKET.id); // a better match stays ahead
  });
  it("two seatings and two departures stay two rows, each with its own time", () => {
    const shows = sellOptions("improv", "");
    expect(ids(shows)).toEqual([IMPROV_7.id, IMPROV_930.id]);
    expect(shows.map(optionMeta)).toEqual(["Fri, Nov 27, 7:00 PM", "Fri, Nov 27, 9:30 PM"]);
    const trains = sellOptions("nyc acela", "");
    expect(ids(trains)).toEqual([TRAIN_AM.id, TRAIN_PM.id]);
    expect(trains.map(optionMeta)).toEqual(["Sat, Nov 21, 9:05 AM", "Sat, Nov 21, 3:10 PM"]);
  });
  it("a name nothing resembles offers nothing (the form then asks for its date)", () => {
    expect(sellOptions("Jazz Brunch", "")).toEqual([]);
    expect(sellMode({ picked: false, isNew: false, text: "Jazz Brunch", matches: 0, when: "" })).toBe("new");
  });
});

describe("The asking price is the seller's own from the first keystroke (9s item 3)", () => {
  it("a price entered before any event is kept when an event is chosen, and when it's changed", () => {
    expect(askAfterEvent({ ask: "25", own: true, carried: null })).toEqual({ ask: "25", own: true });
    // … again and again: what comes out goes back in at the next change of event
    const twice = askAfterEvent({ ...askAfterEvent({ ask: "25", own: true, carried: null }), carried: null });
    expect(twice).toEqual({ ask: "25", own: true });
  });
  it("a starting value that wasn't typed (an event's face value) doesn't follow to the next event", () => {
    expect(askAfterEvent({ ask: "40", own: false, carried: null })).toEqual({ ask: "", own: false });
    expect(askAfterEvent({ ask: "", own: false, carried: null })).toEqual({ ask: "", own: false });
  });
  it("a price carried from Sell an item counts as typed; an emptied field is empty", () => {
    expect(askAfterEvent({ ask: "", own: false, carried: "12" })).toEqual({ ask: "12", own: true });
    expect(askAfterEvent({ ask: "40", own: true, carried: "12" })).toEqual({ ask: "12", own: true });
    expect(askAfterEvent({ ask: "  ", own: true, carried: null })).toEqual({ ask: "", own: false });
  });
  it("$0 is a price", () => {
    expect(askIssue("0", null)).toEqual({ msg: null, over: false });
    expect(askIssue("0", 20)).toEqual({ msg: null, over: false });
    expect(askIssue("0.00", Infinity)).toEqual({ msg: null, over: false });
    expect(askAfterEvent({ ask: "0", own: true, carried: null })).toEqual({ ask: "0", own: true });
  });
  it("a price above the chosen event's face value is said at the price, in the server's words, and the price stays as typed", () => {
    expect(askIssue("25", 20)).toEqual({ msg: "Asking price can't be more than the face value ($20).", over: true });
    expect(askIssue("20", 20)).toEqual({ msg: null, over: false }); // the face value itself is fine
    expect(askIssue("19.99", 20)).toEqual({ msg: null, over: false });
    expect(askIssue("25", null)).toEqual({ msg: null, over: false }); // no event chosen yet, or its ticket type isn't
    expect(askIssue("25", Infinity)).toEqual({ msg: null, over: false }); // an event with no face value has no cap
    expect(askIssue("2500", 1234.5).msg).toBe("Asking price can't be more than the face value ($1,234.50).");
  });
  it("an empty price is missing only once Post was tried; a price that isn't one says so at once", () => {
    expect(askIssue("", 20)).toEqual({ msg: null, over: false });
    expect(askIssue("  ", 20, { tried: true })).toEqual({ msg: "Enter your asking price per ticket.", over: false });
    expect(askIssue("", null, { tried: true, unit: "spot" }).msg).toBe("Enter your asking price per spot.");
    expect(askIssue("abc", 20)).toEqual({ msg: "Enter a non-negative amount with at most two decimals.", over: false });
    expect(askIssue("-5", null).msg).toBe("Enter a non-negative amount with at most two decimals.");
  });
});

describe("Where the date and the club sit (9s items 3 and 4)", () => {
  it("a new ordinary event's date sits beside the asking price; a train's departure, and a date with a twin to say, keep their own row", () => {
    expect(dateBesideAsk({ mode: "new", kind: "event", twin: false })).toBe(true);
    expect(dateBesideAsk({ mode: "new", kind: "train", twin: false })).toBe(false); // a date and time needs the width
    expect(dateBesideAsk({ mode: "new", kind: "event", twin: true })).toBe(false); // "already on Handoff …" and its button need the width
    expect(dateBesideAsk({ mode: "search", kind: "event", twin: false })).toBe(false);
    expect(dateBesideAsk({ mode: "picked", kind: "event", twin: false })).toBe(false); // an event on Handoff shows its date in its summary
  });
  // §9y (SELL7-O1) changed these two: the club or organizer is on the form itself, always, so it isn't one of Optional details' fields.
  it("the club or organizer is on the form itself, not in Optional details, and doesn't count as one of them (§9y)", () => {
    expect(clubPlace({ kind: "event", need: false, reveal: false })).toBe("form");
    expect(clubPlace({ kind: "event", need: false, reveal: true })).toBe("form");
    expect(newMoreUsed({ ...NEW0, date: "2026-12-06", club: "Jazz Society" })).toBe(false); // a kept form's club doesn't open Optional details
    expect(newMoreUsed({ ...NEW0, date: "2026-12-06" })).toBe(false);
    expect(NEW_MORE).not.toContain("r-club");
  });
  it("a restriction that needs a club keeps it where it is, on the form (§9y); a train names no organizer", () => {
    expect(clubPlace({ kind: "event", need: true, reveal: true })).toBe("form"); // members-only or names checked, ticked with no club yet
    expect(clubPlace({ kind: "event", need: true, reveal: false })).toBe("form"); // the club was already named: same place, now required
    expect(clubPlace({ kind: "train", need: true, reveal: true })).toBeNull(); // a train names no organizer
  });
});
