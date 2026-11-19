// SELL6-N1 (USER-INSTRUCTIONS §9x item 1, "Closed requests" and "Guest restrictions"): what the two projections send.
// Closed requests:
// - A public request was open for everyone to see. Once it ends (closed by its owner, fulfilled by a receipt, or past its deadline),
//   every view names it as closed (View.closedRequests, GuestView.closedWanted), so its link says "This request is closed" instead of
//   "not found": the seller who answered it, a third account and a signed-out visitor alike.
// - It is only its id and the event it was for: never who asked, how many, their budget or note, when it ended or why. "Fulfilled" is
//   recorded only by a receipt (or its owner saying so), and only its owner reads it; answering a request records nothing of the kind.
// - Nobody gets one for a record they could never see: a private alert, or an id that never existed. After 14 days it's gone.
// Guest restrictions:
// - A signed-out visitor's listing carries every published restriction: the club, members only, the name-change rule and, since
//   §9x, the seller's own restriction words. Never the seller, their note, or anything that looks like contact or payment details
//   (such words reach a visitor only as "a restriction was noted", as before).
// Labelled test accounts with made-up ids; no database and no sign-in of any kind.
import { afterEach, describe, expect, it } from "vitest";
import type { Action } from "../../engine/index.js";
import { CLOSED_REQUEST_KEYS, contractViolations, guestContractViolations } from "./helpers/contract.js";
import { must, on, reserve, resetEngine, setMethods } from "./helpers/invite.js";
import { FAY, PEOPLE6, ServerWorld, guestViewOf, viewOf } from "./helpers/views.js";
import { ANN, BOB, CAT, DAN, DAY, T0, dateAfter } from "./helpers/worlds.js";

afterEach(resetEngine);

const act = (a: Record<string, unknown>) => a as unknown as Action;
const NOTE = "Hoping to sit near the stage zq17";
interface M { w: ServerWorld; ev: string; iso: string }
/** Ann's "Oysters Night" (9 days ahead) and Dan's public request for it: one ticket, up to $40, with a note, needed within 5 days. */
function market(): M {
  const w = new ServerWorld({ people: PEOPLE6 });
  const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Oysters Night", start: dateAfter(T0, 9) })).id, "event");
  const iso = w.requestFor(DAN, ev, { qty: 1, budget: "40", days: 5, note: NOTE });
  return { w, ev, iso };
}
const answer = (m: M, seller = BOB, askPrice = "30") => must(m.w.ok(seller.userId, act({ type: "answerRequest", isoId: m.iso, ask: askPrice, note: "", obo: false })).id, "the listing");
const close = (m: M, reason: "cancelled" | "fulfilled" = "cancelled") => m.w.ok(DAN.userId, act({ type: "closeInterest", id: m.iso, reason }));
/** What each kind of viewer gets of the request: [in the view whole?, named as closed?]. */
const seen = (m: M) => ({
  answerer: [viewOf(m.w, BOB).interests.some((i) => i.id === m.iso), viewOf(m.w, BOB).closedRequests.filter((c) => c.id === m.iso)],
  third: [viewOf(m.w, FAY).interests.some((i) => i.id === m.iso), viewOf(m.w, FAY).closedRequests.filter((c) => c.id === m.iso)],
  guest: [guestViewOf(m.w).wanted.some((i) => i.id === m.iso), guestViewOf(m.w).closedWanted.filter((c) => c.id === m.iso)],
});
const contractsHold = (m: M) => {
  for (const p of [ANN, BOB, CAT, DAN, FAY]) expect(contractViolations(viewOf(m.w, p), p.userId)).toEqual([]);
  expect(guestContractViolations(guestViewOf(m.w))).toEqual([]);
};

describe("a public request that closed is named as closed to everyone who could see it open", () => {
  it("open: every viewer has it whole (a visitor: anonymized) and nobody has it as closed", () => {
    const m = market();
    answer(m);
    expect(seen(m)).toEqual({ answerer: [true, []], third: [true, []], guest: [true, []] });
    contractsHold(m);
  });

  it("closed by its owner after an answer: the answerer, a third account and a visitor get its id and its event, and nothing else", () => {
    const m = market();
    answer(m);
    close(m);
    const tomb = [{ id: m.iso, eventId: m.ev }];
    expect(seen(m)).toEqual({ answerer: [false, tomb], third: [false, tomb], guest: [false, tomb] });
    contractsHold(m);
    for (const list of [viewOf(m.w, BOB).closedRequests, viewOf(m.w, FAY).closedRequests, guestViewOf(m.w).closedWanted]) {
      for (const c of list) expect(Object.keys(c).sort()).toEqual([...CLOSED_REQUEST_KEYS].sort());
      expect(JSON.stringify(list)).not.toMatch(/user-dan|Dan|zq17|budget|note|qty|cancelled|fulfilled|closedAt/);
    }
    // Its event is in each view, so the page can say what it was for. A visitor's view still names nobody.
    expect(guestViewOf(m.w).events.map((e) => e.id)).toContain(m.ev);
    expect(JSON.stringify(guestViewOf(m.w))).not.toMatch(/user-dan|Dan N|zq17/);
    // A third account's view no longer carries the requester's note or budget at all.
    expect(JSON.stringify(viewOf(m.w, FAY))).not.toMatch(/zq17/);
    // Its owner keeps it whole, with what they recorded.
    const own = must(viewOf(m.w, DAN).interests.find((i) => i.id === m.iso), "Dan's own request");
    expect([own.status, own.closedReason, own.note]).toEqual(["closed", "cancelled", NOTE]);
    expect(viewOf(m.w, DAN).closedRequests).toEqual([]);
  });

  it("answering records no outcome; \"fulfilled\" is recorded by the receipt, and only its owner reads it", () => {
    const m = market();
    setMethods(m.w, CAT, [{ kind: "venmo", value: "cat-moore" }]);
    answer(m, CAT);
    const r = must(m.w.doc.requests.find((x) => x.fromIso === m.iso), "the invitation").id;
    const stored = () => must(m.w.doc.interests.find((i) => i.id === m.iso), "the request");
    expect([stored().status, stored().closedReason]).toEqual(["open", undefined]); // answered: still open, nothing recorded
    reserve(m.w, DAN, r);
    for (const [who, step] of [[DAN, "markPaid"], [CAT, "confirmPayment"], [CAT, "markTransferred"]] as const) m.w.ok(who.userId, on(step, r));
    expect([stored().status, stored().closedReason]).toEqual(["open", undefined]); // reserved, paid and sent: still not fulfilled
    expect(viewOf(m.w, FAY).closedRequests).toEqual([]);
    m.w.ok(DAN.userId, on("buyerReceived", r));
    expect([stored().status, stored().closedReason]).toEqual(["closed", "fulfilled"]);
    expect(must(viewOf(m.w, DAN).interests.find((i) => i.id === m.iso), "Dan's own").closedReason).toBe("fulfilled");
    // Everyone else, the seller who filled it included, reads only that it's closed.
    for (const list of [viewOf(m.w, CAT).closedRequests, viewOf(m.w, FAY).closedRequests, guestViewOf(m.w).closedWanted]) expect(list).toEqual([{ id: m.iso, eventId: m.ev }]);
    contractsHold(m);
  });

  it("past its deadline it reads the same, for 14 days; then it's gone", () => {
    const m = market();
    answer(m);
    m.w.advance(6 * DAY); // needed within 5 days: over
    m.w.sweep();
    const tomb = [{ id: m.iso, eventId: m.ev }];
    expect(seen(m)).toEqual({ answerer: [false, tomb], third: [false, tomb], guest: [false, tomb] });
    m.w.advance(13 * DAY);
    expect(seen(m).third).toEqual([false, tomb]);
    m.w.advance(2 * DAY); // more than 14 days after it ended
    expect(seen(m)).toEqual({ answerer: [false, []], third: [false, []], guest: [false, []] });
    contractsHold(m);
  });

  it("a seller who shared a listing with it keeps seeing it whole for 14 days, as before, and it isn't named twice", () => {
    const m = market();
    const l = must(m.w.ok(BOB.userId, act({ type: "postTicket", eventId: m.ev, qty: 1, ask: "30", note: "", obo: false })).id, "Bob's listing");
    m.w.ok(BOB.userId, act({ type: "shareListing", isoId: m.iso, listingId: l }));
    close(m);
    const v = viewOf(m.w, BOB);
    expect(v.interests.filter((i) => i.id === m.iso).map((i) => i.status)).toEqual(["closed"]);
    expect(v.closedRequests).toEqual([]);
    expect(contractViolations(v, BOB.userId)).toEqual([]);
  });

  it("an item request that closed has no event; a private alert is never named to anyone, open or closed", () => {
    const m = market();
    const goods = must(m.w.ok(DAN.userId, act({ type: "saveInterest", data: { goods: { title: "Bike lock", cat: "Sports & outdoor" }, qty: 1, budget: "20", note: "", expires: dateAfter(T0, 3) } })).id, "the item request");
    const alert = must(m.w.ok(DAN.userId, act({ type: "joinAlert", eventId: m.ev, qty: 1, max: "" })).id, "the alert");
    const ids = () => ({ fay: viewOf(m.w, FAY).closedRequests.map((c) => c.id), guest: guestViewOf(m.w).closedWanted.map((c) => c.id) });
    expect(ids()).toEqual({ fay: [], guest: [] });
    m.w.ok(DAN.userId, act({ type: "closeInterest", id: goods, reason: "cancelled" }));
    m.w.ok(DAN.userId, act({ type: "closeInterest", id: alert }));
    expect(viewOf(m.w, FAY).closedRequests).toEqual([{ id: goods, eventId: null }]);
    expect(guestViewOf(m.w).closedWanted).toEqual([{ id: goods, eventId: null }]);
    for (const text of [JSON.stringify(viewOf(m.w, FAY)), JSON.stringify(guestViewOf(m.w))]) expect(text).not.toContain(alert);
    contractsHold(m);
  });
});

describe("a signed-out visitor reads a listing's published restrictions, the seller's words included", () => {
  const post = (ev: string, more: Record<string, unknown>) => act({ type: "postTicket", eventId: ev, qty: 1, ask: "20", note: "Meet me at Huntsman zq17", obo: false, ...more });

  it("the seller's own restriction words reach a visitor, with the club and the name-change rule; never the seller or their note", () => {
    const m = market();
    const a = must(m.w.ok(BOB.userId, post(m.ev, { club: "Wine Club", restriction: "Student ID checked at the door", method: "name", namesChecked: true })).id, "a");
    const g = guestViewOf(m.w);
    const la = must(g.listings.find((x) => x.id === a), "the listing");
    expect(la).toMatchObject({ club: "Wine Club", namesChecked: true, restriction: "Student ID checked at the door" });
    expect(la).not.toHaveProperty("restrictionNoted");
    expect(guestContractViolations(g)).toEqual([]);
    expect(JSON.stringify(g)).not.toMatch(/user-bob|Bob|zq17|Huntsman/);
    // Signed in, it reads the same words, as before.
    expect(must(viewOf(m.w, FAY).listings.find((x) => x.id === a), "signed in")).toMatchObject({ restriction: "Student ID checked at the door" });
  });

  it("a members-only ticket names its club to a visitor, with any words of the seller's beside it", () => {
    const w = new ServerWorld({ people: PEOPLE6 });
    const ev = must(w.ok(ANN.userId, act({ type: "createEvent", kind: "event", title: "Winter Gala", club: "GCC", start: dateAfter(T0, 9) })).id, "event");
    const id = must(w.ok(BOB.userId, post(ev, { membersOnly: true, restriction: "Black tie required" })).id, "listing");
    const l = must(guestViewOf(w).listings.find((x) => x.id === id), "the listing");
    expect(l).toMatchObject({ membersOnly: true, restriction: "Black tie required" });
    expect(guestContractViolations(guestViewOf(w))).toEqual([]);
  });

  it("words that look like contact or payment details never reach a visitor: only that a restriction was noted", () => {
    for (const words of ["Call me at 555 0100 first", "Email bob@example.invalid to confirm", "Venmo me first", "DM @bobdiaz before asking", "See www.example.invalid/rules", "Text (215) 555-0142"]) {
      const m = market();
      const id = must(m.w.ok(BOB.userId, post(m.ev, { restriction: words })).id, "listing");
      const g = guestViewOf(m.w);
      const l = must(g.listings.find((x) => x.id === id), "the listing");
      expect(l, words).toMatchObject({ restrictionNoted: true });
      expect(l, words).not.toHaveProperty("restriction");
      expect(JSON.stringify(g), words).not.toContain(words);
      expect(guestContractViolations(g)).toEqual([]);
      expect(must(viewOf(m.w, FAY).listings.find((x) => x.id === id), "signed in")).toMatchObject({ restriction: words }); // signed in: read before asking, as before
    }
  });

  it("a listing with no restriction carries neither field", () => {
    const m = market();
    const id = must(m.w.ok(BOB.userId, post(m.ev, {})).id, "listing");
    const l = must(guestViewOf(m.w).listings.find((x) => x.id === id), "the listing");
    expect(l).not.toHaveProperty("restriction");
    expect(l).not.toHaveProperty("restrictionNoted");
  });
});
