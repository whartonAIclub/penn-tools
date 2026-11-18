// Wanted for a signed-out visitor, without its "Needed by" control (USER-INSTRUCTIONS §9s item 1), the page's rules with no page in
// them (_lib/wanted.js): the rows are every live public request for the category, the search, the club and the goods category, in
// Wanted's sort; a needed-by choice kept from before is never read; a request's own deadline and its event's cutoff still end it.
// The signed-in half is the engine's wantedNow (tools/handoff/src/__tests__/l1-browse.test.ts).
// Pure functions over the engine with a set clock, on a guest view written out here; no DOM, no server, no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { guestReqText, guestWantedLive, guestWantedRows, guestWantedTitle, wantedNeed, wantedWhen } from "./wanted";

const T0 = Date.UTC(2026, 10, 16, 15, 0); // Mon Nov 16, 2026, 10:00 AM in Philadelphia
const DAY = 86_400_000;
const day = (n: number) => E.isoDate(T0 + n * DAY);
type World = Parameters<typeof E.applyWorld>[0];
type Disc = typeof E.DISC0;
const d = (patch: Partial<Record<keyof Disc, unknown>> = {}): Disc => ({ ...E.DISC0, ...patch }) as Disc;

/** A guest view's records, as the server sends them (C-CONTRACT §7): published facts only; a request has no person, note or budget. */
const ev = (id: string, title: string, start: string, over: Record<string, unknown> = {}) => ({ id, kind: "event", title, club: "", cat: "", start, attend: "all", tiers: [], perPerson: 2, deadline: null, ...over });
const GALA = "ev-00000000000000a1", OYS = "ev-00000000000000a2", AM = "ev-00000000000000a5", TREK = "ev-00000000000000a8";
const R_TRAIN = "iso-00000000000000d1", R_GALA = "iso-00000000000000d2", R_OYS = "iso-00000000000000d3", R_LOCK = "iso-00000000000000d4", R_TREK = "iso-00000000000000d5";
const MARKET = {
  events: [
    ev(GALA, "Fall Gala", day(15)), ev(OYS, "Oysters Night", day(9), { club: "Wharton Food Club" }),
    ev(AM, "Acela PHL to NYC", `${day(6)}T09:05`, { kind: "train", cat: "Travel" }),
    ev(TREK, "Lisbon Spring Trek", `${day(40)}T08:00`, { kind: "trek", cat: "Treks & trips", club: "Wharton Travel Club" }),
  ],
  listings: [], goods: [],
  wanted: [
    { id: R_TRAIN, eventId: AM, qty: 1, expires: `${day(6)}T09:05`, createdAt: T0 - 5000 },   // ends at the departure
    { id: R_GALA, eventId: GALA, qty: 1, expires: day(3), createdAt: T0 - 4000 },             // an earlier end
    { id: R_OYS, eventId: OYS, qty: 2, expires: `${day(9)}T23:59`, createdAt: T0 - 3000 },
    { id: R_LOCK, eventId: null, goods: { title: "Bike lock", cat: "Sports & outdoor" }, qty: 1, expires: day(40), createdAt: T0 - 2000 },
    { id: R_TREK, eventId: TREK, qty: 1, expires: day(20), createdAt: T0 - 1000 },
  ],
};
/** The market as a guest's page holds it at `at` (the server's clock): installed in the engine as App does (setLiveClock, applyWorld). */
function guestAt(at = T0) {
  const view = { protocol: E.HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-l1", version: 1, serverNow: at, nextRefreshAt: null, ...MARKET, people: {} };
  E.setLiveClock(() => at); E.applyWorld(view as unknown as World);
  return view as unknown as Parameters<typeof guestWantedRows>[0];
}
const ids = (rows: ReturnType<typeof guestWantedRows>) => rows.map((w: { id: string }) => w.id);
const EVERY = [R_TREK, R_LOCK, R_OYS, R_GALA, R_TRAIN]; // newest first
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("a visitor's Wanted has no needed-by control (9s item 1)", () => {
  it("shows every live request, newest first", () => {
    expect(ids(guestWantedRows(guestAt(), d()))).toEqual(EVERY);
  });

  it("never reads the needed-by choice: a kept \"Next 7 days\" or \"Next 30 days\" gives the same list", () => {
    const s = guestAt();
    for (const need of ["week", "month", "any", "anything"]) expect(ids(guestWantedRows(s, d({ need }))), need).toEqual(EVERY);
    expect(ids(guestWantedRows(s, d({ need: "week", when: "week", avail: "waitlist" })))).toEqual(EVERY);
  });

  it("keeps the category, the goods category, the club, the search and the deadline sort; never a budget sort", () => {
    const s = guestAt();
    expect(ids(guestWantedRows(s, d({ need: "week", cat: "trains" })))).toEqual([R_TRAIN]);
    expect(ids(guestWantedRows(s, d({ need: "week", cat: "events" })))).toEqual([R_OYS, R_GALA]);
    expect(ids(guestWantedRows(s, d({ need: "week", cat: "treks" })))).toEqual([R_TREK]);
    expect(ids(guestWantedRows(s, d({ need: "week", cat: "goods" })))).toEqual([R_LOCK]);
    expect(ids(guestWantedRows(s, d({ cat: "goods", goodsCat: "Furniture" })))).toEqual([]);
    expect(ids(guestWantedRows(s, d({ need: "week", q: "oysters" })))).toEqual([R_OYS]);
    const food = E.CLUB_MENU.find((c) => c.label === "Wharton Food Club")!.k; // By club's key for it in this market
    expect(ids(guestWantedRows(s, d({ need: "week", club: food })))).toEqual([R_OYS]);
    expect(ids(guestWantedRows(s, d({ need: "month", sortW: "deadline" })))).toEqual([R_GALA, R_TRAIN, R_OYS, R_TREK, R_LOCK]); // 3, 6, 9, 20 and 40 days on
    expect(ids(guestWantedRows(s, d({ sortW: "budget" })))).toEqual(EVERY); // a guest has no budgets: newest first
  });

  it("a request's own deadline and its event's cutoff still end it", () => {
    expect(ids(guestWantedRows(guestAt(T0 + 4 * DAY), d({ need: "month" })))).toEqual([R_TREK, R_LOCK, R_OYS, R_TRAIN]); // the gala request's earlier end has passed
    expect(ids(guestWantedRows(guestAt(T0 + 7 * DAY), d()))).toEqual([R_TREK, R_LOCK, R_OYS]);                             // the train has left
    const s = guestAt(T0 + 10 * DAY);                                                                                      // the day after the Oysters event
    expect(ids(guestWantedRows(s, d()))).toEqual([R_TREK, R_LOCK]);
    expect(guestWantedLive(MARKET.wanted[2] as never)).toBe(false);
  });

  it("reads only what a guest's view holds of a request: the event's or item's name, club and category", () => {
    guestAt();
    expect(guestWantedTitle(MARKET.wanted[0] as never)).toBe("Acela PHL to NYC");
    expect(guestWantedTitle(MARKET.wanted[3] as never)).toBe("Bike lock");
    expect(guestReqText(MARKET.wanted[2] as never)).toBe("oysters night wharton food club");
    expect(guestReqText(MARKET.wanted[3] as never)).toBe("bike lock sports & outdoor");
  });
});

// §9s item 7: a Wanted card's words, signed in or not. Its date and how many go together; a stated budget and a deadline show only
// when they say something: the deadline when it's earlier than the event's own cutoff (so no date shows twice), or an item request's
// (its only date). A guest's view has no budget, so a guest's card never shows one.
describe("a Wanted card's lines (9s item 7)", () => {
  type Row = (typeof MARKET.wanted)[number];
  const W: readonly Row[] = MARKET.wanted;
  /** The request at i in MARKET.wanted, or the test stops: the rows below are written out above, so a missing one is a broken test. */
  const row = (i: number): Row => { const r = W[i]; if (!r) throw new Error(`no request at ${i}`); return r; };
  /** An event the engine holds (guestAt installs them), or the test stops. */
  const event = (id: string) => { const e = E.EV[id]; if (!e) throw new Error(`no event ${id}`); return e; };
  const evOf = (w: { eventId: string | null }) => (w.eventId ? E.EV[w.eventId] : null);
  const when = (w: Row) => wantedWhen(w as never, evOf(w) as never);
  const need = (w: object, e: unknown) => wantedNeed(w as never, e as never);

  it("groups the date (with a train's departure time) and how many", () => {
    guestAt();
    expect(when(row(1))).toEqual({ when: E.fmtDay(day(15)), qty: "1 ticket" });                          // the gala, a date alone
    expect(when(row(0))).toEqual({ when: `${E.fmtDay(day(6))} · ${E.fmtTime(`${day(6)}T09:05`)}`, qty: "1 ticket" }); // the departure time kept
    expect(when(row(2))).toEqual({ when: E.fmtDay(day(9)), qty: "2 tickets" });
    expect(when(row(4))).toEqual({ when: E.fmtRange(event(TREK)), qty: "1 spot" });                     // a trek's place is a spot
    expect(when(row(3))).toEqual({ when: "Sports & outdoor", qty: "1 item" });                           // an item: its category
    expect(wantedWhen({ qty: 2, missing: { title: "Old one", when: day(5) } } as never, null)).toEqual({ when: E.fmtDay(day(5)), qty: "2 tickets" });
    expect(wantedWhen({ qty: 1, missing: { title: "Old one", flexible: true } } as never, null)).toEqual({ when: "Flexible dates", qty: "1 ticket" });
  });

  it("shows a deadline only when it's earlier than the event's own end, so no date shows twice", () => {
    guestAt();
    expect(need(row(1), evOf(row(1))).until).toBe(`Needed by ${E.fmtDay(day(3))}`);   // the gala: 3 days on, the event 15
    expect(need(row(4), evOf(row(4))).until).toBe(`Needed by ${E.fmtDay(day(20))}`);  // the trek: 20 days on, the trek 40
    expect(need(row(2), evOf(row(2))).until).toBeNull();                              // runs to the event's day: nothing more to say
    expect(need(row(0), evOf(row(0))).until).toBeNull();                              // runs to the departure
    expect(need({ ...row(2), expires: day(9) }, evOf(row(2))).until).toBeNull();      // the date alone, the same day
    expect(need({ ...row(2), expires: null }, evOf(row(2))).until).toBeNull();
    expect(need(row(3), null).until).toBe(`Needed by ${E.fmtDay(day(40))}`);          // an item request's only date
    expect(need({ qty: 1, expires: day(4), missing: { title: "Old one", when: day(5) } }, null).until).toBe(`Needed by ${E.fmtDay(day(4))}`);
    expect(need({ qty: 1, expires: day(5), missing: { title: "Old one", when: day(5) } }, null).until).toBeNull();
  });

  it("shows a stated budget, never one that isn't there, and never in a guest's view", () => {
    guestAt();
    for (const w of W) expect(need(w, evOf(w)).budget, w.id).toBeNull(); // the guest view has no budgets
    expect(need({ ...row(1), budget: 30 }, evOf(row(1))).budget).toBe("Up to $30");
    expect(need({ ...row(1), budget: 0 }, evOf(row(1))).budget).toBe("Up to $0");    // an explicit $0 is what was stated
    expect(need({ ...row(1), budget: null }, evOf(row(1))).budget).toBeNull();        // blank is no budget, never $0
    expect(need({ ...row(3), budget: 20 }, null).budget).toBe("Up to $20");
    expect(need({ ...row(4), budget: 900 }, { ...event(TREK), premium: true }).budget).toBe("Up to $900 reimbursement");
  });
});
