// The picture a card leads with on Available and Wanted (_lib/look.js). §9s item 7 (SELL4-L4) chose it from an explicit category,
// then an obvious word in the title, then a month/day tile. §9v item 1 (SELL5-M4) made it the icon of the row category alone. §9x item 2
// (SELL6-N2) restores the choice: an explicit category first, a conservative cue in the title second, the neutral ticket when unclear
// (no month/day tile: the date is on the card's own line), with a train and a trek in their row's icon, and no card under Events ever
// in the train or the mountain. These are L4's sixteen tests, each kept with its inputs and its expectation changed to the §9x rule (the
// old and new text are recorded in suite-changes-live.md, "Final batch (9x)" > "Step SELL6-N2"; M4's changes to them are under
// "Polished marketplace (9v)" > "Step SELL5-M4"); the rule's own tests are in n2-cards.test.ts. Display only: nothing here changes the
// event.
// Pure functions over the engine; no DOM, no server, no sign-in.
import { describe, expect, it } from "vitest";
import { CATS, GOODS_CATS } from "@penntools/tool-handoff/engine";
import { CAT_ICON } from "./routes";
import { BOARD_LOOK, eventKind, eventLook, itemLook, lookKey, requestLook } from "./look";

/** An event as a view holds it; only what the look reads matters here. */
const ev = (title: string, start: string, over: Record<string, unknown> = {}) => Object.freeze({ id: "ev-00000000000000c1", kind: "event", title, club: "", cat: "", start, attend: "all", tiers: [], ...over });
type Kind = keyof typeof BOARD_LOOK;
/** A row category's own look: the train, the mountain, the bag; for Events the neutral ticket. */
const row = (k: Kind) => ({ kind: "icon", icon: BOARD_LOOK[k].icon, color: BOARD_LOOK[k].color, cat: k, of: null, from: k === "events" ? "none" : "kind" });
/** An ordinary event category's look, from the event's own category or from a cue in its title. */
const cat = (c: keyof typeof CATS, from: "category" | "title") => ({ kind: "icon", icon: (CAT_ICON as Record<string, string>)[c], color: CATS[c], cat: "events", of: c, from });

describe("an explicit category, or a train or a trek, comes first (9x item 2; 9v had: the row category alone decides)", () => {
  it("a train and a trek use their row's icon and colour; an ordinary event that states a category uses that category's", () => {
    expect(eventLook(ev("Acela PHL to NYC", "2026-11-22T09:05", { kind: "train", cat: "Travel" }))).toEqual(row("trains"));
    expect(eventLook(ev("Lisbon Spring Trek", "2026-12-26T08:00", { kind: "trek", cat: "Treks & trips" }))).toEqual(row("treks"));
    expect(eventLook(ev("Fall Gala", "2026-12-01", { cat: "Parties" }))).toEqual(cat("Parties", "category"));
    expect(eventLook(ev("Fall Gala", "2026-12-01", { cat: "Parties" })).icon).toBe("music");
    expect(eventLook(ev("Acela PHL to NYC", "2026-11-22T09:05", { kind: "train", cat: "Travel" })).icon).toBe("train");
  });

  it("the event's own category comes before a word in its title", () => {
    expect(eventLook(ev("Wine & Hockey Night", "2026-12-03", { cat: "Sports" }))).toEqual(cat("Sports", "category"));
    expect(eventLook(ev("Comedy Trip", "2026-12-03", { cat: "Food & drink" })).icon).toBe("wine");
  });

  it("the row category is the board's own (the engine's catOf, by category): Handoff always gives a train and a trek theirs, so one without it is listed, and pictured, under Events", () => {
    expect(eventKind(ev("Morning departure", "2026-11-22T09:05", { kind: "train", cat: "" }))).toBe("events");
    expect(eventLook(ev("Morning departure", "2026-11-22T09:05", { kind: "train", cat: "" }))).toEqual(row("events"));
    expect(eventLook(ev("Patagonia", "2027-01-10", { kind: "trek", cat: null }))).toEqual(row("events"));
  });

  it("an unknown category, or none, is Events", () => {
    expect(eventKind(ev("Something", "2026-11-28", { cat: "constructor" }))).toBe("events");
    expect(eventLook(ev("Something", "2026-11-28", { cat: "Made up" })).kind).toBe("icon");
  });
});

describe("an obvious word in the title comes second (9x item 2; 9v had: no guessed title cue)", () => {
  it("a cue borrows its category's picture; a card under Events never borrows the train or the mountain", () => {
    const titles: [string, ReturnType<typeof row> | ReturnType<typeof cat>][] = [
      ["Amtrak Northeast Regional: Philadelphia to New York", row("events")], ["SEPTA regional rail pass", row("events")], ["Spring Break Trip to Lisbon", row("events")], ["Ski retreat", row("events")],
      ["Penn vs. Princeton", cat("Sports", "title")], ["Eagles at Giants", cat("Sports", "title")], ["Broad Street 10K", cat("Sports", "title")], ["Oysters Night", cat("Food & drink", "title")],
      ["Wine tasting", cat("Food & drink", "title")], ["Jazz Brunch", cat("Food & drink", "title")], ["Comedy Night", cat("Shows", "title")],
      ["Mask and Wig show", cat("Shows", "title")], ["STAND-UP showcase", cat("Shows", "title")], ["Wharton Tech Conference", cat("Conferences", "title")], ["Career fair", cat("Conferences", "title")],
      ["Fall Gala", cat("Parties", "title")], ["Spring Formal", cat("Parties", "title")], ["Jazz night", cat("Parties", "title")],
    ];
    for (const [title, look] of titles) expect(eventLook(ev(title, "2026-11-28")), title).toEqual(look);
  });

  it("words that only resemble a cue choose nothing; accents are ignored", () => {
    for (const title of ["Ballroom lessons", "Training session", "Showcase of work", "Board game night", ""])
      expect(eventLook(ev(title, "2026-11-28")), title).toEqual(row("events"));
    expect(eventLook(ev("SOIRÉE de Noël", "2026-11-28"))).toEqual(cat("Parties", "title"));
  });

  it("the rows' own looks are the row's four icons", () => {
    const looks = new Set((Object.keys(BOARD_LOOK) as Kind[]).map((k) => BOARD_LOOK[k].icon));
    expect([...looks].sort()).toEqual(["bag", "mountain", "ticket", "train"]);
  });
});

describe("no month/day tile: the neutral ticket when unclear (9x item 2, as 9v)", () => {
  it("an event with nothing else to go on shows the ticket, not its date", () => {
    expect(eventLook(ev("L1 Something", "2026-11-28"))).toEqual(row("events"));
    expect(eventLook(ev("Hamilton", "2026-12-01T19:00"))).toMatchObject({ kind: "icon", icon: "ticket" });
  });

  it("the plain ticket with nothing at all to go on", () => {
    expect(eventLook(ev("L1 Something", "not a date"))).toEqual(row("events"));
    expect(eventLook(null)).toEqual(row("events"));
  });

  it("is display only: the event is left as it was", () => {
    const e = ev("Something", "2026-11-28");
    const before = JSON.stringify(e);
    eventLook(e); requestLook({ eventId: e.id, qty: 1 }, e);
    expect(JSON.stringify(e)).toBe(before);
  });
});

describe("the same look for the same event on both boards", () => {
  it("a request for an event shows exactly its event's look", () => {
    for (const e of [ev("Acela PHL to NYC", "2026-11-22T09:05", { kind: "train", cat: "Travel" }), ev("Oysters Night", "2026-11-25"), ev("L1 Something", "2026-11-28")])
      expect(requestLook({ eventId: e.id, qty: 2, budget: 40 }, e)).toEqual(eventLook(e));
  });

  it("names each look the same way wherever it's drawn", () => {
    expect(lookKey(eventLook(ev("Acela PHL to NYC", "2026-11-22T09:05", { kind: "train", cat: "Travel" })))).toBe("icon:train");
    expect(lookKey(eventLook(ev("Oysters Night", "2026-11-25")))).toBe("icon:wine");
    expect(lookKey(eventLook(ev("L1 Something", "2026-11-28")))).toBe("icon:ticket");
    expect(lookKey(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null, "/tools/handoff/photo/g0000000000000001?v=0123456789abcdef"))).toBe("photo");
    expect(lookKey(null)).toBe("");
  });

  it("a photo never replaces an event's look", () => {
    const e = ev("L1 Something", "2026-11-28");
    expect(requestLook({ eventId: e.id, qty: 1 }, e, "/tools/handoff/photo/g0000000000000001?v=0123456789abcdef")).toEqual(eventLook(e));
  });
});

describe("Goods: a seller's real photo, else the item category's icon, else the bag (9x item 2; 9v had: the bag whatever the category)", () => {
  it("shows the bag and Goods' colour for an item with no picture of its own", () => {
    expect(itemLook()).toMatchObject({ kind: "icon", icon: "bag", color: BOARD_LOOK.goods.color, cat: "goods" });
    expect(requestLook({ goods: { title: "Bike lock", cat: "Sports & outdoor" }, qty: 1 }, null)).toMatchObject({ kind: "icon", icon: "bag" });
    expect(requestLook({ goods: { title: "Thing", cat: "toString" }, qty: 1 }, null)).toMatchObject({ icon: "bag", cat: "goods" });
  });

  it("uses the photo the card has, and only a real address", () => {
    const src = "/tools/handoff/photo/g0000000000000001?v=0123456789abcdef";
    expect(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null, src)).toMatchObject({ kind: "photo", src, icon: "home", color: (GOODS_CATS as Record<string, readonly string[]>)["Home & kitchen"]?.[1] ?? "missing", from: "photo" });
    expect(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null, null)).toMatchObject({ kind: "icon", icon: "home" });
    expect(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null, "")).toMatchObject({ kind: "icon" });
  });
});

describe("an older request for an event that isn't on Handoff", () => {
  it("is an event: a cue in the name it gave, else the neutral ticket, whatever date it gave (9v had: the ticket whatever its name)", () => {
    expect(requestLook({ qty: 1, missing: { title: "Wine Club tasting", when: "2026-12-04" } }, null)).toEqual(cat("Food & drink", "title"));
    expect(requestLook({ qty: 1, missing: { title: "L1 Something", when: "2026-12-04" } }, null)).toEqual(row("events"));
    expect(requestLook({ qty: 1, missing: { title: "L1 Something", flexible: true, when: "2026-12-04" } }, null)).toEqual(row("events"));
    expect(requestLook({ qty: 1, missing: { title: "L1 Something" } }, null)).toEqual(row("events"));
  });
});
