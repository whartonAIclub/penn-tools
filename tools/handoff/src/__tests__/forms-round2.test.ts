// Forms round 2 (USER-INSTRUCTIONS §9i, step FORMS-F1), the engine half:
// - E: an ordinary event can be added by its date alone. It ends at the end of that day, 11:59 PM Philadelphia time (daylight saving
//   handled), so its listings, requests to buy, invitations, public requests, alerts and holds end then; a hold still lasts at most
//   15 minutes and never past it. It shows by its date, without a time. An event stored with a time keeps it.
// - E: a new event has one implicit ticket type, and its face value is optional: when given, no asking price, request budget or alert
//   maximum for the event can be above it; when not, there's no cap.
// - T: what the seller paid is no longer asked or used: a new listing and any later price edit are capped by the face value only.
// - R: a train is one name and one departure (no validity window, no ticket type): always an e-ticket, closing when it leaves.
// - K: a trek keeps its ticket types and required face values.
// - Share text and the pilot report read cleanly for a date-only event with no face value.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { PilotData } from "../report/index.js";
import { buildPilotReport } from "../report/index.js";
import type { WorldState } from "../../engine/index.js";
import { guestContractViolations } from "./helpers/contract.js";
import { ask, invite, must, reqOf, reserve, resetEngine } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, MIN, T0, dateAfter, wallAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

/** A date-only ordinary event with nothing optional: the new form's shape (no tiers, no face value). */
const BARE = (date: string, over: Record<string, unknown> = {}) => ({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: date, ...over }) as unknown as E.Action;
/** A train as the new form sends it: one name and its departure. */
const TRAIN = (departs: string, over: Record<string, unknown> = {}) => ({ type: "createEvent", kind: "train", title: "Amtrak Northeast Regional: Philadelphia → New York", start: departs, ...over }) as unknown as E.Action;
/** Adds a ticket and lists it as the new Sell form does: no "what you paid". */
const sell = (eventId: string, ask: string, over: Record<string, unknown> = {}) => ({
  type: "addThen", add: { eventId, tier: "t1", qty: 1 },
  then: { type: "list", qty: 1, ask, note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: "", ...over },
}) as unknown as E.Action;
const storedEvent = (w: ServerWorld, id: string): Record<string, unknown> => must(w.doc.events.find((e) => e.id === id), "event") as unknown as Record<string, unknown>;
/** A New York wall time's instant, as the engine reads it. */
const ny = (wall: string): number => E.wallToMs(wall);
function installed<T>(state: { serverNow: number }, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as WorldState);
  try { return fn(state as unknown as WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}

describe("a date-only event (E1)", () => {
  it("is added by its date alone: stored as the date, with one implicit ticket type and no face value", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 10);
    const id = must(w.ok(ANN.userId, BARE(date)).id, "event");
    const st = storedEvent(w, id);
    expect(st.start).toBe(date);
    expect("end" in st).toBe(false);
    expect(st.tiers).toEqual([{ id: "t1", label: "Ticket", price: null }]);
    w.run(() => {
      const ev = must(E.EV[id], "event");
      expect(ev.tiers).toEqual([{ id: "t1", label: "Ticket", price: null, src: "entered by Ann" }]);
      expect(E.faceMax(ev)).toBeNull();
      expect(E.hasFace(ev)).toBe(false);
    });
  });

  it("ends at 11:59 PM Philadelphia time that day, on standard time, summer time and both clock-change days", () => {
    // [the world's time, the event's date, the instant it ends (UTC)]
    const cases: [string, string, string][] = [
      ["2026-11-10T12:00", "2026-11-20", "2026-11-21T04:59:00.000Z"], // EST (UTC-5)
      ["2026-10-20T12:00", "2026-11-01", "2026-11-02T04:59:00.000Z"], // the clocks fall back that morning: 11:59 PM EST
      ["2027-03-01T12:00", "2027-03-14", "2027-03-15T03:59:00.000Z"], // the clocks spring forward that morning: 11:59 PM EDT
      ["2027-06-20T12:00", "2027-07-04", "2027-07-05T03:59:00.000Z"], // EDT (UTC-4)
    ];
    for (const [now, date, end] of cases) {
      const w = new ServerWorld({ people: PEOPLE6, now: ny(now) });
      const id = must(w.ok(ANN.userId, BARE(date)).id, "event");
      w.run(() => {
        const ev = must(E.EV[id], "event");
        expect(new Date(E.closesAt(ev)).toISOString(), date).toBe(end);
        expect(E.cutoffMs(ev)).toBe(E.closesAt(ev));
      });
      w.now = Date.parse(end) - MIN; // 11:58 PM: still open
      w.run(() => expect(E.access(must(E.EV[id], "event")).ok, `${date} at 11:58 PM`).toBe(true));
      w.now = Date.parse(end); // 11:59 PM: over
      w.run(() => expect(E.access(must(E.EV[id], "event")), `${date} at 11:59 PM`).toMatchObject({ ok: false, kind: "closed", short: "Event over", why: "The event is over." }));
    }
  });

  it("shows by its date alone, while an event stored with a time keeps its time", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const dated = must(w.ok(ANN.userId, BARE("2026-11-20")).id, "dated");
    const timed = w.addEvent(ANN, { title: "Spring Formal", start: "2026-11-20T19:00" });
    w.run(() => {
      expect(E.fmtRange(must(E.EV[dated], "dated"))).toBe("Fri, Nov 20");
      expect(E.fmtRange(must(E.EV[timed], "timed"))).toBe("Fri, Nov 20 · 7:00 PM");
      expect(E.closesAt(must(E.EV[timed], "timed"))).toBe(ny("2026-11-20T19:00"));
    });
  });

  it("ends its listing, requests to buy, invitations, public requests and alerts at 11:59 PM, and cuts a hold to it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const date = dateAfter(T0, 0); // today: the record's date is today, and the day ends tonight
    const end = ny(`${date}T23:59`);
    const id = must(w.ok(ANN.userId, BARE(date)).id, "event");
    const l = must(w.ok(ANN.userId, sell(id, "35")).id, "listing");
    const iso = w.requestFor(CAT, id, { budget: "30", days: 1 }); // a public request whose own deadline is later (tomorrow, the latest it may be)
    w.ok(DAN.userId, { type: "joinAlert", eventId: id, qty: 1, max: "" } as unknown as E.Action);
    // At 11:00 PM a request to buy is left waiting: it would last hours, but the day's end cuts it to 11:59 PM.
    w.now = end - 59 * MIN;
    const asked = ask(w, BOB, l);
    expect(reqOf(w, asked).expiresAt).toBe(end);
    // At 11:50 PM an invitation is reserved: the hold ends at 11:59 PM, not 15 minutes later.
    w.now = end - 9 * MIN;
    const r = ask(w, CAT, l);
    invite(w, ANN, r);
    reserve(w, CAT, r);
    expect(reqOf(w, r).holdUntil).toBe(end);
    w.run(() => {
      expect(E.rState(reqOf(w, asked)).st).toBe("requested");
      expect(E.liveRequest(w.doc, must(w.doc.interests.find((i) => i.id === iso), "iso"))).toBe(true);
    });
    // 11:59 PM: everything has ended, and the sweep stores it.
    w.now = end;
    w.sweep();
    expect(reqOf(w, asked).status).toBe("expired");
    expect(reqOf(w, r).status).toBe("expired");
    w.run(() => {
      expect(E.saleEndedWhy(must(E.EV[id], "event"), must(w.doc.listings.find((x) => x.id === l), "listing"))).toBe("The event is over.");
      expect(E.liveRequest(w.doc, must(w.doc.interests.find((i) => i.id === iso), "iso"))).toBe(false);
      expect(E.demandAllowed(must(E.EV[id], "event"))).toBe(false);
    });
    expect(w.no(DAN.userId, { type: "joinAlert", eventId: id, qty: 1, max: "" } as unknown as E.Action)).toBe("The event is over.");
  });

  it("checks the date", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const cases: [Record<string, unknown>, string][] = [
      [{ start: "" }, "Enter the date."],
      [{ start: "2026-02-30" }, "Enter the date."],
      [{ start: dateAfter(T0, -1) }, "Choose today or a later date."],
      [{ start: dateAfter(T0, 600) }, "The date has to be within the next 18 months."],
      [{ end: wallAfter(T0, 10, "23:00") }, "Leave the end out: an event added by its date ends at 11:59 PM that day."],
      [{ deadline: wallAfter(T0, 11, "10:00") }, "The transfer deadline can't be after the event's date."],
      [{ kind: "trek", club: "Japan Trek Club", tiers: [{ label: "Spot", price: "1200" }] }, "Enter the start date and time."], // a trek keeps its time
    ];
    for (const [over, message] of cases) expect(w.no(ANN.userId, BARE(dateAfter(T0, 10), over)), JSON.stringify(over)).toBe(message);
    // A deadline on the day itself is fine.
    must(w.ok(ANN.userId, BARE(dateAfter(T0, 10), { deadline: wallAfter(T0, 10, "18:00") })).id, "with a deadline");
    expect(w.doc.events).toHaveLength(1);
  });
});

describe("an optional face value (E3) and the price cap (T)", () => {
  it("caps the asking price, a request's budget and an alert's maximum at the face value, with clear words", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const id = must(w.ok(ANN.userId, BARE(dateAfter(T0, 10), { face: "30" })).id, "event");
    expect(storedEvent(w, id).tiers).toEqual([{ id: "t1", label: "Ticket", price: 30 }]);
    expect(w.no(BOB.userId, sell(id, "30.01"))).toBe("Asking price can't be more than the face value ($30).");
    expect(w.doc.holdings).toEqual([]);
    const l = must(w.ok(BOB.userId, sell(id, "30")).id, "listing");
    expect(must(w.doc.holdings[0], "holding").paid).toBeNull(); // nothing about what was paid is stored
    expect(must(w.doc.listings.find((x) => x.id === l), "listing").paid).toBeNull();
    expect(w.no(CAT.userId, { type: "saveInterest", data: { eventId: id, qty: 1, budget: "31", note: "", expires: dateAfter(T0, 5) } } as unknown as E.Action))
      .toBe("The face value is $30, so keep your budget at or below it.");
    expect(w.no(CAT.userId, { type: "joinAlert", eventId: id, qty: 1, max: "31" } as unknown as E.Action))
      .toBe("The face value is $30, so keep your maximum at or below it.");
    w.requestFor(CAT, id, { budget: "30" });
  });

  it("has no cap when the event has no face value", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const id = must(w.ok(ANN.userId, BARE(dateAfter(T0, 10))).id, "event");
    const l = must(w.ok(BOB.userId, sell(id, "450")).id, "listing");
    w.ok(BOB.userId, { type: "editListing", listingId: l, ask: "600" } as unknown as E.Action);
    w.requestFor(CAT, id, { budget: "700" });
    w.ok(DAN.userId, { type: "joinAlert", eventId: id, qty: 1, max: "800" } as unknown as E.Action);
    w.run(() => {
      const ev = must(E.EV[id], "event");
      expect(E.demandCap(ev)).toBe(Infinity);
      expect(E.askCap(ev, { tier: "t1", paid: null })).toBe(Infinity);
    });
  });

  it("checks a face value that's typed", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(w.no(ANN.userId, BARE(dateAfter(T0, 10), { face: "abc" }))).toBe("Face value: enter a non-negative amount with at most two decimals.");
    expect(w.no(ANN.userId, BARE(dateAfter(T0, 10), { face: "5000.01" }))).toBe("Face values can be at most $5,000.");
    const id = must(w.ok(ANN.userId, BARE(dateAfter(T0, 10), { face: "" })).id, "blank face value");
    expect(storedEvent(w, id).tiers).toEqual([{ id: "t1", label: "Ticket", price: null }]);
  });

  it("uses the face value only for a new listing from a ticket held before, and for a later edit of an older listing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const id = w.addEvent(ANN); // stored the older way: a time and a $40 "General admission" ticket type
    // An older listing that stored what its seller paid ($30), as listings did before this round.
    const l = w.listTickets(BOB, id, { paid: "30", ask: "30" });
    expect(must(w.doc.listings.find((x) => x.id === l), "listing").paid).toBe(30);
    // Its later price edit follows the new rule: up to the face value, whatever was paid.
    w.ok(BOB.userId, { type: "editListing", listingId: l, ask: "38" } as unknown as E.Action);
    expect(w.no(BOB.userId, { type: "editListing", listingId: l, ask: "41" } as unknown as E.Action)).toBe("Asking price can't be more than the face value ($40).");
    // A ticket added earlier with what was paid ($25): listed now, up to the face value.
    w.ok(CAT.userId, { type: "addHolding", eventId: id, tier: "t1", qty: 1, paid: "25" } as unknown as E.Action);
    const h = must(w.doc.holdings.find((x) => x.userId === CAT.userId), "holding");
    must(w.ok(CAT.userId, { type: "list", holdingId: h.id, qty: 1, ask: "39", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: "" } as unknown as E.Action).id, "listing from an older ticket");
    // The older listing keeps its stored terms.
    expect(must(w.doc.listings.find((x) => x.id === l), "listing").paid).toBe(30);
  });
});

describe("a train (R)", () => {
  it("is one name and one departure: always an e-ticket, no operator, no validity window, closing when it leaves", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const departs = wallAfter(T0, 3, "08:05");
    const id = must(w.ok(ANN.userId, TRAIN(departs)).id, "train");
    const st = storedEvent(w, id);
    expect(st).toMatchObject({ kind: "train", cat: "Travel", start: departs, methods: ["file"], tiers: [{ id: "t1", label: "Ticket", price: null }] });
    for (const k of ["club", "openUntil", "paperTicket", "end"]) expect(k in st, k).toBe(false);
    w.run(() => {
      const ev = must(E.EV[id], "train");
      expect(E.needsTrain(ev)).toBe(false); // the departure is the train's own: a listing doesn't name one
      expect(E.methodsFor(ev, false)).toEqual(["file"]);
      expect(E.closesAt(ev)).toBe(ny(departs));
      expect(E.fmtRange(ev)).toBe(`${E.fmtDay(departs)} · ${E.fmtTime(departs)}`); // its departure, with its time
    });
    // Sold as an e-ticket with no departure of its own; the transfer method isn't a choice.
    const l = must(w.ok(BOB.userId, sell(id, "60", { method: "file" })).id, "listing");
    expect(must(w.doc.listings.find((x) => x.id === l), "listing")).toMatchObject({ method: "file" });
    expect("departsAt" in must(w.doc.listings.find((x) => x.id === l), "listing")).toBe(false);
    expect(w.no(CAT.userId, sell(id, "60", { method: "app" }))).toBe("Choose how you'll transfer it."); // only a PDF or QR code: anything else reads as not chosen
    w.now = ny(departs) - MIN;
    w.run(() => expect(E.access(must(E.EV[id], "train")).ok).toBe(true));
    w.now = ny(departs);
    w.run(() => {
      const ev = must(E.EV[id], "train");
      expect(E.access(ev)).toMatchObject({ ok: false, kind: "closed", short: "Train left", why: "The train has left." });
      expect(E.saleEndedWhy(ev, must(w.doc.listings.find((x) => x.id === l), "listing"))).toBe("The train has left.");
    });
  });

  it("checks the name and the departure, with an optional face value", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const cases: [E.Action, string][] = [
      [TRAIN(wallAfter(T0, 3), { title: "x" }), "Name the train, like “Amtrak Northeast Regional: Philadelphia → New York” (3 to 120 characters)."],
      [TRAIN(""), "Enter the departure date and time."],
      [TRAIN(dateAfter(T0, 3)), "Enter the departure date and time."],
      [TRAIN(wallAfter(T0, 0, "12:20")), "The departure has to be at least 30 minutes from now."],
      [TRAIN(wallAfter(T0, 600)), "The departure has to be within the next 18 months."],
    ];
    for (const [action, message] of cases) expect(w.no(ANN.userId, action), JSON.stringify(action)).toBe(message);
    const id = must(w.ok(ANN.userId, TRAIN(wallAfter(T0, 3), { face: "89", venue: "30th Street → Penn Station" })).id, "train with a face value");
    expect(storedEvent(w, id)).toMatchObject({ tiers: [{ id: "t1", label: "Ticket", price: 89 }], venue: "30th Street → Penn Station" });
    expect(w.no(BOB.userId, sell(id, "90", { method: "file" }))).toBe("Asking price can't be more than the face value ($89).");
  });

  it("keeps an older train's validity window, operator and ticket type, and its listings name their train", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const older = { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 6, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] } as unknown as E.Action;
    const id = must(w.ok(ANN.userId, older).id, "older train");
    expect(storedEvent(w, id)).toMatchObject({ club: "Amtrak", openUntil: wallAfter(T0, 6, "23:00"), methods: ["file"] });
    w.run(() => expect(E.needsTrain(must(E.EV[id], "older train"))).toBe(true));
    expect(w.no(BOB.userId, sell(id, "60", { method: "file" }))).toBe("Add your train's departure date and time.");
    must(w.ok(BOB.userId, sell(id, "60", { method: "file", departsAt: wallAfter(T0, 3, "08:05") })).id, "older train listing");
  });

});

describe("a trek (K)", () => {
  it("keeps its ticket types and required face values", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const trek = { type: "createEvent", kind: "trek", title: "Japan Trek", club: "Japan Trek Club", start: wallAfter(T0, 20, "08:00") };
    expect(w.no(ANN.userId, { ...trek } as unknown as E.Action)).toBe("Add 1 to 3 ticket types, each with a name and a face value.");
    expect(w.no(ANN.userId, { ...trek, face: "1200" } as unknown as E.Action)).toBe("Add 1 to 3 ticket types, each with a name and a face value.");
    expect(w.no(ANN.userId, { ...trek, tiers: [{ label: "Spot", price: "" }] } as unknown as E.Action)).toBe("Face value: enter an amount.");
    const id = must(w.ok(ANN.userId, { ...trek, tiers: [{ label: "Spot", price: "1200" }, { label: "Spot + flights", price: "2100" }] } as unknown as E.Action).id, "trek");
    expect(storedEvent(w, id).tiers).toEqual([{ id: "t1", label: "Spot", price: 1200 }, { id: "t2", label: "Spot + flights", price: 2100 }]);
    expect(w.no(BOB.userId, sell(id, "1201", { method: "name", namesChecked: true }))).toBe("Asking price can't be more than the face value ($1,200).");
  });
});

describe("words for a date-only event with no face value", () => {
  it("reads cleanly in the views and the guest view, which never mention what a seller paid", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const bare = must(w.ok(ANN.userId, BARE("2026-11-20")).id, "bare");
    const priced = must(w.ok(ANN.userId, BARE("2026-11-21", { title: "Wine Social", face: "40" })).id, "priced");
    const l = must(w.ok(BOB.userId, sell(bare, "55")).id, "listing");
    const g = guestViewOf(w);
    expect(guestContractViolations(g)).toEqual([]);
    expect(must(g.events.find((e) => e.id === bare), "guest event").tiers).toEqual([{ id: "t1", label: "Ticket", price: null }]);
    // SELL5-M1: the share text's checks were removed (§9v item 3: no outward Share, so no share message any more). What that text quoted
    // is still what the guest view carries: the priced event's face value and the listing's asking price, and never what a seller paid.
    expect(must(g.events.find((e) => e.id === priced), "guest priced event").tiers).toEqual([{ id: "t1", label: "Ticket", price: 40 }]);
    expect(must(g.listings.find((x) => x.id === l), "guest listing")).toMatchObject({ ask: 55 });
    expect(JSON.stringify(g)).not.toMatch(/"paid"|seller paid|you paid|NaN|\$∞/);
    const v = viewOf(w, CAT);
    expect(JSON.stringify(v.events.find((e) => e.id === bare))).not.toMatch(/NaN|undefined/);
    installed(v, () => {
      const ev = must(E.EV[bare], "bare");
      const parts = E.priceParts(ev, E.eventSummary(v as unknown as WorldState, ev, CAT.userId));
      expect(JSON.stringify(parts)).not.toMatch(/paid|Original price|NaN|null|\$∞/);
    });
  });

  it("is counted in the pilot report: added by date alone, and without a face value", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, BARE(dateAfter(T0, 10)));
    w.ok(ANN.userId, BARE(dateAfter(T0, 11), { title: "Wine Social", face: "40" }));
    w.addEvent(BOB); // stored with a time and a face value
    const data = { now: w.now, transaction: { readOnly: true, isolation: "repeatable read" }, live: { version: 3, createdAt: T0, updatedAt: w.now, nextDue: null, doc: w.doc },
      testWorlds: 0, profiles: 2, notifications: { total: 0, unread: 0 }, snapshots: 0, actions: { retained: 0, oldestAt: null, recent: [] }, knownTestAccounts: null } as unknown as PilotData;
    const r = buildPilotReport(data);
    expect(r.created.events).toMatchObject({ allTime: 3, dateOnly: 2, noFaceValue: 1 });
  });
});
