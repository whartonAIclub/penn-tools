// §9q item 6 (step SELL3-K3), the engine and server half of "Simplify Goods":
// - An item's name and price are enough to post in the shared market. The server accepts no category, no condition and no pickup
//   area, and stores none: nothing is guessed (never "Good", never "Other", never an invented area). $0 is accepted and reads "Free".
// - The listing expires 14 days on unless the seller chose another day (`expires`). Only a date the seller chose as a pickup deadline
//   (`until`, as the form always sent it) is a "pickup by" date; an item without one carries noPickupBy and is never worded that way.
// - Views, the guest view, notes and the search text leave out what isn't stated. (The share message's checks were removed in SELL5-M1:
//   §9v item 3 removed outward Share, so there is no share message any more.)
// - An item with no category is found by its name, sits under no category, and fits a request only by its name: never by category.
// - An item posted with every field, and every stored item, reads exactly as it did. The preview keeps its own rules.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { WorldState } from "../../engine/index.js";
import { parseAction } from "../live.js";
import type { PilotData } from "../report/index.js";
import { buildPilotReport } from "../report/index.js";
import { contractViolations, guestContractViolations } from "./helpers/contract.js";
import { historyOf, must, resetEngine, textsFor } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, EVE, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
/** "Post item" with a name and a price and nothing else, as the Goods form now sends it. */
const bare = (over: Record<string, unknown> = {}) => act({ type: "postItem", data: { title: "Desk lamp", price: "0", ...over } });
/** "Post item" with every field, as the form always sent it (`until` is the pickup-by date). */
const full = (over: Record<string, unknown> = {}) => act({ type: "postItem", data: { title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: "0", obo: false, minOffer: "", area: "Rittenhouse", until: dateAfter(T0, 10), note: "", ...over } });
const wanted = (title: string, cat: string, over: Record<string, unknown> = {}) => act({ type: "saveInterest", data: { qty: 1, budget: "", note: "", expires: dateAfter(T0, 7), goods: { title, cat }, ...over } });
const stored = (w: ServerWorld, id: string): Record<string, unknown> => must(w.doc.goods.find((g) => g.id === id), `item ${id}`) as unknown as Record<string, unknown>;
function installed<T>(state: { serverNow: number }, fn: (s: WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as WorldState);
  try { return fn(state as unknown as WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}
/** Words no note about an item without a place, condition or pickup deadline may carry ("confirm pickup in Handoff" is the app, not a place). */
const STRAY = /undefined|null|NaN|not stated|\bGood\b|\bOther\b|pickup by|Pickup by|Pickup in|pickup time in |, pickup in | in \.|pickup-by|pickup window/;

describe("a name and a price are enough to post an item (9q item 6)", () => {
  it("is accepted by the input check and the engine, and nothing unstated is stored", () => {
    const parsed = parseAction({ type: "postItem", data: { title: "Desk lamp", price: "0" } });
    expect(parsed.ok).toBe(true);
    const w = new ServerWorld({ people: PEOPLE6 });
    const done = w.ok(ANN.userId, bare());
    const g = must(done.id, "item");
    expect(done.toast).toBe("Item posted.");
    const it = stored(w, g);
    expect(it).toMatchObject({ title: "Desk lamp", price: 0, obo: false, note: "", noPickupBy: true });
    for (const key of ["cat", "cond", "area", "minOffer", "photos"]) expect(Object.prototype.hasOwnProperty.call(it, key), key).toBe(false);
    expect(historyOf(it as unknown as { history: { text: string }[] })).toEqual(["Posted as free"]);
    expect(w.run(() => E.itemState(w.doc, it as unknown as E.Item).key)).toBe("available");
    expect(w.invalid).toEqual([]);
  });

  it("expires 14 days on by default: open through that day, closed after it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare()).id, "item");
    expect(E.ITEM_EXPIRY_DAYS).toBe(14);
    expect(stored(w, g).until).toBe(dateAfter(T0, 14));
    w.advance(14 * DAY); // noon on the last day
    expect(w.run(() => E.itemState(w.doc, stored(w, g) as unknown as E.Item).key)).toBe("available");
    w.advance(DAY);
    const st = w.run(() => E.itemState(w.doc, stored(w, g) as unknown as E.Item));
    expect([st.key, st.label]).toEqual(["closed", "Listing expired"]);
  });

  it("takes another expiry day within 60 days, and says why a wrong one isn't taken", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare({ expires: dateAfter(T0, 30) })).id, "item");
    expect(stored(w, g)).toMatchObject({ until: dateAfter(T0, 30), noPickupBy: true });
    expect(must(w.ok(ANN.userId, bare({ title: "Lamp shade", expires: dateAfter(T0, 60) })).id, "the 60th day")).toBeTruthy();
    expect(w.no(ANN.userId, bare({ expires: dateAfter(T0, -1) }))).toBe("Choose an expiry date in the future.");
    expect(w.no(ANN.userId, bare({ expires: dateAfter(T0, 61) }))).toBe("Pick an expiry date within 60 days.");
    expect(parseAction({ type: "postItem", data: { title: "Desk lamp", price: "0", expires: "2026-13-40" } }).ok).toBe(false);
  });

  it("calls a date pickup-by only when the seller chose it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const chosen = must(w.ok(ANN.userId, bare({ until: dateAfter(T0, 5) })).id, "with a pickup deadline");
    expect(stored(w, chosen).until).toBe(dateAfter(T0, 5));
    expect(Object.prototype.hasOwnProperty.call(stored(w, chosen), "noPickupBy")).toBe(false);
    // The pickup deadline is when the listing closes: an expiry sent with it doesn't outlast it.
    const both = must(w.ok(ANN.userId, bare({ title: "Lamp shade", until: dateAfter(T0, 5), expires: dateAfter(T0, 30) })).id, "both");
    expect(stored(w, both).until).toBe(dateAfter(T0, 5));
    expect(w.no(ANN.userId, bare({ until: dateAfter(T0, -1) }))).toBe("Choose a pickup-by date in the future.");
    expect(w.no(ANN.userId, bare({ until: dateAfter(T0, 61) }))).toBe("Pick a pickup-by date within 60 days.");
    w.run(() => {
      expect(E.hasPickupBy(stored(w, chosen) as unknown as E.Item)).toBe(true);
      expect(E.hasPickupBy(stored(w, both) as unknown as E.Item)).toBe(true);
    });
    const plain = must(w.ok(ANN.userId, bare({ title: "Floor lamp" })).id, "no deadline");
    w.run(() => expect(E.hasPickupBy(stored(w, plain) as unknown as E.Item)).toBe(false));
  });

  it("still refuses a category or condition that isn't one, and a missing name or price", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    expect(w.no(ANN.userId, bare({ cat: "Cars" }))).toBe("Choose a category.");
    expect(w.no(ANN.userId, bare({ cat: "constructor" }))).toBe("Choose a category.");
    expect(w.no(ANN.userId, bare({ cond: "Broken" }))).toBe("Choose a condition.");
    expect(w.no(ANN.userId, bare({ title: "  " }))).toBe("Name the item.");
    expect(w.no(ANN.userId, act({ type: "postItem", data: { title: "Desk lamp" } }))).toMatch(/^Price: /);
    expect(w.doc.goods).toEqual([]);
  });

  it("keeps each optional field the seller did state, and only those", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare({ price: "15", cat: "Electronics", area: "  Huntsman Hall ", obo: true, minOffer: "10", note: "2023 model" })).id, "item");
    const it = stored(w, g);
    expect(it).toMatchObject({ cat: "Electronics", area: "Huntsman Hall", price: 15, obo: true, minOffer: 10, note: "2023 model", noPickupBy: true });
    expect(Object.prototype.hasOwnProperty.call(it, "cond")).toBe(false);
  });
});

describe("a page still open on the older Goods form (9q item 6)", () => {
  it("reloads: the protocol number moved on, so it can't post \"Good\" or a pickup-by date its seller never chose", () => {
    // handlers.ts answers "reload" to any other number (guest-access.test.ts, handlers.test.ts); the old page sent 6.
    expect(E.HANDOFF_PROTOCOL).toBe(10); // 7 with this step; SELL5-M2 (§9v items 4 and 5) made it 8, SELL5-M3 (§9v item 2) 9 and SELL6-N1 (§9x item 1) 10, so the page of 6 still reloads
  });
  it("and the shape that form sent is still read as it always was, should anything send it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, full({ obo: false, minOffer: "", note: "", photos: [] })).id, "item");
    expect(stored(w, g)).toMatchObject({ cat: "Home & kitchen", cond: "Good", area: "Rittenhouse", until: dateAfter(T0, 10) });
    expect(Object.prototype.hasOwnProperty.call(stored(w, g), "noPickupBy")).toBe(false);
  });
});

describe("what others read of an item that states no category, condition or area (9q item 6)", () => {
  it("leaves them out of a classmate's view and a visitor's view, and never as empty words", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare()).id, "item");
    const mine = viewOf(w, ANN), theirs = viewOf(w, BOB), guest = guestViewOf(w);
    for (const [who, v] of [["the seller", mine], ["a classmate", theirs]] as const) {
      const it = must(v.goods.find((x) => x.id === g), `${who}'s item`) as unknown as Record<string, unknown>;
      expect(it.noPickupBy, who).toBe(true);
      for (const key of ["cat", "cond", "area"]) expect(Object.prototype.hasOwnProperty.call(it, key), `${who}: ${key}`).toBe(false);
      expect(it.until).toBe(dateAfter(T0, 14));
    }
    const gi = must(guest.goods.find((x) => x.id === g), "the visitor's item") as unknown as Record<string, unknown>;
    expect(gi).toEqual({ id: g, title: "Desk lamp", price: 0, obo: false, until: dateAfter(T0, 14), noPickupBy: true, createdAt: gi.createdAt });
    expect(contractViolations(mine, ANN.userId)).toEqual([]);
    expect(contractViolations(theirs, BOB.userId)).toEqual([]);
    expect(guestContractViolations(guest)).toEqual([]);
  });

  it("is requested, held and picked up with no place or pickup-by date in anyone's words", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare()).id, "item");
    const asked = w.ok(BOB.userId, act({ type: "requestItem", id: g, msg: "", shareContact: true }));
    const gr = must(asked.id, "Bob's request");
    expect(textsFor(asked.notes, ANN)).toEqual(["Bob D. wants your Desk lamp (free)."]);
    const held = w.ok(ANN.userId, act({ type: "acceptItemReq", id: gr, shareContact: true }));
    const mine = textsFor(held.notes, BOB);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatch(/^Ann accepted your request for Desk lamp\. It's held for you: agree a pickup time by .+, then confirm pickup in Handoff\.$/);
    const at = `${dateAfter(T0, 1)}T15:00`;
    const set = w.ok(BOB.userId, act({ type: "setPickup", id: gr, at }));
    expect(textsFor(set.notes, ANN)).toEqual([`Bob set the pickup time for Desk lamp: ${w.run(() => E.fmtWhen(at))}.`]); // the engine's words at the world's time
    expect(w.no(BOB.userId, act({ type: "setPickup", id: gr, at: `${dateAfter(T0, 20)}T15:00` }))).toBe(`Pick a time by ${E.fmtDate(dateAfter(T0, 14))}, when the listing expires.`);
    const picked = w.ok(BOB.userId, act({ type: "itemPickedUp", id: gr }));
    expect(picked.toast).toBe("Picked up. It's marked sold.");
    expect([...asked.notes, ...held.notes, ...set.notes, ...picked.notes].map((n) => n.text).join(" ")).not.toMatch(STRAY);
    expect(must(w.doc.goodsReqs.find((x) => x.id === gr), "request")).toMatchObject({ price: 0, status: "completed" });
  });

  it("says the listing expired, never that a pickup window ended, once its last day is over", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare()).id, "item");
    const gr = must(w.ok(BOB.userId, act({ type: "requestItem", id: g, msg: "", shareContact: false })).id, "Bob's request");
    w.advance(20 * DAY);
    const req = must(w.doc.goodsReqs.find((x) => x.id === gr), "request");
    expect(w.run(() => E.gState(req, stored(w, g) as unknown as E.Item)).reason).toBe("The listing expired before pickup.");
    expect(w.no(CAT.userId, act({ type: "requestItem", id: g, msg: "", shareContact: false }))).toBe("This item is no longer available (listing expired).");
    expect(w.no(ANN.userId, act({ type: "editItem", id: g, price: "5" }))).toBe("This listing has expired, so it can't be edited.");
    // An item whose seller chose a pickup deadline keeps the words it always had.
    const w2 = new ServerWorld({ people: PEOPLE6 });
    const g2 = must(w2.ok(ANN.userId, full()).id, "item");
    w2.advance(20 * DAY);
    expect(w2.run(() => E.itemState(w2.doc, stored(w2, g2) as unknown as E.Item).label)).toBe("Pickup window over");
    expect(w2.no(ANN.userId, act({ type: "editItem", id: g2, price: "5" }))).toBe("Its pickup window is over, so it can't be edited.");
  });
});

describe("an item with no category: found by name, under no category, matched only by name (9q item 6)", () => {
  it("is found by its name in search, and by nothing it doesn't say", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, bare({ note: "brass, with a bulb" })).id, "item");
    const keys = (d: Partial<E.Discovery>) => installed(viewOf(w, BOB), (s) => E.availableFor(s, BOB.userId, { ...E.DISC0, ...d }).cards.map((c) => c.key));
    expect(keys({ q: "desk lamp" })).toEqual([g]);
    expect(keys({ q: "LAMP" })).toEqual([g]);
    expect(keys({ q: "brass" })).toEqual([g]);
    expect(keys({})).toEqual([g]);
    expect(keys({ cat: "goods" })).toEqual([g]);
    for (const q of ["undefined", "null", "good", "other"]) expect(keys({ q }), q).toEqual([]);
    for (const goodsCat of Object.keys(E.GOODS_CATS)) expect(keys({ cat: "goods", goodsCat }), goodsCat).toEqual([]);
    w.run(() => expect(E.itemText(stored(w, g) as unknown as E.Item)).toBe("desk lamp brass, with a bulb"));
  });

  it("alerts a request that names it, in whatever category, and no other request", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const named = must(w.ok(DAN.userId, wanted("desk lamp", "Home & kitchen")).id, "Dan's request");
    const namedElsewhere = must(w.ok(EVE.userId, wanted("lamp", "Furniture")).id, "Eve's request");
    w.ok(BOB.userId, wanted("monitor", "Electronics"));
    w.ok(CAT.userId, wanted("bike helmet", "Other")); // no category is not "Other"
    const done = w.ok(ANN.userId, bare());
    expect(done.toast).toBe("Item posted. 2 classmates with a matching request got an in-app alert.");
    expect(done.notes.map((n) => [n.userId, n.text, n.kind ?? null, n.ref ?? null]).sort()).toEqual([
      [DAN.userId, 'Possible match for your request "desk lamp": Ann is giving away "Desk lamp" for free.', "match.item", named],
      [EVE.userId, 'Possible match for your request "lamp": Ann is giving away "Desk lamp" for free.', "match.item", namedElsewhere],
    ].sort());
    const g = must(done.id, "item");
    w.run(() => {
      const it = stored(w, g) as unknown as E.Item;
      const fits = w.doc.interests.filter((i) => E.goodsFits(i, it)).map((i) => i.userId).sort();
      expect(fits).toEqual([DAN.userId, EVE.userId].sort());
      const cats = must(w.doc.interests.find((i) => i.userId === CAT.userId), "Cat's request");
      expect(E.requestMatchItem(w.doc, cats, it)).toEqual({ ok: false, partial: false, reasons: ['Nothing in its title or note matches "bike helmet".'] });
    });
  });

  it("can be shared with a request it names; a categorized item still needs the request's category", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const iso = must(w.ok(DAN.userId, wanted("desk lamp", "Furniture")).id, "Dan's request");
    const g = must(w.ok(ANN.userId, bare({ title: "Desk lamp, black" })).id, "item");
    const sent = w.ok(ANN.userId, act({ type: "shareItem", isoId: iso, itemId: g }));
    expect(textsFor(sent.notes, DAN)).toEqual(['Ann L. shared "Desk lamp, black" with your request for desk lamp: Free. It isn\'t held for you: request it on the item page.']);
    const filed = must(w.ok(ANN.userId, full({ title: "Desk lamp, brass" })).id, "an item filed under Home & kitchen");
    expect(w.no(ANN.userId, act({ type: "shareItem", isoId: iso, itemId: filed }))).toBe("This item doesn't fit the request. It's in Home & kitchen, not Furniture.");
    w.run(() => expect(E.goodsFits(must(w.doc.interests.find((i) => i.id === iso), "request"), stored(w, filed) as unknown as E.Item)).toBe(false));
  });

  it("is counted as \"(unspecified)\" in the pilot report, never as another category", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.ok(ANN.userId, bare());
    w.ok(ANN.userId, full({ title: "Kettle" }));
    const data = { now: w.now, transaction: { readOnly: true, isolation: "repeatable read" }, live: { version: 2, createdAt: T0, updatedAt: w.now, nextDue: null, doc: w.doc },
      testWorlds: 0, profiles: 2, notifications: { total: 0, unread: 0 }, snapshots: 0, actions: { retained: 0, oldestAt: null, recent: [] }, knownTestAccounts: null } as unknown as PilotData;
    expect(buildPilotReport(data).supplyAndDemand.goods.byCategory.map((c) => [c.category, c.itemsAvailable]).sort()).toEqual([["(unspecified)", 1], ["Home & kitchen", 1]]);
  });
});

describe("items posted with every field, and stored items, read as they always did", () => {
  it("keeps every field and word of an item the form posted with all of them", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const until = dateAfter(T0, 10);
    const g = must(w.ok(ANN.userId, full()).id, "item");
    const it = stored(w, g);
    expect(it).toMatchObject({ title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: 0, obo: false, area: "Rittenhouse", until, note: "" });
    expect(Object.prototype.hasOwnProperty.call(it, "noPickupBy")).toBe(false);
    const v = must(viewOf(w, BOB).goods.find((x) => x.id === g), "Bob's view") as unknown as Record<string, unknown>;
    expect(v).toMatchObject({ cat: "Home & kitchen", cond: "Good", area: "Rittenhouse", until });
    expect(Object.prototype.hasOwnProperty.call(v, "noPickupBy")).toBe(false);
    expect(guestViewOf(w).goods.find((x) => x.id === g)).toMatchObject({ cat: "Home & kitchen", cond: "Good", until });
    w.run(() => expect(E.itemText(it as unknown as E.Item)).toBe("desk lamp home & kitchen rittenhouse"));
  });

  it("reads a record stored before this change with its own fields and words", () => {
    const until = dateAfter(T0, 6);
    const old = { id: "g0123456789abcdef", sellerId: ANN.userId, title: "Office chair", cat: "Furniture", cond: "Fair", price: 25, obo: true, minOffer: 15, area: "Fishtown", until, note: "Works.", createdAt: T0, history: [{ at: T0, text: "Posted at $25 OBO" }] };
    const w = new ServerWorld({ people: PEOPLE6, doc: { ...E.emptyWorld(), goods: [old] } as unknown as E.LiveWorld });
    expect(stored(w, old.id)).toEqual(old);
    const v = must(viewOf(w, BOB).goods.find((x) => x.id === old.id), "Bob's view");
    expect(v).toMatchObject({ cat: "Furniture", cond: "Fair", area: "Fishtown", until, minOffer: 15, note: "Works." });
    w.run(() => expect(E.hasPickupBy(old as unknown as E.Item)).toBe(true));
    const gr = must(w.ok(BOB.userId, act({ type: "requestItem", id: old.id, msg: "", shareContact: true })).id, "Bob's request");
    const held = w.ok(ANN.userId, act({ type: "acceptItemReq", id: gr, shareContact: true }));
    expect(textsFor(held.notes, BOB)[0]).toMatch(/agree a pickup time in Fishtown by /);
    expect(w.no(BOB.userId, act({ type: "setPickup", id: gr, at: `${dateAfter(T0, 9)}T15:00` }))).toBe(`Pick a time by ${E.fmtDate(until)}, the item's pickup-by date.`);
    expect(stored(w, old.id)).toMatchObject({ cat: "Furniture", cond: "Fair", area: "Fishtown", until }); // nothing rewritten
    expect(Object.prototype.hasOwnProperty.call(stored(w, old.id), "noPickupBy")).toBe(false);
  });

  it("matches a categorized item by its category and name, as before", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const same = must(w.ok(DAN.userId, wanted("desk lamp", "Home & kitchen")).id, "Dan's request");
    w.ok(EVE.userId, wanted("desk lamp", "Furniture")); // the same words in another category: no match for a filed item
    const done = w.ok(ANN.userId, full());
    expect(done.notes.map((n) => [n.userId, n.ref ?? null])).toEqual([[DAN.userId, same]]);
  });
});
