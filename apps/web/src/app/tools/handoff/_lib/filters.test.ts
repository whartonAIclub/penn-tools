// §9s items 1 and 2 (live browsing): All · Events · Trains · Treks · Goods is a visible row directly below the search on Available and
// Wanted; there is no Filters button, panel or count, and no "Next 7 days / Next 30 days" control (_lib/routes.js). Pinned here: the
// five choices, what can narrow the results besides the search (the category, Goods' own category and, where clubs apply, the club:
// never a date, a needed-by or an availability choice), the one way out an empty state offers when a category or a club narrowed it
// (it never clears the search), and an empty board's one line.
// This file pinned the Filters panel's count, Reset filters and "Filtered by" words until §9s removed that panel (step SELL4-L1).
// Pure functions only: no DOM, no server.
import { describe, expect, it } from "vitest";
import { DISC0, clubOf } from "@penntools/tool-handoff/engine";
import * as routes from "./routes";
import { DISC_CATS, DISC_LABEL, discClear, discScope, emptyTitle } from "./routes";

type Disc = typeof DISC0;
const d = (patch: Partial<Record<keyof Disc, unknown>> = {}): Disc => ({ ...DISC0, ...patch }) as Disc;
const CLUB = "beer"; // a club of the catalog the engine starts with
const CLUB_NAME = clubOf(CLUB)!.label;
/** The retired filters, as a state kept before §9s could still hold them. */
const RETIRED = { when: "week", need: "month", avail: "waitlist" };

describe("the category row's five choices", () => {
  it("are All, Events, Trains, Treks and Goods, in that order, All first", () => {
    expect(DISC_CATS.map(([k, label]) => [k, label])).toEqual([["all", "All"], ["events", "Events"], ["trains", "Trains"], ["treks", "Treks"], ["goods", "Goods"]]);
    expect(DISC0.cat).toBe("all"); // the default
    expect(DISC_LABEL).toEqual({ all: "All", events: "Events", trains: "Trains", treks: "Treks", goods: "Goods" });
  });
  it("leave no Filters panel rules behind: its count, its reset and its words are gone", () => {
    for (const gone of ["discFiltersOn", "discReset", "discFilterWords"]) expect(gone in routes, gone).toBe(false);
  });
});

describe("discScope: what narrows an empty board, in its title", () => {
  it("is nothing when nothing narrows it; the search is never part of it", () => {
    expect(discScope(d())).toBe("");
    expect(discScope(d({ q: "gala", sortA: "price", sortW: "deadline" }))).toBe("");
  });
  it("names the category in the row's own word, and Goods' own category when one is chosen", () => {
    for (const k of ["events", "trains", "treks", "goods"]) expect(discScope(d({ cat: k })), k).toBe(` in ${DISC_LABEL[k]}`);
    expect(discScope(d({ cat: "goods", goodsCat: "Furniture" }))).toBe(" in Furniture");
    expect(discScope(d({ cat: "trains", goodsCat: "Furniture" }))).toBe(" in Trains"); // a goods category left over outside Goods narrows nothing
  });
  it("names the club only where clubs apply (All, Events, Treks), never on Trains or Goods", () => {
    expect(discScope(d({ club: CLUB }))).toBe(` from ${CLUB_NAME}`);
    expect(discScope(d({ cat: "events", club: CLUB }))).toBe(` in Events from ${CLUB_NAME}`);
    expect(discScope(d({ cat: "trains", club: CLUB }))).toBe(" in Trains");
    expect(discScope(d({ cat: "goods", club: CLUB }))).toBe(" in Goods");
    expect(discScope(d({ club: "constructor" }))).toBe(""); // not a club
  });
  it("never names a retired filter: a kept date, needed-by or availability choice narrows nothing", () => {
    expect(discScope(d(RETIRED))).toBe("");
    expect(discScope(d({ ...RETIRED, cat: "trains" }))).toBe(" in Trains");
  });
});

describe("discClear: the way out when a category or a club narrowed the results", () => {
  it("is not offered when nothing narrowed them: a search alone, a sort, or a retired filter", () => {
    expect(discClear(d())).toBeNull();
    expect(discClear(d({ q: "oysters", sortA: "price" }))).toBeNull();
    expect(discClear(d(RETIRED))).toBeNull();
    expect(discClear(d({ cat: "trains", club: CLUB }))).not.toBeNull(); // the category, not the club that doesn't apply there
  });
  it("a category: \"Show all categories\" goes back to All (and All goods); focus goes to the row", () => {
    for (const k of ["events", "trains", "treks", "goods"]) expect(discClear(d({ cat: k })), k).toEqual({ label: "Show all categories", patch: { cat: "all", goodsCat: "All" }, focus: "cat" });
    expect(discClear(d({ cat: "goods", goodsCat: "Furniture" }))).toEqual({ label: "Show all categories", patch: { cat: "all", goodsCat: "All" }, focus: "cat" });
    expect(discClear(d({ cat: "trains", club: CLUB }))!.patch).toEqual({ cat: "all", goodsCat: "All" }); // the club that didn't apply is left alone
  });
  it("a club: \"Show all clubs\" drops the club; focus goes to By club", () => {
    expect(discClear(d({ club: CLUB }))).toEqual({ label: "Show all clubs", patch: { club: null }, focus: "club" });
  });
  it("both: one action clears both", () => {
    expect(discClear(d({ cat: "events", club: CLUB }))).toEqual({ label: "Clear category and club", patch: { cat: "all", goodsCat: "All", club: null }, focus: "cat" });
  });
  it("never clears the search or the sort, and leaves nothing narrowing the results", () => {
    for (const patch of [{ cat: "trains" }, { club: CLUB }, { cat: "treks", club: CLUB }, { cat: "goods", goodsCat: "Furniture" }]) {
      const before = d({ q: "lamp", sortA: "price", sortW: "deadline", ...patch });
      const way = discClear(before)!;
      expect(Object.keys(way.patch).some((k) => ["q", "sortA", "sortW"].includes(k)), JSON.stringify(patch)).toBe(false);
      const after = { ...before, ...way.patch } as Disc;
      expect([after.q, after.sortA, after.sortW]).toEqual(["lamp", "price", "deadline"]);
      expect(discScope(after)).toBe("");
      expect(discClear(after)).toBeNull();
    }
  });
});

describe("emptyTitle: an empty board's one line", () => {
  it("empty Available reads \"Nothing listed right now.\" and empty Wanted \"No requests right now.\"", () => {
    expect(emptyTitle("explore", d())).toBe("Nothing listed right now.");
    expect(emptyTitle("isos", d())).toBe("No requests right now.");
    expect(emptyTitle("explore", d(RETIRED))).toBe("Nothing listed right now."); // a retired filter is never named
    expect(emptyTitle("isos", d(RETIRED))).toBe("No requests right now.");
  });
  it("says what narrowed it", () => {
    expect(emptyTitle("explore", d({ cat: "trains" }))).toBe("Nothing listed in Trains right now.");
    expect(emptyTitle("isos", d({ cat: "goods" }))).toBe("No requests in Goods right now.");
    expect(emptyTitle("explore", d({ club: CLUB }))).toBe(`Nothing listed from ${CLUB_NAME} right now.`);
  });
  it("with a search, names what was typed (trimmed), and the category or club beside it", () => {
    expect(emptyTitle("explore", d({ q: " Oysters " }))).toBe("Nothing listed matches \"Oysters\".");
    expect(emptyTitle("isos", d({ q: "Oysters" }))).toBe("No requests match \"Oysters\".");
    expect(emptyTitle("explore", d({ q: "Oysters", cat: "trains" }))).toBe("Nothing listed matches \"Oysters\" in Trains.");
    expect(emptyTitle("isos", d({ q: "Oysters", cat: "events", club: CLUB }))).toBe(`No requests match "Oysters" in Events from ${CLUB_NAME}.`);
  });
});
