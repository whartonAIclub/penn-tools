// SELL5-M3 (USER-INSTRUCTIONS §9v item 2), through the store with the REAL engine and a real Postgres (a throwaway schema): "List and
// invite" (answerRequest) is one write under the world's lock, answered again from the actions log when its request id repeats.
// - A retry, and a double tap that reached the server twice at once, make exactly one listing and one invitation, with the same answer.
// - The same answer sent again with a new id (another tab) is refused and writes nothing.
// - A request closed before the answer applies: the listing is stored, no invitation, and the answer (and its replay) says so.
// - What the requester, a third account and a signed-out visitor see after it (one version step: never a listing without its invitation).
// Labelled TEST users (made-up ids, @example.invalid emails). No session and no sign-in of any kind; times are injected.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAction, getGuestView } from "../store.js";
import type { Actor, WorldId } from "../types.js";
import { createTestDb, databaseUrl, firstWaitsFor, type TestDb } from "./helpers/db.js";
import { StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, actions, dateAfter, givePayHandle, okOf, refusedOf } from "./helpers/live-store.js";

const D: Actor = { id: "handoff-test-d", name: "Handoff Test D", email: "handoff-test-d@example.invalid" };
let db: TestDb;
const world = (id: WorldId): StoreWorld => new StoreWorld(db.sql, id, T0);
const send = (w: StoreWorld, actor: Actor, action: unknown, requestId: string, extra: Record<string, unknown> = {}) =>
  applyAction(db.sql, { worldId: w.worldId, actor, requestId, action, now: w.now, ...extra });
const stored = async (w: StoreWorld) => { const row = await w.row(); if (!row) throw new Error("no world row"); return row; };
const answer = (isoId: string, more: Record<string, unknown> = {}) => ({ type: "answerRequest", isoId, ask: "30", note: "", obo: false, ...more });
/** C adds "[Test] Oysters Night" (9 days ahead, no face value); B posts a public request for one ticket; A can be paid. */
async function market(id: WorldId): Promise<{ w: StoreWorld; ev: string; iso: string }> {
  const w = world(id);
  const ev = await w.createEvent(C, { title: "[Test] Oysters Night", club: null, cat: null, start: dateAfter(T0, 9), tiers: undefined });
  const iso = (await w.ok(B, actions.request(ev, { qty: 1, budget: "40", note: "", expires: dateAfter(T0, 5) }))).resultId!;
  await givePayHandle(db.sql, A);
  return { w, ev, iso };
}

describe.skipIf(!databaseUrl)("List and invite through the store (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("m3-answer");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("a retry with the same request id is answered from the log: one listing, one invitation, the same answer", async () => {
    const { w, iso } = await market("test-m3-retry");
    const rid = randomUUID();
    const first = okOf(await send(w, A, answer(iso), rid), "List and invite");
    expect(first.replay).toBe(false);
    expect(first.toast).toMatch(/^Ticket listed\. Invitation sent to Handoff\./); // SELL5-M4 (§9w): the words, recorded
    const v1 = first.view.version;
    for (let k = 0; k < 3; k++) {
      const again = okOf(await send(w, A, answer(iso), rid), `retry ${k + 1}`);
      expect(again).toMatchObject({ replay: true, toast: first.toast, resultId: first.resultId, steps: first.steps });
      expect(again.view.version).toBe(v1);
    }
    const row = await stored(w);
    expect([row.version, row.doc.listings.length, row.doc.requests.length]).toEqual([v1, 1, 1]);
    expect(row.doc.requests[0]).toMatchObject({ listingId: first.resultId, buyerId: B.id, status: "invited", fromIso: iso });
    const logged = await db.sql<{ type: string; ids: Record<string, string>; ok: boolean }[]>`
      SELECT type, ids, ok FROM actions WHERE world_id = ${w.worldId} AND type = 'answerRequest'`;
    expect([...logged]).toEqual([{ type: "answerRequest", ids: { isoId: iso }, ok: true }]);
  });

  it("a double tap that reaches the server twice at once makes one listing and one invitation", async () => {
    const { w, iso } = await market("test-m3-double");
    const rid = randomUUID();
    const hooks = firstWaitsFor(db, 1);
    const both = await Promise.all([send(w, A, answer(iso), rid, { hooks }), send(w, A, answer(iso), rid, { hooks })]);
    const outcomes = both.map((o, k) => okOf(o, `send ${k + 1}`));
    expect(outcomes.map((o) => o.replay).sort()).toEqual([false, true]);
    expect(outcomes[0]!.resultId).toBe(outcomes[1]!.resultId);
    const row = await stored(w);
    expect([row.doc.listings.length, row.doc.requests.length]).toEqual([1, 1]);
  });

  it("the same answer sent again with a new id (another tab) is refused and writes nothing", async () => {
    const { w, iso } = await market("test-m3-twice");
    okOf(await w.act(A, answer(iso)), "the first");
    const before = await stored(w);
    const no = refusedOf(await w.act(A, answer(iso)), "the second");
    expect(no.error).toBe("You've already listed a ticket for Handoff's request.");
    const after = await stored(w);
    expect([after.version, after.doc.listings.length, after.doc.requests.length]).toEqual([before.version, 1, 1]);
  });

  it("a request closed before the answer applies: the listing is stored, no invitation, and the answer says so (on a retry too)", async () => {
    const { w, ev, iso } = await market("test-m3-closed");
    await w.ok(B, { type: "closeInterest", id: iso, reason: "cancelled" });
    const rid = randomUUID();
    const done = okOf(await send(w, A, answer(iso), rid), "List and invite");
    const words = "Handoff's request closed before it reached them, so no invitation went out.";
    expect(done.toast).toBe(`Your ticket is listed. ${words}`);
    expect(done.steps).toEqual([{ type: "postTicket", ok: true, id: done.resultId }, { type: "inviteRequester", ok: false, error: words }]);
    expect(okOf(await send(w, A, answer(iso), rid), "retry")).toMatchObject({ replay: true, toast: done.toast, steps: done.steps });
    const row = await stored(w);
    expect([row.doc.listings.map((l) => [l.eventId, l.sellerId]), row.doc.requests.length]).toEqual([[[ev, A.id]], 0]);
    const [{ n } = { n: -1 }] = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications WHERE world_id = ${w.worldId} AND user_id = ${B.id}`;
    expect(n).toBe(0);
  });

  it("the requester sees the invitation, a third account and a visitor the open listing only, all in one version step", async () => {
    const { w, iso } = await market("test-m3-seen");
    const v0 = (await w.view(D)).version;
    const done = okOf(await w.act(A, answer(iso)), "List and invite");
    const b = await w.view(B), d = await w.view(D), guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    expect(d.version).toBe(v0 + 1); // the listing and its invitation arrived together
    expect(b.requests.map((r) => [r.listingId, r.status, r.fromIso])).toEqual([[done.resultId, "invited", iso]]);
    expect(b.notifications.map((x) => x.text)).toEqual([expect.stringMatching(/^Handoff A\. invited you to pay \$30 each for 1 ticket for \[Test\] Oysters Night, for your request\./)]);
    expect(d.requests).toEqual([]);
    expect(d.listings.map((l) => [l.id, l.numbers.available])).toEqual([[done.resultId, 1]]);
    expect(guest.listings.map((l) => [l.id, l.available])).toEqual([[done.resultId, 1]]);
    expect(JSON.stringify(guest)).not.toMatch(/Handoff Test|Handoff [ABCD]\.|forIso|fromIso/);
  });
});
