// §9s item 1 (step SELL4-L1), the engine half of "remove the Next 7 days / Next 30 days browse controls on both boards":
// - availableNow (Available in the shared market) never reads the event-date choice, whatever a kept state says: the feed is what
//   can be taken now, goods included, and nothing reports an event filter as on.
// - wantedNow (Wanted in the shared market) never reads the needed-by choice: every live public request shows, for the category,
//   the search, the club and the goods category, in Wanted's sort.
// - Event dates, request deadlines and expiry rules still apply: an event past its day, a request past its deadline and a train
//   that has left are gone from both.
// - availableFor and wantedFor, which the development preview keeps with its own controls, are unchanged.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { WorldState } from "../../engine/index.js";
import { must, resetEngine } from "./helpers/invite.js";
import { ServerWorld, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, dateAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

function installed<T>(state: { serverNow: number }, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as WorldState);
  try { return fn(state as unknown as WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}
type Feed = { cards: string[]; rows: string[]; evFilters: boolean };
const read = (a: E.AvailableResult): Feed => ({ cards: a.cards.map((c) => c.key), rows: a.lookup.map((r) => r.ev.id), evFilters: a.evFilters });
const available = (w: ServerWorld, viewer: TestPerson, d: Partial<E.Discovery> = {}): Feed =>
  installed(viewOf(w, viewer), (s) => read(E.availableNow(s, viewer.userId, { ...E.DISC0, ...d })));
const availablePreview = (w: ServerWorld, viewer: TestPerson, d: Partial<E.Discovery> = {}): Feed =>
  installed(viewOf(w, viewer), (s) => read(E.availableFor(s, viewer.userId, { ...E.DISC0, ...d })));
const wanted = (w: ServerWorld, viewer: TestPerson, d: Partial<E.Discovery> = {}): string[] =>
  installed(viewOf(w, viewer), (s) => E.wantedNow(s, { ...E.DISC0, ...d }).map((i) => i.id));
const wantedPreview = (w: ServerWorld, viewer: TestPerson, d: Partial<E.Discovery> = {}): string[] =>
  installed(viewOf(w, viewer), (s) => E.wantedFor(s, { ...E.DISC0, ...d }).map((i) => i.id));

const act = (w: ServerWorld, who: TestPerson, a: Record<string, unknown>, what: string): string => must(w.ok(who.userId, a as unknown as E.Action).id, what);
const plain = (w: ServerWorld, who: TestPerson, title: string, days: number): string => act(w, who, { type: "createEvent", kind: "event", title, start: dateAfter(w.now, days) }, title);
const train = (w: ServerWorld, who: TestPerson, title: string, days: number, hhmm: string): string => act(w, who, { type: "createEvent", kind: "train", title, start: `${dateAfter(w.now, days)}T${hhmm}` }, title);

/** Ann's gala in 15 days and Bob's train in 6, each with one ticket; an "Oysters Night" in 9 days with none; Bob's free desk lamp. */
function market() {
  const w = new ServerWorld({ people: PEOPLE6 });
  const gala = plain(w, ANN, "Fall Gala", 15);
  w.listTickets(ANN, gala, { ask: "25", paid: "25" });
  const rail = train(w, BOB, "Acela PHL to NYC", 6, "09:05");
  w.advance(1000);
  w.listTickets(BOB, rail, { ask: "40", paid: "40", method: "file" });
  const oys = plain(w, ANN, "Oysters Night", 9);
  w.advance(1000);
  const lamp = act(w, BOB, { type: "postItem", data: { title: "Desk lamp", price: "0" } }, "lamp");
  return { w, gala, rail, oys, lamp };
}
/** The same market with four requests on Wanted: the train (ends at its departure, 6 days on), the gala with an earlier end (3 days
    on), the Oysters event (9 days on) and an item (ends in 40 days). */
function marketWithRequests() {
  const m = market(), { w } = m;
  const rTrain = act(w, CAT, { type: "postRequest", eventId: m.rail, qty: 1 }, "the train request"); w.advance(1000);
  const rGala = act(w, DAN, { type: "postRequest", eventId: m.gala, qty: 1, budget: "30", expires: dateAfter(w.now, 3) }, "the gala request"); w.advance(1000);
  const rOys = act(w, CAT, { type: "postRequest", eventId: m.oys, qty: 2 }, "the oysters request"); w.advance(1000);
  const rLock = act(w, DAN, { type: "saveInterest", data: { goods: { title: "Bike lock", cat: "Sports & outdoor" }, qty: 1, budget: "20", note: "", expires: dateAfter(w.now, 40) } }, "the item request");
  return { ...m, rTrain, rGala, rOys, rLock };
}

describe("Available has no event-date control in the shared market (9s item 1)", () => {
  it("never reads the event-date choice: a kept \"Next 7 days\" or \"Next 30 days\" gives the whole feed, goods included", () => {
    const { w, gala, rail, lamp } = market();
    const whole = { cards: [lamp, rail, gala], rows: [], evFilters: false };
    expect(available(w, DAN)).toEqual(whole);
    for (const when of ["week", "month", "any", "anything"]) expect(available(w, DAN, { when }), when).toEqual(whole);
    // With the removed availability choice as well (9r), and with a category or a search beside it.
    expect(available(w, DAN, { when: "week", avail: "waitlist" })).toEqual(whole);
    expect(available(w, DAN, { when: "week", cat: "events" })).toEqual({ cards: [gala], rows: [], evFilters: false }); // 15 days on: still there
    expect(available(w, DAN, { when: "week", q: "oysters" }).rows).toHaveLength(1); // 9 days on: still found, as a row
  });

  it("the preview's own function still filters by the event date, as its control does", () => {
    const { w, gala, rail } = market();
    expect(availablePreview(w, DAN, { when: "week" })).toEqual({ cards: [rail], rows: [], evFilters: true }); // no goods while it's on
    expect(availablePreview(w, DAN, { when: "month" })).toEqual({ cards: [rail, gala], rows: [], evFilters: true });
  });

  it("an event's own date still applies: after the train has left and the gala's day has passed, neither is in the feed", () => {
    const { w, gala, rail, lamp } = market();
    w.advance(6 * DAY); // noon on the train's day: it left at 9:05 AM
    expect(available(w, DAN, { when: "week" })).toEqual({ cards: [lamp, gala], rows: [], evFilters: false });
    w.advance(10 * DAY); // the day after the gala; the lamp's 14 days are over too
    expect(available(w, DAN, { when: "month" }).cards).not.toContain(gala);
    expect(available(w, DAN).cards).not.toContain(rail);
  });
});

describe("Wanted has no needed-by control in the shared market (9s item 1)", () => {
  it("never reads the needed-by choice: a kept \"Next 7 days\" or \"Next 30 days\" gives every live request", () => {
    const { w, rTrain, rGala, rOys, rLock } = marketWithRequests();
    const every = [rLock, rOys, rGala, rTrain]; // newest first
    expect(wanted(w, ANN)).toEqual(every);
    for (const need of ["week", "month", "any", "anything"]) expect(wanted(w, ANN, { need }), need).toEqual(every);
    expect(wanted(w, ANN, { need: "week", when: "week", avail: "waitlist" })).toEqual(every);
  });

  it("keeps the category, the goods category, the search and the sorts", () => {
    const { w, rTrain, rGala, rOys, rLock } = marketWithRequests();
    expect(wanted(w, ANN, { need: "week", cat: "trains" })).toEqual([rTrain]);
    expect(wanted(w, ANN, { need: "week", cat: "events" })).toEqual([rOys, rGala]);
    expect(wanted(w, ANN, { need: "week", cat: "goods" })).toEqual([rLock]);
    expect(wanted(w, ANN, { cat: "goods", goodsCat: "Furniture" })).toEqual([]);
    expect(wanted(w, ANN, { need: "week", q: "oysters" })).toEqual([rOys]);
    expect(wanted(w, ANN, { need: "month", sortW: "deadline" })).toEqual([rGala, rTrain, rOys, rLock]); // 3, 6, 9 and 40 days on
    expect(wanted(w, ANN, { sortW: "budget" }).slice(0, 2)).toEqual([rGala, rLock]); // $30, then $20; those without a budget after
  });

  it("the preview's own function still filters by needed-by, as its control does", () => {
    const { w, rTrain, rGala, rOys, rLock } = marketWithRequests();
    expect(wantedPreview(w, ANN, { need: "week" })).toEqual([rGala, rTrain]); // ending within 7 days
    expect(wantedPreview(w, ANN, { need: "month" })).toEqual([rOys, rGala, rTrain]);
    expect(wantedPreview(w, ANN)).toEqual([rLock, rOys, rGala, rTrain]);
  });

  it("a request's own deadline and its event's cutoff still end it", () => {
    const { w, rTrain, rGala, rOys, rLock } = marketWithRequests();
    w.advance(4 * DAY); // the gala request's earlier end (3 days on) has passed
    expect(wanted(w, ANN, { need: "month" })).toEqual([rLock, rOys, rTrain]);
    expect(wanted(w, ANN)).not.toContain(rGala);
    w.advance(3 * DAY); // the train left the day before
    expect(wanted(w, ANN)).toEqual([rLock, rOys]);
    w.advance(3 * DAY); // the day after the Oysters event
    expect(wanted(w, ANN)).toEqual([rLock]);
  });
});
