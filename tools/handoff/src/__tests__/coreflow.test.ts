// The first two-user journey (C-CONTRACT.md §6; C-DESIGN §9.2 "coreflow"), end to end through the store with the REAL engine
// (the store's default port) and a real Postgres: one user adds an event and lists tickets, another discovers them, reserves,
// pays, and receives; stock and activity are right for both after each refresh, each step notifies the other person, private
// things stay private, two buyers racing for the last unit get exactly one reservation, and everything survives a new pool.
//
// Labelled TEST users (made-up ids, @example.invalid emails, named like the minted test sessions). No session and no sign-in
// of any kind: the store takes the actor its caller gives it. Times are injected, so holds and deadlines are deterministic.
// Each step is one test, in order; a step relies on the ones before it.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { ID } from "../live.js";
import { getView, markNotificationsRead, refreshView, savePayMethods } from "../store.js";
import type { View, ViewNotification, WorldId } from "../types.js";
import { createTestDb, databaseUrl, firstWaitsFor, type TestDb } from "./helpers/db.js";
import { MIN, StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, actions, checked, dateAfter } from "./helpers/live-store.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const WORLD: WorldId = "test-coreflow";
// A's payment method (follow-on B1): Venmo, typed with its "@", stored without it, shown with it again.
const HANDLE = "@hand-test-a";
const VENMO_A = { kind: "venmo", value: "hand-test-a" } as const;
const NOTE = "CANARY-B-NOTE: two for the formal (public on purpose)";
const ALERT_MAX = "29.37";
const SOLD_OUT = "No tickets are left on this listing.";

let db: TestDb;
let w: StoreWorld;
const ids = { ev1: "", ev2: "", ev3: "", L1: "", L2: "", L3: "", iso: "", alert: "", share: "", r1: "" };

const texts = (v: View): string[] => v.notifications.map((n) => n.text);
const listingIn = (v: View, id: string) => {
  const l = v.listings.find((x) => x.id === id);
  if (!l) throw new Error(`listing ${id} isn't in ${v.viewer.id}'s view`);
  return l;
};
const requestIn = (v: View, id: string) => {
  const r = v.requests.find((x) => x.id === id);
  if (!r) throw new Error(`request ${id} isn't in ${v.viewer.id}'s view`);
  return r;
};

describe.skipIf(!databaseUrl)("Handoff's first two-user journey (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("coreflow");
    w = new StoreWorld(db.sql, WORLD, T0);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("1. A and B open Handoff: an empty market, each with their own profile and nothing else", async () => {
    for (const p of [A, B]) {
      const v = await w.view(p);
      expect(v).toMatchObject({ protocol: E.HANDOFF_PROTOCOL, mode: "live", worldId: WORLD, version: 0, serverNow: T0, nextRefreshAt: null, unreadCount: 0 });
      // No payment method, although the account has an email: nothing is prefilled from it (follow-on B1.6). Since protocol 2 there's
      // no legacy handle beside it, in the viewer or in your own person.
      expect(v.viewer).toEqual({ id: p.id, name: p.name, email: p.email, payMethods: [] });
      expect(v.people).toEqual({ [p.id]: { name: p.name, first: "Handoff", color: E.colorFor(p.id), demo: true, contact: p.email } });
      for (const key of ["events", "holdings", "listings", "requests", "interests", "responses", "goods", "goodsReqs", "notifications"] as const) {
        expect(v[key], key).toEqual([]);
      }
    }
    expect(await w.row()).toBeUndefined(); // reading creates no world
  });

  it("2. A saves a payment method (Profile: Venmo); only A's own view carries it", async () => {
    expect(await savePayMethods(db.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: HANDLE }] })).toEqual({ ok: true, methods: [VENMO_A] });
    const a = await w.view(A);
    expect(a.viewer.payMethods).toEqual([VENMO_A]);
    expect(a.people[A.id]).not.toHaveProperty("pay");
  });

  it("3. A adds the event (Not listed? Add it), and two more; the form continues with the new event's id", async () => {
    const o = await w.ok(A, actions.createEvent(w.now));
    expect(o.toast).toBe("Event added. It shows as added by you, and Handoff doesn't check its details.");
    expect(o.resultId).toMatch(ID.event);
    ids.ev1 = o.resultId!;
    expect(o.view.version).toBe(1);
    expect(o.view.events.find((e) => e.id === ids.ev1)).toMatchObject({
      title: "[Test] Spring Formal", club: "Wharton Graduate Association", kind: "event", start: `${dateAfter(T0, 10)}T19:00`,
      addedBy: A.id, canRemove: true, userAdded: true, sourcesNote: "Added by Handoff A. · details not checked by Handoff",
      tiers: [{ id: "t1", label: "General admission", price: 40, src: "entered by Handoff" }],
    });
    ids.ev2 = await w.createEvent(A, { title: "[Test] Winter Gala", tiers: [{ label: "General admission", price: "30" }], start: `${dateAfter(T0, 12)}T19:00` });
    ids.ev3 = await w.createEvent(A, { title: "[Test] Jazz Night", club: "Penn Jazz Club", cat: "Shows", tiers: [{ label: "General admission", price: "20" }], start: `${dateAfter(T0, 14)}T20:00` });
    expect((await w.row())?.version).toBe(3);
  });

  it("4. A lists 2 at $35 in one step (addThen); A's own view has the numbers and the history, and no handle on the listing", async () => {
    // A handle sent with a listing (as the page before protocol 2 did) is dropped: buyers pay with A's saved methods.
    const o = await w.ok(A, actions.list(ids.ev1, { qty: 2, ask: "35", paid: "40", payHandle: "@typed-with-the-listing" }));
    expect(o.toast).toBe("Ticket listed. No one has a matching request yet; anyone with a matching private alert gets an in-app alert.");
    expect(o.resultId).toMatch(ID.listing);
    ids.L1 = o.resultId!;
    expect(listingIn(o.view, ids.L1)).toMatchObject({
      sellerId: A.id, eventId: ids.ev1, listed: 2, ask: 35, paid: 40, tier: "t1", method: "app", payKinds: ["venmo"], source: "self-reported",
      numbers: { reserved: 0, completed: 0, available: 2 }, numbersUntil: null, holdingId: expect.stringMatching(ID.holding),
    });
    expect(listingIn(o.view, ids.L1)).not.toHaveProperty("payHandle");
    expect(JSON.stringify((await w.row())!.doc)).not.toContain("@typed-with-the-listing");
    expect(o.view.holdings).toEqual([{ id: listingIn(o.view, ids.L1).holdingId, userId: A.id, eventId: ids.ev1, tier: "t1", qty: 2, paid: 40, source: "self-reported" }]);
    // Something refers to the event now, so A can no longer remove it.
    expect(o.view.events.find((e) => e.id === ids.ev1)?.canRemove).toBe(false);
  });

  it("5. B refreshes: the event, added by Handoff A., with 2 available; no handle, history, holding or email of A's", async () => {
    const r = await refreshView(db.sql, { worldId: WORLD, viewer: B, version: 0, nextRefreshAt: null, now: w.now });
    if (r.unchanged) throw new Error("B's refresh should bring the new version");
    const b = checked(r.view, B.id);
    expect(b.version).toBe(4);
    expect(b.events.map((e) => e.id).sort()).toEqual([ids.ev1, ids.ev2, ids.ev3].sort());
    const ev = b.events.find((e) => e.id === ids.ev1);
    expect(ev).toMatchObject({ addedBy: A.id, sourcesNote: "Added by Handoff A. · details not checked by Handoff" });
    expect(ev).not.toHaveProperty("canRemove");
    expect(b.people[A.id]).toEqual({ name: "Handoff A.", first: "Handoff", color: E.colorFor(A.id), demo: true });
    const l = listingIn(b, ids.L1);
    expect(l.numbers).toEqual({ reserved: 0, completed: 0, available: 2 });
    for (const key of ["payHandle", "history", "holdingId", "record"]) expect(l, key).not.toHaveProperty(key);
    expect(b.holdings).toEqual([]);
    expect(l.payKinds).toEqual(["venmo"]); // which way A takes payment, before B commits; never where to send it
    const json = JSON.stringify(b);
    expect(json).not.toContain(VENMO_A.value);
    expect(json).not.toContain(A.email!);
    // Nothing new since: the next refresh is a cheap "unchanged".
    expect(await refreshView(db.sql, { worldId: WORLD, viewer: B, version: b.version, nextRefreshAt: b.nextRefreshAt, now: w.now })).toEqual({ unchanged: true, version: b.version });
  });

  it("6. B posts a public request for 2 (with a public note) and a private alert on event 2; nobody else sees the alert", async () => {
    const o = await w.ok(B, actions.request(ids.ev1, { qty: 2, budget: "35", note: NOTE, expires: dateAfter(w.now, 5) }));
    expect(o.toast).toBe("Request posted. 1 seller with a listing for this event was told. Matches show at the bell and in My activity."); // §9q item 4: where matches show
    ids.iso = o.resultId!;
    expect(ids.iso).toMatch(ID.iso);
    const al = await w.ok(B, { type: "joinAlert", eventId: ids.ev2, qty: 1, max: ALERT_MAX });
    expect(al.toast).toBe("Alert on. Only you can see it. You'll get an in-app alert when a matching listing appears.");
    ids.alert = al.resultId!;
    expect(al.view.interests.find((i) => i.id === ids.alert)).toMatchObject({ kind: "alert", userId: B.id, max: 29.37, qty: 1, status: "open" });

    for (const p of [A, C]) {
      const v = await w.view(p);
      expect(v.interests.find((i) => i.id === ids.iso), p.id).toMatchObject({ userId: B.id, kind: "iso", qty: 2, budget: 35, note: NOTE, status: "open" });
      expect(v.people[B.id]?.name).toBe("Handoff B.");
      const json = JSON.stringify(v);
      expect(json, p.id).not.toContain(ids.alert);
      expect(json, p.id).not.toContain(ALERT_MAX);
      expect(v.interests.filter((i) => i.kind === "alert"), p.id).toEqual([]);
    }
  });

  it("7. A shares the listing with B's request (I have this): it holds nothing and changes no numbers", async () => {
    const before = listingIn(await w.view(C), ids.L1).numbers;
    const o = await w.ok(A, { type: "shareListing", isoId: ids.iso, listingId: ids.L1 });
    expect(o.toast).toBe("Shared with Handoff. Nothing is held: they reserve it or make an offer like anyone else.");
    ids.share = o.resultId!;
    expect(ids.share).toMatch(ID.share);
    expect(listingIn(await w.view(C), ids.L1).numbers).toEqual(before);
    const b = await w.view(B);
    expect(b.responses.map((x) => x.id)).toEqual([ids.share]);
    // The share links them, so each sees the other's full name, but no email: nothing is reserved.
    expect(b.people[A.id]).toEqual({ name: "Handoff Test A", first: "Handoff", color: E.colorFor(A.id), demo: true });
    expect((await w.view(C)).responses).toEqual([]);
  });

  it("8. A lists 1 on event 2 at $28: no matching request, so A's toast counts nobody, and only B's private alert fires", async () => {
    const o = await w.ok(A, actions.list(ids.ev2, { qty: 1, ask: "28", paid: "30", payHandle: HANDLE }));
    expect(o.toast).toBe("Ticket listed. No one has a matching request yet; anyone with a matching private alert gets an in-app alert.");
    ids.L2 = o.resultId!;
    const b = await w.view(B);
    expect(b.notifications[0]).toMatchObject({ userId: B.id, text: "A ticket opened up for [Test] Winter Gala: Handoff listed 1 ticket at $28.", link: { name: "event", id: ids.ev2 }, read: false });
    for (const p of [A, C]) expect(JSON.stringify(await w.view(p)), p.id).not.toContain(ALERT_MAX);
  });

  it("9. B takes 1 (I'll take it): held 15 minutes; only now B sees where to pay A (the exchange's own copy), A's full name and email", async () => {
    w.advance(MIN);
    const o = await w.ok(B, actions.take(ids.L1));
    expect(o.toast).toBe(`Reserved for 15 minutes. Pay Handoff $35 now, then tap "I've sent payment".`);
    ids.r1 = o.resultId!;
    expect(ids.r1).toMatch(ID.request);
    const until = w.now + 15 * MIN;
    expect(requestIn(o.view, ids.r1)).toMatchObject({ buyerId: B.id, listingId: ids.L1, qty: 1, price: 35, status: "accepted", holdUntil: until, flow: "quick", pay: [VENMO_A] });
    expect(listingIn(o.view, ids.L1)).toMatchObject({ numbers: { reserved: 1, completed: 0, available: 1 }, numbersUntil: until });
    expect(listingIn(o.view, ids.L1)).not.toHaveProperty("payHandle"); // the request's copy is where to pay; the listing has no handle
    expect(o.view.people[A.id]).toEqual({ name: "Handoff Test A", first: "Handoff", color: E.colorFor(A.id), demo: true, contact: A.email });
    expect(o.view.nextRefreshAt).toBe(until);

    // A, the seller: 1 available and 1 held until B's hold ends, B's reservation with B's full name and email.
    const a = await w.view(A);
    expect(listingIn(a, ids.L1)).toMatchObject({ numbers: { reserved: 1, completed: 0, available: 1 }, numbersUntil: until });
    expect(requestIn(a, ids.r1)).toMatchObject({ buyerId: B.id, status: "accepted" });
    expect(a.people[B.id]).toEqual({ name: "Handoff Test B", first: "Handoff", color: E.colorFor(B.id), demo: true, contact: B.email });

    // C, a stranger: the same counts, but not when B's hold ends (that would show when B reserved it, and how), and nobody's
    // reservation, handle or email. Were the hold to lapse, the world's next_due would make C's next refresh bring the change.
    const c = await w.view(C);
    const lc = listingIn(c, ids.L1);
    expect(lc.numbers).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(lc.numbersUntil).toBeNull();
    expect(lc).not.toHaveProperty("payHandle");
    expect(c.requests).toEqual([]);
    expect(c.nextRefreshAt).toBeNull();
    expect(JSON.stringify(c)).not.toContain(String(until));
    const json = JSON.stringify(c);
    for (const secret of [VENMO_A.value, A.email!, B.email!, ids.r1]) expect(json).not.toContain(secret);

    // The hold's deadline is the world's next_due: the first read after it sweeps.
    expect((await w.row())?.next_due?.getTime()).toBe(until);
  });

  it("10. B marks it paid; A confirms the payment and marks it sent; A's transfer details show B's email", async () => {
    w.advance(2 * MIN);
    const paid = await w.ok(B, actions.onRequest("markPaid", ids.r1));
    expect(paid.toast).toBe("Payment marked as sent. Handoff confirms it arrived, then they transfer it to your email in Ticketmaster or AXS.");
    expect(requestIn(paid.view, ids.r1)).toMatchObject({ status: "paid", paidVia: "venmo" }); // one method: the one B paid with
    expect((await w.row())?.next_due).toBeNull(); // a paid reservation doesn't lapse

    w.advance(2 * MIN);
    const a0 = await refreshView(db.sql, { worldId: WORLD, viewer: A, version: paid.view.version - 1, nextRefreshAt: null, now: w.now });
    if (a0.unchanged) throw new Error("A's refresh should bring B's payment");
    expect(requestIn(checked(a0.view, A.id), ids.r1).status).toBe("paid");
    const confirmed = await w.ok(A, actions.onRequest("confirmPayment", ids.r1));
    expect(confirmed.toast).toBe("Payment confirmed. Now transfer it in Ticketmaster or AXS."); // readiness RC-6: it said "in the app"
    const sent = await w.ok(A, actions.onRequest("markTransferred", ids.r1));
    expect(sent.toast).toBe('Marked done. Handoff taps "Received" once they have it.');
    expect(requestIn(sent.view, ids.r1).status).toBe("sent");
    expect(sent.view.people[B.id]?.contact).toBe(B.email);
  });

  it("11. B confirms receipt: completed; B holds 1 transferred in Handoff, and B's request stays open for the other 1", async () => {
    w.advance(2 * MIN);
    const o = await w.ok(B, actions.onRequest("buyerReceived", ids.r1));
    expect(o.toast).toBe("Received. You're all set.");
    expect(requestIn(o.view, ids.r1)).toMatchObject({ status: "completed", completedAt: w.now });
    expect(o.view.holdings).toEqual([{ id: expect.stringMatching(ID.holding), userId: B.id, eventId: ids.ev1, tier: "t1", qty: 1, paid: 35, source: "transferred" }]);
    expect(o.view.interests.find((i) => i.id === ids.iso)).toMatchObject({ status: "open", qty: 1 });
    // Where B paid stays with B's record of the exchange; the email was shared only from the reservation to the transfer.
    expect(requestIn(o.view, ids.r1).pay).toEqual([VENMO_A]);
    expect(o.view.people[A.id]).not.toHaveProperty("contact");
  });

  it("12. both reload: A has 1 available and 1 handed over; each step notified the other person, exactly", async () => {
    const a = await w.view(A);
    const b = await w.view(B);
    const c = await w.view(C);
    expect(listingIn(a, ids.L1).numbers).toEqual({ reserved: 0, completed: 1, available: 1 });
    expect(listingIn(c, ids.L1).numbers).toEqual({ reserved: 0, completed: 1, available: 1 });
    expect(a.holdings.find((h) => h.eventId === ids.ev1)).toMatchObject({ userId: A.id, qty: 1, source: "self-reported" });
    expect(requestIn(a, ids.r1).status).toBe("completed");

    // Newest first, as the bell shows them.
    expect(texts(a)).toEqual([
      "Handoff confirmed receiving the ticket for [Test] Spring Formal. All done.",
      'Handoff B. says they sent $35 by Venmo for [Test] Spring Formal. Check Venmo, then tap "Payment received".',
      `Handoff B. reserved 1 ticket for [Test] Spring Formal at $35 each. They have 15 minutes to pay you and tap "I've sent payment".`,
      'Handoff B. is looking for 2 tickets for [Test] Spring Formal at up to $35. If your listing fits, share it with their request ("I have this").',
    ]);
    expect(texts(b)).toEqual([
      'Handoff says they transferred the ticket for [Test] Spring Formal to your email. Accept it in Ticketmaster or AXS, then tap "Received".',
      "Handoff confirmed your payment for [Test] Spring Formal. Next: they transfer it in Ticketmaster or AXS.",
      "A ticket opened up for [Test] Winter Gala: Handoff listed 1 ticket at $28.",
      "Handoff A. shared a listing for [Test] Spring Formal with your request: 2 tickets at $35. It isn't held for you: reserve it or make an offer on the event page.",
    ]);
    expect(c.notifications).toEqual([]);
    expect([a.unreadCount, b.unreadCount, c.unreadCount]).toEqual([4, 4, 0]);
    // Every notification links somewhere the recipient can open.
    const linkOk = (n: ViewNotification): boolean => n.link !== null && ["event", "activity", "iso", "item", "goods"].includes(n.link.name);
    expect([...a.notifications, ...b.notifications].every(linkOk)).toBe(true);
  });

  it("13. the bell: B opens one notification and then reads all; A can't mark B's notifications", async () => {
    const b = await w.view(B);
    const first = b.notifications[0]!;
    expect(await markNotificationsRead(db.sql, { worldId: WORLD, userId: A.id, ids: b.notifications.map((n) => n.id) })).toBe(0);
    expect(await markNotificationsRead(db.sql, { worldId: WORLD, userId: B.id, ids: [first.id] })).toBe(1);
    const after = await w.view(B);
    expect(after.unreadCount).toBe(3);
    expect(after.notifications.find((n) => n.id === first.id)?.read).toBe(true);
    expect(after.version).toBe(b.version); // reading notifications doesn't change the world
    expect(await markNotificationsRead(db.sql, { worldId: WORLD, userId: B.id, ids: "all" })).toBe(3);
    expect((await w.view(B)).unreadCount).toBe(0);
    expect((await w.view(A)).unreadCount).toBe(4);
  });

  it("J6. B and C tap I'll take it on the last unit at the same moment: exactly one reservation, and the other is told why", async () => {
    ids.L3 = await w.list(A, ids.ev3, { qty: 1, ask: "18", paid: "20" });
    const aBefore = texts(await w.view(A));
    // Both requests are in flight together: the first to lock the world holds it until Postgres reports the other waiting.
    const hooks = firstWaitsFor(db, 1);
    const outcomes = await Promise.all([w.act(B, actions.take(ids.L3), { hooks }), w.act(C, actions.take(ids.L3), { hooks })]);
    const won = outcomes.filter((o) => o.ok);
    const lost = outcomes.filter((o) => !o.ok);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    const loss = lost[0]!;
    if (loss.ok || loss.code !== "refused") throw new Error(`the other buyer should be refused, got ${JSON.stringify(loss)}`);
    expect(loss).toMatchObject({ error: SOLD_OUT, replay: false });
    expect(listingIn(checked(loss.view, loss.view.viewer.id), ids.L3).numbers).toEqual({ reserved: 1, completed: 0, available: 0 });
    const winner = won[0]!.ok ? won[0]!.view.viewer.id : "";

    const a = await w.view(A);
    expect(listingIn(a, ids.L3).numbers).toEqual({ reserved: 1, completed: 0, available: 0 });
    const doc = (await w.row())!.doc;
    const onL3 = doc.requests.filter((r) => r.listingId === ids.L3);
    expect(onL3.map((r) => [r.buyerId, r.status])).toEqual([[winner, "accepted"]]);
    // A heard about the one reservation, and nothing else.
    const who = winner === B.id ? "Handoff B." : "Handoff C.";
    expect(texts(a).slice(0, texts(a).length - aBefore.length)).toEqual([
      `${who} reserved 1 ticket for [Test] Jazz Night at $18 each. They have 15 minutes to pay you and tap "I've sent payment".`,
    ]);
  });

  it("J8. a stale screen: C opens event 1, A withdraws the listing, and C's take is refused with a fresh view", async () => {
    w.advance(MIN);
    const stale = await w.view(C);
    expect(listingIn(stale, ids.L1).numbers.available).toBe(1);
    const withdrawn = await w.ok(A, { type: "withdraw", listingId: ids.L1 });
    expect(withdrawn.toast).toBe("Listing closed. 1 ticket is back with you."); // "Close listing" (follow-on B2): the 1 ticket left goes back to A
    const no = await w.refused(C, actions.take(ids.L1));
    expect(no.error).toBe("This listing was withdrawn.");
    expect(no.view.version).toBe(withdrawn.view.version);
    expect(listingIn(no.view, ids.L1)).toMatchObject({ withdrawnAt: w.now, numbers: { reserved: 0, completed: 1, available: 0 } });
  });

  it("J9. crafted calls on someone else's records are refused and change nothing", async () => {
    const before = (await w.row())!.version;
    expect((await w.refused(B, { type: "withdraw", listingId: ids.L2 })).error).toBe("Listing not found.");
    expect((await w.refused(C, actions.onRequest("confirmPayment", ids.r1))).error).toBe("Only the seller can confirm the payment.");
    expect((await w.refused(C, { type: "closeInterest", id: ids.alert })).error).toBe("Not found.");
    expect((await w.refused(C, { type: "setAlert", id: ids.alert, paused: true })).error).toBe("Alert not found.");
    expect((await w.refused(B, { type: "removeEvent", eventId: ids.ev1 })).error).toBe("Only the person who added an event can remove it.");
    expect((await w.row())!.version).toBe(before);
    // A refusal names nothing private: the alert's id answers exactly as an id that doesn't exist.
    expect((await w.refused(C, { type: "setAlert", id: "iso-0000000000000000", paused: true })).error).toBe("Alert not found.");
  });

  it("stores no email and no full name in the shared document, and no request text or private amount in the actions log", async () => {
    const doc = JSON.stringify((await w.row())!.doc);
    for (const p of [A, B, C]) {
      expect(doc).not.toContain(p.email!);
      expect(doc).not.toContain(p.name!);
    }
    expect(doc).toContain("Handoff B."); // public names, as the engine writes its history lines
    const log = JSON.stringify(await db.sql`SELECT actor_id, type, ids, ok, result FROM actions WHERE world_id = ${WORLD}`);
    for (const secret of ["CANARY-B-NOTE", ALERT_MAX, VENMO_A.value, A.email!, B.email!]) expect(log).not.toContain(secret);
    expect((await w.row())!.doc.notifications).toEqual([]); // drained into the table on every write
  });

  it("persists: a fresh pool (another app instance) gives every person exactly the same view", async () => {
    const other = db.pool(2);
    for (const p of [A, B, C]) {
      const here = await getView(db.sql, { worldId: WORLD, viewer: p, now: w.now });
      const there = await getView(other, { worldId: WORLD, viewer: p, now: w.now });
      expect(there).toEqual(here);
    }
    const a = await w.view(A, other);
    expect(listingIn(a, ids.L3).numbers).toEqual({ reserved: 1, completed: 0, available: 0 });
    expect(a.viewer.payMethods).toEqual([VENMO_A]);
  });
});
