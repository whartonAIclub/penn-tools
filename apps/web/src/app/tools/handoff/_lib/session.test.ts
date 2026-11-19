import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DISC0 } from "@penntools/tool-handoff/engine";
import { RETURN_KEY, draftAt, keepDiscovery, keptDiscovery } from "./session";

const EV = "ev-0123456789abcdef", LISTING = "l0123456789abcdef", OTHER = "lfedcba9876543210";

describe("a kept form's place", () => {
  it("is the address the sign-in comes back to: the full return target, the guest page's settled address, or the page alone", () => {
    const place = `${EV}?listing=${LISTING}&do=take`; // a request form open on a listing when the session ended (keepDraft)
    expect(draftAt(place, place)).toBe(true); // Handoff's own Sign in: the return target itself
    expect(draftAt(`${EV}?listing=${LISTING}`, place)).toBe(true); // the site header's Sign in: the guest page's address, which keeps the listing
    expect(draftAt(EV, place)).toBe(true); // the page alone
    expect(draftAt("post", `post?event=${EV}&from=event&fromId=${EV}`)).toBe(true); // a posting form: its params leave the guest page's address
    expect(draftAt("activity", `activity?listing=${LISTING}`)).toBe(true); // a seller's edit, back at My activity
  });

  it("is never another listing, another action or another page", () => {
    const place = `${EV}?listing=${LISTING}&do=take`;
    expect(draftAt(`${EV}?listing=${OTHER}`, place)).toBe(false); // another listing's link opened meanwhile
    expect(draftAt(`${EV}?listing=${LISTING}&do=offer`, place)).toBe(false);
    expect(draftAt("ev-fedcba9876543210", place)).toBe(false);
    expect(draftAt(`post?event=${EV}`, `post?event=${EV}&from=event&fromId=${EV}`)).toBe(false);
    expect(draftAt("", "explore")).toBe(false);
  });
});

// §9r: the All / Available / Nothing listed selector is gone from Available. The one place its choice ever travelled was this tab's
// kept browsing choices across a sign-in (never an address): a state kept with it opens the normal Available, with its search.
describe("a guest's browsing choices across sign-in (9r)", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => (store.has(k) ? store.get(k) : null), setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  /** What a tab kept before the selector was removed (keepDiscovery, as it was). */
  const oldKept = (avail: string, over: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, at: Date.now(), side: "explore", disc: { cat: "all", q: "Oysters", goodsCat: "All", club: null, avail, when: "any", need: "any", sortA: "newest", sortW: "newest", ...over } });

  it("a state kept with the removed filter comes back without it, on Available, with its search", () => {
    for (const avail of ["waitlist", "available", "all", "constructor"]) {
      store.set(RETURN_KEY, oldKept(avail));
      expect(keptDiscovery(), avail).toEqual({ side: "explore", disc: { cat: "all", q: "Oysters", goodsCat: "All", club: null, sortA: "newest", sortW: "newest" } }); // 9s: was with when: "any", need: "any" (the date-range filters are no longer part of a kept state)
    }
    // On the page (App): the kept choices go over DISC0, so the feed is the normal one.
    store.set(RETURN_KEY, oldKept("waitlist"));
    expect({ ...DISC0, ...keptDiscovery()!.disc }).toEqual({ ...DISC0, q: "Oysters" });
  });

  // §9s item 1: the "Next 7 days / Next 30 days" controls are gone from both boards. A state kept with one (before §9s, or planted)
  // keeps its search, its category, its club, its sorts and its side, and comes back with no date-range filter on.
  it("keeps the rest of an old state: the category, the search, the club, the sorts, the side; never a retired date-range filter (9s)", () => {
    store.set(RETURN_KEY, JSON.stringify({ ...JSON.parse(oldKept("waitlist", { cat: "trains", q: "nyc", when: "week", need: "month", sortA: "price", sortW: "deadline", club: "wga" })), side: "isos" }));
    expect(keptDiscovery()).toEqual({ side: "isos", disc: { cat: "trains", q: "nyc", goodsCat: "All", club: "wga", sortA: "price", sortW: "deadline" } }); // 9s: was with when: "week", need: "month"
    // On the page (App): over DISC0, neither date-range filter is on, whatever the old state held.
    const page = { ...DISC0, ...keptDiscovery()!.disc };
    expect([page.when, page.need, page.avail]).toEqual(["any", "any", "all"]);
    expect([page.cat, page.q, page.club, page.sortA, page.sortW]).toEqual(["trains", "nyc", "wga", "price", "deadline"]);
    for (const [when, need] of [["month", "week"], ["week", "week"], ["constructor", "__proto__"]]) {
      store.set(RETURN_KEY, oldKept("all", { cat: "goods", goodsCat: "Furniture", q: "lamp", when, need }));
      const back = { ...DISC0, ...keptDiscovery()!.disc };
      expect([back.when, back.need, back.cat, back.goodsCat, back.q], `${when}/${need}`).toEqual(["any", "any", "goods", "Furniture", "lamp"]);
    }
  });

  it("no longer keeps an availability choice or a date-range filter, and never puts anything in the address", () => {
    keepDiscovery({ ...DISC0, q: "Oysters", cat: "events", avail: "waitlist", when: "week", need: "month" }, "explore");
    const kept = JSON.parse(store.get(RETURN_KEY) ?? "null") as { disc: Record<string, unknown>; side: string };
    expect(Object.keys(kept.disc).sort()).toEqual(["cat", "club", "goodsCat", "q", "sortA", "sortW"]); // 9s: was with "need" and "when"
    expect([kept.disc.q, kept.disc.cat, kept.side]).toEqual(["Oysters", "events", "explore"]);
    expect(keptDiscovery()).toEqual({ side: "explore", disc: { cat: "events", q: "Oysters", goodsCat: "All", club: null, sortA: "newest", sortW: "newest" } }); // 9s: was with when: "any", need: "any"
  });

  it("keeps the chosen category and the search for the round trip, whichever board it was chosen on (9s)", () => {
    for (const side of ["explore", "isos"]) for (const cat of ["all", "events", "trains", "treks", "goods"]) {
      keepDiscovery({ ...DISC0, q: "nyc", cat }, side);
      expect(keptDiscovery(), `${side}/${cat}`).toMatchObject({ side, disc: { cat, q: "nyc" } });
    }
    store.set(RETURN_KEY, oldKept("all", { cat: "concerts" })); // not one of the five: All
    expect(keptDiscovery()!.disc.cat).toBe("all");
  });

  it("still ignores a state that is too old or isn't one", () => {
    store.set(RETURN_KEY, JSON.stringify({ ...JSON.parse(oldKept("waitlist")), at: Date.now() - 16 * 60e3 }));
    expect(keptDiscovery()).toBeNull();
    store.set(RETURN_KEY, "{not json");
    expect(keptDiscovery()).toBeNull();
  });
});
