// SELL5-M1 (USER-INSTRUCTIONS §9v item 3: "Remove outward Share controls throughout Handoff"): the shared market has no Share button
// and no WhatsApp or copy-link sheet, so its engine builds no share message and keeps no "may a signed-out visitor open this share's
// link?" rule:
// - a live world builds no share message, whoever asks (a classmate's view installed as the page installs it, the guest view, and the
//   server's own document inside withEngine): shareText refuses;
// - guestSees, the live page's old "offer Share?" test, is gone from the engine;
// - the development preview keeps its own share sheet, so its message is as before;
// - what an ordinary URL opens is unchanged: a listing anyone signed in could take is in every view and in the guest view (so its link
//   opens it, signed in or not), and a closed one is in no one's list (its event's page says so).
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { seed } from "../../engine/preview.js";
import { must, resetEngine } from "./helpers/invite.js";
import { ServerWorld, guestViewOf, viewOf, PEOPLE6 } from "./helpers/views.js";
import { ANN, BOB, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as E.Action;
/** A state installed as the page installs it (its clock, then applyWorld), for fn; the engine is put back afterwards. */
function installed<T>(state: { serverNow: number }, fn: (s: E.WorldState) => T): T {
  E.setLiveClock(() => state.serverNow);
  E.applyWorld(state as unknown as E.WorldState);
  try { return fn(state as unknown as E.WorldState); } finally { E.setLiveClock(null); E.applyWorld(null); }
}
/** A small market: an event with one open listing, a closed one, an item and a public request. */
function market() {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Rooftop Mixer", start: dateAfter(T0, 12) })).id, "event");
  const open = must(w.ok(ANN.userId, act({ type: "postTicket", eventId: ev, qty: 1, ask: "25" })).id, "open listing");
  const ev2 = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Old Show", start: dateAfter(T0, 10) })).id, "second event");
  const closed = must(w.ok(ANN.userId, act({ type: "postTicket", eventId: ev2, qty: 1, ask: "21" })).id, "closed listing");
  w.ok(ANN.userId, act({ type: "withdraw", listingId: closed }));
  const item = must(w.ok(ANN.userId, act({ type: "postItem", data: { title: "Desk lamp", price: "15" } })).id, "item");
  const iso = must(w.ok(BOB.userId, act({ type: "postRequest", eventId: ev, qty: 1 })).id, "request");
  return { w, ev, ev2, open, closed, item, iso };
}

describe("the shared market has no share message (9v item 3)", () => {
  it("refuses one for every kind of record, from a classmate's view, the guest view and the server's document", () => {
    const m = market();
    const targets: E.ShareTarget[] = [{ type: "event", id: m.ev }, { type: "listing", id: m.open }, { type: "item", id: m.item }, { type: "iso", id: m.iso }];
    for (const t of targets) {
      expect(() => installed(viewOf(m.w, BOB), (s) => E.shareText(t, s, new Set())), `${t.type} from a classmate's view`).toThrow(/no share messages/);
      expect(() => installed({ ...guestViewOf(m.w), people: {}, interests: [] } as unknown as { serverNow: number }, (s) => E.shareText(t, s, new Set())), `${t.type} from the guest view`).toThrow(/no share messages/);
      expect(() => m.w.run(() => E.shareText(t, m.w.doc as unknown as E.WorldState, new Set())), `${t.type} on the server`).toThrow(/no share messages/);
    }
  });

  it("keeps no \"offer Share?\" rule: guestSees is gone from the engine", () => {
    expect(Object.prototype.hasOwnProperty.call(E, "guestSees")).toBe(false);
  });

  it("leaves the development preview's own share message as it was", () => {
    resetEngine();
    const t = E.shareText({ type: "listing", id: "l2" }, seed(), new Set(["l2"]));
    expect(t.text).toMatch(/\[Handoff prototype: illustrative listing\]$/);
    expect(t.hash).toBe(must(seed().listings.find((l) => l.id === "l2"), "l2").eventId);
  });
});

describe("what an ordinary URL opens is unchanged (9v item 3, 9k)", () => {
  it("an open listing is in a classmate's view and the guest view; a closed one is in neither list; the item and the request are there for both", () => {
    const m = market();
    const v = viewOf(m.w, BOB), g = guestViewOf(m.w);
    expect(must(v.listings.find((l) => l.id === m.open), "Bob's copy")).toMatchObject({ ask: 25, numbers: { available: 1 } });
    expect(must(g.listings.find((l) => l.id === m.open), "the visitor's copy")).toMatchObject({ ask: 25, available: 1 });
    expect(g.listings.some((l) => l.id === m.closed)).toBe(false);
    expect(installed(v, (s) => { const l = s.listings.find((x) => x.id === m.closed); return l ? E.listingNumbers(s, l).available : 0; })).toBe(0);
    expect(g.events.map((e) => e.id)).toEqual(expect.arrayContaining([m.ev, m.ev2])); // the old listing's event still opens
    expect(g.goods.some((x) => x.id === m.item)).toBe(true);
    expect(g.wanted.some((x) => x.id === m.iso)).toBe(true);
  });
});
