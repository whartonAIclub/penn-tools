// One-form Sell (USER-INSTRUCTIONS §9l item 4), through the store with the REAL engine and a real Postgres (a throwaway schema):
// "Post ticket" (postTicket) is one write under the world's lock, answered again from the actions log when its request id repeats.
// - A retry, and a double tap that got through twice, make exactly one event and one listing, and get the same answer.
// - Two classmates posting for the same new event at the same moment end with one event: the second is told it exists, nothing of
//   theirs is stored, and their own tap on it lists there.
// - A refused bundle writes nothing: the version doesn't move, and a second account and a signed-out visitor see no event.
// - A second account sees the new event together with its listing, in one version step (never an event with nothing on it).
// Labelled TEST users (made-up ids, @example.invalid emails). No session and no sign-in of any kind; times are injected.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REUSED_REQUEST_ERROR, applyAction, getGuestView } from "../store.js";
import type { Actor, WorldId } from "../types.js";
import { createTestDb, databaseUrl, firstWaitsFor, type TestDb } from "./helpers/db.js";
import { StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, dateAfter, okOf, refusedOf } from "./helpers/live-store.js";

const DAY_OF = dateAfter(T0, 19);
const TWIN_EVENT = "An event with this name on that date is already on Handoff. Choose it to list your ticket there, or add what's different to the name if yours is a different showing.";
const NEW_EVENT_TOAST = "Ticket listed. Its event is new on Handoff: it shows as added by you, and Handoff doesn't check its details.";
/** "Post ticket" for a new event, as the Sell form sends it. */
const post = (title: string, over: Record<string, unknown> = {}) => ({ type: "postTicket", event: { kind: "event", title, start: DAY_OF }, qty: 1, ask: "30", note: "", method: "file", obo: false, ...over });

let db: TestDb;
const world = (id: WorldId): StoreWorld => new StoreWorld(db.sql, id, T0);
const send = (w: StoreWorld, actor: Actor, action: unknown, requestId: string, extra: Record<string, unknown> = {}) =>
  applyAction(db.sql, { worldId: w.worldId, actor, requestId, action, now: w.now, ...extra });
const stored = async (w: StoreWorld) => { const row = await w.row(); if (!row) throw new Error("no world row"); return row; };
const titled = (doc: { events: { id: string; title: string; removedAt?: number }[] }, title: string) => doc.events.filter((e) => e.title === title && !e.removedAt);

describe.skipIf(!databaseUrl)("Post ticket through the store (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("post-ticket");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("a retry with the same request id is answered from the log: one event, one listing, the same answer", async () => {
    const w = world("test-post-retry");
    const rid = randomUUID();
    const first = okOf(await send(w, A, post("[Test] Spring Gala"), rid), "Post ticket");
    expect(first).toMatchObject({ replay: false, toast: NEW_EVENT_TOAST });
    expect(first.view.version).toBe(1); // the event and its listing arrived in one write
    const row1 = await stored(w);
    const ev = titled(row1.doc, "[Test] Spring Gala")[0]!;
    expect(row1.doc.listings).toHaveLength(1);
    expect(first.resultId).toBe(row1.doc.listings[0]!.id);
    expect(first.steps).toEqual([{ type: "createEvent", ok: true, id: ev.id }, { type: "list", ok: true, id: first.resultId }]);
    // The answer was lost and the page sends the same change again, with its id: nothing is written again.
    for (let k = 0; k < 3; k++) {
      const again = okOf(await send(w, A, post("[Test] Spring Gala"), rid), `retry ${k + 1}`);
      expect(again).toMatchObject({ replay: true, toast: first.toast, resultId: first.resultId, steps: first.steps });
      expect(again.view.version).toBe(1);
    }
    const row2 = await stored(w);
    expect(row2.version).toBe(1);
    expect([titled(row2.doc, "[Test] Spring Gala").length, row2.doc.listings.length, row2.doc.holdings.length]).toEqual([1, 1, 1]);
    const logged = await db.sql<{ type: string; ids: Record<string, string>; ok: boolean; result: Record<string, unknown> }[]>`
      SELECT type, ids, ok, result FROM actions WHERE world_id = ${w.worldId}`;
    expect([...logged]).toEqual([{ type: "postTicket", ids: {}, ok: true, result: { toast: NEW_EVENT_TOAST, resultId: first.resultId, steps: first.steps } }]);
    expect(JSON.stringify(logged)).not.toContain("Spring Gala"); // the log never holds what was typed
    // That id is this change's: another change can't reuse it.
    expect(await send(w, A, { type: "postTicket", eventId: ev.id, qty: 1, ask: "30", method: "file" }, rid)).toEqual({ ok: false, code: "invalid", error: REUSED_REQUEST_ERROR });
    // The same event sent as a new change (the seller changed the price after the lost answer) is refused, not doubled.
    const changed = refusedOf(await w.act(A, post("[Test] Spring Gala", { ask: "28" })), "the changed resend");
    expect(changed).toMatchObject({ error: TWIN_EVENT, replay: false, steps: [{ type: "createEvent", ok: false, error: TWIN_EVENT }] });
    const row3 = await stored(w);
    expect([row3.version, titled(row3.doc, "[Test] Spring Gala").length, row3.doc.listings.length]).toEqual([1, 1, 1]);
    expect(row3.doc.listings[0]!.ask).toBe(30);
  });

  it("a double tap that reaches the server twice at once makes one event and one listing", async () => {
    const w = world("test-post-double");
    await w.createEvent(C, { title: "[Test] Another night" }); // the world's row exists, so both sends meet at its lock
    const rid = randomUUID();
    const hooks = firstWaitsFor(db, 1);
    const both = await Promise.all([send(w, A, post("[Test] Spring Gala"), rid, { hooks }), send(w, A, post("[Test] Spring Gala"), rid, { hooks })]);
    const outcomes = both.map((o, k) => okOf(o, `send ${k + 1}`));
    expect(outcomes.map((o) => o.replay).sort()).toEqual([false, true]); // one applied it; the other was answered from the log
    expect(outcomes[0]!.resultId).toBe(outcomes[1]!.resultId);
    expect(outcomes[0]!.steps).toEqual(outcomes[1]!.steps);
    const row = await stored(w);
    expect(row.version).toBe(2);
    expect([titled(row.doc, "[Test] Spring Gala").length, row.doc.listings.length, row.doc.holdings.length]).toEqual([1, 1, 1]);
  });

  it("two classmates post for the same new event at the same moment: one event, and the second chooses it", async () => {
    const w = world("test-post-race");
    await w.createEvent(C, { title: "[Test] Another night" });
    const hooks = firstWaitsFor(db, 1);
    const outcomes = await Promise.all([w.act(A, post("[Test] Spring Gala", { ask: "30" }), { hooks }), w.act(B, post("[test] spring gala", { ask: "28" }), { hooks })]);
    const won = outcomes.filter((o) => o.ok), lost = outcomes.filter((o) => !o.ok);
    expect([won.length, lost.length]).toEqual([1, 1]);
    const loss = refusedOf(lost[0]!, "the second seller");
    expect(loss).toMatchObject({ error: TWIN_EVENT, replay: false });
    const row = await stored(w);
    expect([titled(row.doc, "[Test] Spring Gala").length + titled(row.doc, "[test] spring gala").length, row.doc.listings.length]).toEqual([1, 1]);
    // The refusal brings the second seller's page the event it didn't know, so it can offer it: their tap lists there.
    const ev = row.doc.events.find((e) => /spring gala/i.test(e.title))!;
    expect(loss.view.events.map((e) => e.id)).toContain(ev.id);
    const loser = loss.view.viewer.id === A.id ? A : B;
    const joined = okOf(await w.act(loser, { type: "postTicket", eventId: ev.id, qty: 1, ask: "28", method: "file" }), "the second seller's tap");
    expect(joined.steps).toEqual([{ type: "list", ok: true, id: joined.resultId }]);
    const after = await stored(w);
    expect(after.doc.events.filter((e) => /spring gala/i.test(e.title))).toHaveLength(1);
    expect(after.doc.listings.map((l) => l.eventId)).toEqual([ev.id, ev.id]);
    expect(new Set(after.doc.listings.map((l) => l.sellerId))).toEqual(new Set([A.id, B.id]));
  });

  it("a refused bundle writes nothing: no version, no event for a second account or a visitor; the refusal is logged", async () => {
    const w = world("test-post-refused");
    const tries: [Record<string, unknown>, string | RegExp][] = [
      [post("[Test] Spring Gala", { event: { kind: "event", title: "[Test] Spring Gala", start: "" } }), "Enter the date."],
      [post("[Test] Spring Gala", { event: { kind: "event", title: "[Test] Spring Gala", start: dateAfter(T0, -1) } }), "Choose today or a later date."],
      [post("[Test] Spring Gala", { event: { kind: "event", title: "[Test] Spring Gala", start: DAY_OF, face: "40" }, ask: "45" }), "Asking price can't be more than the face value ($40)."],
      [post("[Test] Spring Gala", { qty: 5 }), "Enter between 1 and 4 tickets (4 per person)."],
      [post("[Test] Spring Gala", { method: "inperson" }), "Choose how you'll transfer it."], // a way the event doesn't have (since the follow-up, §9m, no method at all posts: post-request-store.test.ts)
    ];
    for (const [action, error] of tries) {
      const no = refusedOf(await w.act(A, action), JSON.stringify(action).slice(0, 80));
      if (typeof error === "string") expect(no.error).toBe(error); else expect(no.error).toMatch(error);
      expect(no.view).toMatchObject({ version: 0, events: [], listings: [], holdings: [] });
    }
    expect(await w.act(A, post("[Test] Spring Gala", { qty: 0 }))).toMatchObject({ ok: false, code: "invalid" }); // never reaches the engine
    const row = await stored(w);
    expect([row.version, row.doc.events.length, row.doc.listings.length, row.doc.holdings.length]).toEqual([0, 0, 0, 0]);
    expect(await w.view(B)).toMatchObject({ version: 0, events: [], listings: [], notifications: [] });
    expect(await getGuestView(db.sql, { worldId: w.worldId, now: w.now })).toMatchObject({ version: 0, events: [], listings: [] });
    const logged = await db.sql<{ type: string; ok: boolean; version_before: number; version_after: number }[]>`
      SELECT type, ok, version_before, version_after FROM actions WHERE world_id = ${w.worldId}`;
    expect([...logged]).toEqual(tries.map(() => ({ type: "postTicket", ok: false, version_before: 0, version_after: 0 })));
    const [{ n } = { n: -1 }] = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE world_id = ${w.worldId}`;
    expect(n).toBe(0);
  });

  it("a second account and a visitor see the new event together with its listing, one version after an empty market", async () => {
    const w = world("test-post-seen");
    expect(await w.view(B)).toMatchObject({ version: 0, events: [], listings: [] });
    const done = okOf(await w.act(A, post("[Test] Spring Gala", { event: { kind: "event", title: "[Test] Spring Gala", start: DAY_OF, face: "40" }, ask: "35" })), "Post ticket");
    const b = await w.view(B);
    expect(b.version).toBe(1); // no version of the market ever held the event without its listing
    expect(b.events.map((e) => [e.title, e.start])).toEqual([["[Test] Spring Gala", DAY_OF]]);
    expect(b.listings.map((l) => [l.id, l.eventId, l.ask, l.numbers.available])).toEqual([[done.resultId, b.events[0]!.id, 35, 1]]);
    expect(b.notifications).toEqual([]);
    const guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    expect(guest.events.map((e) => e.id)).toEqual([b.events[0]!.id]);
    expect(guest.listings.map((l) => [l.id, l.eventId, l.ask, l.available])).toEqual([[done.resultId, b.events[0]!.id, 35, 1]]);
    // The seller's own view has the listing as theirs, and the standalone actions still work beside it.
    expect(done.view.listings.map((l) => l.sellerId)).toEqual([A.id]);
    await w.createEvent(C, { title: "[Test] Another night" });
    expect((await w.view(B)).events).toHaveLength(2);
  });
});
