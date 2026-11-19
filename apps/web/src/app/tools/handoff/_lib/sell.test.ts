// One-form Sell (USER-INSTRUCTIONS §9l), the page's rules (_lib/sell.js): what "What ticket are you selling?" offers, when a typed
// name becomes a new event (only by the seller's choice, or when nothing resembles it; never a merge), what stops a new event before
// anything is sent (the exact-twin rule included), what "Post ticket" sends for it, and the event the form reads meanwhile.
// Pure functions over the engine's catalog: a small live market installed with a set clock; no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import {
  DRAFT_ID, NEW0, NEW_MORE, draftEvent, nameReady, newEventAction, newEventIssues, newMoreUsed, newValues, optionMeta, sellMode, sellOptions,
  WHAT, buyerQtyChoices, buyerTotal, clampQty, listingQtyLine, newMoreIds, payRowNames, qtyNote, requestAction, sellConfirm, sellMethod, transferWays,
  whatError, whatHelp,
} from "./sell";

const T0 = Date.UTC(2026, 10, 15, 20, 0); // Sun Nov 15, 2026, 3:00 PM in Philadelphia
const ME = "u-test-seller";
const stored = (id: string, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${id.padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const GALA = stored("1", "Spring Gala", "2026-12-04", { venue: "Houston Hall", club: "Wharton Social Committee" });
const GALA_LATE = stored("2", "Spring Gala", "2026-12-05T21:30"); // another showing, stored with its time
const COMEDY = stored("3", "Comedy Night", "2026-11-24");
const MIXER = stored("4", "Rooftop Mixer", "2026-11-29", { tiers: [{ id: "t1", label: "Ticket", price: 40 }] });
const TRAIN = stored("5", "Amtrak Northeast Regional: Philadelphia → New York", "2026-11-21T09:05", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const OVER = stored("6", "Fall Formal", "2026-11-14"); // yesterday: over
const REMOVED = stored("7", "Winter Formal", "2026-12-12", { removedAt: T0 - 60e3 });
const EVENTS = [GALA, GALA_LATE, COMEDY, MIXER, TRAIN, OVER, REMOVED];
const install = (events: object[] = EVENTS) => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld(), events } as unknown as Parameters<typeof E.applyWorld>[0]); };
const ids = (xs: { id: string }[]) => xs.map((e) => e.id);
const nd = (over: Partial<Record<keyof typeof NEW0, string | boolean>> = {}) => ({ ...NEW0, ...over }) as typeof NEW0;
const issue = (rows: ReturnType<typeof newEventIssues>, id: string) => { const r = rows.find((x) => x[0] === id); return r ? { missing: r[1], wrong: r[2] } : null; };

beforeEach(() => install());
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("What ticket are you selling? The matches offered (9l item 2)", () => {
  it("an empty field lists what's open to list now, the soonest first, never an event that's over or removed", () => {
    expect(ids(sellOptions("", ""))).toEqual([TRAIN.id, COMEDY.id, MIXER.id, GALA.id, GALA_LATE.id]);
    expect(ids(sellOptions("", "", () => 0, 2))).toEqual([TRAIN.id, COMEDY.id]);
  });
  it("puts the events the seller holds unlisted tickets for first", () => {
    expect(ids(sellOptions("", "", (e) => (e.id === GALA.id ? 1 : 0)))[0]).toBe(GALA.id);
  });
  it("one or two letters narrow that list by name", () => {
    expect(ids(sellOptions("co", ""))).toEqual([COMEDY.id]);
    expect(ids(sellOptions("zz", ""))).toEqual([]);
  });
  it("from three letters, the engine's suggestions: the same name first, each seating its own row, nothing merged", () => {
    expect(nameReady("Sp")).toBe(false);
    expect(nameReady("Spr")).toBe(true);
    expect(ids(sellOptions("Spring Gala", ""))).toEqual([GALA.id, GALA_LATE.id]);
    expect(ids(sellOptions("spring gala!", "2026-12-05"))).toEqual([GALA_LATE.id, GALA.id]); // the date entered refines the order
    expect(ids(sellOptions("Spring Gala 2026", ""))).toEqual([GALA.id, GALA_LATE.id]); // a near match is offered, never chosen
    expect(ids(sellOptions("amtrak", ""))).toEqual([TRAIN.id]); // every kind
    expect(ids(sellOptions("Fall Formal", ""))).toEqual([]); // over: not offered
    expect(ids(sellOptions("Winter Formal", ""))).toEqual([]); // removed: not offered
    expect(ids(sellOptions("Jazz Brunch", ""))).toEqual([]);
  });
  it("shows each match's date, its time only where one is known, then the venue and the organizer", () => {
    const [gala, late] = sellOptions("Spring Gala", "");
    expect(optionMeta(gala!)).toBe("Fri, Dec 4 · Houston Hall · Wharton Social Committee");
    expect(optionMeta(gala!)).not.toMatch(/11:59/); // a date-only event's close is never shown as a start time
    expect(optionMeta(late!)).toBe("Sat, Dec 5, 9:30 PM");
    expect(optionMeta(sellOptions("amtrak", "")[0]!)).toBe("Sat, Nov 21, 9:05 AM");
  });
});

describe("Existing event, new event, or still choosing (9l item 2: never a silent merge)", () => {
  const f = (over: Partial<Parameters<typeof sellMode>[0]>) => sellMode({ picked: false, isNew: false, text: "Spring Gala", matches: 2, when: "", ...over });
  it("an event on Handoff is chosen only by the seller's tap", () => {
    expect(f({})).toBe("search"); // the very name of an event on Handoff, typed: still not chosen
    expect(f({ text: "Spring Gala 2026" })).toBe("search"); // a near match: neither joined nor created without a tap
    expect(f({ picked: true })).toBe("picked");
  });
  it("a typed name is a new event when the seller says so, or when nothing on Handoff resembles it", () => {
    expect(f({ isNew: true })).toBe("new"); // "a different event, date or showing"
    expect(f({ text: "Jazz Brunch", matches: 0 })).toBe("new"); // no suitable match: the name stays and the date shows
    expect(f({ text: "Ja", matches: 0 })).toBe("search"); // not a name yet
    expect(f({ text: "", matches: 5 })).toBe("search");
  });
  it("a date already entered keeps it new while the name is edited", () => {
    expect(f({ when: "2026-12-06" })).toBe("new");
  });
});

describe("A new event: what stops it before anything is sent (9l items 2 and 4)", () => {
  it("needs a name and a date, and says so at each field", () => {
    const rows = newEventIssues("", nd());
    expect(issue(rows, "r-what")).toEqual({ missing: "Type the event's name (3 to 120 characters).", wrong: null });
    expect(issue(rows, "r-date")).toEqual({ missing: "Enter the date.", wrong: null });
    expect(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06" })).every(([, missing, wrong]) => !missing && !wrong)).toBe(true);
  });
  it("refuses a past date, a date that isn't one, and one more than 18 months out, in the server's words", () => {
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-11-14" })), "r-date")!.wrong).toBe("Choose today or a later date.");
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-11-15" })), "r-date")!.wrong).toBeNull(); // today ends at 11:59 PM
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-13-40" })), "r-date")!.wrong).toBe("Enter a date.");
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2028-11-15" })), "r-date")!.wrong).toBe("The date has to be within the next 18 months.");
  });
  it("an exact twin of an open event is said at the date; a different date, showing or name is its own event", () => {
    expect(issue(newEventIssues("Spring Gala", nd({ date: "2026-12-04" })), "r-date")!.wrong).toBe(E.TWIN_EVENT);
    expect(issue(newEventIssues("  spring   GALA! ", nd({ date: "2026-12-04" })), "r-date")!.wrong).toBe(E.TWIN_EVENT); // capitals, spacing and punctuation only
    expect(issue(newEventIssues("Spring Gala", nd({ date: "2026-12-05" })), "r-date")!.wrong).toBe(E.TWIN_EVENT); // the 9:30 PM showing's day: a date alone can't tell them apart
    expect(issue(newEventIssues("Spring Gala", nd({ date: "2026-12-06" })), "r-date")!.wrong).toBeNull(); // another date
    expect(issue(newEventIssues("Spring Gala late show", nd({ date: "2026-12-04" })), "r-date")!.wrong).toBeNull(); // what's different is in the name
    expect(issue(newEventIssues("Spring", nd({ date: "2026-12-04" })), "r-date")!.wrong).toBeNull(); // a name that only resembles another is no twin
    expect(issue(newEventIssues("Fall Formal", nd({ date: "2026-11-20" })), "r-date")!.wrong).toBeNull(); // an event that's over doesn't count
  });
  it("checks the optional details only when they're filled in", () => {
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", face: "abc" })), "r-face")!.wrong).toBeTruthy();
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", face: "6000" })), "r-face")!.wrong).toBe("Face values can be at most $5,000.");
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", face: "40" })), "r-face")!.wrong).toBeNull();
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", officialUrl: "example.com" })), "r-url")!.wrong).toBe("Enter a full link starting with https://, or leave it blank.");
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", namesChecked: true })), "r-club")!.missing).toMatch(/^Add the club or organizer: with names checked at the door/);
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", namesChecked: true, club: "Jazz Society" })), "r-club")).toEqual({ missing: null, wrong: null });
    expect(issue(newEventIssues("Jazz Brunch", nd({ date: "2026-12-06", club: "J" })), "r-club")!.wrong).toMatch(/2 to 80 characters/);
    for (const id of ["r-face", "r-url"]) expect(NEW_MORE).toContain(id); // each sits in Optional details, which opens for it
    expect(NEW_MORE).not.toContain("r-club"); // the club isn't one of Optional details' fields (§9y: clubPlace, on the form itself)
  });
  it("a new train needs its departure date and time, at least 30 minutes ahead, and is never added twice", () => {
    const train = (start: string, name = "Acela 2150") => newEventIssues(name, nd({ kind: "train", start }));
    expect(issue(train(""), "r-start")).toEqual({ missing: "Enter the departure date and time.", wrong: null });
    expect(issue(train("2026-11-15T15:10"), "r-start")!.wrong).toBe("The departure has to be at least 30 minutes from now.");
    expect(issue(train("2026-11-15T16:00"), "r-start")!.wrong).toBeNull();
    expect(issue(train("2026-11-21T09:05", "Amtrak Northeast Regional: Philadelphia → New York"), "r-start")!.wrong).toBe(E.TWIN_TRAIN);
    expect(issue(train("2026-11-21T15:10", "Amtrak Northeast Regional: Philadelphia → New York"), "r-start")!.wrong).toBeNull(); // another departure
    expect(train("2026-11-21T09:05").some(([id]) => id === "r-club")).toBe(false); // a train names no organizer
  });
});

describe("A new event: what Post ticket sends, and what the form reads meanwhile", () => {
  it("sends createEvent's fields for an event by its date, with nothing optional guessed", () => {
    expect(newEventAction("Jazz Brunch", nd({ date: "2026-12-06" }))).toEqual({ kind: "event", title: "Jazz Brunch", club: "", cat: null, start: "2026-12-06", namesChecked: false, face: null, venue: null, perPerson: null, officialUrl: null });
    expect(newEventAction("Jazz Brunch", nd({ date: "2026-12-06", face: " 40 ", cat: "Shows", club: "Jazz Society", venue: " Houston Hall ", perPerson: "2", namesChecked: true, officialUrl: " https://example.com/jazz " })))
      .toEqual({ kind: "event", title: "Jazz Brunch", club: "Jazz Society", cat: "Shows", start: "2026-12-06", namesChecked: true, face: "40", venue: "Houston Hall", perPerson: 2, officialUrl: "https://example.com/jazz" });
  });
  it("sends a train by its name and departure, with no organizer, category or names-checked answer", () => {
    expect(newEventAction("Acela 2150", nd({ kind: "train", start: "2026-11-21T15:10", date: "2026-12-06", club: "x", cat: "Shows", namesChecked: true })))
      .toEqual({ kind: "train", title: "Acela 2150", start: "2026-11-21T15:10", face: null, venue: null, perPerson: null, officialUrl: null });
  });
  it("the form's event follows the same rules as a stored one: face value, transfer methods, per-person limit", () => {
    const plain = draftEvent("  Jazz   Brunch ", nd({ date: "2026-12-06" }), ME);
    expect(plain).toMatchObject({ id: DRAFT_ID, kind: "event", title: "Jazz Brunch", start: "2026-12-06", club: "", perPerson: 4, addedBy: ME });
    expect(plain.tiers).toMatchObject([{ id: "t1", label: "Ticket", price: null }]);
    expect(E.askPrefill(plain, "t1")).toBe(""); // no face value: the price starts empty, and nothing caps it
    expect(E.askCap(plain, { tier: "t1", paid: null } as unknown as Parameters<typeof E.askCap>[1])).toBe(Infinity);
    expect(E.methodsFor(plain, E.namesCheckedFor(plain, false))).toEqual(["file", "app"]); // two valid ways: the seller's choice, with a visible default
    expect(E.isQuick(plain)).toBe(true);
    const faced = draftEvent("Jazz Brunch", nd({ date: "2026-12-06", face: "40", club: "Jazz Society", perPerson: "2" }), ME);
    expect(E.askPrefill(faced, "t1")).toBe("40"); // the price starts at the face value just entered
    expect(E.askCap(faced, { tier: "t1", paid: null } as unknown as Parameters<typeof E.askCap>[1])).toBe(40); // and can't be above it
    expect(faced.perPerson).toBe(2);
    expect(E.methodsFor(faced, E.namesCheckedFor(faced, false))).toEqual(["file", "app", "name"]);
    const named = draftEvent("Jazz Brunch", nd({ date: "2026-12-06", club: "Jazz Society", namesChecked: true }), ME);
    expect(E.methodsFor(named, E.namesCheckedFor(named, false))).toEqual(["name"]); // names checked: only a name change, set without asking
    const bad = draftEvent("Jazz Brunch", nd({ date: "2026-12-06", face: "abc" }), ME);
    expect(bad.tiers).toMatchObject([{ price: null }]); // a face value that isn't one caps nothing (its own field says so)
  });
  it("a new train is an e-ticket without being asked, and names no departure per listing", () => {
    const t = draftEvent("Acela 2150", nd({ kind: "train", start: "2026-11-21T15:10", club: "x", namesChecked: true }), ME);
    expect(t).toMatchObject({ kind: "train", cat: "Travel", start: "2026-11-21T15:10", club: "", perPerson: 2 });
    expect(E.methodsFor(t, E.namesCheckedFor(t, false))).toEqual(["file"]);
    expect(E.needsTrain(t)).toBe(false);
    expect(E.unitOf(t)).toBe("ticket");
  });
  it("never puts the draft in the catalog", () => {
    draftEvent("Jazz Brunch", nd({ date: "2026-12-06" }), ME);
    expect(Object.prototype.hasOwnProperty.call(E.EV, DRAFT_ID)).toBe(false);
    expect(E.EVENTS.some((e) => e.id === DRAFT_ID)).toBe(false);
  });
});

describe("A kept form's new event (drafts, the Goods switch)", () => {
  it("takes only the form's own fields, each of its type; any other kind is an event", () => {
    expect(newValues(null)).toEqual(NEW0);
    expect(newValues({ kind: "trek", date: "2026-12-06", face: 40, namesChecked: "yes", club: "Jazz Society", extra: "x" }))
      .toEqual({ ...NEW0, date: "2026-12-06", club: "Jazz Society" });
    expect(newValues({ kind: "train", start: "2026-11-21T15:10" })).toMatchObject({ kind: "train", start: "2026-11-21T15:10" });
  });
  it("Optional details opens by itself only when one of them is filled in", () => {
    expect(newMoreUsed(nd({ date: "2026-12-06" }))).toBe(false);
    expect(newMoreUsed(nd({ perPerson: "4" }))).toBe(false); // the default
    expect(newMoreUsed(nd({ perPerson: "2" }))).toBe(true);
    expect(newMoreUsed(nd({ face: "40" }))).toBe(true);
    expect(newMoreUsed(nd({ namesChecked: true }))).toBe(true);
  });
});

// Sell and Request follow-up (USER-INSTRUCTIONS §9m, §9n): the page's rules for it.
const CLUB_EV = stored("8", "Winter Ball", "2026-12-10", { club: "Wharton Social Committee" });
const NAMED_EV = stored("9", "Alumni Dinner", "2026-12-11", { club: "Wharton Alumni Club", namesChecked: true });
const TREK = stored("a", "Japan Trek", "2026-12-20T08:00", { kind: "trek", cat: "Treks & trips", club: "Wharton Japan Club", perPerson: 2, tiers: [{ id: "t1", label: "Traveler", price: 900 }] });
const SOLO = stored("b", "Chef's Table", "2026-12-02", { perPerson: 1 });
const ev = (e: { id: string }) => E.EV[e.id]!;

describe("No promised delivery method on an ordinary event's ticket (9m item 1)", () => {
  beforeEach(() => install([...EVENTS, CLUB_EV, NAMED_EV, TREK]));
  it("Sell sends no method where a ticket could change hands several ways", () => {
    expect(transferWays(ev(COMEDY))).toEqual(["file", "app"]);
    expect(sellMethod(ev(COMEDY))).toBe(""); // an ordinary event: nothing is promised for the seller
    expect(transferWays(ev(CLUB_EV))).toEqual(["file", "app", "name"]);
    expect(sellMethod(ev(CLUB_EV))).toBe("");
    expect(sellMethod(draftEvent("Jazz Brunch", nd({ date: "2026-12-06" }), ME))).toBe(""); // a new event in the form, too
  });
  it("keeps the one valid way of a train, a trek and a names-checked event, set without asking", () => {
    expect(sellMethod(ev(TRAIN))).toBe("file");
    expect(sellMethod(ev(TREK))).toBe("name");
    expect(sellMethod(ev(NAMED_EV))).toBe("name");
    expect(sellMethod(draftEvent("Jazz Brunch", nd({ date: "2026-12-06", club: "Jazz Society", namesChecked: true }), ME))).toBe("name");
    expect(sellMethod(draftEvent("Acela 2150", nd({ kind: "train", start: "2026-11-21T15:10" }), ME))).toBe("file");
  });
  it("the line by Post ticket names no method unless the event has only one", () => {
    expect(sellConfirm("ticket", "")).toBe("Posting confirms you have this ticket. Send the ticket to the buyer after payment.");
    expect(sellConfirm("ticket", "")).toContain(E.SEND_AFTER_PAYMENT);
    expect(sellConfirm("ticket", "")).not.toMatch(/PDF|QR|Ticketmaster|AXS/);
    expect(sellConfirm("ticket", "file")).toBe("Posting confirms you have this ticket and will send the PDF or QR code as soon as the buyer pays.");
    expect(sellConfirm("spot", "name")).toBe("Posting confirms you have this spot and will request the name change as soon as the buyer pays.");
  });
});

describe("Sell's compact payment row (9m item 2)", () => {
  it("names the saved methods, never where to pay", () => {
    expect(payRowNames([{ kind: "venmo", value: "ann-lee" }])).toBe("Venmo");
    expect(payRowNames([{ kind: "venmo", value: "ann-lee" }, { kind: "zelle", value: "+12155550142" }])).toBe("Venmo or Zelle");
    expect(payRowNames([{ kind: "paypal", value: "ann@example.invalid" }])).not.toMatch(/ann|@/);
  });
  it("a handle saved before methods had kinds is named without guessing a provider", () => {
    expect(payRowNames([{ kind: "other", value: "@ann" }])).toBe("your saved payment details");
  });
  it("nothing saved: no names, so the row offers Add payment method", () => {
    expect(payRowNames([])).toBe("");
    expect(payRowNames(null)).toBe("");
    expect(payRowNames(undefined)).toBe("");
  });
});

describe("Quantity (9n)", () => {
  it("the count shows beside Optional details from two up, so it stays visible with the details closed", () => {
    expect(qtyNote(1, "ticket")).toBe("");
    expect(qtyNote(2, "ticket")).toBe("2 tickets");
    expect(qtyNote(3, "spot")).toBe("3 spots");
  });
  it("a multi-ticket listing reads “2 tickets · $25 each”; one ticket has no such line", () => {
    expect(listingQtyLine(2, 25, "ticket")).toBe("2 tickets · $25 each");
    expect(listingQtyLine(1, 25, "ticket")).toBe("");
    expect(listingQtyLine(0, 25, "ticket")).toBe("");
  });
  describe("the buyer's choice", () => {
    const SELLER = "u-test-other", BUYER = "u-test-buyer";
    const world = (more: Record<string, unknown> = {}, event = COMEDY, listed = 2) => {
      const w = { ...E.emptyWorld(), events: [event, SOLO], holdings: [{ id: "h1", userId: SELLER, eventId: event.id, tier: "t1", qty: listed, paid: null, source: "self-reported" }],
        listings: [{ id: "l1", eventId: event.id, sellerId: SELLER, holdingId: "h1", listed, ask: 25, paid: null, tier: "t1", viaOrganizer: false, obo: false, note: "", createdAt: T0 - 60e3, history: [] }], ...more };
      E.setLiveClock(() => T0); E.applyWorld(w as unknown as Parameters<typeof E.applyWorld>[0]);
      return w as unknown as E.WorldState;
    };
    const l1 = (w: E.WorldState) => w.listings.find((l: { id: string }) => l.id === "l1")!;
    it("defaults to one, and offers a choice only when the buyer may take more than one", () => {
      const two = world();
      expect(buyerQtyChoices(two, BUYER, l1(two))).toEqual([1, 2]);
      const one = world({}, COMEDY, 1);
      expect(buyerQtyChoices(one, BUYER, l1(one))).toEqual([]); // one ticket: no control
      const solo = world({}, SOLO, 2);
      expect(buyerQtyChoices(solo, BUYER, l1(solo))).toEqual([]); // one per person for this event: no control, whatever is listed
      const full = world({ holdings: [{ id: "h1", userId: SELLER, eventId: COMEDY.id, tier: "t1", qty: 2, paid: null, source: "self-reported" }, { id: "h2", userId: BUYER, eventId: COMEDY.id, tier: "t1", qty: 3, paid: null, source: "self-reported" }] });
      expect(buyerQtyChoices(full, BUYER, l1(full))).toEqual([]); // already holds 3 of the 4 allowed: one more at most
      expect(buyerQtyChoices(two, SELLER, l1(two))).toEqual([]); // the seller's own listing
      expect(buyerQtyChoices(two, null, l1(two))).toEqual([]);
    });
    it("a quantity kept from before is cut to what the buyer may take now, never below one", () => {
      expect(clampQty(2, 2)).toBe(2);
      expect(clampQty(3, 2)).toBe(2);
      expect(clampQty(2, 1)).toBe(1);
      expect(clampQty(2, 0)).toBe(1);
      expect(clampQty(0, 4)).toBe(1);
    });
    it("shows the total before reserving: quantity times the agreed price", () => {
      expect(buyerTotal(1, 25, "ticket")).toEqual({ amount: 25, total: "$25", detail: "" });
      expect(buyerTotal(2, 25, "ticket")).toEqual({ amount: 50, total: "$50", detail: "2 tickets · $25 each" });
      expect(buyerTotal(2, 22.5, "ticket")).toEqual({ amount: 45, total: "$45", detail: "2 tickets · $22.50 each" });
    });
  });
});

describe("Request a ticket (ISO): one form, one action (9m item 3)", () => {
  it("Post request sends one change: the event the buyer tapped, or the new one with it", () => {
    expect(requestAction({ eventId: COMEDY.id, text: "ignored", nd: nd(), qty: 1, budget: "", note: "", until: "" }))
      .toEqual({ type: "postRequest", eventId: COMEDY.id, qty: 1, budget: "", note: "" });
    expect(requestAction({ eventId: "", text: "Oysters", nd: nd({ date: "2026-11-27" }), qty: 1, budget: "  ", note: " ", until: "" }))
      .toEqual({ type: "postRequest", event: { kind: "event", title: "Oysters", start: "2026-11-27" }, qty: 1, budget: "", note: "" }); // §9q item 4: a new event goes with its name and date, nothing else
  });
  it("defaults: one ticket, a blank budget (never $0) and no date (the server runs it to the event's cutoff)", () => {
    const a = requestAction({ eventId: COMEDY.id, text: "", nd: nd(), qty: 1, budget: "", note: "", until: "" });
    expect(a.qty).toBe(1);
    expect(a.budget).toBe("");
    expect(a).not.toHaveProperty("expires");
    expect(a).not.toHaveProperty("event");
  });
  it("a budget, an earlier date and a note go only when given", () => {
    expect(requestAction({ eventId: COMEDY.id, text: "", nd: nd(), qty: 2, budget: " 30 ", note: " Can pay today ", until: "2026-11-20" }))
      .toEqual({ type: "postRequest", eventId: COMEDY.id, qty: 2, budget: "30", note: "Can pay today", expires: "2026-11-20" });
  });
  it("a new train goes with its departure, as on Sell", () => {
    const a = requestAction({ eventId: "", text: "Acela 2150", nd: nd({ kind: "train", start: "2026-11-21T15:10" }), qty: 1, budget: "", note: "", until: "" });
    expect(a).toMatchObject({ type: "postRequest", event: { kind: "train", title: "Acela 2150", start: "2026-11-21T15:10" } });
    expect(Object.keys((a as { event: object }).event).sort()).toEqual(["kind", "start", "title"]); // §9q item 4: its name and departure, nothing else
    expect(a).not.toHaveProperty("eventId");
  });
  it("what stops a new event is said at the request form's own fields, with the request's twin words", () => {
    const rows = newEventIssues("", nd(), T0, { idp: "iso", request: true });
    expect(issue(rows, "iso-what")).toEqual({ missing: "Type the event's name (3 to 120 characters).", wrong: null });
    expect(issue(rows, "iso-date")).toEqual({ missing: "Enter the date.", wrong: null });
    expect(issue(newEventIssues("Spring Gala", nd({ date: "2026-12-04" }), T0, { idp: "iso", request: true }), "iso-date")!.wrong).toBe(E.TWIN_EVENT_REQUEST);
    expect(issue(newEventIssues("Spring Gala", nd({ date: "2026-12-06" }), T0, { idp: "iso", request: true }), "iso-date")!.wrong).toBeNull(); // another date: its own event
    expect(issue(newEventIssues("Amtrak Northeast Regional: Philadelphia → New York", nd({ kind: "train", start: "2026-11-21T09:05" }), T0, { idp: "iso", request: true }), "iso-start")!.wrong).toBe(E.TWIN_TRAIN_REQUEST);
    expect(issue(newEventIssues("Amtrak Northeast Regional: Philadelphia → New York", nd({ kind: "train", start: "2026-11-21T15:10" }), T0, { idp: "iso", request: true }), "iso-start")!.wrong).toBeNull(); // another departure
    expect(issue(newEventIssues("Spring Gala", nd({ date: "2026-12-04" })), "r-date")!.wrong).toBe(E.TWIN_EVENT); // Sell keeps its own ids and words
    expect(newMoreIds("iso")).toEqual(["iso-face", "iso-cat", "iso-venue", "iso-pp", "iso-names", "iso-url"]); // §9q item 5: the club left Optional details (the request form no longer shows any of these: §9q item 4)
    expect(newMoreIds("r")).toEqual(NEW_MORE);
  });
  it("the search field speaks for the form it's in: selling or looking", () => {
    expect(WHAT.sell.label).toBe("What ticket are you selling?");
    expect(WHAT.request.label).toBe("What ticket are you looking for?");
    expect(whatHelp("sell", "search", "", 0)).toBe("Type its name. Events and trains already on Handoff show up as you type.");
    expect(whatHelp("sell", "search", "Sp", 0)).toBe("Keep typing its name.");
    expect(whatHelp("sell", "search", "Spring Gala", 2)).toBe("Is it one of these? Tap it. If not, tap “isn't one of these”.");
    expect(whatHelp("sell", "new", "Spring Gala", 2)).toBe("Adding it as a new one, together with your ticket when you post.");
    expect(whatHelp("sell", "new", "Jazz Brunch", 0)).toBe("New on Handoff: it's added together with your ticket when you post.");
    expect(whatHelp("request", "new", "Oysters", 0)).toBe(""); // §9q item 4: no caption about Handoff adding the event with the request
    expect(whatHelp("request", "new", "Spring Gala", 2)).toBe("");
    expect(whatError("sell", "", true)).toBe("Type the event your ticket is for.");
    expect(whatError("request", "", true)).toBe("Type the event you want a ticket for.");
    expect(whatError("request", "Sp", true)).toBe("Type the event's name (3 to 120 characters).");
    expect(whatError("request", "Spring Gala", true)).toBe("Choose your event from the list, or tap “isn't one of these” to add it as a new one.");
    expect(whatError("request", "Spring Gala", false)).toBeNull(); // nothing is said before Post request was tried
  });
  it("reuses Sell's matching: the same matches, each seating and departure its own row, and never a merge", () => {
    expect(ids(sellOptions("Spring Gala", ""))).toEqual([GALA.id, GALA_LATE.id]);
    expect(sellMode({ picked: false, isNew: false, text: "Spring Gala", matches: 2, when: "" })).toBe("search"); // a request never joins an event by its name alone
    expect(sellMode({ picked: false, isNew: false, text: "Oysters", matches: 0, when: "" })).toBe("new"); // an unmatched name: its date is asked right there
  });
});
