// Forms round 2 (USER-INSTRUCTIONS §9j item 4, step FORMS-F2c), the engine half of Goods:
// - An item posted at an explicit $0 reads "Free" wherever its price is put into words in the shared market: the notes classmates get
//   (a match, a share with a request, a request to the seller), the seller's toast and the item's history. (The
//   share message's checks were removed in SELL5-M1: §9v item 3 removed outward Share, so there is no share message any more.)
//   What's stored stays the number 0; nothing else about the item changes, and a priced item reads as it always did.
// - Only a Goods item's price: a ticket listed at $0 still reads "$0", and the preview keeps "$0".
// - An item request (a Goods ISO) with no budget fits a free item like any other, and is alerted in the same words.
// Labelled test accounts with made-up ids; no database and no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { historyOf, lastHistory, must, resetEngine, textsFor } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, DAN, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
const UNTIL = dateAfter(T0, 10);
/** "Post item" as the Goods form sends it. */
const item = (over: Record<string, unknown> = {}) => act({ type: "postItem", data: { title: "Desk lamp", cat: "Home & kitchen", cond: "Good", price: "0", obo: false, minOffer: "", area: "Rittenhouse", until: UNTIL, note: "", ...over } });
/** An item request as the request form sends it: what, its category and a date; a budget only when the buyer added one. */
const wanted = (over: Record<string, unknown> = {}) => act({ type: "saveInterest", data: { qty: 1, budget: "", note: "", expires: dateAfter(T0, 7), goods: { title: "desk lamp", cat: "Home & kitchen" }, ...over } });
const itemOf = (w: ServerWorld, id: string): E.Item => must(w.doc.goods.find((g) => g.id === id), `item ${id}`);

describe("an item's price in words (9j item 4)", () => {
  it("reads Free for exactly $0 in the shared market, and as money otherwise; the preview keeps $0", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    w.run(() => {
      expect(E.itemPrice(0)).toBe("Free");
      expect(E.isFreePrice(0)).toBe(true);
      expect([E.itemPrice(5), E.itemPrice(12.5), E.itemPrice(0.5), E.itemPrice(1200)]).toEqual(["$5", "$12.50", "$0.50", "$1,200"]);
      expect([E.isFreePrice(5), E.isFreePrice(0.5)]).toEqual([false, false]);
    });
    resetEngine(); // the preview's catalog: its sample items keep their words
    expect(E.itemPrice(0)).toBe("$0");
    expect(E.isFreePrice(0)).toBe(false);
    expect(E.itemPrice(30)).toBe("$30");
  });
});

describe("an item posted at $0 (9j item 4)", () => {
  it("is stored as the number 0 with offers off, and its history says free", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const done = w.ok(ANN.userId, item({ obo: true, minOffer: "" })); // offers can't apply to a free item, as before
    const g = must(done.id, "item");
    expect(itemOf(w, g)).toMatchObject({ title: "Desk lamp", price: 0, obo: false, cond: "Good", area: "Rittenhouse", until: UNTIL });
    expect(itemOf(w, g).price).toBe(0);
    expect(done.toast).toBe("Item posted.");
    expect(historyOf(itemOf(w, g))).toEqual(["Posted as free"]);
    // Every view carries the number, never a word: the page puts it into words.
    expect(must(viewOf(w, BOB).goods.find((x) => x.id === g), "Bob's view").price).toBe(0);
    expect(must(guestViewOf(w).goods.find((x) => x.id === g), "the guest view").price).toBe(0);
  });

  it("alerts a matching item request in words that say free", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const iso = must(w.ok(DAN.userId, wanted()).id, "Dan's request"); // no budget: any price fits, a free one too
    expect(must(w.doc.interests.find((i) => i.id === iso), "request").budget).toBeNull();
    const done = w.ok(ANN.userId, item());
    const g = must(done.id, "item");
    expect(done.toast).toBe("Item posted. 1 classmate with a matching request got an in-app alert.");
    expect(done.notes.map((n) => [n.userId, n.text])).toEqual([
      [DAN.userId, 'Possible match for your request "desk lamp": Ann is giving away "Desk lamp" for free.'],
    ]);
    expect(iso).toBeTruthy();
    expect(g).toBeTruthy();
    // Paused and resumed: those who started looking meanwhile hear in the same words.
    w.ok(ANN.userId, act({ type: "pauseItem", id: g }));
    w.advance(60_000);
    const late = must(w.ok(BOB.userId, wanted({ goods: { title: "Desk lamp", cat: "Home & kitchen" } })).id, "Bob's request");
    w.advance(60_000);
    const back = w.ok(ANN.userId, act({ type: "resumeItem", id: g }));
    expect(late).toBeTruthy();
    expect(back.notes.filter((n) => n.userId === BOB.userId).map((n) => n.text)).toEqual(['Possible match for your request "Desk lamp": Ann is giving away "Desk lamp" for free.']);
  });

  it("goes from request to picked up without a price in dollars: the seller's note, the hold and the history", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, item()).id, "item");
    const asked = w.ok(BOB.userId, act({ type: "requestItem", id: g, msg: "", shareContact: true }));
    const gr = must(asked.id, "Bob's request");
    expect(textsFor(asked.notes, ANN)).toEqual(["Bob D. wants your Desk lamp (free)."]);
    expect(must(w.doc.goodsReqs.find((x) => x.id === gr), "request")).toMatchObject({ price: 0, status: "pending" });
    const held = w.ok(ANN.userId, act({ type: "acceptItemReq", id: gr, shareContact: true }));
    expect(held.toast).toMatch(/^Held for Bob \(free\)\. Agree a pickup time by .+, or the hold ends\.$/);
    const picked = w.ok(BOB.userId, act({ type: "itemPickedUp", id: gr }));
    expect(picked.toast).toBe("Picked up. It's marked sold.");
    expect(lastHistory(itemOf(w, g))).toBe("Given to Bob D. for free");
    expect(w.run(() => E.itemState(w.doc, itemOf(w, g)).key)).toBe("sold");
    expect(must(w.doc.goodsReqs.find((x) => x.id === gr), "request")).toMatchObject({ price: 0, status: "completed" });
    expect([...asked.notes, ...held.notes, ...picked.notes].map((n) => n.text).join(" ")).not.toMatch(/\$0/);
  });

  it("is shared with a request as Free, with nothing about offers", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const iso = must(w.ok(DAN.userId, wanted({ goods: { title: "lamp for a desk", cat: "Home & kitchen" } })).id, "Dan's request");
    const g = must(w.ok(ANN.userId, item({ title: "Desk lamp, black" })).id, "item");
    const sent = w.ok(ANN.userId, act({ type: "shareItem", isoId: iso, itemId: g }));
    expect(textsFor(sent.notes, DAN)).toEqual(['Ann L. shared "Desk lamp, black" with your request for lamp for a desk: Free, pickup in Rittenhouse. It isn\'t held for you: request it on the item page.']);
  });

  it("says Free in an edit's history, in either direction", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const g = must(w.ok(ANN.userId, item({ price: "10", obo: true })).id, "item");
    expect(w.ok(ANN.userId, act({ type: "editItem", id: g, price: "0" })).toast).toBe("Item updated. Requests and offers already made keep their prices.");
    expect(itemOf(w, g)).toMatchObject({ price: 0, obo: false });
    w.ok(ANN.userId, act({ type: "editItem", id: g, price: "5" }));
    expect(historyOf(itemOf(w, g))).toEqual(["Posted at $10 OBO", "Edited: price $10 to Free, offers off", "Edited: price Free to $5"]);
  });
});

describe("everything with a price above $0 reads as before", () => {
  it("keeps a priced item's words: the match, the request and the pickup", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const iso = must(w.ok(DAN.userId, wanted({ budget: "50" })).id, "Dan's request");
    const done = w.ok(ANN.userId, item({ price: "30", obo: true }));
    const g = must(done.id, "item");
    expect(historyOf(itemOf(w, g))).toEqual(["Posted at $30 OBO"]);
    expect(done.notes.map((n) => n.text)).toEqual(['Possible match for your request "desk lamp": Ann is selling "Desk lamp" for $30 OBO.']);
    const sent = w.ok(ANN.userId, act({ type: "shareItem", isoId: iso, itemId: g }));
    expect(textsFor(sent.notes, DAN)).toEqual(['Ann L. shared "Desk lamp" with your request for desk lamp: $30 OBO, pickup in Rittenhouse. It isn\'t held for you: request it or make an offer on the item page.']);
    const asked = w.ok(BOB.userId, act({ type: "requestItem", id: g, msg: "", shareContact: true }));
    const gr = must(asked.id, "Bob's request");
    expect(textsFor(asked.notes, ANN)).toEqual(["Bob D. wants your Desk lamp at $30."]);
    expect(w.ok(ANN.userId, act({ type: "acceptItemReq", id: gr, shareContact: true })).toast).toMatch(/^Held for Bob at \$30\. /);
    w.ok(BOB.userId, act({ type: "itemPickedUp", id: gr }));
    expect(lastHistory(itemOf(w, g))).toBe("Sold to Bob D. for $30");
  });

  it("leaves a ticket listed at $0 as $0: Free is a Goods item's word", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: dateAfter(T0, 12) })).id, "event");
    const l = must(w.ok(ANN.userId, act({ type: "addThen", add: { eventId: ev, tier: "t1", qty: 1 },
      then: { type: "list", qty: 1, ask: "0", note: "", viaOrganizer: false, restricted: false, method: "app", namesChecked: false, file: null, membersOnly: false, obo: false, minOffer: "" } })).id, "listing");
    // SELL5-M1: there is no share message any more (§9v item 3), so the words checked are the listing's own, as its seller reads them in
    // its history, and its price as a buyer's view carries it: "$0", never "Free".
    expect(historyOf(must(w.doc.listings.find((x) => x.id === l), "listing"))).toEqual(["Listed 1 ticket at $0"]);
    expect(must(viewOf(w, BOB).listings.find((x) => x.id === l), "Bob's copy").ask).toBe(0);
    expect(E.money(0)).toBe("$0");
  });
});
