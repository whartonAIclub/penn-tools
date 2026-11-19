// §9r (step SELL3-K3b), the engine half of "remove the All / Available / Nothing listed selector from Available":
// - availableNow is Available for the shared market: the feed is what can be taken now (events with a ticket to take, items on
//   sale), and the availability filter is never read, whatever a kept state says.
// - A search (or a club) still finds an event that's on Handoff with nothing to take, as a row, only while requests for it are
//   open: after its day, its departure or its transfer deadline it isn't in Available at all.
// - Every event is its own row: two seatings of one show and two departures of one train stay apart.
// - availableFor, which the development preview keeps, is unchanged.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { WorldState } from "../../engine/index.js";
import { must, reserved, resetEngine } from "./helpers/invite.js";
import { ServerWorld, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, T0, dateAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

function installed<T>(state: { serverNow: number }, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as WorldState);
  try { return fn(state as unknown as WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}
type Feed = { cards: string[]; rows: string[]; evFilters: boolean };
const read = (a: E.AvailableResult): Feed => ({ cards: a.cards.map((c) => c.key), rows: a.lookup.map((r) => r.ev.id), evFilters: a.evFilters });
/** Available in the shared market, as `viewer`'s page computes it from their view. */
const now = (w: ServerWorld, viewer: TestPerson, d: Partial<E.Discovery> = {}): Feed =>
  installed(viewOf(w, viewer), (s) => read(E.availableNow(s, viewer.userId, { ...E.DISC0, ...d })));
/** The same view through availableFor, which the preview keeps. */
const preview = (w: ServerWorld, viewer: TestPerson, d: Partial<E.Discovery> = {}): Feed =>
  installed(viewOf(w, viewer), (s) => read(E.availableFor(s, viewer.userId, { ...E.DISC0, ...d })));

/** Why nothing can be done on an event now ("Event over", "Transfer window closed"), or null while it's open. */
const closedWhy = (w: ServerWorld, id: string): string | null => w.run(() => { const a = E.access(must(E.EV[id], id)); return a.ok ? null : a.short; });

/** A plain event by its name and day, as the one-form Sell and Request add them. */
const plain = (w: ServerWorld, who: TestPerson, title: string, days: number, over: Record<string, unknown> = {}): string =>
  must(w.ok(who.userId, { type: "createEvent", kind: "event", title, start: dateAfter(w.now, days), ...over } as unknown as E.Action).id, title);
const timed = (w: ServerWorld, who: TestPerson, kind: "event" | "train", title: string, days: number, hhmm: string): string =>
  must(w.ok(who.userId, { type: "createEvent", kind, title, start: `${dateAfter(w.now, days)}T${hhmm}`, ...(kind === "event" ? { tiers: [{ label: "General admission", price: "25" }] } : {}) } as unknown as E.Action).id, title);

/** Ann's gala with one ticket, an "Oysters Night" with none, and Bob's free desk lamp. */
function market() {
  const w = new ServerWorld({ people: PEOPLE6 });
  const gala = plain(w, ANN, "Fall Gala", 15);
  const l = w.listTickets(ANN, gala, { ask: "25", paid: "25" });
  const oys = plain(w, ANN, "Oysters Night", 9);
  w.advance(1000);
  const lamp = must(w.ok(BOB.userId, { type: "postItem", data: { title: "Desk lamp", price: "0" } } as unknown as E.Action).id, "lamp");
  return { w, gala, l, oys, lamp };
}

describe("Available shows what can be taken now (9r)", () => {
  it("the feed is the events with a ticket to take and the items on sale; an event with nothing listed isn't in it", () => {
    const { w, gala, lamp } = market();
    expect(now(w, DAN)).toEqual({ cards: [lamp, gala], rows: [], evFilters: false });
  });

  it("a ticket held for a buyer and an item on hold leave the feed", () => {
    E.setInviteSwitch(true);
    const { w, gala, l, lamp } = market();
    reserved(w, ANN, CAT, l);
    expect(now(w, DAN).cards).toEqual([lamp]);
    expect(now(w, DAN, { q: "gala" })).toMatchObject({ cards: [], rows: [gala] }); // found by name, as a row: requests are open
    const r = must(w.ok(CAT.userId, { type: "requestItem", id: lamp, msg: "", shareContact: true } as unknown as E.Action).id, "the item request");
    w.ok(BOB.userId, { type: "acceptItemReq", id: r, shareContact: true } as unknown as E.Action);
    expect(now(w, DAN).cards).toEqual([]);
  });

  it("never reads the availability filter: a kept \"Nothing listed\" or \"Available\" gives the same feed, with the goods in it", () => {
    const { w, gala, lamp, oys } = market();
    for (const avail of ["waitlist", "available", "all", "anything"]) {
      expect(now(w, DAN, { avail }), avail).toEqual({ cards: [lamp, gala], rows: [], evFilters: false });
      expect(now(w, DAN, { avail, q: "oysters" }), avail + " + search").toEqual({ cards: [], rows: [oys], evFilters: false });
    }
    // The preview's own function still filters, as its selector does.
    expect(preview(w, DAN, { avail: "waitlist" })).toEqual({ cards: [], rows: [oys], evFilters: true });
    expect(preview(w, DAN, { avail: "available", q: "oysters" })).toEqual({ cards: [], rows: [], evFilters: true });
  });

  it("the other choices still work: a category and the sort; the event-date control is gone, so a kept one is never read (9s)", () => {
    const { w, gala, lamp } = market();
    expect(now(w, DAN, { cat: "goods" }).cards).toEqual([lamp]);
    expect(now(w, DAN, { cat: "events" }).cards).toEqual([gala]);
    expect(now(w, DAN, { when: "week" })).toEqual({ cards: [lamp, gala], rows: [], evFilters: false }); // 9s: was { cards: [], rows: [], evFilters: true } (the gala is 15 days on)
    expect(now(w, DAN, { when: "month" })).toEqual({ cards: [lamp, gala], rows: [], evFilters: false }); // 9s: was { cards: [gala], rows: [], evFilters: true }
    expect(preview(w, DAN, { when: "week" })).toEqual({ cards: [], rows: [], evFilters: true }); // the preview keeps its control
    expect(now(w, DAN, { sortA: "price" }).cards).toEqual([lamp, gala]); // free, then $25
  });
});

describe("a search still finds an event with no tickets, while requests for it are open (9r)", () => {
  it("is a row for the event, for the viewer and for its own seller alike", () => {
    const { w, oys } = market();
    for (const who of [DAN, ANN]) expect(now(w, who, { q: "Oysters" }), who.name).toEqual({ cards: [], rows: [oys], evFilters: false });
    expect(w.run(() => E.demandAllowed(must(E.EV[oys], "the event")))).toBe(true);
  });

  it("is gone after the event's day: no row and no card (the preview's function still finds it by name)", () => {
    const { w, oys } = market();
    w.advance(9 * DAY); // noon on its day: still open, to 11:59 PM
    expect(now(w, DAN, { q: "Oysters" }).rows).toEqual([oys]);
    w.advance(DAY);
    expect(closedWhy(w, oys)).toBe("Event over");
    expect(now(w, DAN, { q: "Oysters" })).toEqual({ cards: [], rows: [], evFilters: false });
    expect(now(w, ANN, { q: "Oysters" }).rows).toEqual([]);
    expect(preview(w, DAN, { q: "Oysters" }).rows).toEqual([oys]);
  });

  it("is gone after its transfer deadline, though the event is still ahead", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const formal = plain(w, ANN, "Winter Formal", 20, { deadline: `${dateAfter(T0, 2)}T17:00` });
    expect(now(w, DAN, { q: "formal" }).rows).toEqual([formal]);
    w.advance(3 * DAY);
    expect(closedWhy(w, formal)).toBe("Transfer window closed");
    expect(now(w, DAN, { q: "formal" })).toEqual({ cards: [], rows: [], evFilters: false });
  });

  it("is gone once a train has left, and a departure that's still ahead stays", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const am = timed(w, BOB, "train", "Acela PHL to NYC", 6, "09:05"), pm = timed(w, BOB, "train", "Acela PHL to NYC", 6, "15:10");
    expect(now(w, DAN, { q: "acela" }).rows).toEqual([am, pm]);
    w.advance(6 * DAY); // noon that day: the morning train has left
    expect(now(w, DAN, { q: "acela" }).rows).toEqual([pm]);
    w.advance(DAY);
    expect(now(w, DAN, { q: "acela" }).rows).toEqual([]);
  });

  it("a club's events with nothing listed are rows too, by the same rule", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const tasting = plain(w, ANN, "Autumn Tasting", 5, { club: "Wharton Wine Club" });
    const club = installed(viewOf(w, DAN), () => must(E.CLUB_MENU.find((c) => c.label === "Wharton Wine Club"), "the club").k);
    expect(now(w, DAN, { club })).toEqual({ cards: [], rows: [tasting], evFilters: false });
    w.advance(6 * DAY);
    expect(now(w, DAN, { club }).rows).toEqual([]);
  });
});

describe("seatings and departures stay separate (9r)", () => {
  it("two seatings of one show are two rows, in order, each its own event", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const early = timed(w, ANN, "event", "Comedy Hour", 12, "19:00"), late = timed(w, BOB, "event", "Comedy Hour", 12, "21:30");
    expect(now(w, DAN, { q: "comedy" })).toEqual({ cards: [], rows: [early, late], evFilters: false });
    const whens = w.run(() => [early, late].map((id) => E.fmtRange(must(E.EV[id], id))));
    expect(whens[0]).not.toBe(whens[1]);
    expect(whens.map((t) => /7:00 PM|9:30 PM/.exec(t)?.[0])).toEqual(["7:00 PM", "9:30 PM"]);
  });

  it("a departure with a ticket is a card and the other departure is a row", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const am = timed(w, BOB, "train", "Acela PHL to NYC", 6, "09:05"), pm = timed(w, BOB, "train", "Acela PHL to NYC", 6, "15:10");
    w.listTickets(BOB, am, { ask: "40", paid: "40", method: "file" });
    expect(now(w, DAN, { q: "acela" })).toEqual({ cards: [am], rows: [pm], evFilters: false });
    expect(now(w, DAN).cards).toEqual([am]); // the feed: only the departure with a ticket
  });
});
