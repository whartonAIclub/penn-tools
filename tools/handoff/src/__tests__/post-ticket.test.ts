// One-form Sell (USER-INSTRUCTIONS §9l), the server half: "Post ticket" is one action, postTicket. It lists a ticket the seller is
// adding, on an event they chose (eventId) or on a new one made with the listing (event: createEvent's fields), and it stores all of
// it or none of it. It reuses the existing steps (createEvent, then addThen with list), so every rule they have still applies.
// - A new event and its listing are stored together; a second account and a signed-out visitor see the event only with its listing.
// - A refused bundle (no date, a past date, a price above the face value just entered, a bad quantity, a transfer method the event
//   doesn't have) stores nothing: no event, no ticket, no listing, no notification. (Since the Sell and Request follow-up, §9m, an
//   ordinary event's ticket sent with no method at all posts, promising none: sell-request-followup.test.ts.)
// - Joining an event is only ever the seller's choice (eventId) and never adds one. A new event is never merged into another: an exact
//   twin (the same name on the same date, or the same train at the same departure) is refused with the choice spelled out; a
//   different date, departure or name is its own occurrence.
// - A train is an e-ticket and a trek a name change without being asked; names checked at the door still means a name change.
// - createEvent, list, addThen and seq keep working as they did.
// The retry and double-tap half (request ids, the world's lock) is in post-ticket-store.test.ts, against a throwaway database schema.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { FILE_ERROR, ID, INVALID_ACTION_ERROR, LIVE_ACTIONS, SEQ_STEP_TYPES, TEXT_ERROR, actionIds, parseAction, type LiveAction } from "../live.js";
import type { GuestView, View } from "../types.js";
import { must, resetEngine } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, LiveTestWorld, T0, dateAfter, wallAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
/** "Post ticket" as the Sell form sends it: one ticket at $30, sent as a PDF or QR code, unless said otherwise. */
const POST = (over: Record<string, unknown>) => act({ type: "postTicket", qty: 1, ask: "30", note: "", method: "file", obo: false, ...over });
/** A new ordinary event as the form names it: its name and its date. */
const NEW = (title: string, date: string, over: Record<string, unknown> = {}) => ({ kind: "event", title, start: date, ...over });
const TRAIN = (title: string, departs: string) => ({ kind: "train", title, start: departs });
const GALA_DAY = dateAfter(T0, 19);
const TWIN_EVENT = "An event with this name on that date is already on Handoff. Choose it to list your ticket there, or add what's different to the name if yours is a different showing.";
const TWIN_TRAIN = "A train with this name and departure is already on Handoff. Choose it to list your ticket there.";
const TWIN_TREK = "A trek with this name and start is already on Handoff. Choose it to list your spot there.";
const NOT_SAVED = "Not saved: a later step didn't go through.";
const NEW_EVENT_TOAST = "Ticket listed. Its event is new on Handoff: it shows as added by you, and Handoff doesn't check its details.";

const counts = (w: LiveTestWorld) => ({ events: w.doc.events.filter((e) => !e.removedAt).length, holdings: w.doc.holdings.length, listings: w.doc.listings.length });
const eventOf = (w: LiveTestWorld, id: string) => must(w.doc.events.find((e) => e.id === id), `event ${id}`);
const listingOf = (w: LiveTestWorld, id: string) => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
/** What a signed-in classmate's page holds: the events and listings in their view, and the cards Available shows them. */
function seenBy(w: LiveTestWorld, who: TestPerson): { events: string[]; listings: string[]; cards: string[]; v: View } {
  const v = viewOf(w, who);
  E.setLiveClock(() => v.serverNow);
  E.applyWorld(v as unknown as E.WorldState);
  try {
    const cards = E.availableFor(v as unknown as E.WorldState, who.userId, { ...E.DISC0 }).cards.map((c) => c.key);
    return { events: v.events.map((e) => e.id), listings: v.listings.map((l) => l.id), cards, v };
  } finally { E.setLiveClock(null); E.applyWorld(null); }
}
const guestSees = (w: LiveTestWorld): { events: string[]; listings: string[]; g: GuestView } => { const g = guestViewOf(w); return { events: g.events.map((e) => e.id), listings: g.listings.map((l) => l.id), g }; };

describe("Post ticket: a new event and its listing, stored together (9l item 4)", () => {
  it("is one live action, and a seq step", () => {
    expect(E.LIVE_TYPES).toContain("postTicket");
    expect(LIVE_ACTIONS).toContain("postTicket");
    expect(E.SEQ_STEP_TYPES).toContain("postTicket");
    expect(SEQ_STEP_TYPES).toContain("postTicket");
    // The actions it's made of are all still there (standalone event creation stays available).
    for (const t of ["createEvent", "addHolding", "addThen", "list", "seq"]) expect(E.LIVE_TYPES, t).toContain(t);
  });

  it("stores the event, the ticket and the listing in one change, and answers with the listing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(counts(w)).toEqual({ events: 0, holdings: 0, listings: 0 });
    const done = w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY) }));
    expect(w.invalid).toEqual([]);
    expect(w.outcomes).toHaveLength(1); // one change, not two
    expect(counts(w)).toEqual({ events: 1, holdings: 1, listings: 1 });
    const ev = must(w.doc.events[0], "the event"), l = must(w.doc.listings[0], "the listing"), h = must(w.doc.holdings[0], "the ticket");
    expect(ev).toMatchObject({ kind: "event", title: "Spring Gala", start: GALA_DAY, createdBy: ANN.userId, tiers: [{ id: "t1", label: "Ticket", price: null }] });
    expect(ev.id).toMatch(ID.event);
    expect(l).toMatchObject({ eventId: ev.id, sellerId: ANN.userId, holdingId: h.id, listed: 1, ask: 30, tier: "t1", method: "file", paid: null });
    expect(h).toMatchObject({ userId: ANN.userId, eventId: ev.id, tier: "t1", qty: 1, paid: null, source: "self-reported" });
    // The answer is the listing (what "Ticket listed" and its share link need); the steps name what was made.
    expect(done.id).toBe(l.id);
    expect(done.id).toMatch(ID.listing);
    expect(done.steps).toEqual([{ type: "createEvent", ok: true, id: ev.id }, { type: "list", ok: true, id: l.id }]);
    expect(done.toast).toBe(NEW_EVENT_TOAST);
    expect(done.toast).not.toContain("Spring Gala"); // toasts go into the actions log, which never quotes what was typed
    expect(done.notes).toEqual([]); // nobody could have asked for an event that didn't exist
    // It closes like any event added by its date: 11:59 PM that day in Philadelphia.
    w.run(() => expect(E.closesAt(must(E.EV[ev.id], "event"))).toBe(E.wallToMs(`${GALA_DAY}T23:59`)));
  });

  it("a second account and a visitor see the event only together with its listing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(seenBy(w, BOB)).toMatchObject({ events: [], listings: [], cards: [] });
    expect(guestSees(w)).toMatchObject({ events: [], listings: [] });
    const done = w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY, { face: "40" }), ask: "35" }));
    const ev = must(w.doc.events[0], "the event").id, l = must(done.id, "the listing's id");
    const bob = seenBy(w, BOB);
    expect(bob).toMatchObject({ events: [ev], listings: [l], cards: [ev] }); // on Available, as a card with a ticket on it
    expect(must(bob.v.listings[0], "Bob's copy")).toMatchObject({ eventId: ev, ask: 35, numbers: { available: 1 } });
    const guest = guestSees(w);
    expect(guest).toMatchObject({ events: [ev], listings: [l] });
    expect(must(guest.g.listings[0], "the visitor's copy")).toMatchObject({ eventId: ev, ask: 35, available: 1 });
    expect(JSON.stringify(guest.g)).not.toContain(ANN.name); // the visitor's view still names nobody
  });

  it("a refused bundle stores nothing: no event, no ticket, no listing, no notification, and nobody's view changes", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const before = JSON.stringify(w.doc);
    const good = NEW("Spring Gala", GALA_DAY);
    // [what's wrong, the action, the refusal, the part that failed]
    const bad: [string, E.Action, string | RegExp, "event" | "listing"][] = [
      ["no date", POST({ event: NEW("Spring Gala", "") }), "Enter the date.", "event"],
      ["a date that has passed", POST({ event: NEW("Spring Gala", dateAfter(T0, -1)) }), "Choose today or a later date.", "event"],
      ["a date that isn't one", POST({ event: NEW("Spring Gala", "next Friday") }), "Enter the date.", "event"],
      ["a date more than 18 months away", POST({ event: NEW("Spring Gala", dateAfter(T0, 600)) }), "The date has to be within the next 18 months.", "event"],
      ["a name too short to be one", POST({ event: NEW("x", GALA_DAY) }), "Give the event a name (3 to 120 characters).", "event"],
      ["a face value that isn't an amount", POST({ event: NEW("Spring Gala", GALA_DAY, { face: "forty" }) }), /^Face value: /, "event"],
      ["a price above the face value just entered", POST({ event: NEW("Spring Gala", GALA_DAY, { face: "40" }), ask: "45" }), "Asking price can't be more than the face value ($40).", "listing"],
      ["more tickets than one person may hold", POST({ event: good, qty: 5 }), "Enter between 1 and 4 tickets (4 per person).", "listing"],
      ["no price", POST({ event: good, ask: "" }), /^Asking price: /, "listing"],
      ["a price that isn't an amount", POST({ event: good, ask: "lots" }), /^Asking price: /, "listing"],
      ["a lowest offer above the price", POST({ event: good, obo: true, minOffer: "45" }), /lowest offer|Lowest offer/, "listing"],
      ["a transfer method that isn't one of the event's", POST({ event: good, method: "inperson" }), "Choose how you'll transfer it.", "listing"], // the follow-up (§9m): no method at all is no longer a refusal (below: "a method that's sent is kept…")
      ["a name change with no organizer to make it", POST({ event: good, method: "name" }), E.NO_ORG_NAME, "listing"],
    ];
    for (const [what, action, error, part] of bad) {
      const out = w.act(ANN.userId, action);
      if (typeof error === "string") expect(out.res.error, what).toBe(error); else expect(out.res.error, what).toMatch(error);
      // Which part failed, for the page to put the message beside the right field; the event is never reported as saved.
      expect(out.res.steps, what).toEqual(part === "event" ? [{ type: "createEvent", ok: false, error: out.res.error }]
        : [{ type: "createEvent", ok: false, error: NOT_SAVED }, { type: "list", ok: false, error: out.res.error }]);
      expect(JSON.stringify(w.doc), what).toBe(before);
      expect(out.notes, what).toEqual([]);
    }
    expect(w.invalid).toEqual([]); // each of those reached the engine: the rules refused them, in their own words
    // A quantity that isn't one never reaches the engine at all.
    for (const qty of [0, -1, 1.5, 100]) expect(w.no(ANN.userId, POST({ event: good, qty })), String(qty)).toBe(INVALID_ACTION_ERROR);
    expect(JSON.stringify(w.doc)).toBe(before);
    expect(counts(w)).toEqual({ events: 0, holdings: 0, listings: 0 });
    expect(w.notes).toEqual([]);
    expect(seenBy(w, BOB)).toMatchObject({ events: [], listings: [], cards: [] });
    expect(guestSees(w)).toMatchObject({ events: [], listings: [] });
    // And the same bundle, once it's right, goes through: the refusals left nothing in its way.
    w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY, { face: "40" }), ask: "40" })); // at the face value is fine
    expect(counts(w)).toEqual({ events: 1, holdings: 1, listings: 1 });
  });

  it("refused bundles don't count toward the five events a person may add in a day; stored ones do", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    for (let k = 0; k < 6; k++) w.no(ANN.userId, POST({ event: NEW(`Refused Night ${k}`, GALA_DAY), ask: "" }));
    for (let k = 1; k <= 5; k++) w.ok(ANN.userId, POST({ event: NEW(`Open Mic ${k}`, dateAfter(T0, 10 + k)) }));
    expect(w.no(ANN.userId, POST({ event: NEW("Open Mic 6", dateAfter(T0, 16)) }))).toBe("You've added 5 events in the last 24 hours, the most Handoff allows. Try again later.");
    expect(counts(w)).toEqual({ events: 5, holdings: 5, listings: 5 });
  });

  it("needs exactly one of an event on Handoff and a new one", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: dateAfter(T0, 12) })).id, "event");
    const before = JSON.stringify(w.doc);
    expect(w.no(ANN.userId, POST({}))).toBe("Choose the event your ticket is for, or name a new one.");
    expect(w.invalid).toEqual([]);
    // Both at once is no shape the page sends: the input gate refuses it, and the engine would too.
    expect(w.no(ANN.userId, POST({ eventId: ev, event: NEW("Spring Gala", GALA_DAY) }))).toBe(INVALID_ACTION_ERROR);
    expect(w.invalid).toHaveLength(1);
    const raw = new LiveTestWorld({ doc: w.doc, people: PEOPLE6 });
    expect(raw.no(ANN.userId, POST({ eventId: ev, event: NEW("Spring Gala", GALA_DAY) }))).toBe("Choose the event your ticket is for, or name a new one.");
    expect(raw.no(ANN.userId, POST({ event: "Spring Gala" }))).toBe("Choose the event your ticket is for, or name a new one.");
    expect(JSON.stringify(w.doc)).toBe(before);
    expect(JSON.stringify(raw.doc)).toBe(before);
  });

  it("runs in a live world only, for a signed-in person", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(w.no(null, POST({ event: NEW("Spring Gala", GALA_DAY) }))).toBe("Sign in to do that.");
    expect(w.no("", POST({ event: NEW("Spring Gala", GALA_DAY) }))).toBe("Sign in to do that.");
    expect(counts(w)).toEqual({ events: 0, holdings: 0, listings: 0 });
  });
});

describe("Post ticket on an event that's already on Handoff: the seller's tap joins it (9l item 2)", () => {
  it("lists there and never adds an event", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY) }));
    const ev = must(w.doc.events[0], "event").id;
    const bob = w.ok(BOB.userId, POST({ eventId: ev, ask: "28" }));
    expect(counts(w)).toEqual({ events: 1, holdings: 2, listings: 2 });
    expect(listingOf(w, must(bob.id, "Bob's listing"))).toMatchObject({ eventId: ev, sellerId: BOB.userId, ask: 28, listed: 1, tier: "t1" });
    expect(bob.steps).toEqual([{ type: "list", ok: true, id: bob.id }]); // nothing else was made
    expect(bob.toast).toMatch(/^Ticket listed\. /);
    expect(bob.toast).not.toMatch(/new on Handoff/);
    w.ok(CAT.userId, POST({ eventId: ev, qty: 2, ask: "25" }));
    expect(counts(w)).toEqual({ events: 1, holdings: 3, listings: 3 });
    expect(seenBy(w, DAN).cards).toEqual([ev]); // one card, three listings
    // A second ticket of the same type from the same seller is still refused, as it was (nothing doubles).
    expect(w.no(BOB.userId, POST({ eventId: ev, ask: "28" }))).toBe("You've already added a ticket in this tier. It can't be changed yet.");
    expect(counts(w)).toEqual({ events: 1, holdings: 3, listings: 3 });
  });

  it("asks which ticket type only when the event has several", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const two = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Charity Ball", start: wallAfter(T0, 14), tiers: [{ label: "General admission", price: "60" }, { label: "VIP", price: "95" }] })).id, "event");
    expect(w.no(BOB.userId, POST({ eventId: two, ask: "50" }))).toBe("Choose your ticket type.");
    expect(w.no(BOB.userId, POST({ eventId: two, tier: "", ask: "50" }))).toBe("Choose your ticket type.");
    const vip = w.ok(BOB.userId, POST({ eventId: two, tier: "t2", ask: "90" }));
    expect(listingOf(w, must(vip.id, "listing"))).toMatchObject({ tier: "t2", ask: 90 });
    expect(w.no(CAT.userId, POST({ eventId: two, tier: "t1", ask: "61" }))).toBe("Asking price can't be more than the face value ($60).");
  });

  it("refuses an event that was removed, is over, or isn't there, and adds nothing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const gone = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Sprng Gala", start: GALA_DAY })).id, "event");
    w.ok(ANN.userId, act({ type: "removeEvent", eventId: gone }));
    const soon = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Comedy Night", start: dateAfter(T0, 1) })).id, "event");
    const before = JSON.stringify(w.doc);
    expect(w.no(BOB.userId, POST({ eventId: gone }))).toBe("This event was removed.");
    expect(w.no(BOB.userId, POST({ eventId: "ev-0123456789abcdef" }))).toBe("Choose an event.");
    expect(JSON.stringify(w.doc)).toBe(before);
    w.advance(2 * DAY);
    expect(w.no(BOB.userId, POST({ eventId: soon }))).toBe("The event is over.");
    expect(counts(w)).toEqual({ events: 1, holdings: 0, listings: 0 });
  });
});

describe("the same event twice: never merged, never doubled (9l item 2)", () => {
  it("an exact twin of an open event is refused with the choice spelled out; tapping the match lists there", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const first = w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY) }));
    const ev = must(w.doc.events[0], "event").id;
    const before = JSON.stringify(w.doc);
    // The same name, whatever its capitals, spacing or punctuation, on the same date: the second classmate's page didn't know it yet.
    for (const title of ["Spring Gala", "spring gala", "  SPRING   GALA ", "Spring-Gala!"]) {
      const out = w.act(BOB.userId, POST({ event: NEW(title, GALA_DAY), ask: "28" }));
      expect(out.res.error, title).toBe(TWIN_EVENT);
      expect(out.res.steps, title).toEqual([{ type: "createEvent", ok: false, error: TWIN_EVENT }]);
    }
    expect(TWIN_EVENT).not.toContain("Spring"); // refusals go into the actions log: never the name that was typed
    expect(JSON.stringify(w.doc)).toBe(before); // nothing of Bob's was stored, and nothing was joined for him
    expect(w.doc.listings.map((l) => l.sellerId)).toEqual([ANN.userId]);
    // Bob's own tap on the match is what joins it.
    const joined = w.ok(BOB.userId, POST({ eventId: ev, ask: "28" }));
    expect(counts(w)).toEqual({ events: 1, holdings: 2, listings: 2 });
    expect(new Set(w.doc.listings.map((l) => l.eventId))).toEqual(new Set([ev]));
    expect(joined.id).not.toBe(first.id);
    expect(seenBy(w, DAN).cards).toEqual([ev]);
  });

  it("the same seller sending the same new event again as a new change (a lost answer, then a changed price) ends with one event and one listing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY), ask: "30" }));
    expect(w.no(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY), ask: "28" }))).toBe(TWIN_EVENT);
    expect(w.no(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY), ask: "30" }))).toBe(TWIN_EVENT);
    expect(counts(w)).toEqual({ events: 1, holdings: 1, listings: 1 });
    expect(must(w.doc.listings[0], "the listing").ask).toBe(30);
  });

  it("a different date, a different departure, or a name with something added is its own occurrence", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY) }));
    w.ok(BOB.userId, POST({ event: NEW("Spring Gala", dateAfter(T0, 26)) })); // the same name a week later
    w.ok(CAT.userId, POST({ event: NEW("Spring Gala (9:30 PM show)", GALA_DAY) })); // another showing that day, told apart by its name
    w.ok(DAN.userId, POST({ event: NEW("Spring Gala 2026", GALA_DAY) })); // a longer name is another name: nothing fuzzy
    w.ok(EVE.userId, POST({ event: NEW("Spring Gal", GALA_DAY) })); // and so is a shorter one
    expect(counts(w)).toEqual({ events: 5, holdings: 5, listings: 5 });
    expect(new Set(w.doc.listings.map((l) => l.eventId)).size).toBe(5);
    // Trains: the same name at another time is another departure; at the same minute it's the same train.
    const day = dateAfter(T0, 6), name = "Amtrak Northeast Regional: Philadelphia → New York";
    const am = w.ok(ANN.userId, POST({ event: TRAIN(name, `${day}T09:05`), method: undefined }));
    w.ok(BOB.userId, POST({ event: TRAIN(name, `${day}T15:10`), method: undefined }));
    expect(w.no(CAT.userId, POST({ event: TRAIN("amtrak northeast regional: philadelphia -> new york", `${day}T09:05`), method: undefined }))).toBe(TWIN_TRAIN);
    expect(counts(w)).toEqual({ events: 7, holdings: 7, listings: 7 });
    expect(w.doc.events.filter((e) => e.kind === "train").map((e) => e.start).sort()).toEqual([`${day}T09:05`, `${day}T15:10`]);
    // An event and a train of one name aren't each other's twin.
    w.ok(CAT.userId, POST({ event: NEW(name, day) }));
    expect(counts(w).events).toBe(8);
    expect(am.toast).toBe("Ticket listed. Its train is new on Handoff: it shows as added by you, and Handoff doesn't check its details.");
  });

  it("treks: the same name and start is the same trek", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const trek = (start: string) => ({ kind: "trek", title: "Japan Trek", club: "Japan Trek Club", start, tiers: [{ label: "Spot", price: "1200" }] });
    const done = w.ok(ANN.userId, POST({ event: trek(wallAfter(T0, 20, "08:00")), ask: "1100", method: undefined }));
    expect(done.toast).toBe("Spot listed. Its trek is new on Handoff: it shows as added by you, and Handoff doesn't check its details.");
    expect(w.no(BOB.userId, POST({ event: trek(wallAfter(T0, 20, "08:00")), ask: "1000", method: undefined }))).toBe(TWIN_TREK);
    w.ok(BOB.userId, POST({ event: trek(wallAfter(T0, 27, "08:00")), ask: "1000", method: undefined }));
    expect(counts(w)).toEqual({ events: 2, holdings: 2, listings: 2 });
  });

  it("an event that was removed, or whose transfer window has closed, is nobody's twin", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const typo = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Trivia Night", start: GALA_DAY })).id, "event");
    w.ok(ANN.userId, act({ type: "removeEvent", eventId: typo }));
    w.ok(BOB.userId, POST({ event: NEW("Trivia Night", GALA_DAY) }));
    w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Wine Tasting", start: GALA_DAY, deadline: wallAfter(T0, 2, "17:00") }));
    expect(w.no(CAT.userId, POST({ event: NEW("Wine Tasting", GALA_DAY) }))).toBe(TWIN_EVENT); // while it's open, it is
    w.advance(3 * DAY); // its transfer window has closed: nobody can list there
    w.ok(CAT.userId, POST({ event: NEW("Wine Tasting", GALA_DAY) }));
    expect(w.doc.events.filter((e) => e.title === "Wine Tasting")).toHaveLength(2);
  });

  it("eventTwin gives the page the same answer, from a classmate's view in the browser", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY) }));
    const gala = must(w.doc.events[0], "event").id;
    // Two seatings stored with their times (the older form), and a train.
    const day = dateAfter(T0, 9);
    const timed = (start: string) => act({ type: "createEvent", kind: "event", title: "Improv Showcase", start, tiers: [{ label: "General admission", price: "25" }] });
    const early = must(w.ok(BOB.userId, timed(`${day}T19:00`)).id, "early"), late = must(w.ok(BOB.userId, timed(`${day}T21:30`)).id, "late");
    const train = must(w.ok(CAT.userId, act({ type: "createEvent", kind: "train", title: "Amtrak Keystone: Philadelphia → Harrisburg", start: `${day}T09:05` })).id, "train");
    const v = viewOf(w, DAN);
    E.setLiveClock(() => v.serverNow);
    E.applyWorld(v as unknown as E.WorldState);
    try {
      const twin = (kind: "event" | "train" | "trek", title: string, start: string) => { const e = E.eventTwin(kind, title, start); return e ? e.id : null; };
      expect(twin("event", "SPRING GALA", GALA_DAY)).toBe(gala);
      expect(twin("event", "Spring Gala", dateAfter(T0, 20))).toBeNull(); // another day
      expect(twin("event", "Spring", GALA_DAY)).toBeNull(); // part of a name is no match (suggestEvents offers those; nothing joins them)
      expect(twin("train", "Spring Gala", `${GALA_DAY}T09:00`)).toBeNull(); // another kind
      // A date alone matches a seating on that day (the earlier one); a time matches only that seating.
      expect(twin("event", "Improv Showcase", day)).toBe(early);
      expect(twin("event", "Improv Showcase", `${day}T21:30`)).toBe(late);
      expect(twin("event", "Improv Showcase", `${day}T20:00`)).toBeNull();
      expect(twin("train", "Amtrak Keystone: Philadelphia → Harrisburg", `${day}T09:05`)).toBe(train);
      expect(twin("train", "Amtrak Keystone: Philadelphia → Harrisburg", `${day}T09:06`)).toBeNull();
      for (const blank of ["", "  ", "!!"]) expect(twin("event", blank, GALA_DAY)).toBeNull();
      expect(twin("event", "Spring Gala", "")).toBeNull();
    } finally { E.setLiveClock(null); E.applyWorld(null); }
  });
});

describe("the transfer method and the restrictions that matter (9l item 3)", () => {
  it("is chosen for the seller when only one is valid: a train is an e-ticket, a trek a name change", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const train = w.ok(ANN.userId, act({ type: "postTicket", qty: 1, ask: "28", event: TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 4, "09:05")) }));
    expect(listingOf(w, must(train.id, "listing")).method).toBe("file");
    const trek = w.ok(BOB.userId, act({ type: "postTicket", qty: 1, ask: "1100", event: { kind: "trek", title: "Japan Trek", club: "Japan Trek Club", start: wallAfter(T0, 20, "08:00"), tiers: [{ label: "Spot", price: "1200" }] } }));
    expect(listingOf(w, must(trek.id, "listing")).method).toBe("name");
    // Neither can be sent another way.
    expect(w.no(CAT.userId, act({ type: "postTicket", qty: 1, ask: "28", method: "app", event: TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 5, "09:05")) }))).toBe("Choose how you'll transfer it.");
    expect(w.no(CAT.userId, act({ type: "postTicket", qty: 1, ask: "900", method: "file", event: { kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(T0, 40, "08:00"), tiers: [{ label: "Spot", price: "1200" }] } })))
      .toBe("Names are checked at entry, so it has to go through an organizer name change.");
    expect(counts(w)).toEqual({ events: 2, holdings: 2, listings: 2 });
    // A trek keeps its face value as the cap, and a train its two-per-person limit.
    expect(w.no(CAT.userId, act({ type: "postTicket", qty: 1, ask: "1300", event: { kind: "trek", title: "Iceland Trek", club: "Nordic Club", start: wallAfter(T0, 40, "08:00"), tiers: [{ label: "Spot", price: "1200" }] } })))
      .toBe("Asking price can't be more than the face value ($1,200).");
    expect(w.no(CAT.userId, act({ type: "postTicket", qty: 3, ask: "28", event: TRAIN("Amtrak Keystone: Philadelphia → Harrisburg", wallAfter(T0, 5, "09:05")) }))).toBe("Enter between 1 and 2 tickets (2 per person).");
    expect(counts(w)).toEqual({ events: 2, holdings: 2, listings: 2 });
  });

  // The Sell and Request follow-up (USER-INSTRUCTIONS §9m item 1) changed this test's first expectation: an ordinary event's ticket
  // posted with no method used to be refused ("Choose how you'll transfer it."); it now posts and promises none. A method that's sent
  // is still kept, and one that isn't valid for the event is still refused (sell-request-followup.test.ts has the rest).
  it("an ordinary event has two or three valid ways: a method that's sent is kept, and with none sent the listing promises none", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const none = w.ok(CAT.userId, act({ type: "postTicket", qty: 1, ask: "30", event: NEW("Autumn Gala", GALA_DAY) }));
    expect("method" in listingOf(w, must(none.id, "listing"))).toBe(false);
    const blank = w.ok(DAN.userId, POST({ eventId: listingOf(w, must(none.id, "listing")).eventId, method: "" })); // the blank a form would send
    expect("method" in listingOf(w, must(blank.id, "listing"))).toBe(false);
    expect(w.no(EVE.userId, POST({ event: NEW("Winter Gala", GALA_DAY), method: "inperson" }))).toBe("Choose how you'll transfer it."); // not one of its ways
    const app = w.ok(ANN.userId, POST({ event: NEW("Spring Gala", GALA_DAY), method: "app" }));
    expect(listingOf(w, must(app.id, "listing")).method).toBe("app");
    const named = w.ok(BOB.userId, POST({ event: NEW("Rooftop Mixer", GALA_DAY, { club: "Wharton Social Committee" }), method: "name", namesChecked: true }));
    expect(listingOf(w, must(named.id, "listing"))).toMatchObject({ method: "name", namesChecked: true });
  });

  it("names checked at the door: a name change through the organizer, and nothing else", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const checked = NEW("Winter Ball", GALA_DAY, { club: "Wharton Graduate Association", namesChecked: true });
    expect(w.no(ANN.userId, POST({ event: checked, method: "file" }))).toBe("Names are checked at entry, so it has to go through an organizer name change.");
    expect(counts(w)).toEqual({ events: 0, holdings: 0, listings: 0 });
    const done = w.ok(ANN.userId, act({ type: "postTicket", qty: 1, ask: "30", event: checked })); // no method sent: the one valid way
    expect(listingOf(w, must(done.id, "listing"))).toMatchObject({ method: "name", namesChecked: true });
    expect(eventOf(w, must(w.doc.events[0], "event").id).namesChecked).toBe(true);
    // Without an organizer there's nobody to change a name: the event itself is refused, so nothing is stored.
    expect(w.no(BOB.userId, POST({ event: NEW("Summer Ball", GALA_DAY, { namesChecked: true }), method: "name" })))
      .toBe("Add the club or organizer: with names checked at the door, tickets move by a name change with them.");
    expect(counts(w)).toEqual({ events: 1, holdings: 1, listings: 1 });
  });

  it("keeps the members-only mark, the seller's restriction flag, offers and an older train's own departure", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const club = w.ok(ANN.userId, POST({ event: NEW("Members Mixer", GALA_DAY, { club: "Wharton Wine Club", attend: "members" }), restricted: true, obo: true, minOffer: "20", note: "Row C, on the aisle." }));
    expect(listingOf(w, must(club.id, "listing"))).toMatchObject({ restricted: true, obo: true, minOffer: 20, note: "Row C, on the aisle." });
    const mixer = must(w.doc.events[0], "event").id;
    w.run(() => expect(E.membersOnlyListing(must(E.EV[mixer], "event"), listingOf(w, must(club.id, "listing")))).toBe(true));
    // A members-only ticket needs a club to be a member of.
    expect(w.no(BOB.userId, POST({ event: NEW("Open Mixer", GALA_DAY), membersOnly: true }))).toBe(E.NO_ORG_MEMBERS);
    // A train ticket stored with a travel window (before forms round 2) still names its own train.
    const pass = must(w.ok(CAT.userId, act({ type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 2, "06:00"), openUntil: wallAfter(T0, 6, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] })).id, "pass");
    expect(w.no(DAN.userId, act({ type: "postTicket", qty: 1, ask: "80", eventId: pass }))).toBe("Add your train's departure date and time.");
    const dep = wallAfter(T0, 3, "14:11");
    const seat = w.ok(DAN.userId, act({ type: "postTicket", qty: 1, ask: "80", eventId: pass, departsAt: dep }));
    expect(listingOf(w, must(seat.id, "listing"))).toMatchObject({ method: "file", departsAt: dep });
    // A train's own tag already warns about the carrier's rules, so the seller's flag isn't stored a second time (as for list).
    expect(listingOf(w, must(w.ok(EVE.userId, act({ type: "postTicket", qty: 1, ask: "80", eventId: pass, departsAt: dep, restricted: true })).id, "listing")).restricted).toBeUndefined();
  });
});

describe("the actions it's made of keep working (9l item 1: standalone event creation stays, secondary)", () => {
  it("createEvent alone still adds an event with nothing listed, and doesn't check for a twin", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const a = w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Spring Gala", start: GALA_DAY }));
    expect(a.toast).toBe("Event added. It shows as added by you, and Handoff doesn't check its details.");
    w.ok(BOB.userId, act({ type: "createEvent", kind: "event", title: "Spring Gala", start: GALA_DAY })); // unchanged: its own form suggests the match
    expect(counts(w)).toEqual({ events: 2, holdings: 0, listings: 0 });
    // Post ticket then finds a twin (the earlier of the two) and refuses to add a third.
    expect(w.no(CAT.userId, POST({ event: NEW("Spring Gala", GALA_DAY) }))).toBe(TWIN_EVENT);
  });

  it("addThen, list and a seq of createEvent then addThen behave as before", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: dateAfter(T0, 12), face: "40" })).id, "event");
    const listing = { type: "list", qty: 1, ask: "35", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false };
    const l1 = must(w.ok(BOB.userId, act({ type: "addThen", add: { eventId: ev, tier: "t1", qty: 1 }, then: listing })).id, "addThen");
    const h = must(w.ok(CAT.userId, act({ type: "addHolding", eventId: ev, tier: "t1", qty: 2 })).id, "holding");
    const l2 = must(w.ok(CAT.userId, act({ ...listing, holdingId: h })).id, "list");
    expect([l1, l2].every((x) => ID.listing.test(x))).toBe(true);
    const seq = w.ok(DAN.userId, act({ type: "seq", steps: [
      { action: { type: "createEvent", kind: "event", title: "Book Swap", start: dateAfter(T0, 13) } },
      { action: { type: "addThen", add: { eventId: "@0", tier: "t1", qty: 1 }, then: { ...listing, ask: "10" } } },
    ] }));
    expect(seq.id).toMatch(ID.event); // a seq still answers with its first step
    expect(seq.steps?.map((s) => [s.type, s.ok])).toEqual([["createEvent", true], ["addThen", true]]);
    expect(counts(w)).toEqual({ events: 2, holdings: 3, listings: 3 });
  });

  it("as a seq step: Post ticket, then share it with a classmate's request", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: dateAfter(T0, 12) })).id, "event");
    const iso = must(w.ok(DAN.userId, act({ type: "saveInterest", data: { eventId: ev, qty: 1, budget: "", note: "" } })).id, "request");
    const done = w.ok(BOB.userId, act({ type: "seq", steps: [{ action: POST({ eventId: ev, ask: "25" }) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" }, optional: true }] }));
    expect(done.steps?.map((s) => [s.type, s.ok])).toEqual([["postTicket", true], ["shareListing", true]]);
    expect(done.id).toMatch(ID.listing); // "@0" was the listing
    expect(w.doc.responses.map((r) => [r.isoId, r.listingId])).toEqual([[iso, done.id]]);
    // A required step failing after a new event's Post ticket keeps none of it.
    const before = JSON.stringify(w.doc);
    expect(w.no(CAT.userId, act({ type: "seq", steps: [{ action: POST({ event: NEW("Spring Gala", GALA_DAY) }) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" } }] }))).toMatch(/doesn't fit|request/i);
    expect(JSON.stringify(w.doc)).toBe(before);
  });
});

describe("the input gate (parseAction) for Post ticket", () => {
  const ok = (raw: unknown): LiveAction => { const r = parseAction(raw); if (!r.ok) throw new Error(`refused: ${r.error} (${r.why})`); return r.action; };
  const refusal = (raw: unknown): string => { const r = parseAction(raw); if (r.ok) throw new Error("accepted"); return r.error; };
  const EV1 = "ev-0123456789abcdef";
  const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

  it("passes what the form sends unchanged: a new event, a train, a trek, and an event on Handoff", () => {
    const sent = [
      { type: "postTicket", event: { kind: "event", title: "Spring Gala", club: "", cat: null, start: "2026-12-04", deadline: null, attend: "all", face: null, namesChecked: false, venue: null, perPerson: null, officialUrl: null, notes: null },
        qty: 1, ask: "30", note: "", restricted: false, method: "file", namesChecked: false, file: null, membersOnly: false, obo: false },
      { type: "postTicket", event: { kind: "event", title: "Winter Ball", club: "Wharton Graduate Association", cat: "Parties", start: "2026-12-11", deadline: "2026-12-10T12:00", attend: "members", face: "40", namesChecked: true, venue: "Houston Hall", perPerson: 2, officialUrl: "https://example.invalid/ball", notes: "Black tie." },
        qty: 2, ask: "35", note: "Two together.", restricted: true, membersOnly: true, obo: true, minOffer: "25" },
      { type: "postTicket", event: { kind: "train", title: "Amtrak Northeast Regional: Philadelphia → New York", start: "2026-11-21T09:05", face: "", venue: null, perPerson: null, officialUrl: null, notes: null }, qty: 1, ask: "28", obo: false },
      { type: "postTicket", event: { kind: "trek", title: "Japan Trek", club: "Japan Trek Club", start: "2026-12-20T08:00", end: null, deadline: null, attend: "all", tiers: [{ label: "Spot", price: "1200" }, { label: "Single room", price: "1500" }] }, tier: "t2", qty: 1, ask: "1400" },
      { type: "postTicket", eventId: EV1, qty: 1, ask: "30", note: "", method: "app", obo: false },
      { type: "postTicket", eventId: EV1, tier: "t2", qty: 1, ask: "80", departsAt: "2026-11-21T14:11" },
    ];
    for (const a of sent) expect(canon(ok(a)), JSON.stringify(a).slice(0, 80)).toBe(canon(a));
  });

  it("drops what the engine doesn't read, and refuses what the pilot doesn't do", () => {
    const base = { type: "postTicket", eventId: EV1, qty: 1, ask: "30" };
    expect(ok({ ...base, payHandle: "@ann", paid: "40", holdingId: "h0123456789abcdef", simulate: true, sellerId: "user-ann", steps: [] })).toEqual(base);
    const fresh = ok({ type: "postTicket", qty: 1, ask: "30", event: { kind: "event", title: "Spring Gala", start: "2026-12-04", id: EV1, createdBy: "user-bob", removedAt: 1, type: "createEvent", policy: "official" } });
    expect(fresh).toEqual({ type: "postTicket", qty: 1, ask: "30", event: { kind: "event", title: "Spring Gala", start: "2026-12-04" } });
    expect(refusal({ ...base, file: { name: "t.pdf", size: 1, hash: "abcdef0123456789" } })).toBe(FILE_ERROR);
    expect(refusal({ ...base, event: { kind: "event", title: "Spring Gala", start: "2026-12-04" } })).toBe(INVALID_ACTION_ERROR); // both at once
    expect(refusal({ type: "postTicket", qty: 1, ask: "30", event: { kind: "concert", title: "Spring Gala", start: "2026-12-04" } })).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "postTicket", qty: 1, ask: "30", event: "Spring Gala" })).toBe(INVALID_ACTION_ERROR);
    expect(refusal({ type: "postTicket", qty: 1, ask: "30", event: { kind: "event", title: "Gala\u0000", start: "2026-12-04" } })).toBe(TEXT_ERROR);
    expect(refusal({ ...base, note: "\ud800" })).toBe(TEXT_ERROR);
    expect(refusal({ ...base, departsAt: "2026-02-30T10:00" })).toBe(INVALID_ACTION_ERROR);
    for (const eventId of ["@0", "ev-1", "l0123456789abcdef", "__none", "", 5, null]) expect(refusal({ ...base, eventId }), String(eventId)).toBe(INVALID_ACTION_ERROR);
    for (const tier of ["t4", "T1", "@0", 1]) expect(refusal({ ...base, tier }), String(tier)).toBe(INVALID_ACTION_ERROR);
    for (const qty of [0, 1.5, 100, "1", null]) expect(refusal({ ...base, qty }), String(qty)).toBe(INVALID_ACTION_ERROR);
    // The follow-up (§9n): a quantity left out is no longer a refusal: the engine reads one.
    expect(ok({ type: "postTicket", eventId: EV1, ask: "30" })).toEqual({ type: "postTicket", eventId: EV1, ask: "30" });
    // Neither an event nor a new one is the seller not having chosen yet: the engine says so, in words.
    expect(ok({ type: "postTicket", qty: 1, ask: "30" })).toEqual({ type: "postTicket", qty: 1, ask: "30" });
    // The date of a new event is the engine's to check, with its own message (as for createEvent).
    expect(ok({ type: "postTicket", qty: 1, ask: "30", event: { kind: "event", title: "Spring Gala", start: "" } }).type).toBe("postTicket");
  });

  it("inside seq its event may be an earlier step's, and the actions log keeps ids only", () => {
    const step = { type: "postTicket", eventId: "@0", qty: 1, ask: "30", method: "file" };
    ok({ type: "seq", steps: [{ action: { type: "createEvent", kind: "event", title: "Gala", start: "2026-12-04" } }, { action: step }] });
    expect(refusal({ type: "seq", steps: [{ action: step }] })).toBe(INVALID_ACTION_ERROR); // no earlier step to name
    expect(actionIds(ok({ type: "postTicket", eventId: EV1, tier: "t2", qty: 1, ask: "30", note: "call me at 555-0100" }))).toEqual({ eventId: EV1, tier: "t2" });
    expect(actionIds(ok({ type: "postTicket", qty: 1, ask: "30", event: { kind: "event", title: "Spring Gala", start: "2026-12-04", notes: "ask for Ann" } }))).toEqual({});
  });
});
