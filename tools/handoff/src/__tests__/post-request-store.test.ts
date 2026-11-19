// The Sell and Request follow-up (USER-INSTRUCTIONS §9m, §9n), through the store with the REAL engine and a real Postgres (a throwaway
// schema): "Post request" (postRequest) is one write under the world's lock, answered again from the actions log when its request id
// repeats.
// - A retry, and a double submit that got through twice, make exactly one event and one request, and get the same answer.
// - Two classmates posting for the same new event at the same moment end with one event: the second is told it exists, nothing of
//   theirs is stored, and their own tap on it posts there.
// - A refused bundle writes nothing: the version doesn't move, and a second account and a signed-out visitor see no event.
// - A second account sees the new event together with its request, in one version step (never a bare event).
// - An ordinary seller posts with no transfer method and no payment method; the paid exchange later shows the right payment
//   details, to its buyer only. Two $25 tickets are one listing: one reserved leaves one at $25 for everyone else.
// Labelled TEST users (made-up ids, @example.invalid emails). No session and no sign-in of any kind; times are injected.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REUSED_REQUEST_ERROR, applyAction, ensurePerson, getGuestView, savePayMethods } from "../store.js";
import type { Actor, WorldId } from "../types.js";
import { createTestDb, databaseUrl, firstWaitsFor, type TestDb } from "./helpers/db.js";
import { StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, dateAfter, okOf, refusedOf } from "./helpers/live-store.js";

const DAY_OF = dateAfter(T0, 19);
const TWIN_REQ = "An event with this name on that date is already on Handoff. Choose it to post your request there, or add what's different to the name if yours is a different showing.";
const NEW_EVENT_TOAST = "Request posted. Matches show at the bell and in My activity. Its event is new on Handoff and shows as added by you."; // §9q item 4: where matches show
const NO_PAY = "Add how buyers can pay you: Venmo or Zelle."; // §9q item 5
/** "Post request" for a new event, as the Request form sends it. */
const post = (title: string, over: Record<string, unknown> = {}) => ({ type: "postRequest", event: { kind: "event", title, start: DAY_OF }, ...over });
/** "Post ticket" as the Sell form sends it after the follow-up: no transfer method. */
const sell = (title: string, over: Record<string, unknown> = {}) => ({ type: "postTicket", event: { kind: "event", title, start: DAY_OF }, ask: "25", note: "", obo: false, ...over });

let db: TestDb;
const world = (id: WorldId): StoreWorld => new StoreWorld(db.sql, id, T0);
const send = (w: StoreWorld, actor: Actor, action: unknown, requestId: string, extra: Record<string, unknown> = {}) =>
  applyAction(db.sql, { worldId: w.worldId, actor, requestId, action, now: w.now, ...extra });
const stored = async (w: StoreWorld) => { const row = await w.row(); if (!row) throw new Error("no world row"); return row; };
const titled = (doc: { events: { id: string; title: string; removedAt?: number }[] }, title: string) => doc.events.filter((e) => e.title === title && !e.removedAt);

describe.skipIf(!databaseUrl)("Post request through the store (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("post-request");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("a retry with the same request id is answered from the log: one event, one request, the same answer", async () => {
    const w = world("test-req-retry");
    const rid = randomUUID();
    const first = okOf(await send(w, A, post("[Test] Oysters"), rid), "Post request");
    expect(first).toMatchObject({ replay: false, toast: NEW_EVENT_TOAST });
    expect(first.view.version).toBe(1); // the event and its request arrived in one write
    const row1 = await stored(w);
    const ev = titled(row1.doc, "[Test] Oysters")[0]!;
    expect(row1.doc.interests).toHaveLength(1);
    expect(first.resultId).toBe(row1.doc.interests[0]!.id);
    expect(row1.doc.interests[0]).toMatchObject({ userId: A.id, eventId: ev.id, qty: 1, budget: null, expires: DAY_OF, status: "open" });
    expect(first.steps).toEqual([{ type: "createEvent", ok: true, id: ev.id }, { type: "saveInterest", ok: true, id: first.resultId }]);
    // The answer was lost and the page sends the same change again, with its id: nothing is written again.
    for (let k = 0; k < 3; k++) {
      const again = okOf(await send(w, A, post("[Test] Oysters"), rid), `retry ${k + 1}`);
      expect(again).toMatchObject({ replay: true, toast: first.toast, resultId: first.resultId, steps: first.steps });
      expect(again.view.version).toBe(1);
    }
    const row2 = await stored(w);
    expect(row2.version).toBe(1);
    expect([titled(row2.doc, "[Test] Oysters").length, row2.doc.interests.length]).toEqual([1, 1]);
    const logged = await db.sql<{ type: string; ids: Record<string, string>; ok: boolean; result: Record<string, unknown> }[]>`
      SELECT type, ids, ok, result FROM actions WHERE world_id = ${w.worldId}`;
    expect([...logged]).toEqual([{ type: "postRequest", ids: {}, ok: true, result: { toast: NEW_EVENT_TOAST, resultId: first.resultId, steps: first.steps } }]);
    expect(JSON.stringify(logged)).not.toContain("Oysters"); // the log never holds what was typed
    // That id is this change's: another change can't reuse it.
    expect(await send(w, A, { type: "postRequest", eventId: ev.id }, rid)).toEqual({ ok: false, code: "invalid", error: REUSED_REQUEST_ERROR });
    // The same event sent as a new change (the buyer changed the quantity after the lost answer) is refused, not doubled.
    const changed = refusedOf(await w.act(A, post("[Test] Oysters", { qty: 2 })), "the changed resend");
    expect(changed).toMatchObject({ error: TWIN_REQ, replay: false, steps: [{ type: "createEvent", ok: false, error: TWIN_REQ }] });
    // The refusal's view holds the event, so the form can offer it; their tap there updates the one request they have.
    expect(changed.view.events.map((e) => e.id)).toEqual([ev.id]);
    const tapped = okOf(await w.act(A, { type: "postRequest", eventId: ev.id, qty: 2 }), "the tap on the match");
    expect(tapped.resultId).toBe(first.resultId);
    const row3 = await stored(w);
    expect([titled(row3.doc, "[Test] Oysters").length, row3.doc.interests.length, row3.doc.interests[0]!.qty]).toEqual([1, 1, 2]);
  });

  it("a double submit that reaches the server twice at once makes one event and one request", async () => {
    const w = world("test-req-double");
    await w.createEvent(C, { title: "[Test] Another night" }); // the world's row exists, so both sends meet at its lock
    const rid = randomUUID();
    const hooks = firstWaitsFor(db, 1);
    const both = await Promise.all([send(w, A, post("[Test] Oysters"), rid, { hooks }), send(w, A, post("[Test] Oysters"), rid, { hooks })]);
    const outcomes = both.map((o, k) => okOf(o, `send ${k + 1}`));
    expect(outcomes.map((o) => o.replay).sort()).toEqual([false, true]); // one applied it; the other was answered from the log
    expect(outcomes[0]!.resultId).toBe(outcomes[1]!.resultId);
    expect(outcomes[0]!.steps).toEqual(outcomes[1]!.steps);
    const row = await stored(w);
    expect(row.version).toBe(2);
    expect([titled(row.doc, "[Test] Oysters").length, row.doc.interests.length]).toEqual([1, 1]);
  });

  it("two classmates post for the same new event at the same moment: one event, and the second chooses it", async () => {
    const w = world("test-req-race");
    await w.createEvent(C, { title: "[Test] Another night" });
    const hooks = firstWaitsFor(db, 1);
    const outcomes = await Promise.all([w.act(A, post("[Test] Oysters"), { hooks }), w.act(B, post("[test] oysters", { qty: 2 }), { hooks })]);
    const won = outcomes.filter((o) => o.ok), lost = outcomes.filter((o) => !o.ok);
    expect([won.length, lost.length]).toEqual([1, 1]);
    const loss = refusedOf(lost[0]!, "the second buyer");
    expect(loss).toMatchObject({ error: TWIN_REQ, replay: false });
    const row = await stored(w);
    expect([row.doc.events.filter((e) => /oysters/i.test(e.title)).length, row.doc.interests.length]).toEqual([1, 1]);
    // The refusal brings the second buyer's page the event it didn't know, so it can offer it: their tap posts there.
    const ev = row.doc.events.find((e) => /oysters/i.test(e.title))!;
    expect(loss.view.events.map((e) => e.id)).toContain(ev.id);
    const loser = loss.view.viewer.id === A.id ? A : B;
    const joined = okOf(await w.act(loser, { type: "postRequest", eventId: ev.id }), "the second buyer's tap");
    expect(joined.steps).toEqual([{ type: "saveInterest", ok: true, id: joined.resultId }]);
    const after = await stored(w);
    expect(after.doc.events.filter((e) => /oysters/i.test(e.title))).toHaveLength(1);
    expect(after.doc.interests.map((i) => i.eventId)).toEqual([ev.id, ev.id]);
    expect(new Set(after.doc.interests.map((i) => i.userId))).toEqual(new Set([A.id, B.id]));
  });

  it("a refused bundle writes nothing: no version, no event for a second account or a visitor; the refusal is logged", async () => {
    const w = world("test-req-refused");
    const tries: [Record<string, unknown>, string | RegExp][] = [
      [post("[Test] Oysters", { event: { kind: "event", title: "[Test] Oysters", start: "" } }), "Enter the date."],
      [post("[Test] Oysters", { event: { kind: "event", title: "[Test] Oysters", start: dateAfter(T0, -1) } }), "Choose today or a later date."],
      [post("[Test] Oysters", { event: { kind: "event", title: "[Test] Oysters", start: DAY_OF, face: "40" }, budget: "45" }), "The face value is $40, so keep your budget at or below it."],
      [post("[Test] Oysters", { qty: 5 }), "Ask for between 1 and 4 tickets (the per-person limit for this event)."],
      [post("[Test] Oysters", { expires: dateAfter(T0, 25) }), "A request can't outlast the event's transfer deadline."],
    ];
    for (const [action, error] of tries) {
      const no = refusedOf(await w.act(A, action), JSON.stringify(action).slice(0, 80));
      if (typeof error === "string") expect(no.error).toBe(error); else expect(no.error).toMatch(error);
      expect(no.view).toMatchObject({ version: 0, events: [], interests: [] });
    }
    expect(await w.act(A, post("[Test] Oysters", { qty: 0 }))).toMatchObject({ ok: false, code: "invalid" }); // never reaches the engine
    const row = await stored(w);
    expect([row.version, row.doc.events.length, row.doc.interests.length]).toEqual([0, 0, 0]);
    expect(await w.view(B)).toMatchObject({ version: 0, events: [], interests: [], notifications: [] });
    expect(await getGuestView(db.sql, { worldId: w.worldId, now: w.now })).toMatchObject({ version: 0, events: [] });
    const logged = await db.sql<{ type: string; ok: boolean; version_before: number; version_after: number }[]>`
      SELECT type, ok, version_before, version_after FROM actions WHERE world_id = ${w.worldId}`;
    expect([...logged]).toEqual(tries.map(() => ({ type: "postRequest", ok: false, version_before: 0, version_after: 0 })));
    const [{ n } = { n: -1 }] = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE world_id = ${w.worldId}`;
    expect(n).toBe(0);
  });

  it("a second account sees the new event together with its request, one version after an empty market", async () => {
    const w = world("test-req-seen");
    expect(await w.view(B)).toMatchObject({ version: 0, events: [], interests: [] });
    const done = okOf(await w.act(A, post("[Test] Oysters", { qty: 2, note: "Two together." })), "Post request");
    const b = await w.view(B);
    expect(b.version).toBe(1); // no version of the market ever held the event without its request
    expect(b.events.map((e) => [e.title, e.start])).toEqual([["[Test] Oysters", DAY_OF]]);
    expect(b.interests.map((i) => [i.id, i.eventId, i.qty, i.budget, i.expires])).toEqual([[done.resultId, b.events[0]!.id, 2, null, DAY_OF]]);
    expect(b.notifications).toEqual([]);
    // The buyer's own view has the request as theirs, and the standalone actions still work beside it.
    expect(done.view.interests.map((i) => i.userId)).toEqual([A.id]);
    await w.createEvent(C, { title: "[Test] Another night" });
    expect((await w.view(B)).events).toHaveLength(2);
  });

  it("an ordinary seller posts with no transfer or payment method; the paid exchange shows the right payment details, to its buyer only", async () => {
    const w = world("test-req-neutral");
    await ensurePerson(db.sql, A);
    const posted = okOf(await w.act(A, sell("[Test] Comedy Night", { qty: 2 })), "Post ticket"); // no method, nothing saved to be paid with
    const lid = posted.resultId!;
    const row = await stored(w);
    expect(row.doc.listings).toHaveLength(1);
    expect(row.doc.listings[0]).toMatchObject({ id: lid, listed: 2, ask: 25 });
    expect("method" in row.doc.listings[0]!).toBe(false);
    expect((await w.view(B)).listings.map((l) => [l.id, l.method, l.ask, l.numbers.available])).toEqual([[lid, undefined, 25, 2]]);
    // A second account asks for one of the two; the seller is asked for a way to be paid at the first invitation.
    const asked = okOf(await w.act(B, { type: "requestToBuy", listingId: lid, qty: 1, msg: "" }), "Request to buy");
    const rid = asked.resultId!;
    expect(refusedOf(await w.act(A, { type: "invite", requestId: rid }), "an invitation with no way to be paid").error).toBe(NO_PAY);
    expect(await savePayMethods(db.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: "@pay-test-a-venmo" }], worldId: w.worldId, now: w.now })).toMatchObject({ ok: true });
    okOf(await w.act(A, { type: "invite", requestId: rid }), "the invitation");
    // Invited, not yet reserved: the buyer sees the price and the quantity, never where to pay.
    const invitedView = await w.view(B);
    expect(invitedView.requests.map((r) => [r.id, r.status, r.qty, r.price, r.pay])).toEqual([[rid, "invited", 1, 25, undefined]]);
    expect(JSON.stringify(invitedView)).not.toContain("pay-test-a-venmo");
    const reserved = okOf(await w.act(B, { type: "reserve", requestId: rid }), "Reserve");
    expect(reserved.toast).toMatch(/^Reserved for 15 minutes\. Pay Handoff \$25 now, /);
    expect(reserved.view.requests.map((r) => [r.id, r.status, r.pay])).toEqual([[rid, "accepted", [{ kind: "venmo", value: "pay-test-a-venmo" }]]]);
    // One of the two is held: everyone else sees one ticket still available at $25, on the same listing; no one else sees where to pay.
    const c = await w.view(C);
    expect(c.listings.map((l) => [l.id, l.ask, l.numbers.available, l.numbers.reserved])).toEqual([[lid, 25, 1, 1]]);
    expect(c.requests).toEqual([]);
    expect(JSON.stringify(c)).not.toContain("pay-test-a-venmo");
    const guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    expect(guest.listings.map((l) => [l.id, l.ask, l.available])).toEqual([[lid, 25, 1]]);
    expect(JSON.stringify(guest)).not.toMatch(/pay-test-a-venmo|"method"/);
    // The exchange finishes without anyone being told a method.
    const paid = okOf(await w.act(B, { type: "markPaid", requestId: rid }), "I've sent payment");
    expect(paid.toast).toBe("Payment marked as sent. Handoff confirms it arrived, then they send you the ticket.");
    const confirmed = okOf(await w.act(A, { type: "confirmPayment", requestId: rid }), "Payment received");
    expect(confirmed.toast).toBe("Payment confirmed. Now send the ticket to Handoff, then tap “I've sent it”.");
    okOf(await w.act(A, { type: "markTransferred", requestId: rid }), "I've sent it");
    okOf(await w.act(B, { type: "buyerReceived", requestId: rid }), "Received");
    const notes = await db.sql<{ text: string }[]>`SELECT text FROM notifications WHERE world_id = ${w.worldId}`;
    expect(notes.length).toBeGreaterThan(3);
    expect(notes.map((n) => n.text).join("\n")).not.toMatch(/PDF|QR code|Ticketmaster|AXS|name change/i);
    const end = await stored(w);
    expect(end.doc.requests[0]).toMatchObject({ status: "completed", qty: 1, price: 25, pay: [{ kind: "venmo", value: "pay-test-a-venmo" }] });
    expect((await w.view(C)).listings.map((l) => [l.ask, l.numbers.available, l.numbers.completed])).toEqual([[25, 1, 1]]);
  });
});
