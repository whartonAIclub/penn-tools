// SELL6-N3 (USER-INSTRUCTIONS §9x item 5): the club stays optional and persistent. The engine's and the server's half:
// - a new event made through Post request carries its optional club: the event (with the club) and the request are stored in one
//   change, or not at all; a blank club posts just the same;
// - an event on Handoff keeps the club it was saved with; where it names none, a seller's own listing may name one (§9v item 4), and
//   the shared event is never changed by a later post;
// - By club and the search read the relevant saved affiliation (eventClubs): the event's club, or, for an event that names none,
//   the clubs named on its listings that are still up, whatever their capitals; signed in and signed out;
// - a club never implies members only: only an explicit restriction asks a buyer to confirm anything;
// - a blank club blocks nothing and never keeps a post from the same event (the same name on the same date is the same event,
//   whatever club either names), and it never keeps a listing from matching a request there.
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Action, WorldState } from "../../engine/index.js";
import { must, resetEngine } from "./helpers/invite.js";
import { PEOPLE6, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, T0, dateAfter, type TestPerson } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as Action;
const stored = (w: ServerWorld, id: string) => must(w.doc.events.find((e) => e.id === id), "event") as unknown as Record<string, unknown>;
const listing = (w: ServerWorld, id: string) => must(w.doc.listings.find((l) => l.id === id), "listing") as unknown as Record<string, unknown>;
const post = (eventId: string, more: Record<string, unknown> = {}) => act({ type: "postTicket", eventId, qty: 1, ask: "25", note: "", obo: false, ...more });
const newEvent = (title: string, days: number, more: Record<string, unknown> = {}) => ({ kind: "event", title, start: dateAfter(T0, days), ...more });

/** Runs fn with a view installed as the browser installs it (the catalog, the club menu and the clock). */
function installed<T>(state: { serverNow: number }, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as WorldState);
  try { return fn(state as unknown as WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}
const clubKey = (label: string): string | null => { const c = E.CLUB_MENU.find((x) => x.label === label); return c ? c.k : null; };
/** What By club shows on Available for a signed-in viewer: the cards and the no-ticket rows, by event id. */
const byClub = (w: ServerWorld, viewer: TestPerson, label: string) => installed(viewOf(w, viewer), (s) => {
  const k = clubKey(label); if (!k) return null;
  const a = E.availableNow(s, viewer.userId, { ...E.DISC0, club: k });
  return { cards: a.cards.map((c) => c.key).sort(), rows: a.lookup.map((r) => r.ev.id).sort() };
});
const search = (w: ServerWorld, viewer: TestPerson, q: string) => installed(viewOf(w, viewer), (s) => {
  const a = E.availableNow(s, viewer.userId, { ...E.DISC0, q });
  return [...a.cards.map((c) => c.key), ...a.lookup.map((r) => r.ev.id)].sort();
});
const menu = (w: ServerWorld, viewer: TestPerson) => installed(viewOf(w, viewer), () => E.CLUB_MENU.map((c) => c.label));

describe("a new event made through Request carries its optional club (9x item 5)", () => {
  it("the event, with its club, and the request are stored in one change; the club is trimmed and restricts nothing", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const before = w.doc;
    const done = w.ok(CAT.userId, act({ type: "postRequest", event: newEvent("Chess Night", 12, { club: "  Penn   Chess Club " }), qty: 1, budget: "", note: "" }));
    expect((done.steps || []).map((x) => [x.type, x.ok])).toEqual([["createEvent", true], ["saveInterest", true]]);
    expect(before.events).toHaveLength(0); // one change: the document before it has neither
    const evId = must((done.steps || [])[0]?.id, "the new event");
    expect(stored(w, evId)).toMatchObject({ title: "Chess Night", club: "Penn Chess Club", attend: "all" });
    const req = must(w.doc.interests.find((i) => i.id === done.id), "the request");
    expect(req).toMatchObject({ kind: "iso", eventId: evId, userId: CAT.userId, qty: 1 });
    w.run(() => expect(E.EV[evId]?.namesChecked).toBeUndefined());
  });
  it("a request that is refused leaves no event behind, club or not", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const why = w.no(CAT.userId, act({ type: "postRequest", event: newEvent("Chess Night", 12, { club: "Penn Chess Club" }), qty: 9, budget: "", note: "" }));
    expect(why).toBeTruthy();
    expect(w.doc.events).toHaveLength(0);
    expect(w.doc.interests).toHaveLength(0);
  });
  it("a blank club posts just the same, and the event then names none", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    for (const [n, club] of [undefined, "", "   ", null].entries()) {
      const done = w.ok(CAT.userId, act({ type: "postRequest", event: newEvent(`Open Mic number ${n + 1}`, 12, club === undefined ? {} : { club }), qty: 1, budget: "", note: "" }));
      const evId = must((done.steps || [])[0]?.id, "the new event");
      expect("club" in stored(w, evId) ? stored(w, evId).club : "").toBeFalsy();
    }
    expect(w.doc.interests).toHaveLength(4);
  });
  it("a club that isn't a name is refused at the event, in the server's words, and nothing is stored", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(w.no(CAT.userId, act({ type: "postRequest", event: newEvent("Chess Night", 12, { club: "x" }), qty: 1, budget: "", note: "" })))
      .toBe("Add who runs it: the club or organizer (2 to 80 characters), or leave it blank.");
    expect(w.doc.events).toHaveLength(0);
  });
});

describe("an event keeps its saved club, and a later post never changes the shared event (9x item 5)", () => {
  it("a listing or a request on an event that names its club reuses it: nothing sent with them replaces it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const gala = must(w.ok(ANN.userId, act({ type: "postTicket", event: newEvent("Fall Gala", 15, { club: "GCC" }), qty: 1, ask: "25", note: "", obo: false })).steps?.[0]?.id, "gala");
    const id = must(w.ok(BOB.userId, post(gala, { club: "Another Club" })).id, "listing");
    expect("club" in listing(w, id)).toBe(false); // the event's own club is the listing's
    w.ok(CAT.userId, act({ type: "postRequest", eventId: gala, qty: 1, budget: "", note: "" }));
    expect(stored(w, gala).club).toBe("GCC");
  });
  it("where the event names none, the club a seller names stays on their listing: the event still names none", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const oys = must(w.ok(CAT.userId, act({ type: "postRequest", event: newEvent("Oysters Night", 9), qty: 1, budget: "", note: "" })).steps?.[0]?.id, "oysters");
    const id = must(w.ok(BOB.userId, post(oys, { club: "Oyster Society" })).id, "listing");
    expect(listing(w, id).club).toBe("Oyster Society");
    expect("club" in stored(w, oys) ? stored(w, oys).club : "").toBeFalsy();
  });
});

describe("By club and the search read the relevant saved affiliation (9x item 5)", () => {
  /** Ann's Wine Night (Wine Society, one ticket), Cat's Chess Night request (Penn Chess Club, no ticket), and an Oysters Night that
      names no club, with Bob's ticket naming "Oyster Society" on his own listing. */
  function market() {
    const w = new ServerWorld({ people: PEOPLE6 });
    const wine = must(w.ok(ANN.userId, act({ type: "postTicket", event: newEvent("Wine Night", 14, { club: "Wine Society" }), qty: 1, ask: "20", note: "", obo: false })).steps?.[0]?.id, "wine");
    w.advance(1000);
    const chessReq = w.ok(CAT.userId, act({ type: "postRequest", event: newEvent("Chess Night", 12, { club: "Penn Chess Club" }), qty: 1, budget: "", note: "" }));
    const chess = must(chessReq.steps?.[0]?.id, "chess");
    w.advance(1000);
    const oys = must(w.ok(ANN.userId, act({ type: "createEvent", ...newEvent("Oysters Night", 9) })).id, "oysters");
    const oysL = must(w.ok(BOB.userId, post(oys, { club: "Oyster Society" })).id, "oysters listing");
    return { w, wine, chess, chessReq: must(chessReq.id, "chess request"), oys, oysL };
  }
  it("a club saved with a new-event Sell and a new-event Request is in By club for another account, with its event", () => {
    const { w, wine, chess } = market();
    expect(menu(w, DAN)).toEqual(expect.arrayContaining(["Wine Society", "Penn Chess Club"]));
    expect(byClub(w, DAN, "Wine Society")).toEqual({ cards: [wine], rows: [] });
    expect(byClub(w, DAN, "Penn Chess Club")).toEqual({ cards: [], rows: [chess] }); // no ticket yet: its row, with "Request a ticket"
  });
  it("Wanted's By club finds the request by its event's club", () => {
    const { w, chessReq } = market();
    const rows = installed(viewOf(w, DAN), (s) => E.wantedNow(s, { ...E.DISC0, club: must(clubKey("Penn Chess Club"), "club") }).map((i) => i.id));
    expect(rows).toEqual([chessReq]);
  });
  it("eventClubs: an event's own club, or, for an event that names none, the clubs named on its listings", () => {
    const { w, wine, oys } = market();
    installed(viewOf(w, DAN), () => {
      expect(E.eventClubs(E.EV[wine])).toEqual(["Wine Society"]);
      expect(E.eventClubs(E.EV[oys])).toEqual(["Oyster Society"]);
      expect(E.eventClubs(null)).toEqual([]);
    });
  });
  it("By club finds a club-less event by the club named on its listing, and the menu lists that club", () => {
    const { w, oys } = market();
    expect(menu(w, DAN)).toContain("Oyster Society");
    expect(byClub(w, DAN, "Oyster Society")).toEqual({ cards: [oys], rows: [] });
    expect(byClub(w, DAN, "Wine Society")?.cards).not.toContain(oys);
  });
  it("the search finds it by that club too, and by its name as before", () => {
    const { w, oys } = market();
    expect(search(w, DAN, "oyster society")).toEqual([oys]);
    expect(search(w, DAN, "Oysters")).toEqual([oys]);
    expect(search(w, DAN, "society")).toHaveLength(2); // Wine Society's event and the Oyster Society listing's
  });
  it("the same club typed with other capitals or spacing is one club", () => {
    const { w, oys } = market();
    const clams = must(w.ok(ANN.userId, act({ type: "createEvent", ...newEvent("Clam Bake", 11) })).id, "clams");
    w.ok(CAT.userId, post(clams, { club: "oyster  society" }));
    w.ok(DAN.userId, post(clams, { club: "Oyster Society" }));
    expect(menu(w, ANN).filter((x) => /oyster/i.test(x))).toEqual(["Oyster Society"]); // one entry, in its most used spelling
    expect(byClub(w, ANN, "Oyster Society")).toEqual({ cards: [clams, oys].sort(), rows: [] });
  });
  it("a signed-out visitor's catalog has the same clubs and the same affiliation", () => {
    const { w, oys, wine } = market();
    installed(guestViewOf(w), () => {
      expect(E.CLUB_MENU.map((c) => c.label)).toEqual(expect.arrayContaining(["Wine Society", "Penn Chess Club", "Oyster Society"]));
      expect(E.eventClubs(E.EV[oys])).toEqual(["Oyster Society"]);
      expect(E.evText(must(E.EV[oys], "event"))).toContain("oyster society");
      expect(E.eventClubs(E.EV[wine])).toEqual(["Wine Society"]);
    });
  });
  it("Wanted's By club shows a request for that event under its listing's club", () => {
    const { w, oys } = market();
    const r = must(w.ok(DAN.userId, act({ type: "postRequest", eventId: oys, qty: 1, budget: "", note: "" })).id, "request");
    const rows = installed(viewOf(w, CAT), (s) => E.wantedNow(s, { ...E.DISC0, club: must(clubKey("Oyster Society"), "club") }).map((i) => i.id));
    expect(rows).toEqual([r]);
  });
  it("a closed listing's club leaves By club, and an event that names its own club never reads a listing's", () => {
    const { w, oys, oysL, wine } = market();
    w.ok(BOB.userId, act({ type: "withdraw", listingId: oysL }));
    expect(menu(w, DAN)).not.toContain("Oyster Society");
    installed(viewOf(w, DAN), () => expect(E.eventClubs(E.EV[oys])).toEqual([]));
    w.ok(BOB.userId, post(wine, { club: "Some Other Club" })); // dropped: the event names its club
    expect(menu(w, DAN)).not.toContain("Some Other Club");
    installed(viewOf(w, DAN), () => expect(E.eventClubs(E.EV[wine])).toEqual(["Wine Society"]));
  });
  it("the preview's catalog is as it was: an event's own organizer, and no listing clubs", () => {
    E.applyWorld(null);
    const ev = must(E.EVENTS[0], "a sample event");
    expect(E.eventClubs(ev)).toEqual([ev.club]);
    expect(E.evText(ev)).toContain(ev.club.toLowerCase());
  });
});

describe("a club never implies members only (9x item 5)", () => {
  it("a ticket for an event made through Request with a club has no restriction, and anyone may ask to buy it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(CAT.userId, act({ type: "postRequest", event: newEvent("Fall Gala", 15, { club: "GCC" }), qty: 1, budget: "", note: "" })).steps?.[0]?.id, "gala");
    const id = must(w.ok(BOB.userId, post(ev)).id, "listing");
    w.run(() => {
      const e = must(E.EV[ev], "event");
      expect(e.attend).toBe("all");
      expect(E.listingRestrictions(e, listing(w, id) as never)).toEqual([]);
      expect(E.membersOnlyListing(e, listing(w, id) as never)).toBe(false);
    });
    expect(w.ok(DAN.userId, act({ type: "requestToBuy", listingId: id, qty: 1, msg: "" })).id).toBeTruthy(); // no member confirmation asked
  });
  it("a club named on a listing alone restricts nothing either; only an explicit restriction asks the buyer to confirm", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", ...newEvent("Oysters Night", 9) })).id, "oysters");
    const open = must(w.ok(BOB.userId, post(ev, { club: "GCC" })).id, "open listing");
    expect(w.ok(DAN.userId, act({ type: "requestToBuy", listingId: open, qty: 1, msg: "" })).id).toBeTruthy();
    const members = must(w.ok(CAT.userId, post(ev, { club: "GCC", membersOnly: true })).id, "members listing");
    expect(w.no(DAN.userId, act({ type: "requestToBuy", listingId: members, qty: 1, msg: "" }))).toMatch(/GCC members\. Confirm you're a member/);
  });
});

describe("a blank club never keeps a post from the same event (9x item 5)", () => {
  it("the same name on the same date is the same event, whatever club either one names", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const gala = must(w.ok(ANN.userId, act({ type: "postTicket", event: newEvent("Fall Gala", 15, { club: "GCC" }), qty: 1, ask: "25", note: "", obo: false })).steps?.[0]?.id, "gala");
    // A request typed as a new event with no club, or with another one, is pointed at the event that's there: no second event.
    for (const club of [undefined, "", "Some Other Club"]) {
      expect(w.no(CAT.userId, act({ type: "postRequest", event: newEvent("fall gala", 15, club === undefined ? {} : { club }), qty: 1, budget: "", note: "" }))).toBe(E.TWIN_EVENT_REQUEST);
      expect(w.no(BOB.userId, act({ type: "postTicket", event: newEvent("Fall  Gala", 15, club === undefined ? {} : { club }), qty: 1, ask: "20", note: "", obo: false }))).toBe(E.TWIN_EVENT);
    }
    expect(w.doc.events).toHaveLength(1);
    // And the search field offers that event whatever was typed for a club (the club is no part of the match).
    w.run(() => expect(E.suggestEvents("fall gala", dateAfter(T0, 15), { loose: true }).map((e) => e.id)).toEqual([gala]));
  });
  it("a listing with no club, or with one, matches a request on the same event either way", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const oys = must(w.ok(CAT.userId, act({ type: "postRequest", event: newEvent("Oysters Night", 9), qty: 1, budget: "", note: "" })).steps?.[0]?.id, "oysters");
    const req = must(w.doc.interests[0], "request");
    const blank = must(w.ok(BOB.userId, post(oys)).id, "blank listing");
    const named = must(w.ok(DAN.userId, post(oys, { club: "Oyster Society" })).id, "named listing");
    w.run(() => {
      expect(E.requestMatch(w.doc, req as never, listing(w, blank) as never).ok).toBe(true);
      expect(E.requestMatch(w.doc, req as never, listing(w, named) as never).ok).toBe(true);
    });
  });
});
