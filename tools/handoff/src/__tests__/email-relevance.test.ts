// Email relevance (follow-on Batch 4; FOLLOWON-PLAN §2.4, B4.5, B4.11): is a delayed email still worth sending when the dispatcher gets
// to it, and what may it say? The real engine on frozen live documents (helpers/worlds.ts), as the dispatcher's check runs it: each
// kind is relevant while its record waits on the step it asks for, and skipped with a reason once it moved on (answered, closed,
// expired, paused, no longer matching, gone). Then every kind is rendered from a world whose private fields hold canaries, and none
// reaches a subject, body or link. Labelled test people with made-up ids; no database, no sign-in.
import { afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { WorldDoc } from "../engine-port.js";
import { emailRelevance } from "../email/relevance.js";
import { renderEmail } from "../email/templates.js";
import type { EmailFacts, EmailKind, JobRef, Relevance } from "../email/types.js";
import type { NotificationLink } from "../types.js";
import { ANN, BOB, CAT, DAN, EVE, HOUR, LiveTestWorld, dateAfter, type TestPerson } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const SITE = "http://localhost:3000";

afterEach(() => {
  E.applyWorld(null); // back to the preview's catalog between tests
});

function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
}

/** The dispatcher's question for one job, on the world as it is now. */
function check(w: LiveTestWorld, kind: EmailKind, to: TestPerson, ref: string, link: NotificationLink | null = null): Relevance {
  const job: JobRef = { notificationId: "n0000000000000001", userId: to.userId, kind, ref, link };
  return w.run(() => emailRelevance(w.doc as unknown as WorldDoc, job));
}
const why = (r: Relevance): string => (r.ok ? "ok" : r.why);
function factsOf(r: Relevance): EmailFacts {
  if (!r.ok) throw new Error(`expected relevant, got ${r.why}`);
  return r.facts;
}
const fmt = (w: LiveTestWorld, ms: number | undefined): string => w.run(() => E.fmtMs(must(ms, "a time")));
const req = (w: LiveTestWorld, id: string) => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
const greq = (w: LiveTestWorld, id: string) => must(w.doc.goodsReqs.find((g) => g.id === id), `goods request ${id}`);
const id = (v: string | undefined, what: string): string => must(v, what);

/** Ann's event, and her listing of `qty` tickets at $35 (offers welcome from $20). */
function market(qty = 3) {
  const w = new LiveTestWorld();
  const ev = w.addEvent(ANN);
  const l = w.listTickets(ANN, ev, { qty, ask: "35", obo: true, minOffer: "20" });
  return { w, ev, l };
}
const offer = (w: LiveTestWorld, who: TestPerson, l: string, amount = "30") =>
  id(w.ok(who.userId, { type: "offer", listingId: l, qty: 1, amount, msg: "", member: false }).id, "the offer");

describe("ticket exchanges: worth sending while the request waits on that step", () => {
  it("follows one offer from made to received, each email relevant only at its own step", () => {
    const { w, ev, l } = market();
    const r = offer(w, BOB, l);
    const received = factsOf(check(w, "offer.received", ANN, r));
    expect(received).toEqual({
      title: "Spring Formal", who: "Bob", unit: "ticket", qty: null, due: fmt(w, req(w, r).expiresAt), price: null, obo: false, via: null,
      eventId: ev, listingId: l, itemId: null,
    });
    expect(why(check(w, "offer.received", BOB, r))).toBe("missing"); // not Bob's to answer: the recipient must be the seller
    expect(why(check(w, "offer.accepted", BOB, r))).toBe("answered");

    w.ok(ANN.userId, { type: "accept", requestId: r });
    expect(why(check(w, "offer.received", ANN, r))).toBe("answered");
    expect(factsOf(check(w, "offer.accepted", BOB, r))).toMatchObject({ who: "Ann", due: fmt(w, req(w, r).holdUntil), eventId: ev, listingId: l });

    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    expect(why(check(w, "offer.accepted", BOB, r))).toBe("answered");
    expect(factsOf(check(w, "payment.reported", ANN, r))).toMatchObject({ who: "Bob", due: null, listingId: l });
    expect(why(check(w, "payment.missing", BOB, r))).toBe("answered"); // paid, but nobody said it hasn't arrived

    w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    expect(why(check(w, "payment.reported", ANN, r))).toBe("answered"); // the seller answered: it hasn't arrived
    expect(factsOf(check(w, "payment.missing", BOB, r))).toMatchObject({ who: "Ann", due: null });

    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect(why(check(w, "payment.missing", BOB, r))).toBe("answered");
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    expect(factsOf(check(w, "transfer.sent", BOB, r))).toMatchObject({ who: "Ann", unit: "ticket", eventId: ev, listingId: l });
    w.ok(BOB.userId, { type: "buyerReceived", requestId: r });
    expect(why(check(w, "transfer.sent", BOB, r))).toBe("answered");
  });

  it("skips an offer that expired or was withdrawn, and one whose record is gone", () => {
    const { w, l } = market();
    const late = offer(w, CAT, l);
    const gone = offer(w, DAN, l);
    w.ok(DAN.userId, { type: "cancel", requestId: gone });
    expect(why(check(w, "offer.received", ANN, gone))).toBe("closed");
    w.advance(req(w, late).expiresAt! - w.now + 1);
    expect(why(check(w, "offer.received", ANN, late))).toBe("expired");
    expect(why(check(w, "offer.received", ANN, "r0000000000000000"))).toBe("missing");
  });

  it("holds a counter-offer's email while the listing is paused, and drops it once declined", () => {
    const { w, l } = market();
    const r = offer(w, EVE, l, "25");
    w.ok(ANN.userId, { type: "counter", requestId: r, amount: "32" });
    expect(factsOf(check(w, "counter.received", EVE, r))).toMatchObject({ who: "Ann", due: fmt(w, req(w, r).expiresAt) });
    w.ok(ANN.userId, { type: "pauseListing", listingId: l });
    expect(why(check(w, "counter.received", EVE, r))).toBe("paused"); // nobody can accept a counter while paused
    w.ok(ANN.userId, { type: "resumeListing", listingId: l });
    expect(why(check(w, "counter.received", EVE, r))).toBe("ok");
    w.ok(EVE.userId, { type: "respond", requestId: r, accept: false });
    expect(why(check(w, "counter.received", EVE, r))).toBe("closed");
  });

  it("asks a requester about a held reply until they answer it", () => {
    const { w, ev } = market();
    const iso = w.requestFor(DAN, ev, { budget: "40" });
    const r = id(w.ok(EVE.userId, {
      type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, method: "app", namesChecked: false, file: null, payHandle: EVE.payHandle, membersOnly: false },
    }).id, "the held reply");
    const f = factsOf(check(w, "reply.held", DAN, r));
    expect(f).toMatchObject({ who: "Eve", due: fmt(w, req(w, r).expiresAt), eventId: ev, listingId: req(w, r).listingId });
    w.ok(DAN.userId, { type: "respond", requestId: r, accept: true });
    expect(why(check(w, "reply.held", DAN, r))).toBe("answered");
    const plain = offer(w, CAT, w.listTickets(BOB, ev, { qty: 1, obo: true }));
    expect(why(check(w, "reply.held", CAT, plain))).toBe("missing"); // not a held reply
  });
});

describe("goods exchanges", () => {
  it("asks the seller until they answer, never about a backup, and the buyer until a pickup time is set", () => {
    const w = new LiveTestWorld();
    const g = w.postItem(ANN, { title: "Desk chair", price: "30" });
    const gr = id(w.ok(BOB.userId, { type: "requestItem", id: g, msg: "" }).id, "Bob's request");
    expect(factsOf(check(w, "item.requested", ANN, gr))).toEqual({
      title: "Desk chair", who: "Bob", unit: "item", qty: null, due: w.run(() => E.fmtMs(E.goodsRespondBy(greq(w, gr), must(w.doc.goods.find((x) => x.id === g), "the item")))),
      price: null, obo: false, via: null, eventId: null, listingId: null, itemId: g,
    });
    w.ok(ANN.userId, { type: "acceptItemReq", id: gr });
    expect(why(check(w, "item.requested", ANN, gr))).toBe("answered");
    expect(factsOf(check(w, "item.accepted", BOB, gr))).toMatchObject({ who: "Ann", due: fmt(w, greq(w, gr).holdUntil), itemId: g });
    const backup = id(w.ok(CAT.userId, { type: "requestItem", id: g, msg: "" }).id, "Cat's backup");
    expect(why(check(w, "item.requested", ANN, backup))).toBe("answered"); // it waits as a backup: nothing to answer now
    w.ok(BOB.userId, { type: "setPickup", id: gr, at: `${dateAfter(w.now, 2)}T15:00` });
    expect(why(check(w, "item.accepted", BOB, gr))).toBe("answered");
    expect(why(check(w, "item.accepted", CAT, gr))).toBe("missing");
  });
});

describe("matches: worth sending while the interest is live and the listing or item still fits it", () => {
  /** Bob's event; Cat's private alert and Dan's public request for it; Ann lists 2 tickets at $35, which match both. */
  function matched(budget = "40") {
    const w = new LiveTestWorld();
    const ev = w.addEvent(BOB);
    const alert = id(w.ok(CAT.userId, { type: "joinAlert", eventId: ev, qty: 1, max: null }).id, "Cat's alert");
    const iso = w.requestFor(DAN, ev, { qty: 2, budget });
    const l = w.listTickets(ANN, ev, { qty: 2, ask: "35" });
    const link: NotificationLink = { name: "event", id: ev, listing: l };
    return { w, ev, l, alert, iso, link };
  }

  it("names the listing's public terms and which interest it fits", () => {
    const { w, ev, l, alert, iso, link } = matched();
    expect(factsOf(check(w, "match.listing", CAT, alert, link))).toEqual({
      title: "Spring Formal", who: null, unit: "ticket", qty: 2, due: null, price: "$35", obo: false, via: "alert", eventId: ev, listingId: l, itemId: null,
    });
    expect(factsOf(check(w, "match.listing", DAN, iso, link))).toMatchObject({ via: "request", qty: 2, price: "$35" });
    expect(why(check(w, "match.listing", DAN, alert, link))).toBe("missing"); // someone else's interest
    expect(why(check(w, "match.listing", CAT, alert, { name: "event", id: ev }))).toBe("missing"); // no listing named
  });

  it("stops for a paused alert, a fulfilled or expired request, and a paused, closed or sold-out listing", () => {
    let m = matched();
    m.w.ok(CAT.userId, { type: "setAlert", id: m.alert, paused: true });
    expect(why(check(m.w, "match.listing", CAT, m.alert, m.link))).toBe("paused");
    m.w.ok(DAN.userId, { type: "closeInterest", id: m.iso, reason: "fulfilled" });
    expect(why(check(m.w, "match.listing", DAN, m.iso, m.link))).toBe("closed");

    m = matched();
    m.w.ok(ANN.userId, { type: "pauseListing", listingId: m.l });
    expect(why(check(m.w, "match.listing", CAT, m.alert, m.link))).toBe("paused");
    m.w.ok(ANN.userId, { type: "resumeListing", listingId: m.l });
    expect(why(check(m.w, "match.listing", CAT, m.alert, m.link))).toBe("ok");
    m.w.ok(ANN.userId, { type: "withdraw", listingId: m.l });
    expect(why(check(m.w, "match.listing", CAT, m.alert, m.link))).toBe("closed");

    m = matched();
    m.w.take(EVE, m.l, 2); // nothing left on it
    expect(why(check(m.w, "match.listing", CAT, m.alert, m.link))).toBe("no_longer_matches");

    m = matched();
    m.w.advance(6 * 24 * HOUR); // Dan's request was needed within 5 days
    expect(why(check(m.w, "match.listing", DAN, m.iso, m.link))).toBe("expired");
  });

  it("stops when the listing no longer fits the request's public budget", () => {
    const m = matched("36");
    expect(why(check(m.w, "match.listing", DAN, m.iso, m.link))).toBe("ok");
    m.w.ok(ANN.userId, { type: "editListing", listingId: m.l, ask: "38" });
    expect(why(check(m.w, "match.listing", DAN, m.iso, m.link))).toBe("no_longer_matches");
    expect(why(check(m.w, "match.listing", CAT, m.alert, m.link))).toBe("ok"); // Cat's alert has no maximum
  });

  it("matches an item to a goods request while both are open", () => {
    const w = new LiveTestWorld();
    const iso = id(w.ok(DAN.userId, { type: "saveInterest", data: { qty: 1, budget: "50", note: "", expires: dateAfter(w.now, 5), goods: { title: "desk chair", cat: "Furniture" } } }).id, "Dan's request");
    const g = w.postItem(ANN, { title: "Desk chair", price: "30", obo: true });
    const link: NotificationLink = { name: "item", id: g };
    expect(factsOf(check(w, "match.item", DAN, iso, link))).toEqual({
      title: "Desk chair", who: null, unit: "item", qty: null, due: null, price: "$30", obo: true, via: "request", eventId: null, listingId: null, itemId: g,
    });
    w.ok(ANN.userId, { type: "pauseItem", id: g });
    expect(why(check(w, "match.item", DAN, iso, link))).toBe("paused");
    w.ok(ANN.userId, { type: "resumeItem", id: g });
    const gr = id(w.ok(BOB.userId, { type: "requestItem", id: g, msg: "" }).id, "Bob's request");
    w.ok(ANN.userId, { type: "acceptItemReq", id: gr });
    expect(why(check(w, "match.item", DAN, iso, link))).toBe("no_longer_matches"); // on hold for Bob
    w.ok(DAN.userId, { type: "closeInterest", id: iso, reason: "cancelled" });
    expect(why(check(w, "match.item", DAN, iso, link))).toBe("closed");
  });

  it("follows a share until the seller takes it back", () => {
    const w = new LiveTestWorld();
    const ev = w.addEvent(BOB);
    const iso = w.requestFor(DAN, ev, { budget: "40" });
    const l = w.listTickets(ANN, ev, { qty: 1, ask: "35" });
    const share = id(w.ok(ANN.userId, { type: "shareListing", isoId: iso, listingId: l }).id, "the share");
    // `how`: what Dan does on the listing's page. This suite runs the earlier flow, so he reserves it or makes an offer; with invite to
    // pay on he asks to buy it (invite-flow-compat.test.ts and invite-email.test.ts).
    expect(factsOf(check(w, "share.listing", DAN, share))).toMatchObject({ who: "Ann", eventId: ev, listingId: l, via: "request", how: "reserve" });
    expect(why(check(w, "share.listing", CAT, share))).toBe("missing");
    w.ok(ANN.userId, { type: "withdrawShare", id: share });
    expect(why(check(w, "share.listing", DAN, share))).toBe("closed");

    const goods = id(w.ok(DAN.userId, { type: "saveInterest", data: { qty: 1, budget: "60", note: "", expires: dateAfter(w.now, 5), goods: { title: "office chair", cat: "Furniture" } } }).id, "Dan's goods request");
    const g = w.postItem(BOB, { title: "Office chair", price: "45" });
    const shared = id(w.ok(BOB.userId, { type: "shareItem", isoId: goods, itemId: g }).id, "the item share");
    expect(factsOf(check(w, "share.item", DAN, shared))).toMatchObject({ who: "Bob", itemId: g, title: "Office chair" });
    w.ok(BOB.userId, { type: "withdrawItem", id: g });
    expect(why(check(w, "share.item", DAN, shared))).toBe("closed");
  });
});

describe("what an email may say (B4.11)", () => {
  it("never carries a payment destination, address, pickup detail, budget, lowest offer, note, message, problem or exchange amount", () => {
    // Canaries in every private field a world can hold, and amounts that must not appear in an exchange email.
    const CANARIES = ["CANARY-NOTE-L", "CANARY-NOTE-R", "CANARY-NOTE-I", "CANARY-MSG", "CANARY-AREA", "didn't work", "canary-pay", "@example.invalid"];
    const w = new LiveTestWorld({ people: [ANN, BOB, CAT, DAN, EVE].map((p) => ({ ...p, payHandle: "@canary-pay", email: `${p.userId}@example.invalid` })) });
    const ev = w.addEvent(ANN);
    const l = w.listTickets(ANN, ev, { qty: 3, ask: "35", obo: true, minOffer: "30", note: "CANARY-NOTE-L" });
    const rendered: { kind: EmailKind; subject: string; text: string; html: string; url: string }[] = [];
    const render = (kind: EmailKind, to: TestPerson, ref: string, link: NotificationLink | null = null): void => {
      const f = factsOf(check(w, kind, to, ref, link));
      const e = must(renderEmail(kind, f, SITE), `${kind}'s email`);
      rendered.push({ kind, subject: e.subject, text: e.text, html: e.html, url: e.actionUrl });
    };

    const r = id(w.ok(BOB.userId, { type: "offer", listingId: l, qty: 1, amount: "31", msg: "CANARY-MSG", member: false }).id, "the offer");
    render("offer.received", ANN, r);
    w.ok(ANN.userId, { type: "counter", requestId: r, amount: "34" });
    render("counter.received", BOB, r);
    w.ok(BOB.userId, { type: "respond", requestId: r, accept: true });
    render("offer.accepted", BOB, r);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    render("payment.reported", ANN, r);
    w.ok(ANN.userId, { type: "paymentMissing", requestId: r });
    render("payment.missing", BOB, r);
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    w.ok(BOB.userId, { type: "reportProblem", kind: "ticket", id: r, reason: "The ticket didn't work" }); // a problem's reason stays in the app
    render("transfer.sent", BOB, r);

    const iso = id(w.ok(DAN.userId, { type: "saveInterest", data: { eventId: ev, qty: 1, budget: "39", note: "CANARY-NOTE-R", expires: dateAfter(w.now, 5) } }).id, "Dan's request");
    const reply = id(w.ok(EVE.userId, {
      type: "addThen", add: { eventId: ev, tier: "t1", qty: 1, paid: "40" },
      then: { type: "isoReply", isoId: iso, qty: 1, method: "app", namesChecked: false, file: null, payHandle: "@canary-pay", membersOnly: false, note: "CANARY-NOTE-L" },
    }).id, "the held reply");
    render("reply.held", DAN, reply);

    const g = w.postItem(ANN, { title: "Desk chair", price: "29", obo: true, minOffer: "25", area: "CANARY-AREA", note: "CANARY-NOTE-I" });
    const gr = id(w.ok(BOB.userId, { type: "requestItem", id: g, offer: "27", msg: "CANARY-MSG" }).id, "Bob's offer");
    render("item.requested", ANN, gr);
    w.ok(ANN.userId, { type: "acceptItemReq", id: gr });
    render("item.accepted", BOB, gr);

    const ev2 = w.addEvent(BOB, { title: "Winter Gala" });
    const alert = id(w.ok(CAT.userId, { type: "joinAlert", eventId: ev2, qty: 1, max: "38" }).id, "Cat's alert");
    const iso2 = id(w.ok(DAN.userId, { type: "saveInterest", data: { eventId: ev2, qty: 1, budget: "39", note: "CANARY-NOTE-R", expires: dateAfter(w.now, 5) } }).id, "Dan's second request");
    const l2 = w.listTickets(EVE, ev2, { qty: 2, ask: "36", note: "CANARY-NOTE-L" });
    render("match.listing", CAT, alert, { name: "event", id: ev2, listing: l2 });
    render("match.listing", DAN, iso2, { name: "event", id: ev2, listing: l2 });
    const share = id(w.ok(EVE.userId, { type: "shareListing", isoId: iso2, listingId: l2 }).id, "the share");
    render("share.listing", DAN, share);

    const iso3 = id(w.ok(DAN.userId, { type: "saveInterest", data: { qty: 1, budget: "41", note: "CANARY-NOTE-R", expires: dateAfter(w.now, 5), goods: { title: "floor lamp", cat: "Home & kitchen" } } }).id, "Dan's goods request");
    const lamp = w.postItem(CAT, { title: "Floor lamp", cat: "Home & kitchen", price: "22", area: "CANARY-AREA", note: "CANARY-NOTE-I" });
    render("match.item", DAN, iso3, { name: "item", id: lamp });
    const shared = id(w.ok(CAT.userId, { type: "shareItem", isoId: iso3, itemId: lamp }).id, "the item share");
    render("share.item", DAN, shared);

    // Every kind was rendered, from facts alone.
    expect(new Set(rendered.map((e) => e.kind))).toEqual(new Set<EmailKind>([
      "offer.received", "offer.accepted", "counter.received", "reply.held", "payment.reported", "transfer.sent", "payment.missing",
      "item.requested", "item.accepted", "match.listing", "match.item", "share.listing", "share.item",
    ]));
    for (const e of rendered) {
      const all = `${e.subject}\n${e.text}\n${e.html}\n${e.url}`;
      for (const c of CANARIES) expect(all, `${e.kind}: ${c}`).not.toContain(c);
      // Surnames stay in the app: an email names the other person by first name only.
      for (const surname of ["Lee", "Diaz", "Moore", "Ng", "Park"]) expect(all, `${e.kind}: ${surname}`).not.toMatch(new RegExp(`\\b${surname}\\b`));
      // Budgets, lowest offers, alert maximums and the offers, counters and requests made.
      for (const amount of ["$39", "$38", "$41", "$30", "$25", "$31", "$34", "$27"]) expect(all, `${e.kind}: ${amount}`).not.toContain(amount);
      // An exchange email names no amount at all; a match email only the public asking price.
      if (!e.kind.startsWith("match.")) expect(all, e.kind).not.toContain("$");
      expect(e.url.startsWith(`${SITE}/tools/handoff#`)).toBe(true);
    }
    expect(rendered.find((e) => e.kind === "match.listing")?.text).toContain("2 tickets at $36 may match your alert.");
    expect(rendered.find((e) => e.kind === "match.item")?.text).toContain("A classmate is selling it for $22.");
  });
});
