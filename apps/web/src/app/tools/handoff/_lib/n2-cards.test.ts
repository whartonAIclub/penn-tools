// SELL6-N2 (USER-INSTRUCTIONS §9x items 2 and 3): the cards' visual presence and secondary status. The page's rules with no page in them:
// - a card's picture is chosen from Handoff's own icons: an explicit category first, a conservative cue in the title second, the
//   neutral ticket when unclear; "White Wine Varietals" and "Spring Formal" get appropriate, different pictures; the same event has the
//   same icon and colour wherever it shows; choosing a picture never changes the event, its category or the row it is listed under
//   (look.js);
// - Goods: the seller's photo when there is one, else a suitable category icon (look.js);
// - the owner's own card wears a small "Your listing" label, not a pill that says "You've listed 1 ticket"; its price leads, and how
//   many are available (and how many a buyer holds) is said once; a free ticket's price reads "Free" (cards.js).
// Pure functions over the engine; no DOM, no server, no sign-in.
import { describe, expect, it } from "vitest";
import { CATS, GOODS_CATS, catOf, money, priceParts } from "@penntools/tool-handoff/engine";
import { BOARD_ROW, CAT_ICON } from "./routes";
import { BOARD_LOOK, EVENT_CATS, TITLE_CUES, eventKind, eventLook, itemLook, lookKey, requestLook, titleCue } from "./look";
import { OWN_LABEL, cardPrice, ownCard, ownSub } from "./cards";

/** An event as a view holds it; only what the rules read matters here. */
const ev = (title: string, over: Record<string, unknown> = {}) => Object.freeze({ id: "ev-00000000000000c1", kind: "event", title, club: "", start: "2026-12-01", attend: "all", tiers: [], ...over });
const WINE = ev("White Wine Varietals");
const FORMAL = ev("Spring Formal", { club: "WGA" });
const TRAIN = ev("Acela PHL to NYC", { kind: "train", cat: "Travel", start: "2026-11-22T09:05" });
const TREK = ev("Lisbon Spring Trek", { kind: "trek", cat: "Treks & trips", start: "2026-12-26T08:00" });
const PHOTO = "/tools/handoff/photo/g0000000000000001?v=0123456789abcdef";
/** The event as the engine's own functions take it (they read only a few of its fields here). */
const asEv = (e: object) => e as unknown as Parameters<typeof catOf>[0];
/** A Goods category's colour (the engine's GOODS_CATS: [icon, colour]). */
const goodsColor = (c: string): string => { const v = (GOODS_CATS as Record<string, readonly string[] | undefined>)[c]; if (!v || typeof v[1] !== "string") throw new Error("no Goods category " + c); return v[1]; };
/** The icons Handoff already draws (_components/ui.jsx PATHS) that a card may wear. */
const EXISTING = ["ticket", "train", "mountain", "bag", "music", "wine", "globe", "trophy", "sofa", "home", "monitor", "shirt", "book"];

describe("a card's picture: an explicit category first (9x item 2)", () => {
  it("an ordinary event that states its category wears that category's icon and colour", () => {
    expect(eventLook(ev("Fall Gala", { cat: "Parties" }))).toEqual({ kind: "icon", icon: "music", color: CATS.Parties, cat: "events", of: "Parties", from: "category" });
    expect(eventLook(ev("Members Dinner", { cat: "Food & drink" }))).toMatchObject({ icon: "wine", color: CATS["Food & drink"], from: "category" });
    expect(eventLook(ev("Annual Meeting", { cat: "Conferences" }))).toMatchObject({ icon: "globe", color: CATS.Conferences, from: "category" });
    expect(eventLook(ev("Finals", { cat: "Sports" }))).toMatchObject({ icon: "trophy", color: CATS.Sports, from: "category" });
    expect(eventLook(ev("Spring Showcase", { cat: "Shows" }))).toMatchObject({ icon: "ticket", color: CATS.Shows, from: "category" });
  });
  it("the stated category beats a word in the title", () => {
    expect(eventLook(ev("Wine & Hockey Night", { cat: "Sports" }))).toMatchObject({ icon: "trophy", of: "Sports", from: "category" });
    expect(eventLook(ev("Comedy Dinner", { cat: "Parties" }))).toMatchObject({ icon: "music", of: "Parties", from: "category" });
  });
  it("a train and a trek wear their row's icon and colour, whatever their name says", () => {
    expect(eventLook(TRAIN)).toEqual({ kind: "icon", icon: "train", color: BOARD_LOOK.trains.color, cat: "trains", of: null, from: "kind" });
    expect(eventLook(TREK)).toEqual({ kind: "icon", icon: "mountain", color: BOARD_LOOK.treks.color, cat: "treks", of: null, from: "kind" });
    expect(eventLook(ev("Wine Country Trek", { kind: "trek", cat: "Treks & trips" })).icon).toBe("mountain");
    expect(eventLook(ev("Dinner train to NYC", { kind: "train", cat: "Travel" })).icon).toBe("train");
  });
});

describe("a card's picture: a conservative cue in the title second (9x item 2)", () => {
  it("White Wine Varietals and Spring Formal get appropriate, different pictures", () => {
    const w = eventLook(WINE), f = eventLook(FORMAL);
    expect(w).toEqual({ kind: "icon", icon: "wine", color: CATS["Food & drink"], cat: "events", of: "Food & drink", from: "title" });
    expect(f).toEqual({ kind: "icon", icon: "music", color: CATS.Parties, cat: "events", of: "Parties", from: "title" });
    expect(w.icon).not.toBe(f.icon);
    expect(w.color).not.toBe(f.color);
  });
  it("obvious words choose a picture: food and drink, a show, a conference, a party, a game", () => {
    const want: [string, string][] = [["Oysters Night", "wine"], ["Jazz Brunch", "wine"], ["Wine tasting", "wine"], ["Comedy Hour", "ticket"], ["Mask and Wig show", "ticket"],
      ["Wharton Tech Conference", "globe"], ["Career fair", "globe"], ["Fall Gala", "music"], ["Jazz night", "music"], ["Penn vs. Princeton", "trophy"], ["Broad Street 10K", "trophy"]];
    for (const [title, icon] of want) expect(eventLook(ev(title)), title).toMatchObject({ kind: "icon", icon, cat: "events", from: "title" });
    expect(eventLook(ev("Comedy Hour")).color).toBe(CATS.Shows); // a show's ticket is in the Shows colour, not the neutral one
  });
  it("whole words only, in any case, accents ignored; near misses choose nothing", () => {
    expect(titleCue("SOIRÉE de Noël")).toBe("Parties");
    expect(titleCue("STAND-UP showcase")).toBe("Shows");
    for (const title of ["Ballroom lessons", "Training session", "Showcase of work", "Board game night", "Winery tour", "Formality check", ""]) expect(titleCue(title, EVENT_CATS), title).toBeNull();
  });
  it("a word that often means something else is not a cue", () => {
    const words = TITLE_CUES.flatMap(([, ws]) => ws as string[]);
    for (const w of ["game", "night", "club", "play", "spring", "fall", "hour", "talk"]) expect(words, w).not.toContain(w);
  });
  it("a card listed under Events never borrows the train or the mountain: those belong to the Trains and Treks rows", () => {
    for (const title of ["Amtrak Northeast Regional: Philadelphia to New York", "SEPTA regional rail pass", "Spring Break Trip to Lisbon", "Ski retreat"]) {
      const l = eventLook(ev(title));
      expect(l, title).toEqual({ kind: "icon", icon: "ticket", color: BOARD_LOOK.events.color, cat: "events", of: null, from: "none" });
    }
    expect(eventLook(ev("Wine train to Napa"))).toMatchObject({ icon: "wine", from: "title" }); // a later cue for Events still counts
    expect(eventLook(ev("Morning departure", { kind: "train", cat: "" })).icon).toBe("ticket"); // listed under Events (the engine's catOf), so pictured there
  });
});

describe("a card's picture: the neutral ticket when unclear (9x item 2)", () => {
  it("no category and no cue: the plain ticket in Handoff's own colour, never a guess and never a date tile", () => {
    for (const title of ["Founders Talk", "Fall Kickoff", "L1 Something", "Hamilton", "Trivia Night"]) expect(eventLook(ev(title)), title).toEqual({ kind: "icon", icon: "ticket", color: "var(--accent)", cat: "events", of: null, from: "none" });
    expect(eventLook(null)).toMatchObject({ kind: "icon", icon: "ticket", from: "none" });
    expect(eventLook(ev("Something", { cat: "Made up" }))).toMatchObject({ icon: "ticket", from: "none" });
    expect(eventLook(ev("Something", { cat: "constructor" }))).toMatchObject({ icon: "ticket", from: "none" });
  });
  it("only icons Handoff already has, and only the category row's four or an event or item category's", () => {
    const all = [...Object.values(BOARD_LOOK).map((l) => l.icon), ...EVENT_CATS.map((c) => eventLook(ev("x", { cat: c })).icon), ...Object.keys(GOODS_CATS).map((c) => itemLook(c).icon)];
    for (const i of all) expect(EXISTING, i).toContain(i);
    expect(EVENT_CATS.map((c) => eventLook(ev("x", { cat: c })).icon)).toEqual(EVENT_CATS.map((c) => (CAT_ICON as Record<string, string>)[c]));
  });
});

describe("choosing a picture is display only (9x item 2)", () => {
  it("the event is left as it was, and the row it is listed under is the engine's, not the picture's", () => {
    for (const e of [WINE, FORMAL, TRAIN, TREK, ev("Fall Gala", { cat: "Parties" })]) {
      const before = JSON.stringify(e), row = catOf(asEv(e));
      const l = eventLook(e); requestLook({ eventId: e.id, qty: 1 }, e);
      expect(JSON.stringify(e)).toBe(before);
      expect(catOf(asEv(e))).toBe(row);
      expect(eventKind(e)).toBe(row);
      expect(l.cat).toBe(row); // what the card is listed under (data-kind), whatever it wears
    }
    expect(eventLook(WINE).cat).toBe("events");
    expect("cat" in WINE).toBe(false); // a cue gives no category to the event
  });
  it("the category row keeps its five icons", () => {
    expect(BOARD_ROW).toEqual([["all", "All", "grid"], ["events", "Events", "ticket"], ["trains", "Trains", "train"], ["treks", "Treks", "mountain"], ["goods", "Goods", "bag"]]);
    for (const [k, , icon] of BOARD_ROW) if (k !== "all") expect(BOARD_LOOK[k as keyof typeof BOARD_LOOK].icon, k).toBe(icon);
  });
});

describe("the same event has the same icon and colour everywhere (9x item 2)", () => {
  it("a request for an event shows exactly its event's look (Available and Wanted, signed in or out)", () => {
    for (const e of [WINE, FORMAL, TRAIN, TREK, ev("Founders Talk"), ev("Fall Gala", { cat: "Parties" })]) {
      expect(requestLook({ eventId: e.id, qty: 2, budget: 40 }, e)).toEqual(eventLook(e));
      expect(requestLook({ eventId: e.id, qty: 1 }, e)).toEqual(eventLook(e)); // a visitor's row has no budget
      expect(requestLook({ eventId: e.id, qty: 1 }, e, PHOTO)).toEqual(eventLook(e)); // a photo never replaces an event's look
    }
  });
  it("names each picture one way wherever it is drawn", () => {
    expect(lookKey(eventLook(WINE))).toBe("icon:wine");
    expect(lookKey(eventLook(FORMAL))).toBe("icon:music");
    expect(lookKey(eventLook(TRAIN))).toBe("icon:train");
    expect(lookKey(eventLook(TREK))).toBe("icon:mountain");
    expect(lookKey(eventLook(ev("Founders Talk")))).toBe("icon:ticket");
  });
  it("an older request for an event that isn't on Handoff: a cue in the name it gave, else the neutral ticket", () => {
    expect(requestLook({ qty: 1, missing: { title: "Wine Club tasting", when: "2026-12-04" } }, null)).toMatchObject({ icon: "wine", cat: "events", from: "title" });
    expect(requestLook({ qty: 1, missing: { title: "L1 Something", when: "2026-12-04" } }, null)).toMatchObject({ icon: "ticket", from: "none" });
    expect(requestLook({ qty: 1, missing: { title: "Amtrak to NYC" } }, null)).toMatchObject({ icon: "ticket", from: "none" });
    expect(requestLook({ qty: 1 }, null)).toMatchObject({ icon: "ticket", from: "none" });
  });
});

describe("Goods: the seller's photo when there is one, else a suitable category icon (9x item 2)", () => {
  it("a category with a picture of its own wears it, in its colour", () => {
    expect(itemLook("Furniture")).toEqual({ kind: "icon", icon: "sofa", color: goodsColor("Furniture"), cat: "goods", of: "Furniture", from: "category" });
    expect(itemLook("Home & kitchen")).toMatchObject({ icon: "home", color: goodsColor("Home & kitchen") });
    expect(itemLook("Electronics")).toMatchObject({ icon: "monitor" });
    expect(itemLook("Clothing")).toMatchObject({ icon: "shirt" });
    expect(itemLook("Books & supplies")).toMatchObject({ icon: "book" });
  });
  it("no category, Other, an unknown one, and Sports & outdoor (whose mountain is the Treks row's now): the shopping bag", () => {
    const bag = { kind: "icon", icon: "bag", color: BOARD_LOOK.goods.color, cat: "goods", of: null, from: "kind" };
    for (const c of [undefined, null, "", "Other", "Sports & outdoor", "toString", "Made up"]) expect(itemLook(c), String(c)).toEqual(bag);
    expect(itemLook("Sports & outdoor").icon).not.toBe(eventLook(TREK).icon);
    expect(itemLook("Other").icon).not.toBe("grid"); // the grid is the row's All
  });
  it("the seller's photo leads when the page has its address, and keeps the item's icon for when it can't be had", () => {
    expect(itemLook("Home & kitchen", PHOTO)).toEqual({ kind: "photo", src: PHOTO, icon: "home", color: goodsColor("Home & kitchen"), cat: "goods", of: "Home & kitchen", from: "photo" });
    expect(itemLook(null, PHOTO)).toMatchObject({ kind: "photo", src: PHOTO, icon: "bag" });
    expect(lookKey(itemLook("Furniture", PHOTO))).toBe("photo");
    expect(itemLook("Furniture", "")).toEqual(itemLook("Furniture"));
    expect(itemLook("Furniture", null)).toEqual(itemLook("Furniture"));
  });
  it("a Goods request looks like an item of its category on Available", () => {
    expect(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null)).toEqual(itemLook("Home & kitchen"));
    expect(requestLook({ goods: { title: "Bike lock", cat: "Sports & outdoor" }, qty: 1 }, null)).toEqual(itemLook("Sports & outdoor"));
    expect(requestLook({ goods: { title: "Desk lamp", cat: "Home & kitchen" }, qty: 1 }, null, PHOTO)).toEqual(itemLook("Home & kitchen", PHOTO));
  });
});

/** The engine's eventSummary for a viewer, as far as a card reads it. */
const sum = (over: Record<string, unknown> = {}) => ({ state: { key: "mine", label: "You've listed 1 ticket", tone: "good" }, myOpen: null, best: null, ownMain: { id: "l0000000000000001", ask: 25, paid: 25, listed: 1 }, ownUnit: "ticket", ownAvail: 1, ownReserved: 0, ownPaused: 0, ...over });

describe("the owner's own card: a small \"Your listing\" label, and what is so said once (9x item 3)", () => {
  it("the label is \"Your listing\", never a count", () => {
    expect(OWN_LABEL).toBe("Your listing");
    expect(ownCard(sum())).toEqual({ label: "Your listing", status: "1 ticket available" });
    expect(ownCard(sum())!.label).not.toMatch(/\d|listed/);
  });
  it("how many are available is said once, in the status", () => {
    expect(ownCard(sum({ ownAvail: 2, ownMain: { ask: 25, listed: 2 } }))!.status).toBe("2 tickets available");
    expect(ownCard(sum({ ownUnit: "spot" }))!.status).toBe("1 spot available");
  });
  it("a reserved, a partly reserved and a paused listing say what they actually are", () => {
    expect(ownCard(sum({ ownAvail: 1, ownReserved: 1, ownMain: { ask: 25, listed: 2 } }))!.status).toBe("1 ticket available · 1 ticket held for a buyer");
    expect(ownCard(sum({ ownAvail: 0, ownReserved: 1, state: { key: "mine", label: "Your ticket is held for a buyer", tone: "warn" } }))).toEqual({ label: "Your listing", status: "1 ticket held for a buyer" });
    expect(ownCard(sum({ ownAvail: 0, ownPaused: 2, state: { key: "mine", label: "Your listing is paused", tone: "warn" } }))!.status).toBe("2 tickets paused");
  });
  it("not the owner's card: someone else's tickets, nobody's, or the viewer's own request or reservation (its pill stays)", () => {
    expect(ownCard(sum({ state: { key: "available", label: "1 ticket available", tone: "good" } }))).toBeNull();
    expect(ownCard(sum({ state: { key: "mine", label: "You reserved this", tone: "warn" }, myOpen: { id: "r1", price: 25 } }))).toBeNull();
    expect(ownCard(sum({ state: { key: "wanted", label: "No tickets listed", tone: "warn" }, ownMain: null }))).toBeNull();
    expect(ownCard(sum({ ownMain: null }))).toBeNull();
    expect(ownCard(null)).toBeNull();
  });
});

describe("the price a card leads with (9x items 1 and 3)", () => {
  it("the owner's own card leads with the price itself, not \"Your listing: $25\"", () => {
    const asSum = (x: object) => x as unknown as Parameters<typeof priceParts>[1];
    const main = priceParts(asEv(ev("Fall Gala")), asSum(sum())).main; // the engine's words, which the event page and the preview keep
    expect(main.pre.join("")).toBe("Your listing: ");
    expect(cardPrice(main, { own: true })).toEqual({ pre: "", bold: "$25", post: "" });
    expect(cardPrice(priceParts(asEv(ev("Fall Gala")), asSum(sum({ ownMain: { ask: 25, paid: 25, listed: 2 }, ownAvail: 2 }))).main, { own: true })).toEqual({ pre: "", bold: "$25", post: " per ticket" });
  });
  it("another seller's card is as it was", () => {
    expect(cardPrice({ pre: ["Tickets", " from "], bold: ["$40"], post: [] })).toEqual({ pre: "Tickets from ", bold: "$40", post: "" });
    expect(cardPrice({ pre: ["Spots", " from "], bold: ["$900"], post: [] })).toEqual({ pre: "Spots from ", bold: "$900", post: "" });
  });
  it("a free ticket reads \"Free\", never \"$0\"", () => {
    expect(money(0)).toBe("$0");
    expect(cardPrice({ pre: ["Tickets", " from "], bold: ["$0"], post: [] })).toEqual({ pre: "", bold: "Free", post: "" });
    expect(cardPrice({ pre: ["Your listing: "], bold: ["$0"], post: [" per ticket"] }, { own: true })).toEqual({ pre: "", bold: "Free", post: "" });
    expect(cardPrice({ pre: ["Tickets", " from "], bold: ["$10"], post: [] }).bold).toBe("$10");
  });
  it("under the owner's price: the status once, then a face value only when it isn't the price", () => {
    const own = { status: "1 ticket available" };
    expect(ownSub(own, "1 ticket available", "$25")).toBe("1 ticket available");
    expect(ownSub(own, "1 ticket available · face value $25", "$25")).toBe("1 ticket available");
    expect(ownSub(own, "1 ticket available · face value $30", "$25")).toBe("1 ticket available · face value $30");
    expect(ownSub({ status: "1 ticket available · 1 ticket held for a buyer" }, "1 ticket available · 1 ticket held for a buyer", "$25")).toBe("1 ticket available · 1 ticket held for a buyer");
    expect(ownSub({ status: "" }, "face value $30", "$25")).toBe("Face value $30");
    expect((ownSub(own, "1 ticket available · face value $30", "$25").match(/available/g) || []).length).toBe(1);
  });
});
