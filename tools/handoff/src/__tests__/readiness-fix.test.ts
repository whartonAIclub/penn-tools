// The readiness fixes (Nov 8, 2026; PILOT\RF\FIX.md): the engine and store rules behind the readiness findings that the server decides.
// Each test failed on the code before its fix. Through helpers/worlds.ts (the real engine on frozen documents, notifications drained as
// the store drains them) and, for the notifications table, the store on a throwaway Postgres schema. The people are labelled test
// accounts with made-up ids; no sign-in of any kind.
// - RB-1: a reservation that lapses unpaid tells its buyer and its seller, in words that fit why it ended; nobody else (D42).
// - RB-4: a hold cut short by a transfer cutoff lapses with the cutoff's reason, never "so it went back on sale".
// - RB-5: once a train has left, its listing's held tickets aren't "held for a buyer" to anyone else.
// - RB-6: a trek's name change calls the place a spot, and its seller emails the organizer.
// - RB-10: two changes with the same words each notify; one change never stores the same words twice for a person.
// - RC-4: a listing's share link names the listing as well as its event.
// - RC-6: an app transfer says where it happens: "in Ticketmaster or AXS", never "in the app".
// (RB-7, a same-day range, is in time.test.ts with the other date words.)
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { Listing, TicketRequest } from "../../engine/index.js";
import { seed } from "../../engine/preview.js";
import { applyAction } from "../store.js";
import type { WorldId } from "../types.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { StoreWorld, T0 as LT0, TEST_A, TEST_B, actions as sent } from "./helpers/live-store.js";
import { ANN, BOB, CAT, DAN, LiveTestWorld, MIN, T0, wallAfter } from "./helpers/worlds.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}
const requestOf = (w: LiveTestWorld, id: string): TicketRequest => must(w.doc.requests.find((r) => r.id === id), `request ${id}`);
const listingOf = (w: LiveTestWorld, id: string): Listing => must(w.doc.listings.find((l) => l.id === id), `listing ${id}`);
const holdEndOf = (w: LiveTestWorld, id: string): number => must(requestOf(w, id).holdUntil, `the hold end of ${id}`);
const PAID_ELSEWHERE = "If you did pay Ann, contact them directly: Handoff can't see payments.";
/** Ann's event with `qty` tickets listed at $35. */
function market(qty = 2, event: Record<string, unknown> = {}, list: Parameters<LiveTestWorld["listTickets"]>[2] = {}) {
  const w = new LiveTestWorld();
  const ev = w.addEvent(ANN, event);
  const l = w.listTickets(ANN, ev, { qty, ...list });
  return { w, ev, l };
}
/** A train valid all of T0's day, and Ann's eTicket for one leaving at `departs` (a New York wall time). */
function trainMarket(departs: string, qty = 2) {
  const w = new LiveTestWorld();
  const ev = must(w.ok(ANN.userId, { type: "createEvent", kind: "train", title: "Amtrak: Philadelphia → New York", club: "Amtrak", start: wallAfter(T0, 0, "06:00"),
    openUntil: wallAfter(T0, 0, "23:00"), ticketType: "eticket", tiers: [{ label: "Coach", price: "89" }] }).id, "train");
  const l = w.listTickets(ANN, ev, { qty, paid: "89", ask: "80", method: "file", departsAt: departs });
  return { w, ev, l };
}
const texts = (notes: readonly { userId: string; text: string }[]) => Object.fromEntries(notes.map((n) => [n.userId, n.text]));

afterEach(() => {
  E.applyWorld(null); // back to the preview's catalog between tests
});

describe("RB-1: a reservation that lapses unpaid tells its buyer and its seller", () => {
  it("says when it ended, that it went back on sale, and what to do if the buyer paid; nobody else is told, and only once", () => {
    const { w, ev, l } = market(3);
    const r = w.take(BOB, l);
    const paid = w.take(CAT, l); // Cat holds another ticket on the same listing, and pays
    w.ok(CAT.userId, { type: "markPaid", requestId: paid });
    const until = holdEndOf(w, r);
    w.now = until + 1;
    const swept = w.sweep();
    expect(requestOf(w, r)).toMatchObject({ status: "expired", reason: "The reservation ended without payment, so it went back on sale." });
    const at = E.fmtMs(until);
    expect(swept.notes.map((n) => [n.userId, n.text, n.link])).toEqual(expect.arrayContaining([
      [BOB.userId, `Your reservation for Spring Formal ended at ${at} without payment, so it went back on sale. ${PAID_ELSEWHERE}`, { name: "event", id: ev }],
      [ANN.userId, `Bob D.'s reservation of 1 ticket for Spring Formal ended at ${at} without payment. It's back on sale.`, { name: "activity", tab: "listings" }],
    ]));
    expect(swept.notes).toHaveLength(2); // Cat (another buyer on the listing) and everyone else hear nothing about Bob's hold
    expect(w.sweep().notes).toEqual([]); // stored once: a later sweep tells nobody again
    // The same when another person's change is what stores it (every change settles what time decided): Dan, whose take that is,
    // hears nothing about Bob's hold.
    const m = market(2);
    const r2 = m.w.take(BOB, m.l);
    const end2 = holdEndOf(m.w, r2);
    m.w.now = end2 + MIN;
    const next = m.w.ok(DAN.userId, { type: "take", listingId: m.l, qty: 1, amount: "", msg: "", member: false });
    const of = (p: { userId: string }) => next.notes.filter((n) => n.userId === p.userId).map((n) => n.text);
    expect(of(BOB)).toEqual([`Your reservation for Spring Formal ended at ${E.fmtMs(end2)} without payment, so it went back on sale. ${PAID_ELSEWHERE}`]);
    expect(of(ANN)).toContain(`Bob D.'s reservation of 1 ticket for Spring Formal ended at ${E.fmtMs(end2)} without payment. It's back on sale.`);
    expect(of(DAN)).toEqual([]);
  });

  it("fits the words to why it ended: a paused listing, a train that left, a transfer window that closed", () => {
    // Paused: nothing went back on sale.
    const p = market(2);
    const r = p.w.take(BOB, p.l);
    p.w.ok(ANN.userId, { type: "pauseListing", listingId: p.l });
    const until = holdEndOf(p.w, r);
    p.w.now = until + 1;
    expect(texts(p.w.sweep().notes)).toEqual({
      [BOB.userId]: `Your reservation for Spring Formal ended at ${E.fmtMs(until)} without payment. ${PAID_ELSEWHERE}`,
      [ANN.userId]: `Bob D.'s reservation of 1 ticket for Spring Formal ended at ${E.fmtMs(until)} without payment. It's back with you, and the listing stays paused until you resume it.`,
    });
    // A train: the hold was cut to its departure, and the train left.
    const t = trainMarket(wallAfter(T0, 0, "12:10"));
    const tr = t.w.take(BOB, t.l);
    const dep = holdEndOf(t.w, tr);
    expect(dep).toBe(E.wallToMs(wallAfter(T0, 0, "12:10")));
    t.w.now = dep + 1;
    expect(texts(t.w.sweep().notes)).toEqual({
      [BOB.userId]: `Your reservation for Amtrak: Philadelphia → New York ended at ${E.fmtMs(dep)}: the train left before it was paid for. ${PAID_ELSEWHERE}`,
      [ANN.userId]: `Bob D.'s reservation of 1 ticket for Amtrak: Philadelphia → New York ended at ${E.fmtMs(dep)}: the train left before it was paid for.`,
    });
    // A transfer cutoff (RB-4's reason, below).
    const c = market(2, { deadline: wallAfter(T0, 0, "12:10") });
    const cr = c.w.take(BOB, c.l);
    const cut = holdEndOf(c.w, cr);
    c.w.now = cut + 1;
    const when = c.w.run(() => E.fmtWhen(wallAfter(T0, 0, "12:10")));
    expect(texts(c.w.sweep().notes)).toEqual({
      [BOB.userId]: `Your reservation for Spring Formal ended at ${E.fmtMs(cut)}: the transfer window closed ${when} before it was paid for. ${PAID_ELSEWHERE}`,
      [ANN.userId]: `Bob D.'s reservation of 1 ticket for Spring Formal ended at ${E.fmtMs(cut)}: the transfer window closed ${when} before it was paid for.`,
    });
  });

  it("tells nobody when nothing lapsed: a paid hold, a cancelled or released one, an offer that expired", () => {
    const { w, l } = market(4, {}, { obo: true });
    const paid = w.take(BOB, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: paid });
    w.ok(CAT.userId, { type: "cancel", requestId: w.take(CAT, l) });
    w.ok(ANN.userId, { type: "release", requestId: w.take(DAN, l) });
    const offer = must(w.ok(DAN.userId, { type: "offer", listingId: l, qty: 1, amount: "30", msg: "", member: false }).id, "offer");
    w.advance(7 * 60 * MIN); // past every hold and the offer's 6 hours
    const swept = w.sweep();
    expect(requestOf(w, offer).status).toBe("expired");
    expect(swept.notes.filter((n) => /reservation .*ended/.test(n.text))).toEqual([]);
  });

  it("leaves the preview as it was: a lapse there notifies nobody", () => {
    let s = seed();
    E.applyWorld(s);
    s = E.reduce(s, "u_priya", { type: "take", listingId: "l12", qty: 1 }).state; // Leah's Amtrak eTicket
    const before = s.notifications.length;
    s = E.reduce(s, "u_jordan", { type: "clock", hours: 1 }).state; // the preview's demo clock, past the 15-minute hold
    expect(must(s.requests[0], "request").status).toBe("expired");
    expect(s.notifications.slice(0, s.notifications.length - before).filter((n) => /reservation .*ended/.test(n.text))).toEqual([]);
  });
});

describe("RB-4: a hold cut short by a transfer cutoff lapses with the cutoff's reason", () => {
  it("stores \"The transfer window closed … before it was paid for.\", paused or not, and keeps the plain reason for a hold that ended first", () => {
    for (const pause of [false, true]) {
      const { w, l } = market(2, { deadline: wallAfter(T0, 0, "12:10") });
      const r = w.take(BOB, l);
      expect(holdEndOf(w, r)).toBe(E.wallToMs(wallAfter(T0, 0, "12:10"))); // cut to the cutoff, 10 minutes after the take
      if (pause) w.ok(ANN.userId, { type: "pauseListing", listingId: l });
      w.now = holdEndOf(w, r) + 1;
      const when = w.run(() => E.fmtWhen(wallAfter(T0, 0, "12:10")));
      const reason = `The transfer window closed ${when} before it was paid for.`;
      expect(w.run(() => E.rState(requestOf(w, r))), `derived, paused ${pause}`).toMatchObject({ st: "expired", reason }); // what every page shows before the sweep
      w.sweep();
      expect(requestOf(w, r), `stored, paused ${pause}`).toMatchObject({ status: "expired", reason });
    }
    // A hold that ran out before a later cutoff went back on sale, as before.
    const { w, l } = market(2, { deadline: wallAfter(T0, 0, "13:00") });
    const r = w.take(BOB, l);
    w.now = holdEndOf(w, r) + 1;
    w.sweep();
    expect(requestOf(w, r).reason).toBe("The reservation ended without payment, so it went back on sale.");
  });
});

describe("RB-5: a train that has left holds nothing for anyone else", () => {
  it("doesn't count its paid-but-unconfirmed reservation as held for a buyer once it departs", () => {
    const { w, ev, l } = trainMarket(wallAfter(T0, 0, "12:10"));
    const r = w.take(BOB, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    w.now = E.wallToMs(wallAfter(T0, 0, "12:05"));
    w.run(() => {
      const sum = E.eventSummary(w.doc, must(E.EV[ev], "train"), CAT.userId);
      expect(sum.reservedOthers).toBe(1); // before it leaves, Cat reads it's held (it could still open up)
    });
    w.now = E.wallToMs(wallAfter(T0, 0, "12:11"));
    w.run(() => {
      const train = must(E.EV[ev], "train");
      expect(E.listingNumbers(w.doc, listingOf(w, l))).toMatchObject({ reserved: 1, available: 0 }); // Bob's paid reservation goes on
      const sum = E.eventSummary(w.doc, train, CAT.userId);
      expect(sum.reservedOthers).toBe(0);
      expect(sum.state.label).not.toMatch(/held for a buyer/);
      expect(E.priceParts(train, sum).sub).not.toMatch(/held for a buyer/);
      expect(E.eventSummary(w.doc, train, ANN.userId).ownReserved).toBe(1); // the seller still has Bob's exchange to finish
    });
  });
});

describe("RB-6: a trek's name change", () => {
  it("calls the place a spot, and the seller emails the organizer", () => {
    const w = new LiveTestWorld();
    const ev = must(w.ok(ANN.userId, { type: "createEvent", kind: "trek", title: "Japan Trek", club: "Kyoto Travel Co", start: wallAfter(T0, 40, "08:00"), end: wallAfter(T0, 45, "18:00"),
      attend: "all", tiers: [{ label: "Spot", price: "1200" }] }).id, "trek");
    const l = w.listTickets(ANN, ev, { qty: 1, paid: "1200", ask: "1100", method: "name" });
    const r = w.take(BOB, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect(w.run(() => E.needsAction(w.doc, ANN.userId).map((x) => x.why))).toEqual(["email the organizer"]);
    const done = w.ok(ANN.userId, { type: "markTransferred", requestId: r });
    expect(texts(done.notes)).toEqual({ [BOB.userId]: 'Ann asked Kyoto Travel Co to put the spot for Japan Trek in your name. Tap "Received" once it\'s confirmed.' });
    // An event's tickets keep their words.
    const t = market(1, { namesChecked: true }, { method: "name" });
    const tr = t.w.take(BOB, t.l);
    t.w.ok(BOB.userId, { type: "markPaid", requestId: tr });
    t.w.ok(ANN.userId, { type: "confirmPayment", requestId: tr });
    expect(t.w.run(() => E.needsAction(t.w.doc, ANN.userId).map((x) => x.why))).toEqual(["email the club"]);
    expect(texts(t.w.ok(ANN.userId, { type: "markTransferred", requestId: tr }).notes)).toEqual({
      [BOB.userId]: 'Ann asked Wharton Graduate Association to put the ticket for Spring Formal in your name. Tap "Received" once it\'s confirmed.' });
  });
});

// RC-4 ("a listing's share link names the listing") was removed in SELL5-M1: §9v item 3 removed outward Share, so no share link is built.
// The listing's ordinary URL ("#ev-…?listing=…") is the page's own: apps/web's routes.test.ts pins how it opens and stays in the address.

describe("RC-6: an app transfer says where it happens", () => {
  it("\"transfer it in Ticketmaster or AXS\", in the toast, the buyer's notification and the seller's next step", () => {
    expect(E.METHODS.app.verb).toBe("transfer it in Ticketmaster or AXS");
    const { w, l } = market(1);
    const r = w.take(BOB, l);
    w.ok(BOB.userId, { type: "markPaid", requestId: r });
    const done = w.ok(ANN.userId, { type: "confirmPayment", requestId: r });
    expect(done.toast).toBe("Payment confirmed. Now transfer it in Ticketmaster or AXS.");
    expect(texts(done.notes)).toEqual({ [BOB.userId]: "Ann confirmed your payment for Spring Formal. Next: they transfer it in Ticketmaster or AXS." });
    expect(w.run(() => E.needsAction(w.doc, ANN.userId).map((x) => x.why))).toEqual(["transfer it in Ticketmaster or AXS"]);
  });
});

// ── RB-10: the notifications table, through the store with the real engine (a throwaway schema) ──────────────────────────────────
describe.skipIf(!databaseUrl)("RB-10: notifications from separate changes all arrive (Postgres)", () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb("readiness-fix"); }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("two exchanges confirmed with the same words both reach the buyer; a retried change adds nothing", async () => {
    const w = new StoreWorld(db.sql, "test-rf-notes" as WorldId, LT0);
    const ev = await w.createEvent(TEST_A);
    const l = await w.list(TEST_A, ev, { qty: 2, ask: "35" });
    // (The method's words are RC-6's, tested above; either wording counts here.)
    const CONFIRMED = /^Handoff confirmed your payment for \[Test\] Spring Formal\. Next: they transfer it in (the app|Ticketmaster or AXS)\.$/;
    // B's first exchange: paid, confirmed (retried once), transferred and received. B never opens the notifications.
    const r1 = must((await w.ok(TEST_B, sent.take(l))).resultId, "the first reservation");
    await w.ok(TEST_B, sent.onRequest("markPaid", r1));
    const rid = randomUUID();
    const first = await applyAction(db.sql, { worldId: w.worldId, actor: TEST_A, requestId: rid, action: sent.onRequest("confirmPayment", r1), now: w.now });
    expect(first.ok).toBe(true);
    const again = await applyAction(db.sql, { worldId: w.worldId, actor: TEST_A, requestId: rid, action: sent.onRequest("confirmPayment", r1), now: w.now });
    expect(again).toMatchObject({ ok: true, replay: true }); // the same change, retried: answered once, notified once
    let b = await w.view(TEST_B);
    expect(b.notifications.filter((n) => CONFIRMED.test(n.text))).toHaveLength(1);
    await w.ok(TEST_A, sent.onRequest("markTransferred", r1));
    await w.ok(TEST_B, sent.onRequest("buyerReceived", r1));
    // The second exchange on the same listing, confirmed in the same words.
    const r2 = must((await w.ok(TEST_B, sent.take(l))).resultId, "the second reservation");
    await w.ok(TEST_B, sent.onRequest("markPaid", r2));
    await w.ok(TEST_A, sent.onRequest("confirmPayment", r2));
    b = await w.view(TEST_B);
    // The second exchange's confirmation, in the same words while the first is unread: it arrives too (it was dropped as a duplicate).
    expect(b.notifications.filter((n) => CONFIRMED.test(n.text)).map((n) => n.read)).toEqual([false, false]);
    expect(b.unreadCount).toBe(b.notifications.filter((n) => !n.read).length);
  });
});
