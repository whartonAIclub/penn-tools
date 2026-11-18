// Available without the All / Available / Nothing listed selector (USER-INSTRUCTIONS §9r), the page's rules with no page in them
// (_lib/available.js): a signed-out visitor's Available (guestAvailable) shows what can be taken now, never reads the availability
// filter, finds an event with no tickets by its name only while requests for it are open, and keeps seatings and departures apart;
// and the words of such an event's row ("Request a ticket"). The signed-in half is the engine's availableNow
// (tools/handoff/src/__tests__/k3b-available.test.ts).
// Pure functions over the engine with a set clock, on a guest view written out here; no DOM, no server, no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { LOOKUP_HINT, guestAvailable, guestEventRows, guestStock, requestLabel } from "./available";

const T0 = Date.UTC(2026, 10, 16, 15, 0); // Mon Nov 16, 2026, 10:00 AM in Philadelphia
const DAY = 86_400_000;
const day = (n: number) => E.isoDate(T0 + n * DAY);
type World = Parameters<typeof E.applyWorld>[0];
type Disc = typeof E.DISC0;
const d = (patch: Partial<Record<keyof Disc, unknown>> = {}): Disc => ({ ...E.DISC0, ...patch }) as Disc;

/** A guest view's records, as the server sends them (C-CONTRACT §7): published facts only. */
const ev = (id: string, title: string, start: string, over: Record<string, unknown> = {}) => ({ id, kind: "event", title, club: "", cat: "", start, attend: "all", tiers: [], perPerson: 2, deadline: null, ...over });
const train = (id: string, title: string, start: string) => ev(id, title, start, { kind: "train", cat: "Travel" });
const listing = (id: string, eventId: string, ask: number, over: Record<string, unknown> = {}) => ({ id, eventId, tier: null, ask, obo: false, available: 1, createdAt: T0 - 2000, ...over });
const item = (id: string, title: string, price: number, over: Record<string, unknown> = {}) => ({ id, title, price, obo: false, until: day(14), noPickupBy: true, createdAt: T0 - 1000, ...over });

const GALA = "ev-00000000000000a1", OYS = "ev-00000000000000a2", EARLY = "ev-00000000000000a3", LATE = "ev-00000000000000a4", AM = "ev-00000000000000a5", PM = "ev-00000000000000a6", FORMAL = "ev-00000000000000a7";
const MARKET = {
  events: [
    ev(GALA, "Fall Gala", day(15)), ev(OYS, "Oysters Night", day(9)),
    ev(EARLY, "Comedy Hour", `${day(12)}T19:00`), ev(LATE, "Comedy Hour", `${day(12)}T21:30`),
    train(AM, "Acela PHL to NYC", `${day(6)}T09:05`), train(PM, "Acela PHL to NYC", `${day(6)}T15:10`),
    ev(FORMAL, "Winter Formal", day(20), { deadline: `${day(2)}T17:00` }),
  ],
  listings: [listing("l00000000000000b1", GALA, 25), listing("l00000000000000b2", AM, 40, { createdAt: T0 - 3000 })],
  goods: [item("g00000000000000c1", "Desk lamp", 0)],
};
/** The market as a guest's page holds it at `at` (the server's clock): installed in the engine as App does (setLiveClock, applyWorld). */
function guestAt(at = T0) {
  const view = { protocol: E.HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-k3b", version: 1, serverNow: at, nextRefreshAt: null, ...MARKET, wanted: [], people: {} };
  E.setLiveClock(() => at); E.applyWorld(view as unknown as World);
  return view as unknown as Parameters<typeof guestAvailable>[0];
}
const read = (a: ReturnType<typeof guestAvailable>) => ({ cards: a.cards.map((c) => c.key), rows: a.lookup.map((r) => r.ev.id) });
/** Why nothing can be done on an event now ("Event over", "Transfer window closed"), or null while it's open. */
const closedWhy = (id: string) => { const a = E.access(E.EV[id]!); return a.ok ? null : a.short; };
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("a visitor's Available shows what can be taken now (9r)", () => {
  it("the feed is the events with a ticket to take and the items on sale, newest first; events with none aren't in it", () => {
    const s = guestAt();
    expect(read(guestAvailable(s, d()))).toEqual({ cards: ["g00000000000000c1", GALA, AM], rows: [] });
    expect(guestStock(s, E.EV[GALA]!)).toBe(1);
    expect(guestStock(s, E.EV[OYS]!)).toBe(0);
  });

  it("never reads the availability filter: a kept \"None available\" or \"Available\" gives the same feed, goods included", () => {
    const s = guestAt();
    for (const avail of ["waitlist", "available", "all", "anything"]) {
      const a = guestAvailable(s, d({ avail }));
      expect(read(a), avail).toEqual({ cards: ["g00000000000000c1", GALA, AM], rows: [] });
      expect(a.evFilters, avail).toBe(false); // nothing for an empty state to call a filter
      expect(read(guestAvailable(s, d({ avail, q: "oysters" }))), avail + " + search").toEqual({ cards: [], rows: [OYS] });
    }
  });

  it("the other choices still work: a category and the sort; the event-date control is gone, so a kept one is never read (9s)", () => {
    const s = guestAt();
    expect(read(guestAvailable(s, d({ cat: "goods" }))).cards).toEqual(["g00000000000000c1"]);
    expect(read(guestAvailable(s, d({ cat: "trains" }))).cards).toEqual([AM]);
    for (const when of ["week", "month", "anything"]) {
      const kept = guestAvailable(s, d({ when }));
      expect([read(kept).cards, kept.evFilters], when).toEqual([["g00000000000000c1", GALA, AM], false]); // 9s: was [[AM], true] for "week" (the gala is 15 days on; goods were hidden while it was on)
    }
    expect(read(guestAvailable(s, d({ when: "week", q: "oysters" })))).toEqual({ cards: [], rows: [OYS] }); // 9 days on: still found
    expect(read(guestAvailable(s, d({ sortA: "price" }))).cards).toEqual(["g00000000000000c1", GALA, AM]); // free, $25, $40
  });
});

describe("a visitor's search still finds an event with no tickets, while requests for it are open (9r)", () => {
  it("is a row for that event", () => {
    const s = guestAt();
    expect(read(guestAvailable(s, d({ q: "Oysters" })))).toEqual({ cards: [], rows: [OYS] });
    expect(E.demandAllowed(E.EV[OYS]!)).toBe(true);
  });

  it("is gone after the event's day, though a search still reads it (guestEventRows)", () => {
    expect(read(guestAvailable(guestAt(T0 + 9 * DAY), d({ q: "Oysters" }))).rows).toEqual([OYS]); // its own day: open to 11:59 PM
    const s = guestAt(T0 + 10 * DAY);
    expect(closedWhy(OYS)).toBe("Event over");
    expect(read(guestAvailable(s, d({ q: "Oysters" })))).toEqual({ cards: [], rows: [] });
    expect(guestEventRows(s, { q: "Oysters" }).map((r) => r.ev.id)).toEqual([OYS]);
  });

  it("is gone after its transfer deadline, though the event is still ahead", () => {
    expect(read(guestAvailable(guestAt(), d({ q: "formal" }))).rows).toEqual([FORMAL]);
    const s = guestAt(T0 + 3 * DAY);
    expect(closedWhy(FORMAL)).toBe("Transfer window closed");
    expect(read(guestAvailable(s, d({ q: "formal" })))).toEqual({ cards: [], rows: [] });
  });

  it("two seatings are two rows, and a train's two departures are a card and a row, until each has left", () => {
    const s = guestAt();
    expect(read(guestAvailable(s, d({ q: "comedy" })))).toEqual({ cards: [], rows: [EARLY, LATE] });
    expect(read(guestAvailable(s, d({ q: "acela" })))).toEqual({ cards: [AM], rows: [PM] });
    const noon = guestAt(T0 + 6 * DAY + 2 * 3600e3); // noon on the trains' day: the morning one has left
    expect(read(guestAvailable(noon, d({ q: "acela" })))).toEqual({ cards: [], rows: [PM] });
  });
});

describe("the row's words (9r)", () => {
  it("offers \"Request a ticket\", or a spot on a trek", () => {
    guestAt();
    expect(requestLabel(E.EV[OYS]!)).toBe("Request a ticket");
    expect(requestLabel(E.EV[AM]!)).toBe("Request a ticket");
    expect(requestLabel({ ...E.EV[OYS]!, cat: "Treks & trips" })).toBe("Request a spot");
    expect(LOOKUP_HINT).toBe("Request a ticket, get notified privately, or open one for its details.");
  });
});
