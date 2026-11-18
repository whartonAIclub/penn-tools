// SELL4-L2 (USER-INSTRUCTIONS §9s item 4), the engine's rule behind the page: the forgiving event search that Sell a ticket and Request
// a ticket ask for (suggestEvents with `loose`): any typed word may be half typed and in any order ("night oys" and "oys night" both
// find Oysters Night), the better match comes first, the events `first` picks out lead among equal matches, and every seating or
// departure stays its own row. Without `loose` the search is as it was (Add a trek's suggestions and the preview).
// (Its second part, the seller's one-line share message of §9s item 5, was removed in SELL5-M1: §9v item 3 removed outward Share, and
// the shared market builds no share message any more; m1-no-share.test.ts checks that it refuses one.)
// A small live market with a set clock; labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";

afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

// ── The search ───────────────────────────────────────────────────────────────────────────
const T0 = Date.UTC(2026, 10, 15, 20, 0); // Sun Nov 15, 2026, 3:00 PM in Philadelphia
const stored = (n: number, title: string, start: string, more: Record<string, unknown> = {}) => ({
  id: `ev-${String(n).padStart(16, "0")}`, kind: "event", title, start, attend: "all", tiers: [{ id: "t1", label: "Ticket", price: null }], perPerson: 4, deadline: null,
  policy: "unknown", createdBy: "u-test-other", createdAt: T0 - 3600e3, ...more,
});
const COMEDY = stored(1, "Comedy Night", "2026-11-20"); // the soonest "… Night"
const OYSTERS = stored(2, "Oysters Night", "2026-11-25");
const MARKET = stored(3, "Night Market", "2026-11-22");
const IMPROV_7 = stored(4, "Improv Hour", "2026-11-27T19:00");
const IMPROV_930 = stored(5, "Improv Hour", "2026-11-27T21:30");
const TRAIN_AM = stored(6, "Acela PHL to NYC", "2026-11-21T09:05", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const TRAIN_PM = stored(7, "Acela PHL to NYC", "2026-11-21T15:10", { kind: "train", cat: "Travel", methods: ["file"], noOrganizer: true, perPerson: 2 });
const OVER = stored(8, "Oysters Night", "2026-11-14"); // yesterday's: over
const BAR = stored(9, "Oyster Bar Night", "2026-11-28"); // later than Oysters Night
const EVENTS = [COMEDY, OYSTERS, MARKET, IMPROV_7, IMPROV_930, TRAIN_AM, TRAIN_PM, OVER, BAR];
const install = () => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld(), events: EVENTS } as unknown as Parameters<typeof E.applyWorld>[0]); };
const ids = (xs: { id: string }[]) => xs.map((e) => e.id);
const loose = (text: string, o: Record<string, unknown> = {}) => ids(E.suggestEvents(text, "", { max: 5, loose: true, ...o } as Parameters<typeof E.suggestEvents>[2]));

describe("the forgiving event search (9s item 4: suggestEvents with loose)", () => {
  it("\"night oys\" finds Oysters Night, first: every typed word is in its name, one of them half typed", () => {
    install();
    expect(loose("night oys")[0]).toBe(OYSTERS.id);
    expect(loose("night oys")).not.toContain(OVER.id); // never the one that's over
  });
  it("word order doesn't matter, and the half-typed word needn't be the last one typed", () => {
    install();
    expect(loose("oys night")[0]).toBe(OYSTERS.id); // "oys" isn't the last word typed
    expect(loose("oyst nigh")[0]).toBe(OYSTERS.id); // both half typed
    expect(loose("NIGHT, oysters!")[0]).toBe(OYSTERS.id); // capitals and punctuation don't matter
  });
  it("ranks by how well the name matches before how soon the event is", () => {
    install();
    // Comedy Night and Night Market are sooner and hold "night" too: one word of two, so they come after the full match.
    expect(loose("oys night")).toEqual([OYSTERS.id, BAR.id, COMEDY.id, MARKET.id]);
    expect(loose("night market")).toEqual([MARKET.id, COMEDY.id, OYSTERS.id, BAR.id]);
    // Whole words before half-typed ones: both names hold both typed words, and the later one has them whole.
    expect(loose("oyster night").slice(0, 2)).toEqual([BAR.id, OYSTERS.id]);
    // Among equal matches, the soonest first.
    expect(loose("night")).toEqual([COMEDY.id, MARKET.id, OYSTERS.id, BAR.id]);
  });
  it("words under three letters refine the order, and are enough when nothing longer was typed", () => {
    install();
    expect(loose("night oy")[0]).toBe(OYSTERS.id); // "oy" begins its other word
    expect(loose("oy ni")).toEqual([OYSTERS.id, BAR.id]); // two half-typed words, nothing longer: only the names that have both
    expect(loose("zz ni")).toEqual([]);
  });
  it("a name nothing resembles finds nothing, and one common word out of three isn't a match", () => {
    install();
    expect(loose("Jazz Brunch")).toEqual([]);
    expect(loose("night bazaar stalls")).toEqual([]); // one word of three
    expect(loose("ni")).toEqual([]); // not a name yet (under three letters in all)
  });
  it("each seating and each departure is its own row, in time order; nothing is merged", () => {
    install();
    expect(loose("improv")).toEqual([IMPROV_7.id, IMPROV_930.id]);
    expect(loose("hour improv")).toEqual([IMPROV_7.id, IMPROV_930.id]);
    expect(loose("acela nyc")).toEqual([TRAIN_AM.id, TRAIN_PM.id]);
    expect(E.eventWhen(E.EV[IMPROV_930.id]!)).toMatch(/9:30 PM$/);
    expect(E.eventWhen(E.EV[TRAIN_PM.id]!)).toMatch(/3:10 PM$/); // a departure keeps its time
  });
  it("among equal matches the events `first` picks out lead (Sell: the ones the seller holds unlisted tickets for)", () => {
    install();
    expect(loose("night", { first: (e: { id: string }) => e.id === OYSTERS.id })).toEqual([OYSTERS.id, COMEDY.id, MARKET.id, BAR.id]);
    // … but never ahead of a better match
    expect(loose("night market", { first: (e: { id: string }) => e.id === OYSTERS.id })[0]).toBe(MARKET.id);
  });
  it("a date entered still refines the order among equal matches", () => {
    install();
    expect(ids(E.suggestEvents("improv", "2026-11-27T21:30", { max: 5, loose: true } as Parameters<typeof E.suggestEvents>[2]))).toEqual([IMPROV_930.id, IMPROV_7.id]);
  });
  it("without loose the search is as it was: an earlier word has to be whole, and little words are ignored", () => {
    install();
    const strict = (text: string) => ids(E.suggestEvents(text, "", { max: 5 }));
    expect(strict("night oys")[0]).toBe(OYSTERS.id); // the last word may be half typed, as before
    expect(strict("oys night")).toEqual([COMEDY.id, MARKET.id, OYSTERS.id, BAR.id]); // "oys" isn't whole: one word of two for each, the soonest first
    expect(strict("oy ni")).toEqual([]);
  });
});
