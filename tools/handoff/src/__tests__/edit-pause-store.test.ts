// A seller's Edit and Pause/Resume through the store (C-CONTRACT.md §8): the real engine (the store's default port) on a
// throwaway Postgres schema, as page.tsx and actions.ts use them, with injected times. Every view a helper reads is checked
// against C-CONTRACT §2 (helpers/live-store.ts), and the guest view against §7. What it shows on the stored path:
// - another account's edit, pause or resume is refused and changes nothing stored (no new version);
// - a pause and a take on the last unit, in either order and all at once, never give a reservation made after the pause;
// - a retried request id is answered once (the same answer again), and a second pause from another tab is refused;
// - the stored views: the seller sees it paused, other accounts and guests never see it available; history is the seller's;
// - an exchange agreed before the pause goes through every step while paused.
// Labelled TEST users with made-up ids; no session and no sign-in of any kind.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import type { LiveWorld } from "../../engine/index.js";
import { applyAction, getGuestView, type ApplyHooks } from "../store.js";
import type { ActOutcome, WorldId } from "../types.js";
import { guestContractViolations } from "./helpers/contract.js";
import { createTestDb, databaseUrl, deferred, firstWaitsFor, waitForLockWaiters, type TestDb } from "./helpers/db.js";
import { MIN, StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, actions as sent, checked, okOf } from "./helpers/live-store.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const PAUSED = "The seller has paused this listing, so it can't be reserved or offered on right now.";
const SOLD_OUT = "No tickets are left on this listing.";
const buyers = Array.from({ length: 9 }, (_, i) => ({ id: `handoff-test-ep-buyer-${i}`, name: `EP Buyer ${i}`, email: `ep-buyer-${i}@example.invalid` }));

let db: TestDb;

/** A world with A's event and a listing of `qty` at $35 (taking offers from $20). */
async function listed(worldId: WorldId, qty: number): Promise<{ w: StoreWorld; event: string; listing: string }> {
  const w = new StoreWorld(db.sql, worldId, T0);
  const event = await w.createEvent(A);
  const listing = await w.list(A, event, { qty, ask: "35", obo: true, minOffer: "20" });
  return { w, event, listing };
}

/** Hooks that hold a transaction at the world's lock until `release`, and say when it got there. */
function holdAtLock(): { hooks: ApplyHooks; locked: Promise<void>; release: () => void } {
  const locked = deferred();
  const held = deferred();
  return { hooks: { async afterLock() { locked.resolve(); await held.promise; } }, locked: locked.promise, release: held.resolve };
}

/** The invariants of the stored document, as the store checks them (none may be broken). */
async function storedViolations(w: StoreWorld): Promise<string[]> {
  const row = (await w.row())!;
  return E.withEngine({ doc: row.doc, people: [], now: w.now }, () => E.invariantViolations(row.doc));
}

const requestsOn = (doc: LiveWorld, listing: string) => doc.requests.filter((r) => r.listingId === listing);

describe.skipIf(!databaseUrl)("a seller's edit, pause and resume through the store (real engine, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("edit-pause");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("another account's edit, pause or resume is refused, with nothing stored; the seller's goes through", async () => {
    const { w, listing } = await listed("test-ep-owner", 2);
    const r = okOf(await w.act(B, sent.take(listing)), "B's take").resultId!;
    const item = okOf(await w.act(A, sent.postItem(w.now)), "A's item").resultId!;
    okOf(await w.act(B, { type: "requestItem", id: item, msg: "", shareContact: false }), "B's item request");
    const before = (await w.row())!;
    for (const who of [B, C]) {
      for (const action of [{ type: "editListing", listingId: listing, ask: "20", note: "mine" }, { type: "pauseListing", listingId: listing }, { type: "resumeListing", listingId: listing }]) {
        expect((await w.refused(who, action)).error, `${action.type} by ${who.id}`).toBe("Listing not found.");
      }
      for (const action of [{ type: "editItem", id: item, price: "5" }, { type: "pauseItem", id: item }, { type: "resumeItem", id: item }]) {
        expect((await w.refused(who, action)).error, `${action.type} by ${who.id}`).toBe("Item not found.");
      }
    }
    const after = (await w.row())!;
    expect(after.version).toBe(before.version);
    expect(after.doc).toEqual(before.doc);
    // The refusals are logged as refusals, with the record's id only.
    const log = await db.sql<{ type: string; ok: boolean; ids: Record<string, string> }[]>`
      SELECT type, ok, ids FROM actions WHERE world_id = ${w.worldId} AND actor_id = ${C.id}`;
    expect(log.map((x) => JSON.stringify([x.type, x.ok, x.ids])).sort()).toEqual([
      ["editListing", false, { listingId: listing }], ["pauseListing", false, { listingId: listing }], ["resumeListing", false, { listingId: listing }],
      ["editItem", false, { id: item }], ["pauseItem", false, { id: item }], ["resumeItem", false, { id: item }],
    ].map((x) => JSON.stringify(x)).sort());
    // The seller's own go through, and B's reservation keeps its price.
    expect((await w.ok(A, { type: "editListing", listingId: listing, ask: "30", note: "Row C." })).toast).toBe("Listing updated. Reservations and offers already made keep their prices.");
    expect((await w.ok(A, { type: "pauseListing", listingId: listing })).toast).toMatch(/^Listing paused\./);
    expect((await w.ok(A, { type: "resumeListing", listingId: listing })).toast).toBe("Listing resumed. 1 ticket is available again.");
    expect((await w.row())!.doc.requests.find((x) => x.id === r)?.price).toBe(35);
    expect(await storedViolations(w)).toEqual([]);
  });

  it("orders a pause and a take on the last unit either way: a take queued behind the pause is refused; a pause behind the take keeps it", async () => {
    {
      const { w, listing } = await listed("test-ep-pause-first", 1);
      const one = holdAtLock();
      const pause = w.act(A, { type: "pauseListing", listingId: listing }, { hooks: one.hooks });
      await one.locked;
      const take = w.act(B, sent.take(listing));
      await waitForLockWaiters(db, 1);
      one.release();
      const [p, t] = await Promise.all([pause, take]);
      expect(p.ok).toBe(true);
      expect(t).toMatchObject({ ok: false, code: "refused", error: PAUSED });
      expect(requestsOn((await w.row())!.doc, listing)).toEqual([]);
      if (!t.ok && t.code === "refused") expect(checked(t.view, B.id).listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 0, completed: 0, available: 0 });
    }
    {
      const { w, listing } = await listed("test-ep-take-first", 1);
      const one = holdAtLock();
      const take = w.act(B, sent.take(listing), { hooks: one.hooks });
      await one.locked;
      const pause = w.act(A, { type: "pauseListing", listingId: listing });
      await waitForLockWaiters(db, 1);
      one.release();
      const [t, p] = await Promise.all([take, pause]);
      expect(t.ok).toBe(true);
      expect(p).toMatchObject({ ok: true, toast: "Listing paused. Classmates can't reserve it or make offers until you resume it. Reservations already made continue." });
      const doc = (await w.row())!.doc;
      const [r] = requestsOn(doc, listing);
      expect(r).toMatchObject({ buyerId: B.id, status: "accepted" });
      expect(r!.acceptedAt).toBeLessThan(doc.listings.find((l) => l.id === listing)!.pausedAt!);
      // Everything left is held for B: the seller's listing reads as held, and C can't take anything.
      const seller = await w.view(A);
      expect(seller.listings.find((l) => l.id === listing)).toMatchObject({ numbers: { reserved: 1, completed: 0, available: 0 } });
      expect((await w.refused(C, sent.take(listing))).error).toBe(PAUSED);
      expect(await storedViolations(w)).toEqual([]);
    }
  });

  it("one pause and nine takes on the last unit at once (5 rounds): never a reservation made after the pause, at most one in all", async () => {
    const won = { pauseFirst: 0, takeFirst: 0 };
    for (let round = 1; round <= 5; round++) {
      const { w, listing } = await listed(`test-ep-burst-${round}`, 1);
      const hooks = firstWaitsFor(db, buyers.length); // the first in holds the lock until the other nine are queued on it
      const outcomes = await Promise.all([
        w.act(A, { type: "pauseListing", listingId: listing }, { hooks, lockTimeoutMs: 15_000 }),
        ...buyers.map((b) => w.act(b, sent.take(listing), { hooks, lockTimeoutMs: 15_000 })),
      ]);
      const [pause, ...takes] = outcomes as [ActOutcome, ...ActOutcome[]];
      expect(pause.ok, `round ${round}: the pause`).toBe(true);
      const ok = takes.filter((t) => t.ok);
      expect(ok.length, `round ${round}`).toBeLessThanOrEqual(1);
      for (const t of takes.filter((x) => !x.ok)) expect([PAUSED, SOLD_OUT], `round ${round}`).toContain(t.ok ? "" : t.code === "refused" ? t.error : t.code);
      const doc = (await w.row())!.doc;
      const pausedAt = doc.listings.find((l) => l.id === listing)!.pausedAt!;
      const reservations = requestsOn(doc, listing);
      expect(reservations).toHaveLength(ok.length);
      for (const r of reservations) expect(r.acceptedAt!, `round ${round}`).toBeLessThan(pausedAt);
      if (ok.length) won.takeFirst++; else won.pauseFirst++;
      expect(await storedViolations(w)).toEqual([]);
    }
    expect(won.pauseFirst + won.takeFirst).toBe(5);
  }, 60_000);

  it("a retried request id is answered once with the same answer; a second pause or resume from another tab is refused", async () => {
    const { w, listing } = await listed("test-ep-retry", 2);
    const send = (requestId: string, action: Record<string, unknown>) => applyAction(db.sql, { worldId: w.worldId, actor: A, requestId, action, now: w.now });
    const version = async () => (await w.row())!.version;
    const v0 = await version();
    const pauseId = randomUUID();
    const first = okOf(await send(pauseId, { type: "pauseListing", listingId: listing }), "pause");
    const again = okOf(await send(pauseId, { type: "pauseListing", listingId: listing }), "pause, retried");
    expect([first.replay, again.replay, again.toast]).toEqual([false, true, first.toast]);
    expect(await version()).toBe(v0 + 1);
    expect(await send(randomUUID(), { type: "pauseListing", listingId: listing })).toMatchObject({ ok: false, code: "refused", error: "This listing is already paused." });
    // An edit retried with the same id is the same change, even with other details (the log keeps ids, never amounts: D13).
    const editId = randomUUID();
    okOf(await send(editId, { type: "editListing", listingId: listing, ask: "30" }), "edit");
    expect(await send(editId, { type: "editListing", listingId: listing, ask: "25" })).toMatchObject({ ok: true, replay: true });
    expect((await w.row())!.doc.listings.find((l) => l.id === listing)?.ask).toBe(30);
    const resumeId = randomUUID();
    okOf(await send(resumeId, { type: "resumeListing", listingId: listing }), "resume");
    expect(await send(resumeId, { type: "resumeListing", listingId: listing })).toMatchObject({ ok: true, replay: true });
    expect(await send(randomUUID(), { type: "resumeListing", listingId: listing })).toMatchObject({ ok: false, code: "refused", error: "This listing isn't paused." });
    expect(await version()).toBe(v0 + 3); // pause, edit, resume: once each
    // A request id reused for a different change is refused (D13).
    expect(await send(pauseId, { type: "resumeListing", listingId: listing })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("the stored views: the seller sees it paused, other accounts and guests never see it available, and history is the seller's", async () => {
    const { w, event, listing } = await listed("test-ep-views", 2);
    const item = okOf(await w.act(A, sent.postItem(w.now)), "item").resultId!;
    const offer = okOf(await w.act(C, sent.offer(listing, "30")), "C's offer").resultId!;
    await w.ok(A, { type: "editListing", listingId: listing, ask: "33", note: "Row C." });
    const pause = await w.ok(A, { type: "pauseListing", listingId: listing });
    await w.ok(A, { type: "pauseItem", id: item });
    // A: paused, everything else as it was.
    const seller = pause.view.listings.find((l) => l.id === listing)!;
    expect(seller).toMatchObject({ ask: 33, note: "Row C.", numbers: { reserved: 0, completed: 0, available: 0 } });
    expect(seller.pausedAt).toBeTypeOf("number");
    expect(seller.history?.map((h) => h.text)).toEqual(["Listed 2 tickets at $35", "Edited: price $35 to $33, description", "Paused: no new reservations or offers until it's resumed"]);
    // B (a stranger) and C (an open offer): in view, paused, nothing available; no history.
    for (const who of [B, C]) {
      const v = await w.view(who);
      const l = v.listings.find((x) => x.id === listing)!;
      expect([l.pausedAt, l.numbers.available, "history" in l], who.id).toEqual([seller.pausedAt, 0, false]);
      expect(v.goods.find((x) => x.id === item)?.state).toEqual({ key: "sellerPaused", label: "Paused", tone: "warn" });
    }
    expect((await w.view(C)).requests.find((r) => r.id === offer)?.status).toBe("pending");
    expect((await w.view(C)).notifications.map((n) => n.text)).toContain("Handoff paused their listing for [Test] Spring Formal. Your offer stays open, but they can't accept it until they resume the listing.");
    // A guest: the event, and nothing to take.
    const guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    expect(guestContractViolations(guest)).toEqual([]);
    expect([guest.events.map((e) => e.id), guest.listings, guest.goods]).toEqual([[event], [], []]);
    // Resumed: back for everyone, guests included, at the edited price.
    await w.ok(A, { type: "resumeListing", listingId: listing });
    await w.ok(A, { type: "resumeItem", id: item });
    const again = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
    expect(again.listings.map((l) => [l.id, l.ask, l.available])).toEqual([[listing, 33, 2]]);
    expect(again.goods.map((g) => g.id)).toEqual([item]);
    expect((await w.view(B)).listings.find((x) => x.id === listing)).not.toHaveProperty("pausedAt");
  });

  it("an exchange agreed before the pause goes through every step while paused; a hold that lapses meanwhile isn't put back on sale", async () => {
    const { w, listing } = await listed("test-ep-exchange", 3);
    const r = okOf(await w.act(B, sent.take(listing)), "B's take").resultId!;
    const lapsing = okOf(await w.act(C, sent.take(listing)), "C's take").resultId!;
    await w.ok(A, { type: "pauseListing", listingId: listing });
    for (const [who, type] of [[B, "markPaid"], [A, "confirmPayment"], [A, "markTransferred"], [B, "buyerReceived"]] as const) {
      await w.ok(who, sent.onRequest(type, r));
    }
    w.advance(16 * MIN); // C's 15-minute hold ends unpaid; the read sweeps it
    const seller = await w.view(A);
    const doc = (await w.row())!.doc;
    expect(doc.requests.find((x) => x.id === r)?.status).toBe("completed");
    expect(doc.requests.find((x) => x.id === lapsing)).toMatchObject({ status: "expired", reason: "The reservation ended without payment. The seller has paused the listing, so it isn't on sale right now." });
    expect(seller.listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 0, completed: 1, available: 0 });
    expect((await getGuestView(db.sql, { worldId: w.worldId, now: w.now })).listings).toEqual([]);
    expect(await storedViolations(w)).toEqual([]);
  });
});
