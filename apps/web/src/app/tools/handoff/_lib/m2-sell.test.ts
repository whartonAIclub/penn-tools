// SELL5-M2 (USER-INSTRUCTIONS §9v), the page's rules that need no page:
// - the address a page writes for itself as people move around inside Handoff (addressOf, _lib/routes.js; the orchestrator's addendum
//   to item 3: copying the address bar gives the page you're on): an event (with the listing it points at), an item, a request, or a
//   board or page by its name; public ids and fixed words only, never a search, a note or a sign-in's or an action's params;
// - Sell's "This ticket has restrictions" (items 4 and 5, _lib/sell.js): one unticked entry point; what it offers for an event
//   (restrictOffer), what stops a post (restrictIssues), when the club or organizer is needed (restrictNeedsClub), what Post ticket
//   sends (restrictBody, listingClubBody), and a kept form's older flags read as the new ones (restrictValues).
// Pure functions over a small live market with a set clock: no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import { setMode } from "./mode";
import { addressOf, initialView, settledHash } from "./routes";
import { RESTRICT0, listingClubBody, restrictBody, restrictIssues, restrictNeedsClub, restrictOffer, restrictValues } from "./sell";

const EV = "ev-0123456789abcdef", LISTING = "l0123456789abcdef", ITEM = "g0123456789abcdef", ISO = "iso-0123456789abcdef";

describe("the address a page writes for itself (addressOf)", () => {
  beforeEach(() => setMode(true, false)); // the shared market (live) reads its ids from an address
  afterEach(() => setMode(false, false));
  it("an event, with the listing it points at; an item; a request: the same ordinary URL a pasted link uses", () => {
    expect(addressOf({ name: "event", id: EV })).toBe(`#${EV}`);
    expect(addressOf({ name: "event", id: EV, listing: LISTING, listed: LISTING, seq: 4 })).toBe(`#${EV}?listing=${LISTING}`);
    expect(addressOf({ name: "item", id: ITEM, posted: true })).toBe(`#item-${ITEM}`);
    expect(addressOf({ name: "iso", id: ISO, posted: true })).toBe(`#${ISO}`);
    for (const v of [{ name: "event", id: EV, listing: LISTING }, { name: "item", id: ITEM }, { name: "iso", id: ISO }]) {
      const h = addressOf(v) as string;
      expect(settledHash(h)).toBe(h); // nothing in it is a sign-in's or an action's: it stays when the page opens
      const back = initialView(h) as { name: string; id?: string; listing?: string };
      expect(back.name).toBe(v.name); expect(back.id).toBe(v.id); // and it opens that same page
      if ("listing" in v) expect(back.listing).toBe(v.listing);
    }
  });
  it("the boards and the other pages by name", () => {
    expect(addressOf({ name: "explore", seq: 2 })).toBe("#explore");
    expect(addressOf({ name: "isos" })).toBe("#isos");
    for (const n of ["how", "activity", "profile", "list", "sell", "post"]) expect(addressOf({ name: n })).toBe("#" + n);
  });
  it("never anything typed or private: a search, a form's text, a draft, an origin, an action, My activity's card", () => {
    const h = [
      addressOf({ name: "explore", q: "my secret search" }), addressOf({ name: "list", text: "Oysters", eventId: EV, forIso: ISO, from: "event", fromId: EV, draft: { note: "call me" } }),
      addressOf({ name: "post", text: "Gala", edit: ISO, market: "goods", cat: "Furniture" }), addressOf({ name: "event", id: EV, resume: "take", notify: true, origin: { name: "iso", id: ISO } }),
      addressOf({ name: "activity", open: "listing:" + LISTING }), addressOf({ name: "item", id: ITEM, resume: "request" }),
    ].join(" ");
    expect(h).toBe(`#explore #list #post #${EV} #activity #item-${ITEM}`);
  });
  it("nothing where there's no ordinary URL: an id that isn't a live one, the preview's own pages, an unknown name", () => {
    for (const v of [{ name: "event", id: "e_wine" }, { name: "item", id: "g1" }, { name: "iso", id: "iso-p1" }, { name: "selftest" }, { name: "clubs" }, { name: "reviewers" }, { name: "results" }, { name: "nope" }, {}, null])
      expect(addressOf(v as never), JSON.stringify(v)).toBeNull();
    expect(addressOf({ name: "event", id: EV, listing: "l1" })).toBe(`#${EV}`); // a listing id that isn't one: the event alone
  });
});

// ── Sell's restrictions (9v items 4 and 5) ────────────────────────────────────────────────────────────────────────
const T0 = Date.UTC(2026, 10, 15, 20, 0);
const stored = (n: number, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${String(n).padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const GALA = stored(1, "Fall Gala", "2026-11-30", { club: "GCC" });
const OYS = stored(2, "Oysters Night", "2026-11-25");
const TRAIN = stored(3, "Acela PHL to NYC", "2026-11-21T09:05", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const FORMAL = stored(4, "Spring Formal", "2026-12-01", { club: "WGA", namesChecked: true });
beforeEach(() => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld(), events: [GALA, OYS, TRAIN, FORMAL] } as unknown as Parameters<typeof E.applyWorld>[0]); });
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });
const ev = (s: { id: string }) => E.EV[s.id] as E.EngineEvent;
const R = (o: Partial<typeof RESTRICT0>) => ({ ...RESTRICT0, ...o });

describe("This ticket has restrictions: what it offers", () => {
  it("unticked by default; for an ordinary event: members only, an organizer name change, or the seller's own words", () => {
    expect(RESTRICT0).toEqual({ on: false, members: false, name: false, other: false, text: "" });
    expect(restrictOffer(ev(GALA), "t1")).toEqual({ members: true, name: true, other: true });
    expect(restrictOffer(ev(OYS), "t1")).toEqual({ members: true, name: true, other: true });
  });
  it("nothing for a train (its carrier's rule is its own); no name change where the event already needs one", () => {
    expect(restrictOffer(ev(TRAIN), "t1")).toBeNull();
    expect(restrictOffer(ev(FORMAL), "t1")).toEqual({ members: true, name: false, other: true });
  });
});

describe("what stops a post, and when the club is needed", () => {
  it("ticked with nothing chosen, and the seller's own words missing or too long, are said at their fields", () => {
    const offer = restrictOffer(ev(GALA), "t1")!;
    const at = (r: typeof RESTRICT0) => Object.fromEntries(restrictIssues(r, offer).map(([id, missing, wrong]) => [id, wrong || missing]));
    expect(at(R({}))).toEqual({ "r-restrict": null, "r-restrict-text": null });
    expect(at(R({ on: true }))).toEqual({ "r-restrict": "Choose the restriction, or untick “This ticket has restrictions.”", "r-restrict-text": null });
    expect(at(R({ on: true, other: true }))["r-restrict-text"]).toBe("Describe the restriction in a few words.");
    expect(at(R({ on: true, other: true, text: "x".repeat(81) }))["r-restrict-text"]).toBe(E.NO_RESTRICTION_TEXT);
    expect(at(R({ on: true, other: true, text: "Black tie" }))).toEqual({ "r-restrict": null, "r-restrict-text": null });
    expect(at(R({ on: false, other: true, text: "" }))).toEqual({ "r-restrict": null, "r-restrict-text": null }); // unticked: nothing counts
  });
  it("a carried choice the event already covers (List again on a names-checked event's listing) stops nothing and sends nothing", () => {
    const o = restrictOffer(ev(FORMAL), "t1")!; // the event checks names at its door: no name-change choice is offered
    const carried = restrictValues({ dlv: { method: "name" } }); // what List again brings for that listing
    expect(carried).toEqual(R({ on: true, name: true }));
    expect(restrictIssues(carried, o).filter(([, missing, wrong]) => missing || wrong)).toEqual([]);
    expect(restrictBody(carried, o)).toEqual({ membersOnly: false }); // the event's own rule stands; nothing extra is sent
    expect(restrictIssues(R({ on: true }), o)[0]![1]).toMatch(/^Choose the restriction/); // ticked with nothing at all: still said
  });
  it("the club or organizer is needed only for members only or a name change, and only where the event names none", () => {
    const o = restrictOffer(ev(OYS), "t1")!;
    expect(restrictNeedsClub(R({ on: true, members: true }), o, "")).toBe(true);
    expect(restrictNeedsClub(R({ on: true, name: true }), o, "")).toBe(true);
    expect(restrictNeedsClub(R({ on: true, other: true, text: "Black tie" }), o, "")).toBe(false);
    expect(restrictNeedsClub(R({ on: true, members: true }), o, "GCC")).toBe(false); // the event's club is known: never asked
    expect(restrictNeedsClub(R({ on: false, members: true }), o, "")).toBe(false);
  });
});

describe("what Post ticket sends", () => {
  it("nothing restricted: no members-only, no method, no words", () => {
    expect(restrictBody(R({}), restrictOffer(ev(GALA), "t1"))).toEqual({ membersOnly: false });
    expect(restrictBody(R({ members: true, name: true, other: true, text: "x" }), restrictOffer(ev(GALA), "t1"))).toEqual({ membersOnly: false }); // unticked
  });
  it("each choice in the engine's own fields", () => {
    const o = restrictOffer(ev(GALA), "t1");
    expect(restrictBody(R({ on: true, members: true }), o)).toEqual({ membersOnly: true });
    expect(restrictBody(R({ on: true, name: true }), o)).toEqual({ membersOnly: false, method: "name", namesChecked: true });
    expect(restrictBody(R({ on: true, other: true, text: "  Black   tie " }), o)).toEqual({ membersOnly: false, restriction: "Black tie" });
    expect(restrictBody(R({ on: true, members: true, name: true, other: true, text: "Black tie" }), o)).toEqual({ membersOnly: true, method: "name", namesChecked: true, restriction: "Black tie" });
    expect(restrictBody(R({ on: true, members: true, name: true }), null)).toEqual({ membersOnly: false }); // a train: none offered
  });
  it("a club named on a listing goes with it, also as the members-only club", () => {
    expect(listingClubBody("  Wharton  Wine Club ", false)).toEqual({ club: "Wharton Wine Club" });
    expect(listingClubBody("GCC", true)).toEqual({ club: "GCC", memberClub: "GCC" });
    expect(listingClubBody("   ", true)).toEqual({});
  });
});

describe("a kept form's older flags (members-only, names checked, the old flag) come back as the new choices", () => {
  it("restrictValues", () => {
    expect(restrictValues(null)).toEqual(RESTRICT0);
    expect(restrictValues({ restrict: { on: true, members: true, name: "yes", other: false, text: 7 } })).toEqual(R({ on: true, members: true }));
    expect(restrictValues({ memberTicket: true })).toEqual(R({ on: true, members: true }));
    expect(restrictValues({ nd: { namesChecked: true } })).toEqual(R({ on: true, name: true }));
    expect(restrictValues({ dlv: { method: "name" } })).toEqual(R({ on: true, name: true }));
    expect(restrictValues({ risk: true })).toEqual(R({ on: true, other: true, text: "The ticket's terms may not allow resale or a name change" }));
    expect(restrictValues({ restrict: { on: true, other: true, text: "y".repeat(200) } }).text).toHaveLength(80);
  });
});
