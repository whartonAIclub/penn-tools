// SELL7-O1 (USER-INSTRUCTIONS §9y): the club, more visible. The page's rules with no page in them:
// - _lib/cards.js: the clubs a card names on its own line (cardClubs: an event's own club, or, for one that names none, the clubs named
//   on its open listings, as By club and the search read them; a request for an event not on Handoff, the club its requester typed;
//   never a train's carrier), and By club's key for a club a card names, so a tap applies it (clubKeyFor);
// - _lib/sell.js: the club or organizer is on the form itself, wherever it's asked (clubPlace), so a kept form's club no longer opens
//   Optional details (newMoreUsed).
// Pure functions over the engine's catalog: a small live market installed with a set clock; no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { cardClubs, clubKeyFor } from "./cards";
import { NEW0, clubPlace, newMoreUsed } from "./sell";
import { guestAvailable } from "./available";
import { guestWantedRows } from "./wanted";

const T0 = Date.UTC(2026, 10, 18, 15, 0); // Wed Nov 18, 2026, 10:00 AM in Philadelphia
const DAY = 86_400_000;
const day = (n: number) => E.isoDate(T0 + n * DAY);
type World = Parameters<typeof E.applyWorld>[0];
type Disc = typeof E.DISC0;
const d = (patch: Partial<Record<keyof Disc, unknown>> = {}): Disc => ({ ...E.DISC0, ...patch }) as Disc;

const stored = (n: number, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${String(n).padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const FORMAL = stored(1, "Spring Formal", day(15), { club: "WGA" });
const GALA = stored(2, "Fall Gala", day(17), { club: "GCC" });
const OYS = stored(3, "Oysters Night", day(9)); // names no club; a listing names one
const COMEDY = stored(4, "Comedy Hour", day(13)); // names no club, and no listing names one
const TRAIN = stored(5, "Acela PHL to NYC", `${day(6)}T09:05`, { kind: "train", cat: "Travel", club: "Amtrak", methods: ["file"], noOrganizer: true, perPerson: 2 });
const EVENTS = [FORMAL, GALA, OYS, COMEDY, TRAIN];
const listing = (id: string, eventId: string, ask: number, over: Record<string, unknown> = {}) => ({ id, eventId, tier: null, ask, obo: false, available: 1, createdAt: T0 - 2000, ...over });
const want = (id: string, eventId: string) => ({ id, eventId, qty: 1, expires: null, createdAt: T0 - 500 });
const LISTINGS = [listing("l00000000000000a1", FORMAL.id, 40), listing("l00000000000000a2", OYS.id, 22, { club: "O1 Wine Society" }), listing("l00000000000000a3", COMEDY.id, 18), listing("l00000000000000a4", GALA.id, 25)];
const WANTED = [want("i00000000000000b1", FORMAL.id), want("i00000000000000b2", OYS.id), want("i00000000000000b3", COMEDY.id)];
/** The market as a signed-out visitor's page holds it (the same catalog a signed-in page installs). */
function guest() {
  const view = { protocol: E.HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-o1", version: 1, serverNow: T0, nextRefreshAt: null,
    events: EVENTS, listings: LISTINGS, goods: [], wanted: WANTED, people: {} };
  E.setLiveClock(() => T0); E.applyWorld(view as unknown as World);
  return view;
}
const EV = (id: string) => EVENTS.find((e) => e.id === id) as unknown as Parameters<typeof cardClubs>[0];

beforeEach(() => { guest(); });
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("the clubs a card names on its own line (9y)", () => {
  it("an event's own club", () => {
    expect(cardClubs(EV(FORMAL.id))).toEqual(["WGA"]);
    expect(cardClubs(EV(GALA.id))).toEqual(["GCC"]);
  });
  it("for an event that names none, the club its seller named on an open listing: what By club and the search read", () => {
    expect(cardClubs(EV(OYS.id))).toEqual(["O1 Wine Society"]);
    expect(cardClubs(EV(OYS.id))).toEqual(E.eventClubs(EV(OYS.id) as never));
  });
  it("none for an event no one has named a club for, and none for a train (its carrier isn't a club)", () => {
    expect(cardClubs(EV(COMEDY.id))).toEqual([]);
    expect(cardClubs(EV(TRAIN.id))).toEqual([]);
  });
  it("a request for an event not on Handoff: the club its requester typed, trimmed; blank is none", () => {
    expect(cardClubs(null, "  Penn   Chess Club ")).toEqual(["Penn Chess Club"]);
    for (const v of ["", "   ", null, undefined]) expect(cardClubs(null, v as string)).toEqual([]);
  });
});

describe("a tap on a card's club applies it in By club (9y)", () => {
  const label = (k: string | null) => (k ? (E.clubOf(k) || { label: null }).label : null);
  it("a club on a card has By club's key, whether it's an event's own or a listing's", () => {
    expect(label(clubKeyFor("WGA"))).toBe("WGA");
    expect(label(clubKeyFor("GCC"))).toBe("GCC");
    expect(label(clubKeyFor("O1 Wine Society"))).toBe("O1 Wine Society");
  });
  it("a club spelled another way finds the same club; one By club doesn't list has no key (it shows as plain text)", () => {
    expect(clubKeyFor("gcc")).toBe(clubKeyFor("GCC"));
    expect(clubKeyFor(" W.G.A. ")).toBe(clubKeyFor("WGA"));
    expect(clubKeyFor("Some Other Club")).toBeNull();
    for (const v of ["", "  ", null, undefined]) expect(clubKeyFor(v as string)).toBeNull();
  });
  it("the key narrows Available and Wanted to that club: each card's club leads back to its own card", () => {
    const s = guest() as unknown as Parameters<typeof guestAvailable>[0];
    const cards = (k: string | null) => guestAvailable(s, d({ club: k })).cards.map((c) => c.key);
    const wanted = (k: string | null) => (guestWantedRows(s as never, d({ club: k })) as unknown as { id: string }[]).map((w) => w.id);
    expect(cards(clubKeyFor("WGA"))).toEqual([FORMAL.id]);
    expect(cards(clubKeyFor("O1 Wine Society"))).toEqual([OYS.id]);
    expect(wanted(clubKeyFor("WGA"))).toEqual(["i00000000000000b1"]);
    expect(wanted(clubKeyFor("O1 Wine Society"))).toEqual(["i00000000000000b2"]);
  });
});

describe("the club or organizer is on the form itself (9y)", () => {
  it("wherever it's asked: not in Optional details, whether a restriction needs it or not", () => {
    for (const need of [false, true]) for (const reveal of [false, true]) expect(clubPlace({ kind: "event", need, reveal })).toBe("form");
  });
  it("a train names no organizer", () => {
    expect(clubPlace({ kind: "train", need: false, reveal: false })).toBeNull();
    expect(clubPlace({ kind: "train", need: true, reveal: true })).toBeNull();
  });
  it("a kept form's club no longer opens Optional details; its other details still do", () => {
    expect(newMoreUsed({ ...NEW0, date: "2026-12-06", club: "Jazz Society" })).toBe(false);
    expect(newMoreUsed({ ...NEW0, date: "2026-12-06", club: "Jazz Society", venue: "Houston Hall" })).toBe(true);
  });
});
