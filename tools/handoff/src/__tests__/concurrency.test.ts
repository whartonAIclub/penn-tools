// The world's lock under real concurrency (C-DESIGN §4.3, §9.2): first with the stand-in engine port (C1), then
// with the real engine, the store's default port (C5).
// Transactions are ordered with hooks, barriers and Postgres's own report of who is waiting on a lock
// (pg_stat_activity), never by sleeping and hoping. The lock:false negative controls show that these
// tests do detect a race when the lock is missing.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveWorld } from "../../engine/index.js";
import { BUSY_ERROR, applyAction, getView, type ApplyHooks, type ApplyInput } from "../store.js";
import type { ActOutcome, Actor, WorldId } from "../types.js";
import { barrier, createTestDb, databaseUrl, deferred, firstWaitsFor as waitsFor, waitForLockWaiters, type TestDb } from "./helpers/db.js";
import { StoreWorld, T0, actions as sent, checked, okOf } from "./helpers/live-store.js";
import { TOY_TEXT, toyPort, type ToyHold } from "./helpers/toy-port.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const seller: Actor = { id: "user-seller", name: "Sam Seller", email: "sam@example.invalid" };
const buyers: Actor[] = Array.from({ length: 10 }, (_, i) => ({ id: `user-buyer-${i}`, name: `Buyer ${i}`, email: null }));
const buyer = (i: number): Actor => buyers[i]!;
const TAKE = { type: "take", item: "i-last" };

let db: TestDb;

function act(worldId: WorldId, actor: Actor, action: unknown, extra: Partial<ApplyInput> = {}): Promise<ActOutcome> {
  return applyAction(db.sql, { worldId, actor, requestId: randomUUID(), action, ...extra }, toyPort);
}

async function stock(worldId: WorldId, listed: number): Promise<void> {
  const o = await act(worldId, seller, { type: "stock", item: "i-last", listed });
  if (!o.ok) throw new Error(`Couldn't stock ${worldId}: ${o.code}`);
}

async function holds(worldId: WorldId): Promise<ToyHold[]> {
  const [row] = await db.sql<{ holds: ToyHold[] | null }[]>`
    SELECT doc #> '{stock,i-last,holds}' AS holds FROM worlds WHERE id = ${worldId}`;
  return row?.holds ?? [];
}

/** The world's version as another connection sees it: only committed writes are visible there. */
async function committedVersion(worldId: WorldId): Promise<number | null> {
  const [row] = await db.admin<{ version: number }[]>`
    SELECT version FROM ${db.admin(db.schema)}.worlds WHERE id = ${worldId}`;
  return row?.version ?? null;
}

async function logged(worldId: WorldId, requestId?: string): Promise<number> {
  const [row] = requestId
    ? await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM actions WHERE world_id = ${worldId} AND request_id = ${requestId}`
    : await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM actions WHERE world_id = ${worldId}`;
  return row?.n ?? -1;
}

/**
 * Hooks for a burst: the first transaction to get the lock holds it until Postgres reports `others` more
 * connections waiting on a lock. That proves they really ran at once; the lock then lets them in one by one.
 */
function firstWaitsFor(others: number): ApplyHooks {
  let first = true;
  return {
    async afterLock() {
      if (!first) return;
      first = false;
      await waitForLockWaiters(db, others);
    },
  };
}

/** Hooks that hold the transaction at the lock until `release` resolves, and say when it got there. */
function holdAtLock(): { hooks: ApplyHooks; locked: Promise<void>; release: () => void } {
  const locked = deferred();
  const held = deferred();
  return {
    hooks: {
      async afterLock() {
        locked.resolve();
        await held.promise;
      },
    },
    locked: locked.promise,
    release: held.resolve,
  };
}

describe.skipIf(!databaseUrl)("Handoff world lock (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("lock");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("lets exactly 1 of 10 buyers who take the last unit at once have it (5 rounds)", async () => {
    for (let round = 1; round <= 5; round++) {
      const w: WorldId = `test-last-unit-${round}`;
      await stock(w, 1);
      const hooks = firstWaitsFor(buyers.length - 1);
      const outcomes = await Promise.all(buyers.map((b) => act(w, b, TAKE, { hooks, lockTimeoutMs: 15_000 })));

      const won = outcomes.filter((o) => o.ok);
      expect(won, `round ${round}`).toHaveLength(1);
      const lost = outcomes.filter((o) => !o.ok);
      expect(lost).toHaveLength(9);
      for (const o of lost) {
        expect(o).toMatchObject({ ok: false, code: "refused", error: TOY_TEXT.soldOut, replay: false });
        if (!o.ok && o.code === "refused") expect(o.view.listings[0]?.numbers).toEqual({ reserved: 1, completed: 0, available: 0 });
      }
      const h = await holds(w);
      expect(h).toHaveLength(1);
      expect(won[0]?.ok === true && won[0].resultId).toBe(h[0]?.id);
      expect(await logged(w)).toBe(11); // the stock, then all ten takes, refused ones included
    }
  }, 60_000);

  it("fills partially: 2 units and 3 buyers at once give 2 reservations and {reserved: 2, available: 0}", async () => {
    const w: WorldId = "test-partial";
    await stock(w, 2);
    const hooks = firstWaitsFor(2);
    const outcomes = await Promise.all([0, 1, 2].map((i) => act(w, buyer(i), TAKE, { hooks, lockTimeoutMs: 15_000 })));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
    expect(outcomes.filter((o) => !o.ok)).toEqual([expect.objectContaining({ code: "refused", error: TOY_TEXT.soldOut })]);
    expect(await holds(w)).toHaveLength(2);
    const view = await getView(db.sql, { worldId: w, viewer: seller }, toyPort);
    expect(view.listings[0]?.numbers).toEqual({ reserved: 2, completed: 0, available: 0 });
  });

  it("barrier: a second writer can't pass the lock until the first has committed", async () => {
    const w: WorldId = "test-barrier";
    await stock(w, 1); // version 1
    const one = holdAtLock();
    let firstCommitting = 0;
    let secondLocked = 0;
    let committedWhenSecondLocked: number | null = null;
    const first = act(w, buyer(0), TAKE, {
      hooks: {
        afterLock: one.hooks.afterLock!,
        async beforeCommit() {
          firstCommitting = performance.now();
        },
      },
    });
    await one.locked;
    const second = act(w, buyer(1), TAKE, {
      hooks: {
        async afterLock() {
          secondLocked = performance.now();
          committedWhenSecondLocked = await committedVersion(w);
        },
      },
    });
    let released = 0;
    try {
      // Postgres reports the second transaction blocked on a lock, and it hasn't passed it. The first hasn't
      // committed: another connection still sees version 1.
      await waitForLockWaiters(db, 1);
      expect(secondLocked).toBe(0);
      expect(await committedVersion(w)).toBe(1);
    } finally {
      released = performance.now();
      one.release();
    }

    const [a, b] = await Promise.all([first, second]);
    expect(a.ok).toBe(true);
    // The second passed the lock only after the first was released and had reached COMMIT...
    expect(secondLocked).toBeGreaterThan(released);
    expect(secondLocked).toBeGreaterThan(firstCommitting);
    // ...and by then the first's write was committed: a third connection already saw version 2.
    expect(committedWhenSecondLocked).toBe(2);
    // It then read that committed reservation, so the unit was gone.
    expect(b).toMatchObject({ ok: false, code: "refused", error: TOY_TEXT.soldOut, replay: false });
    expect(await holds(w)).toHaveLength(1);
  });

  it("negative control: without the lock, both buyers are told they have the last unit", async () => {
    const w: WorldId = "test-no-lock";
    await stock(w, 1);
    // Both transactions read the world before either writes: the barrier makes the race certain.
    const meet = barrier(2);
    const hooks: ApplyHooks = { afterLock: () => meet.arrive() };
    const [a, b] = await Promise.all([act(w, buyer(0), TAKE, { lock: false, hooks }), act(w, buyer(1), TAKE, { lock: false, hooks })]);
    expect([a.ok, b.ok]).toEqual([true, true]); // a double booking
    // The later write silently replaced the earlier one: a lost update.
    expect(await holds(w)).toHaveLength(1);
    const [row] = await db.sql<{ version: number }[]>`SELECT version FROM worlds WHERE id = ${w}`;
    expect(row?.version).toBe(2);

    // The same two buyers with the lock, also at once: exactly one has it.
    const w2: WorldId = "test-with-lock";
    await stock(w2, 1);
    const both = firstWaitsFor(1);
    const [c, d] = await Promise.all([act(w2, buyer(0), TAKE, { hooks: both }), act(w2, buyer(1), TAKE, { hooks: both })]);
    expect([c.ok, d.ok].filter(Boolean)).toHaveLength(1);
    expect(await holds(w2)).toHaveLength(1);

    // And the 10-buyer test's own check fails without the lock: the same burst, all ten reading before any
    // writes, gives ten "you have it" answers where that test requires exactly one.
    const w3: WorldId = "test-no-lock-burst";
    await stock(w3, 1);
    const all = barrier(buyers.length);
    const burst = await Promise.all(buyers.map((x) => act(w3, x, TAKE, { lock: false, hooks: { afterLock: () => all.arrive() } })));
    expect(burst.filter((o) => o.ok)).toHaveLength(buyers.length);
    expect(await holds(w3)).toHaveLength(1); // nine of the ten reservations were silently lost
  });

  it("answers busy when the lock isn't free within lockTimeoutMs, and leaves no trace", async () => {
    const w: WorldId = "test-busy";
    await stock(w, 2);
    const one = holdAtLock();
    const first = act(w, buyer(0), TAKE, { hooks: one.hooks });
    await one.locked;
    const rid = randomUUID();
    const send = (extra: Partial<ApplyInput> = {}) =>
      applyAction(db.sql, { worldId: w, actor: buyer(1), requestId: rid, action: TAKE, ...extra }, toyPort);
    let waited = 0;
    try {
      const start = performance.now();
      expect(await send({ lockTimeoutMs: 200 })).toEqual({ ok: false, code: "busy", error: BUSY_ERROR });
      waited = performance.now() - start;
    } finally {
      one.release();
    }
    expect((await first).ok).toBe(true);
    expect(waited).toBeGreaterThanOrEqual(190); // Postgres waited out the lock timeout
    expect(await logged(w, rid)).toBe(0);
    // The client's retry with the same id then goes through, once.
    expect(await send()).toMatchObject({ ok: true, replay: false });
    expect(await holds(w)).toHaveLength(2);
  });

  it("answers busy within lockTimeoutMs, not a long wait, while another write is between saving and COMMIT", async () => {
    // Every wait an action makes on the world must be bounded by lock_timeout (C-DESIGN §4.5). A statement outside
    // the transaction that touches the world's row (as §4.1's sketch has the first-write INSERT) would instead wait
    // for this writer's COMMIT, however long that takes (DEVIATIONS D16).
    const w: WorldId = "test-busy-after-save";
    await stock(w, 2);
    const committing = deferred();
    const held = deferred();
    const first = act(w, buyer(0), TAKE, {
      hooks: {
        async beforeCommit() {
          committing.resolve(); // the document is saved (UPDATE done) and the rows written; COMMIT is next
          await held.promise;
        },
      },
    });
    await committing.promise;
    let second: Promise<ActOutcome> | undefined;
    let answer: ActOutcome | "still waiting after 3 s" | undefined;
    let waited = 0;
    try {
      const start = performance.now();
      second = act(w, buyer(1), TAKE, { lockTimeoutMs: 200 });
      const late = new Promise<"still waiting after 3 s">((resolve) => setTimeout(() => resolve("still waiting after 3 s"), 3000).unref());
      answer = await Promise.race([second, late]);
      waited = performance.now() - start;
    } finally {
      held.resolve();
    }
    expect(answer).toEqual({ ok: false, code: "busy", error: BUSY_ERROR });
    expect(waited).toBeLessThan(3000);
    expect((await first).ok).toBe(true);
    await second;
    expect(await holds(w)).toHaveLength(1);
  });

  it("creates a world's row on its first write, once, when several first writes arrive at once", async () => {
    const w: WorldId = "test-first-writes";
    // The first transaction to insert the row holds it, uncommitted, until Postgres reports the other four waiting
    // on a lock: each found no row and is waiting on that INSERT. Then they go one by one.
    const hooks = firstWaitsFor(4);
    const items = ["i-a", "i-b", "i-c", "i-d", "i-e"];
    const outcomes = await Promise.all(items.map((item) => act(w, seller, { type: "stock", item, listed: 1 }, { hooks, lockTimeoutMs: 15_000 })));
    expect(outcomes.map((o) => o.ok)).toEqual([true, true, true, true, true]);
    const [row] = await db.sql<{ version: number; items: string[] }[]>`
      SELECT version, ARRAY(SELECT jsonb_object_keys(doc -> 'stock') ORDER BY 1) AS items FROM worlds WHERE id = ${w}`;
    expect(row).toEqual({ version: 5, items });
    expect(await logged(w)).toBe(5);
  });

  it("applies the same request id sent twice at once only once", async () => {
    const w: WorldId = "test-twice";
    await stock(w, 3);
    const rid = randomUUID();
    const hooks = firstWaitsFor(1);
    const send = () => applyAction(db.sql, { worldId: w, actor: buyer(0), requestId: rid, action: TAKE, hooks }, toyPort);
    const [a, b] = await Promise.all([send(), send()]);
    if (!a.ok || !b.ok) throw new Error("Both copies should report the reservation.");
    expect([a.replay, b.replay].sort()).toEqual([false, true]);
    expect(a.resultId).toBe(b.resultId);
    expect(await holds(w)).toHaveLength(1);
    expect(await logged(w, rid)).toBe(1);
  });

  it("orders a take and a withdraw either way, and a take queued behind a withdraw is refused", async () => {
    // The withdraw locks first; the take, queued behind it, sees the listing withdrawn.
    {
      const w: WorldId = "test-withdraw-first";
      await stock(w, 1);
      const one = holdAtLock();
      const withdraw = act(w, seller, { type: "withdraw", item: "i-last" }, { hooks: one.hooks });
      await one.locked;
      const take = act(w, buyer(0), TAKE);
      await waitForLockWaiters(db, 1);
      one.release();
      const [wd, tk] = await Promise.all([withdraw, take]);
      expect(wd.ok).toBe(true);
      expect(tk).toMatchObject({ ok: false, code: "refused", error: TOY_TEXT.withdrawn });
      expect(await holds(w)).toEqual([]);
    }
    // The take locks first; the withdraw, queued behind it, goes through and the reservation stands.
    {
      const w: WorldId = "test-take-first";
      await stock(w, 1);
      const one = holdAtLock();
      const take = act(w, buyer(0), TAKE, { hooks: one.hooks });
      await one.locked;
      const withdraw = act(w, seller, { type: "withdraw", item: "i-last" });
      await waitForLockWaiters(db, 1);
      one.release();
      const [tk, wd] = await Promise.all([take, withdraw]);
      expect(tk.ok).toBe(true);
      expect(wd.ok).toBe(true);
      expect(await holds(w)).toHaveLength(1);
    }
  });
});

// ── The same guarantees with the real engine (C5) ────────────────────────────────────────
//
// Labelled test accounts with made-up ids; no sign-in. Times are injected (T0), so every hold is fresh.

const SOLD_OUT = "No tickets are left on this listing.";
const realSeller: Actor = { id: "user-real-seller", name: "Sam Seller", email: "sam@example.invalid" };
const realBuyers: Actor[] = Array.from({ length: 10 }, (_, i) => ({ id: `user-real-buyer-${i}`, name: `Buyer ${i} Test`, email: `buyer-${i}@example.invalid` }));
const realBuyer = (i: number): Actor => realBuyers[i]!;

describe.skipIf(!databaseUrl)("Handoff world lock with the real engine (Postgres)", () => {
  let rdb: TestDb;

  beforeAll(async () => {
    rdb = await createTestDb("lock-real");
  }, 30_000);

  afterAll(async () => {
    await rdb?.close();
  });

  /** A world with one event and one listing of `qty` at $35 by the seller. */
  async function listed(worldId: WorldId, qty: number, o: { obo?: boolean; minOffer?: string } = {}): Promise<{ w: StoreWorld; event: string; listing: string }> {
    const w = new StoreWorld(rdb.sql, worldId, T0);
    const event = await w.createEvent(realSeller);
    const listing = await w.list(realSeller, event, { qty, ask: "35", ...o });
    return { w, event, listing };
  }

  /** The world as a third connection sees it: only committed writes are visible there. */
  async function committed(worldId: WorldId): Promise<{ version: number; doc: LiveWorld; notes: number } | null> {
    const [row] = await rdb.admin<{ version: number; doc: LiveWorld; notes: number }[]>`
      SELECT w.version, w.doc,
             (SELECT count(*)::int FROM ${rdb.admin(rdb.schema)}.notifications n WHERE n.world_id = w.id) AS notes
      FROM ${rdb.admin(rdb.schema)}.worlds w WHERE w.id = ${worldId}`;
    return row ?? null;
  }

  async function storedRequests(w: StoreWorld, listing: string): Promise<{ buyerId: string; status: string }[]> {
    return (await w.row())!.doc.requests.filter((r) => r.listingId === listing).map((r) => ({ buyerId: r.buyerId, status: r.status }));
  }

  it("lets exactly 1 of 10 buyers who take the last unit at once have it (5 rounds), and tells the 9 others why", async () => {
    for (let round = 1; round <= 5; round++) {
      const { w, listing } = await listed(`test-real-last-unit-${round}`, 1);
      const hooks = waitsFor(rdb, realBuyers.length - 1);
      const outcomes = await Promise.all(realBuyers.map((b) => w.act(b, sent.take(listing), { hooks, lockTimeoutMs: 15_000 })));

      const won = outcomes.filter((o) => o.ok);
      expect(won, `round ${round}`).toHaveLength(1);
      const lost = outcomes.filter((o) => !o.ok);
      expect(lost).toHaveLength(9);
      for (const o of lost) {
        expect(o).toMatchObject({ ok: false, code: "refused", error: SOLD_OUT, replay: false });
        if (!o.ok && o.code === "refused") {
          checked(o.view, o.view.viewer.id);
          expect(o.view.listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 1, completed: 0, available: 0 });
          expect(o.view.requests).toEqual([]); // a refused buyer has no request, and sees nobody else's
        }
      }
      const winner = won[0]!.ok ? won[0]!.view.viewer.id : "";
      expect(await storedRequests(w, listing)).toEqual([{ buyerId: winner, status: "accepted" }]);
      const [log] = await rdb.sql<{ all: number; refused: number }[]>`
        SELECT count(*)::int AS all, count(*) FILTER (WHERE NOT ok)::int AS refused FROM actions WHERE world_id = ${w.worldId}`;
      expect(log).toEqual({ all: 12, refused: 9 }); // createEvent, addThen, then all ten takes
      // The seller heard about the one reservation only.
      const seller = await w.view(realSeller);
      expect(seller.notifications.filter((n) => n.text.includes("reserved 1 ticket"))).toHaveLength(1);
    }
  }, 60_000);

  it("fills partially: 2 units and 3 buyers at once give 2 reservations and {reserved: 2, available: 0}", async () => {
    const { w, listing } = await listed("test-real-partial", 2);
    const hooks = waitsFor(rdb, 2);
    const outcomes = await Promise.all([0, 1, 2].map((i) => w.act(realBuyer(i), sent.take(listing), { hooks, lockTimeoutMs: 15_000 })));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
    expect(outcomes.filter((o) => !o.ok)).toEqual([expect.objectContaining({ code: "refused", error: SOLD_OUT })]);
    expect((await storedRequests(w, listing)).map((r) => r.status)).toEqual(["accepted", "accepted"]);
    const view = await w.view(realSeller);
    expect(view.listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 2, completed: 0, available: 0 });
  });

  it("barrier: a second buyer can't pass the lock until the first buyer's reservation is committed", async () => {
    const { w, listing } = await listed("test-real-barrier", 1); // version 2
    const one = holdAtLockReal();
    let firstCommitting = 0;
    let secondLocked = 0;
    let committedWhenSecondLocked: number | null = null;
    const first = w.act(realBuyer(0), sent.take(listing), {
      hooks: { afterLock: one.hooks.afterLock!, async beforeCommit() { firstCommitting = performance.now(); } },
    });
    await one.locked;
    const second = w.act(realBuyer(1), sent.take(listing), {
      hooks: {
        async afterLock() {
          secondLocked = performance.now();
          committedWhenSecondLocked = (await committed(w.worldId))?.version ?? null;
        },
      },
    });
    let released = 0;
    try {
      await waitForLockWaiters(rdb, 1);
      expect(secondLocked).toBe(0);
      expect((await committed(w.worldId))?.version).toBe(2);
    } finally {
      released = performance.now();
      one.release();
    }
    const [a, b] = await Promise.all([first, second]);
    expect(a.ok).toBe(true);
    expect(secondLocked).toBeGreaterThan(released);
    expect(secondLocked).toBeGreaterThan(firstCommitting);
    expect(committedWhenSecondLocked).toBe(3);
    expect(b).toMatchObject({ ok: false, code: "refused", error: SOLD_OUT, replay: false });
    expect(await storedRequests(w, listing)).toEqual([{ buyerId: realBuyer(0).id, status: "accepted" }]);
  });

  it("negative control: without the lock, both buyers are told the last unit is theirs, and the burst check fails", async () => {
    const { w, listing } = await listed("test-real-no-lock", 1);
    const meet = barrier(2);
    const hooks: ApplyHooks = { afterLock: () => meet.arrive() };
    const [a, b] = await Promise.all([
      w.act(realBuyer(0), sent.take(listing), { lock: false, hooks }),
      w.act(realBuyer(1), sent.take(listing), { lock: false, hooks }),
    ]);
    expect([a.ok, b.ok]).toEqual([true, true]); // a double booking: two buyers each told to pay for the one ticket
    // The later write replaced the earlier one: one buyer's reservation silently vanished (a lost update).
    expect(await storedRequests(w, listing)).toHaveLength(1);
    expect((await w.row())?.version).toBe(3);

    // The same two buyers with the lock, also at once: exactly one has it.
    const locked = await listed("test-real-with-lock", 1);
    const both = waitsFor(rdb, 1);
    const [c, d] = await Promise.all([
      locked.w.act(realBuyer(0), sent.take(locked.listing), { hooks: both }),
      locked.w.act(realBuyer(1), sent.take(locked.listing), { hooks: both }),
    ]);
    expect([c.ok, d.ok].filter(Boolean)).toHaveLength(1);
    expect(await storedRequests(locked.w, locked.listing)).toHaveLength(1);

    // The 10-buyer test's own check fails without the lock: ten "it's yours" answers where it requires exactly one.
    const burst = await listed("test-real-no-lock-burst", 1);
    const all = barrier(realBuyers.length);
    const outcomes = await Promise.all(realBuyers.map((x) => burst.w.act(x, sent.take(burst.listing), { lock: false, hooks: { afterLock: () => all.arrive() } })));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(realBuyers.length);
    expect(await storedRequests(burst.w, burst.listing)).toHaveLength(1); // nine of the ten reservations were lost
  });

  it("orders a take and a withdraw either way: a take queued behind a withdraw is refused, a withdraw behind a take keeps it", async () => {
    {
      const { w, listing } = await listed("test-real-withdraw-first", 1);
      const one = holdAtLockReal();
      const withdraw = w.act(realSeller, { type: "withdraw", listingId: listing }, { hooks: one.hooks });
      await one.locked;
      const take = w.act(realBuyer(0), sent.take(listing));
      await waitForLockWaiters(rdb, 1);
      one.release();
      const [wd, tk] = await Promise.all([withdraw, take]);
      expect(wd.ok).toBe(true);
      expect(tk).toMatchObject({ ok: false, code: "refused", error: "This listing was withdrawn." });
      expect(await storedRequests(w, listing)).toEqual([]);
    }
    {
      const { w, listing } = await listed("test-real-take-first", 1);
      const one = holdAtLockReal();
      const take = w.act(realBuyer(0), sent.take(listing), { hooks: one.hooks });
      await one.locked;
      const withdraw = w.act(realSeller, { type: "withdraw", listingId: listing });
      await waitForLockWaiters(rdb, 1);
      one.release();
      const [tk, wd] = await Promise.all([take, withdraw]);
      expect(tk.ok).toBe(true);
      // "Close listing" (follow-on B2): nothing was left to give back, and the reservation queued first continues.
      expect(wd).toMatchObject({ ok: true, toast: "Listing closed. Reservations already made continue; if one ends unpaid, it comes back to you." });
      expect(await storedRequests(w, listing)).toEqual([{ buyerId: realBuyer(0).id, status: "accepted" }]);
    }
  });

  it("declines, in the same transaction, offers a listing can no longer cover once it sells out", async () => {
    const { w, listing } = await listed("test-real-offer-closed", 1, { obo: true, minOffer: "20" });
    const offer = okOf(await w.act(realBuyer(0), sent.offer(listing, "30")), "the offer");
    expect(offer.toast).toMatch(/^Offer sent\./);
    // An offer reserves nothing, so the offerer doesn't see the seller's payment handle yet (C-CONTRACT §2: from "accepted").
    const offering = checked(offer.view, realBuyer(0).id);
    expect(offering.requests.find((r) => r.id === offer.resultId)?.status).toBe("pending");
    expect(offering.listings.find((l) => l.id === listing)).not.toHaveProperty("payHandle");
    expect(JSON.stringify(offering)).not.toContain(`@${realSeller.id}`);
    const base = (await committed(w.worldId))!;

    // Another buyer takes the last unit. Hold that write after it has saved everything and before COMMIT.
    const saving = deferred();
    const held = deferred();
    const take = w.act(realBuyer(1), sent.take(listing), {
      hooks: { async beforeCommit() { saving.resolve(); await held.promise; } },
    });
    await saving.promise;
    try {
      // Not committed yet: a third connection still sees the offer pending and no new notification.
      const during = (await committed(w.worldId))!;
      expect(during.version).toBe(base.version);
      expect(during.doc.requests.find((r) => r.id === offer.resultId)?.status).toBe("pending");
      expect(during.notes).toBe(base.notes);
    } finally {
      held.resolve();
    }
    expect((await take).ok).toBe(true);
    // One commit did both: the reservation, the offer declined, and the offerer's notification.
    const after = (await committed(w.worldId))!;
    expect(after.version).toBe(base.version + 1);
    expect(after.doc.requests.find((r) => r.id === offer.resultId)).toMatchObject({ status: "declined", reason: "Another buyer reserved it first" });
    const offerer = await w.view(realBuyer(0));
    expect(offerer.notifications.map((n) => n.text)).toEqual([
      "Another buyer reserved the ticket you made an offer on for [Test] Spring Formal, so your offer is closed.",
    ]);
    expect(offerer.listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 1, completed: 0, available: 0 });
  });

  it("accepts one of two acceptItemReq on one item sent at once, and leaves the other request waiting as a backup", async () => {
    const w = new StoreWorld(rdb.sql, "test-real-goods-race", T0);
    const item = okOf(await w.act(realSeller, sent.postItem(w.now)), "postItem").resultId!;
    const reqX = okOf(await w.act(realBuyer(0), { type: "requestItem", id: item, msg: "", shareContact: true }), "request X").resultId!;
    const reqY = okOf(await w.act(realBuyer(1), { type: "requestItem", id: item, msg: "", shareContact: true }), "request Y").resultId!;
    // The seller accepts both at once (two tabs, or a double tap): the lock lets one in first.
    const hooks = waitsFor(rdb, 1);
    const outcomes = await Promise.all([
      w.act(realSeller, { type: "acceptItemReq", id: reqX, shareContact: true }, { hooks }),
      w.act(realSeller, { type: "acceptItemReq", id: reqY, shareContact: true }, { hooks }),
    ]);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok)).toEqual([expect.objectContaining({ code: "refused", error: "Only a pending request can be accepted." })]);
    const winner = outcomes[0]!.ok ? reqX : reqY;
    const statuses = Object.fromEntries((await w.row())!.doc.goodsReqs.map((g) => [g.id, g.status]));
    expect(statuses).toEqual({ [reqX]: winner === reqX ? "accepted" : "waiting", [reqY]: winner === reqY ? "accepted" : "waiting" });
    const view = await w.view(realSeller);
    expect(view.goods.find((g) => g.id === item)?.state.key).toBe("reserved");
  });

  it("answers busy when the lock isn't free within lockTimeoutMs, leaves no trace, and the retry goes through once", async () => {
    const { w, listing } = await listed("test-real-busy", 2);
    const one = holdAtLockReal();
    const first = w.act(realBuyer(0), sent.take(listing), { hooks: one.hooks });
    await one.locked;
    const rid = randomUUID();
    const send = (extra: Partial<ApplyInput> = {}) =>
      applyAction(rdb.sql, { worldId: w.worldId, actor: realBuyer(1), requestId: rid, action: sent.take(listing), now: w.now, ...extra });
    let waited = 0;
    try {
      const start = performance.now();
      expect(await send({ lockTimeoutMs: 200 })).toEqual({ ok: false, code: "busy", error: BUSY_ERROR });
      waited = performance.now() - start;
    } finally {
      one.release();
    }
    expect((await first).ok).toBe(true);
    expect(waited).toBeGreaterThanOrEqual(190);
    const [none] = await rdb.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w.worldId} AND request_id = ${rid}`;
    expect(none?.n).toBe(0);
    expect(await send()).toMatchObject({ ok: true, replay: false });
    expect(await send()).toMatchObject({ ok: true, replay: true });
    expect(await storedRequests(w, listing)).toHaveLength(2);
  });

  it("applies the same request id sent twice at once only once", async () => {
    const { w, listing } = await listed("test-real-twice", 2);
    const rid = randomUUID();
    const hooks = waitsFor(rdb, 1);
    const send = () => applyAction(rdb.sql, { worldId: w.worldId, actor: realBuyer(0), requestId: rid, action: sent.take(listing), now: w.now, hooks });
    const [a, b] = await Promise.all([send(), send()]);
    if (!a.ok || !b.ok) throw new Error("Both copies should report the reservation.");
    expect([a.replay, b.replay].sort()).toEqual([false, true]);
    expect(a.resultId).toBe(b.resultId);
    expect(a.toast).toBe(b.toast);
    expect(await storedRequests(w, listing)).toEqual([{ buyerId: realBuyer(0).id, status: "accepted" }]);
  });

  it("creates a world's row once when several first writes (five classmates adding events) arrive at once", async () => {
    const w = new StoreWorld(rdb.sql, "test-real-first-writes", T0);
    const hooks = waitsFor(rdb, 4);
    const outcomes = await Promise.all(realBuyers.slice(0, 5).map((b, i) => w.act(b, sent.createEvent(w.now, { title: `[Test] Event ${i}` }), { hooks, lockTimeoutMs: 15_000 })));
    expect(outcomes.map((o) => o.ok)).toEqual([true, true, true, true, true]);
    const row = await w.row();
    expect(row?.version).toBe(5);
    expect(row?.doc.events.map((e) => e.title).sort()).toEqual([0, 1, 2, 3, 4].map((i) => `[Test] Event ${i}`));
    // Each one's view (built after its own commit) includes its own event.
    for (const o of outcomes) if (o.ok) expect(o.view.events.some((e) => e.id === o.resultId)).toBe(true);
  });

  /** Hooks that hold a transaction at the lock until `release`, and say when it got there. */
  function holdAtLockReal(): { hooks: ApplyHooks; locked: Promise<void>; release: () => void } {
    const locked = deferred();
    const held = deferred();
    return {
      hooks: {
        async afterLock() {
          locked.resolve();
          await held.promise;
        },
      },
      locked: locked.promise,
      release: held.resolve,
    };
  }
});
