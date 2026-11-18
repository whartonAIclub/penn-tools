// SELL6-N3 (USER-INSTRUCTIONS §9x item 5): the club stays optional and persistent. The page's rules with no page in them:
// - _lib/sell.js: a club as it's saved (clubAsSaved: trimmed, and a club already on Handoff in its own spelling whatever capitals,
//   spacing or punctuation were typed; any other name as typed; blank stays blank); what Post request sends for a new ordinary event
//   (its name, its date and, when one is named, its club: nothing else); what the request form keeps of a new event (requestNew); a
//   club that isn't a name is said at its own field and a blank one stops nothing; Sell's new event and a listing's club are saved
//   the same way;
// - _lib/available.js and _lib/wanted.js: a signed-out visitor's By club and search read the relevant saved affiliation (the
//   engine's eventClubs): an event's own club, or, for an event that names none, the club named on a listing that's open.
// The signed-in half and the server's are tools/handoff/src/__tests__/n3-club.test.ts.
// Pure functions over the engine's catalog: a small live market installed with a set clock; no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { NEW0, clubAsSaved, clubOptions, listingClubBody, newEventAction, newEventIssues, newMoreIds, requestAction, requestNew } from "./sell";
import { guestAvailable } from "./available";
import { guestWantedRows } from "./wanted";

const T0 = Date.UTC(2026, 10, 17, 20, 0); // Tue Nov 17, 2026, 3:00 PM in Philadelphia
const DAY = 86_400_000;
const day = (n: number) => E.isoDate(T0 + n * DAY);
type World = Parameters<typeof E.applyWorld>[0];
type Disc = typeof E.DISC0;
const d = (patch: Partial<Record<keyof Disc, unknown>> = {}): Disc => ({ ...E.DISC0, ...patch }) as Disc;
const nd = (over: Partial<Record<keyof typeof NEW0, string | boolean>> = {}) => ({ ...NEW0, ...over }) as typeof NEW0;
const issue = (rows: ReturnType<typeof newEventIssues>, id: string) => { const r = rows.find((x) => x[0] === id); return r ? { missing: r[1], wrong: r[2] } : null; };

const stored = (n: number, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${String(n).padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const GALA = stored(1, "Fall Gala", day(15), { club: "GCC" });
const WINE = stored(2, "Wine Tasting", day(18), { club: "Wharton Wine Club" });
const WINE2 = stored(3, "Wine and Cheese", day(19), { club: "Wharton Wine Club" });
const WINE3 = stored(4, "Port Night", day(20), { club: "wharton wine club" }); // the same club, typed another way, once
const OYS = stored(5, "Oysters Night", day(9)); // names no club
const CLAMS = stored(6, "Clam Bake", day(11)); // names no club either
const TRAIN = stored(7, "Acela PHL to NYC", `${day(6)}T09:05`, { kind: "train", cat: "Travel", club: "Amtrak", methods: ["file"], noOrganizer: true, perPerson: 2 });
const EVENTS = [GALA, WINE, WINE2, WINE3, OYS, CLAMS, TRAIN];
const install = () => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld(), events: EVENTS } as unknown as World); };

beforeEach(() => install());
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("a club as it's saved (9x item 5)", () => {
  it("trims the spaces around it and between its words", () => {
    expect(clubAsSaved("  Penn   Chess  Club ")).toBe("Penn Chess Club");
    expect(clubAsSaved("Penn Chess Club")).toBe("Penn Chess Club");
  });
  it("a club already on Handoff is saved in its own spelling, whatever capitals, spacing or punctuation were typed", () => {
    expect(clubAsSaved("gcc")).toBe("GCC");
    expect(clubAsSaved(" G.C.C. ")).toBe("GCC");
    expect(clubAsSaved("WHARTON WINE CLUB")).toBe("Wharton Wine Club");
    expect(clubAsSaved("wharton wine club")).toBe("Wharton Wine Club"); // its most used spelling, as the suggestions show it
    expect(clubOptions("wharton wi")).toEqual(["Wharton Wine Club"]);
  });
  it("any other name is free text, kept as typed; a train's operator is no club", () => {
    expect(clubAsSaved("Oyster Society")).toBe("Oyster Society");
    expect(clubAsSaved("amtrak")).toBe("amtrak");
  });
  it("blank stays blank: a club is optional", () => {
    for (const v of ["", "   ", null, undefined]) expect(clubAsSaved(v as string)).toBe("");
  });
});

describe("Post request for a new event sends its optional club with it (9x item 5)", () => {
  it("named, the club goes with the new event, as it's saved; nothing else rides along", () => {
    expect(requestAction({ eventId: "", text: "Chess Night", nd: nd({ date: day(12), club: "  Penn  Chess Club " }), qty: 1, budget: "", note: "", until: "" }))
      .toEqual({ type: "postRequest", event: { kind: "event", title: "Chess Night", start: day(12), club: "Penn Chess Club" }, qty: 1, budget: "", note: "" });
    const kept = nd({ date: day(12), club: "gcc", face: "40", venue: "Houston Hall", perPerson: "2", namesChecked: true, officialUrl: "example.com", cat: "Social" });
    expect((requestAction({ eventId: "", text: "Winter Ball", nd: kept, qty: 1, budget: "", note: "", until: "" }) as { event?: object }).event)
      .toEqual({ kind: "event", title: "Winter Ball", start: day(12), club: "GCC" });
  });
  it("blank, no club is sent: the event names none, and the post is the same as before", () => {
    for (const club of ["", "   "])
      expect(requestAction({ eventId: "", text: "Oysters", nd: nd({ date: day(9), club }), qty: 1, budget: "", note: "", until: "" }))
        .toEqual({ type: "postRequest", event: { kind: "event", title: "Oysters", start: day(9) }, qty: 1, budget: "", note: "" });
  });
  it("a train names no organizer, and an event on Handoff is sent by its id: its own club stands", () => {
    expect((requestAction({ eventId: "", text: "Acela 2150", nd: nd({ kind: "train", start: `${day(6)}T15:10`, club: "Amtrak" }), qty: 1, budget: "", note: "", until: "" }) as { event?: object }).event)
      .toEqual({ kind: "train", title: "Acela 2150", start: `${day(6)}T15:10` });
    expect(requestAction({ eventId: OYS.id, text: "ignored", nd: nd({ club: "Some Club" }), qty: 1, budget: "", note: "", until: "" }))
      .toEqual({ type: "postRequest", eventId: OYS.id, qty: 1, budget: "", note: "" });
  });
  it("the request form keeps a new event's club with its date, and still nothing else", () => {
    const kept = nd({ date: day(12), club: "Penn Chess Club", face: "abc", venue: "Houston Hall", perPerson: "2", namesChecked: true, officialUrl: "example.com", cat: "Social" });
    expect(requestNew(kept)).toEqual({ ...NEW0, date: day(12), club: "Penn Chess Club" });
    expect(requestNew(nd({ kind: "train", start: `${day(6)}T15:10`, club: "Amtrak" }))).toEqual({ ...NEW0, kind: "train", start: `${day(6)}T15:10` });
  });
  it("a blank club stops nothing; one that isn't a name is said at its own field, which sits in Optional details", () => {
    const blank = newEventIssues("Chess Night", requestNew(nd({ date: day(12) })) as typeof NEW0, T0, { idp: "iso", request: true });
    expect(blank.every(([, missing, wrong]) => !missing && !wrong)).toBe(true);
    const named = newEventIssues("Chess Night", requestNew(nd({ date: day(12), club: "Penn Chess Club" })) as typeof NEW0, T0, { idp: "iso", request: true });
    expect(named.every(([, missing, wrong]) => !missing && !wrong)).toBe(true);
    const bad = newEventIssues("Chess Night", requestNew(nd({ date: day(12), club: "x" })) as typeof NEW0, T0, { idp: "iso", request: true });
    expect(issue(bad, "iso-club")).toEqual({ missing: null, wrong: "Add who runs it: the club or organizer (2 to 80 characters), or leave it blank." });
    expect(bad.filter(([, missing, wrong]) => missing || wrong).map(([id]) => id)).toEqual(["iso-club"]);
    expect(newMoreIds("iso")).not.toContain("iso-club"); // the page itself places it there (as Sell does: clubPlace)
  });
  it("a club is never needed to post a request: no rule of the form asks for one", () => {
    const rows = newEventIssues("Chess Night", requestNew(nd({ date: day(12) })) as typeof NEW0, T0, { idp: "iso", request: true });
    expect(issue(rows, "iso-club")).toEqual({ missing: null, wrong: null });
  });
});

describe("Sell saves a club the same way (9x item 5)", () => {
  it("a new event's club and a listing's club are trimmed and matched to a club on Handoff", () => {
    expect((newEventAction("Winter Ball", nd({ date: day(30), club: " gcc " })) as { club?: string }).club).toBe("GCC");
    expect((newEventAction("Winter Ball", nd({ date: day(30), club: "" })) as { club?: string }).club).toBe("");
    expect(listingClubBody(" wharton WINE club ", false)).toEqual({ club: "Wharton Wine Club" });
    expect(listingClubBody("gcc", true)).toEqual({ club: "GCC", memberClub: "GCC" });
    expect(listingClubBody("  ", true)).toEqual({});
  });
});

describe("a visitor's By club and search read the saved affiliation (9x item 5)", () => {
  const listing = (id: string, eventId: string, ask: number, over: Record<string, unknown> = {}) => ({ id, eventId, tier: null, ask, obo: false, available: 1, createdAt: T0 - 2000, ...over });
  const want = (id: string, eventId: string) => ({ id, eventId, qty: 1, expires: null, createdAt: T0 - 500 });
  /** The market as a signed-out visitor's page holds it: the gala and an Oysters ticket whose seller named "Oyster Society". */
  function guest(listings: unknown[], wanted: unknown[] = []) {
    const view = { protocol: E.HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-n3", version: 1, serverNow: T0, nextRefreshAt: null,
      events: EVENTS, listings, goods: [], wanted, people: {} };
    E.setLiveClock(() => T0); E.applyWorld(view as unknown as World);
    return view as unknown as Parameters<typeof guestAvailable>[0];
  }
  const key = (label: string) => { const c = E.CLUB_MENU.find((x) => x.label === label); return c ? c.k : null; };
  const read = (a: ReturnType<typeof guestAvailable>) => ({ cards: a.cards.map((c) => c.key), rows: a.lookup.map((r) => r.ev.id) });

  it("By club lists a club named on an open listing of an event that names none, and finds that event", () => {
    const s = guest([listing("l00000000000000b1", GALA.id, 25), listing("l00000000000000b2", OYS.id, 30, { club: "Oyster Society" })]);
    expect(E.CLUB_MENU.map((c) => c.label)).toEqual(expect.arrayContaining(["GCC", "Wharton Wine Club", "Oyster Society"]));
    expect(read(guestAvailable(s, d({ club: key("Oyster Society") })))).toEqual({ cards: [OYS.id], rows: [] });
    expect(read(guestAvailable(s, d({ club: key("GCC") })))).toEqual({ cards: [GALA.id], rows: [] });
  });
  it("the search finds it by that club", () => {
    const s = guest([listing("l00000000000000b2", OYS.id, 30, { club: "Oyster Society" })]);
    expect(read(guestAvailable(s, d({ q: "oyster society" })))).toEqual({ cards: [OYS.id], rows: [] });
    expect(read(guestAvailable(s, d({ q: "wharton wine" }))).rows.sort()).toEqual([WINE.id, WINE2.id, WINE3.id].sort()); // by an event's own club, as before
  });
  it("with no club named anywhere, the event is under no club and still in the feed", () => {
    const s = guest([listing("l00000000000000b2", OYS.id, 30)]);
    expect(E.CLUB_MENU.map((c) => c.label)).not.toContain("Oyster Society");
    expect(read(guestAvailable(s, d()))).toEqual({ cards: [OYS.id], rows: [] });
    expect(read(guestAvailable(s, d({ club: key("GCC") }))).cards).not.toContain(OYS.id);
  });
  it("Wanted's By club and search read the same affiliation", () => {
    const s = guest([listing("l00000000000000b2", OYS.id, 30, { club: "Oyster Society" })], [want("i00000000000000c1", OYS.id), want("i00000000000000c2", GALA.id)]) as unknown as Parameters<typeof guestWantedRows>[0];
    const ids = (rows: unknown) => (rows as { id: string }[]).map((w) => w.id);
    expect(ids(guestWantedRows(s, d({ club: key("Oyster Society") })))).toEqual(["i00000000000000c1"]);
    expect(ids(guestWantedRows(s, d({ club: key("GCC") })))).toEqual(["i00000000000000c2"]);
    expect(ids(guestWantedRows(s, d({ q: "oyster society" })))).toEqual(["i00000000000000c1"]);
  });
});
