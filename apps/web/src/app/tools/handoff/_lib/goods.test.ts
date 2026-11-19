// Simplified Goods (USER-INSTRUCTIONS §9q item 6), the page's rules with no page in them (_lib/goods.js): what "Post item" sends
// for a name and a price (exactly those), what stops it, the "Listing expires in 14 days" line and its dates, the one collapsed
// "Optional details" line, and an item's words wherever it shows: nothing for a category, condition or pickup area it doesn't state,
// "Pickup by" only for a deadline its seller chose, and every word as before for an item that states them all.
// Pure functions over the engine with a set clock; no DOM, no server, no sign-in.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as E from "@penntools/tool-handoff/engine";
import {
  GOODS0, GOODS_CONFIRM, daysTo, defaultExpiry, expiryLine, guestItemText, itemAction, itemDateIssue, itemEnds, itemEndsShort, itemExpiry, itemIssues, itemKind, itemMeet,
  itemMoreHint, itemMoreUsed, itemOver, itemOverWords, itemOwnLine, itemPanelWhere, itemWhere, itemWhereRow, postAgainGoods,
} from "./goods";

const T0 = Date.UTC(2026, 10, 16, 15, 0); // Mon Nov 16, 2026, 10:00 AM in Philadelphia
const DAY = 86_400_000;
const day = (n: number) => E.isoDate(T0 + n * DAY);
const form = (over: Partial<Record<keyof typeof GOODS0, string | boolean>> = {}) => ({ ...GOODS0, ...over }) as typeof GOODS0;
type Item = Parameters<typeof itemKind>[0];
/** An item as a view carries one posted with a name and a price only. */
const BARE = { id: "g1", sellerId: "u1", title: "Desk lamp", price: 0, obo: false, until: "2026-11-30", noPickupBy: true, note: "", createdAt: T0, history: [] } as unknown as Item;
/** An item posted with every field, as every item was before this. */
const FULL = { id: "g2", sellerId: "u1", title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: 15, obo: false, area: "Rittenhouse", until: "2026-11-30", note: "", createdAt: T0, history: [] } as unknown as Item;

beforeEach(() => { E.setLiveClock(() => T0); E.applyWorld({ ...E.emptyWorld() } as unknown as Parameters<typeof E.applyWorld>[0]); });
afterEach(() => { E.setLiveClock(null); E.applyWorld(null); });

describe("Post item sends a name and a price, and only what else the seller set (9q item 6)", () => {
  it("an untouched form sends exactly the name and the price: no category, condition, area or date", () => {
    expect(itemAction(form({ title: "Desk lamp", price: "0" }))).toEqual({ type: "postItem", data: { title: "Desk lamp", price: "0" } });
    expect(GOODS0.cond).toBe(""); // no condition is chosen for the seller
    expect([GOODS0.cat, GOODS0.area, GOODS0.until, GOODS0.expires]).toEqual(["", "", "", ""]);
  });
  it("each optional detail goes only when set", () => {
    expect(itemAction(form({ title: "Monitor", price: "60", cat: "Electronics", cond: "Like new", area: " Huntsman Hall ", note: "2023 model" })).data)
      .toEqual({ title: "Monitor", price: "60", cat: "Electronics", cond: "Like new", area: " Huntsman Hall ", note: "2023 model" });
    expect(itemAction(form({ title: "Monitor", price: "60", area: "   ", note: "  " })).data).toEqual({ title: "Monitor", price: "60" });
  });
  it("offers go with a price above $0 only, and the lowest offer only with offers", () => {
    expect(itemAction(form({ title: "Monitor", price: "60", obo: true })).data).toEqual({ title: "Monitor", price: "60", obo: true });
    expect(itemAction(form({ title: "Monitor", price: "60", obo: true, minOffer: "40" })).data).toEqual({ title: "Monitor", price: "60", obo: true, minOffer: "40" });
    expect(itemAction(form({ title: "Monitor", price: "0", obo: true, minOffer: "40" })).data).toEqual({ title: "Monitor", price: "0" });
    expect(itemAction(form({ title: "Monitor", price: "60", minOffer: "40" })).data).toEqual({ title: "Monitor", price: "60" });
  });
  it("a pickup deadline goes as `until`; a changed expiry day as `expires`, and never both", () => {
    expect(itemAction(form({ title: "Desk", price: "20", expires: day(30) })).data).toEqual({ title: "Desk", price: "20", expires: day(30) });
    expect(itemAction(form({ title: "Desk", price: "20", until: day(5) })).data).toEqual({ title: "Desk", price: "20", until: day(5) });
    expect(itemAction(form({ title: "Desk", price: "20", until: day(5), expires: day(30) })).data).toEqual({ title: "Desk", price: "20", until: day(5) });
  });
  it("the line by the button says what posting confirms, with no tick", () => {
    expect(GOODS_CONFIRM).toBe("Posting confirms it's yours to sell and that you'll answer requests within 48 hours. Pickup and payment happen between you and the buyer, outside Handoff.");
  });
});

describe("what stops Post item: the name, the price, a wrong date or lowest offer (9q item 6)", () => {
  it("names the name and the price for an empty form, and nothing once both are there", () => {
    expect(itemIssues(form())).toEqual([{ id: "g-title", what: "item name" }, { id: "g-price", what: "price" }]);
    expect(itemIssues(form({ title: "Desk lamp", price: "0" }))).toEqual([]);
    expect(itemIssues(form({ title: "Desk lamp", price: "12.50" }))).toEqual([]);
    expect(itemIssues(form({ title: "Desk lamp", price: "free" }))).toEqual([{ id: "g-price", what: "price" }]);
    expect(itemIssues(form({ title: "  ", price: "5" }))).toEqual([{ id: "g-title", what: "item name" }]);
  });
  it("never asks for a category, an area, a condition or a confirmation", () => {
    const whats = itemIssues(form()).map((p) => p.what).join(" ");
    expect(whats).not.toMatch(/category|area|condition|confirmation|pickup/);
  });
  it("points at a wrong date or lowest offer, and says which sit under Optional details", () => {
    expect(itemIssues(form({ title: "Desk", price: "20", expires: day(-1) }))).toEqual([{ id: "g-expires", what: "expiry day" }]);
    expect(itemIssues(form({ title: "Desk", price: "20", expires: day(61) }))).toEqual([{ id: "g-expires", what: "expiry day" }]);
    expect(itemIssues(form({ title: "Desk", price: "20", until: day(61) }))).toEqual([{ id: "g-until", what: "pickup deadline", more: true }]);
    expect(itemIssues(form({ title: "Desk", price: "20", obo: true, minOffer: "25" }))).toEqual([{ id: "g-min", what: "lowest offer", more: true }]);
    // A pickup deadline is the date in force: an expiry day left wrong behind it stops nothing (it isn't sent).
    expect(itemIssues(form({ title: "Desk", price: "20", until: day(5), expires: day(61) }))).toEqual([]);
    // A lowest offer typed with offers off, or for a free item, stops nothing either.
    expect(itemIssues(form({ title: "Desk", price: "20", minOffer: "25" }))).toEqual([]);
    expect(itemIssues(form({ title: "Desk", price: "0", obo: true, minOffer: "25" }))).toEqual([]);
  });
  it("takes any day that isn't over, up to 60 days on (the server's rule)", () => {
    expect(itemDateIssue("")).toBeNull();
    expect(itemDateIssue(day(0))).toBeNull(); // open through the end of today
    expect(itemDateIssue(day(1))).toBeNull();
    expect(itemDateIssue(day(60))).toBeNull();
    expect(itemDateIssue(day(-1))).toBe("Pick a date in the future.");
    expect(itemDateIssue(day(-3))).toBe("Pick a date in the future.");
    expect(itemDateIssue(day(61))).toBe("Pick a date within 60 days.");
    expect(itemDateIssue("2026-13-40")).toBe("Pick a date.");
  });
});

describe("\"Listing expires in 14 days · Change\" (9q item 6)", () => {
  it("is 14 days by default, and follows the day the seller picks", () => {
    expect(defaultExpiry()).toBe("2026-11-30");
    expect(itemExpiry(form())).toBe("2026-11-30");
    expect(daysTo("2026-11-30")).toBe(14);
    expect(expiryLine(form())).toBe("Listing expires in 14 days");
    expect(expiryLine(form({ expires: day(21) }))).toBe("Listing expires in 21 days");
    expect(expiryLine(form({ expires: day(1) }))).toBe("Listing expires in 1 day");
    expect(expiryLine(form({ expires: day(60) }))).toBe("Listing expires in 60 days");
    expect(expiryLine(form({ expires: day(0) }))).toBe("Listing expires today");
  });
  it("closes with the pickup deadline when the seller set one", () => {
    expect(itemExpiry(form({ until: day(5), expires: day(30) }))).toBe(day(5));
    expect(expiryLine(form({ until: day(5) }))).toBe("Listing expires in 5 days, with your pickup deadline");
  });
  it("makes up no count while the date is wrong", () => {
    expect(expiryLine(form({ expires: day(-1) }))).toBe("Listing expires on the day you choose");
    expect(expiryLine(form({ until: day(90) }))).toBe("Listing expires on the day you choose");
  });
  it("counts days by the New York date, late in the evening too", () => {
    const late = Date.UTC(2026, 10, 17, 4, 30); // Mon Nov 16, 11:30 PM in Philadelphia
    expect(defaultExpiry(late)).toBe("2026-11-30");
    expect(daysTo("2026-11-30", late)).toBe(14);
  });
});

describe("the closed Optional details line (9q item 6)", () => {
  it("lists what it holds until something there is set, then says what stands", () => {
    expect(itemMoreUsed(form({ title: "Desk", price: "20" }))).toBe(false);
    expect(itemMoreHint(form())).toBe("Category, pickup area, condition, pickup deadline, offers, description");
    const set = form({ cat: "Electronics", cond: "Like new", area: "University City", until: day(4), obo: true, note: "2023 model" });
    expect(itemMoreUsed(set)).toBe(true);
    expect(itemMoreHint(set)).toBe(`Electronics · Like new · University City · pickup by ${E.fmtDay(day(4))} · open to offers · a description`);
    expect(itemMoreHint(form({ cond: "Fair" }))).toBe("Fair");
    expect(itemMoreUsed(form({ expires: day(30) }))).toBe(false); // the expiry day has its own line, in view
  });
});

describe("an item's words: only what it states (9q item 6)", () => {
  it("says nothing for a category, condition or area an item doesn't state, and never \"pickup by\" for an expiry", () => {
    expect(itemKind(BARE)).toBe("");
    expect(itemWhere(BARE)).toBe("");
    expect(itemOver(BARE)).toBe("Goods");
    expect(itemEnds(BARE)).toBe("Listing expires Mon, Nov 30");
    expect(itemEndsShort(BARE)).toBe("listing expires Nov 30, 2026");
    expect(itemPanelWhere(BARE)).toBe("listing expires Nov 30, 2026");
    expect(itemOwnLine(BARE)).toBe("your item");
    expect(itemMeet(BARE)).toBe("meet somewhere public");
    expect(itemWhereRow(BARE)).toBe("Agree the spot together.");
    expect(itemOverWords(BARE)).toBe("This listing has expired.");
    expect(guestItemText(BARE)).toBe("desk lamp");
    const all = [itemKind(BARE), itemWhere(BARE), itemOver(BARE), itemEnds(BARE), itemPanelWhere(BARE), itemOwnLine(BARE), itemMeet(BARE), itemWhereRow(BARE), guestItemText(BARE)].join(" | ");
    expect(all).not.toMatch(/undefined|null|not stated|\bGood\b|Other|[Pp]ickup by|[Pp]ickup in/);
  });
  it("says each one that is stated, alone or together", () => {
    expect(itemKind({ ...BARE, cond: "Like new" } as Item)).toBe("Like new");
    expect(itemKind({ ...BARE, cat: "Electronics" } as Item)).toBe("Electronics");
    expect(itemWhere({ ...BARE, area: "University City" } as Item)).toBe("University City");
    expect(itemPanelWhere({ ...BARE, area: "University City" } as Item)).toBe("pickup in University City · listing expires Nov 30, 2026");
    const by = { ...BARE, noPickupBy: undefined } as Item; // its seller chose the date as a pickup deadline
    expect(itemWhere(by)).toBe("Pickup by Nov 30, 2026");
    expect(itemEnds(by)).toBe("Pickup by Mon, Nov 30");
    expect(itemPanelWhere(by)).toBe("pickup by Nov 30, 2026");
  });
  it("reads an item that states everything exactly as before", () => {
    expect(itemKind(FULL)).toBe("Home & kitchen · Good");
    expect(itemWhere(FULL)).toBe("Rittenhouse · pickup by Nov 30, 2026");
    expect(itemOver(FULL)).toBe("Goods · Home & kitchen · Good");
    expect(itemEnds(FULL)).toBe("Pickup by Mon, Nov 30");
    expect(itemEndsShort(FULL)).toBe("pickup by Nov 30, 2026");
    expect(itemPanelWhere(FULL)).toBe("pickup in Rittenhouse by Nov 30, 2026");
    expect(itemOwnLine(FULL)).toBe("your item · Good · pickup in Rittenhouse");
    expect(itemMeet(FULL)).toBe("meet in Rittenhouse somewhere public");
    expect(itemWhereRow(FULL)).toBe("Pickup in Rittenhouse. Agree the exact spot together.");
    expect(itemOverWords(FULL)).toBe("The pickup window is over.");
    expect(guestItemText(FULL)).toBe("desk lamp home & kitchen good");
  });
});

describe("Post again starts from what the closed item states (9q item 6)", () => {
  it("brings no condition, category, area or date the item never had", () => {
    expect(postAgainGoods(BARE)).toEqual({ title: "Desk lamp", cat: "", cond: "", price: "0", obo: false, minOffer: "", area: "", until: "", expires: "", photos: [] });
  });
  it("brings an earlier item's fields, and its pickup deadline only while it's still ahead", () => {
    expect(postAgainGoods({ ...FULL, obo: true, minOffer: 10 } as Item)).toEqual({ title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: "15", obo: true, minOffer: "10", area: "Rittenhouse", until: "2026-11-30", expires: "", photos: [] });
    expect(postAgainGoods({ ...FULL, until: "2026-11-16" } as Item).until).toBe("");
    expect(postAgainGoods({ ...FULL, until: "2026-11-10" } as Item).until).toBe("");
  });
});
