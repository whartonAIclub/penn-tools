// The store against a real Postgres (C-DESIGN §9.2): views, writes, retries, notifications, expiry sweeps,
// invariants, size limits, profiles, pruning and error mapping. First with the stand-in engine port (C1),
// whose levers (pad, corrupt, boom…) reach paths the real rules never take; then with the real engine, the
// store's default port, and the document cache (C5). Each run uses a throwaway schema; the database tests
// skip when no database is configured, the others always run.

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as E from "../../engine/index.js";
import type { LiveWorld } from "../../engine/index.js";
import { errorCode, isBusy, setupErrorKind, unavailableMessage } from "../db-errors.js";
import { enginePort, type EnginePort, type WorldDoc } from "../engine-port.js";
import {
  BAD_REQUEST_ERROR,
  DOC_CACHE_WORLDS,
  FULL_ERROR,
  ACTIONS_PER_MINUTE,
  DELETE_OPEN_ERROR,
  INTERNAL_ERROR,
  OPEN_LIMIT_ERROR,
  OPEN_RECORDS_MAX,
  RATE_ERROR,
  RECORD_MAX_BYTES,
  REUSED_REQUEST_ERROR,
  SAVED_NO_VIEW_ERROR,
  applyAction,
  deleteMyData,
  documentCacheStats,
  ensurePerson,
  getGuestView,
  getView,
  markNotificationsRead,
  pruneWorld,
  readStoredWorld,
  refreshView,
  saveProfile,
  type ApplyInput,
} from "../store.js";
import type { ActOutcome, Actor, View, WorldId } from "../types.js";
import { guestContractViolations } from "./helpers/contract.js";
import { createTestDb, databaseUrl, deferred, waitForLockWaiters, type TestDb } from "./helpers/db.js";
import { DAY as LDAY, MIN as LMIN, NO_LIMITS, StoreWorld, T0 as LT0, TEST_A, TEST_B, TEST_C, actions as sent, checked, dateAfter, okOf, storeDocument } from "./helpers/live-store.js";
import { TOY_TEXT, toyControls, toyPort, violations, type ToyDoc } from "./helpers/toy-port.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const ann: Actor = { id: "user-ann", name: "Ann Lee", email: "ann@example.invalid" };
const bob: Actor = { id: "user-bob", name: "Bob Diaz", email: "bob@example.invalid" };
const cat: Actor = { id: "user-cat", name: "Cat Wu", email: "cat@example.invalid" };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Nov 9, 2026, 10:00 in New York (EST, UTC−5). Tests inject time; actions.ts never does. */
const T0 = Date.UTC(2026, 10, 9, 15, 0);
const MB = 1024 * 1024;

let db: TestDb;

/** An action through the store with the stand-in port; the per-account limits are off unless the test passes its own. */
function act(worldId: WorldId, actor: Actor, action: unknown, extra: Partial<ApplyInput> = {}): Promise<ActOutcome> {
  return applyAction(db.sql, { worldId, actor, requestId: randomUUID(), action, limits: NO_LIMITS, ...extra }, toyPort);
}

function ok(o: ActOutcome): Extract<ActOutcome, { ok: true }> {
  if (!o.ok) throw new Error(`Expected ok, got ${JSON.stringify(o.code === "unavailable" ? o : { code: o.code, error: o.error })}`);
  return o;
}

function refused(o: ActOutcome): Extract<ActOutcome, { code: "refused" }> {
  if (o.ok || o.code !== "refused") throw new Error(`Expected a refusal, got ${JSON.stringify(o.ok ? { ok: true } : o.code)}`);
  return o;
}

/** The world as stored (its rows joined into the document), with the next deadline still to sweep. */
async function world(id: string): Promise<{ version: number; doc: ToyDoc; next_due: Date | null } | undefined> {
  const w = await readStoredWorld(db.sql, id as WorldId, toyPort);
  return w && { version: w.version, doc: w.doc as ToyDoc, next_due: w.nextDue === null ? null : new Date(w.nextDue) };
}

async function count(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? -1;
}

describe("db-errors (no database)", () => {
  const withCode = (code: string) => Object.assign(new Error("x"), { code });

  it("sorts setup errors into not-set-up and down, and timeouts into busy", () => {
    for (const code of ["28000", "28P01", "3D000", "3F000", "42P01", "42501"]) {
      expect(setupErrorKind(withCode(code)), code).toBe("not-set-up");
      expect(isBusy(withCode(code)), code).toBe(false);
    }
    const down = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "CONNECT_TIMEOUT", "57P01", "57P03", "57P02", "ECONNRESET", "CONNECTION_CLOSED", "CONNECTION_ENDED"];
    for (const code of down) expect(setupErrorKind(withCode(code)), code).toBe("down");
    for (const code of ["55P03", "57014"]) {
      expect(isBusy(withCode(code)), code).toBe(true);
      expect(setupErrorKind(withCode(code)), code).toBeNull();
    }
    for (const e of [withCode("23505"), withCode("23514"), withCode("40001"), new Error("x"), null, undefined, "28P01", { code: 28 }]) {
      expect(setupErrorKind(e)).toBeNull();
      expect(isBusy(e)).toBe(false);
    }
  });

  it("reads the code inside an AggregateError (a host name with several addresses)", () => {
    const e = new AggregateError([withCode("ECONNREFUSED"), withCode("ECONNREFUSED")], "connect failed");
    expect(errorCode(e)).toBe("ECONNREFUSED");
    expect(setupErrorKind(e)).toBe("down");
  });

  it("has a message for each kind", () => {
    for (const kind of ["no-database", "not-set-up", "down"] as const) expect(unavailableMessage(kind)).toMatch(/\.$/);
  });
});

describe("the stand-in port keeps the engine's contract (no database)", () => {
  it("refuses an async callback and blanks its state after every run", () => {
    const ctx = { doc: toyPort.empty(), people: [], now: T0 };
    expect(() => toyPort.run(ctx, () => Promise.resolve(1))).toThrow(/synchronous/);
    expect(() => toyPort.reduce(toyPort.empty(), "user-ann", { type: "trim" })).toThrow(/outside run/);
    expect(toyPort.run(ctx, () => toyPort.reduce(ctx.doc, "user-ann", { type: "trim" }).toast)).toBe("Trimmed.");
    expect(() => toyPort.nextDue(ctx.doc)).toThrow(/outside run/);
  });

  it("leaves the previous state untouched when it refuses", () => {
    const doc = toyPort.empty();
    const frozen = JSON.stringify(doc);
    const res = toyPort.run({ doc, people: [], now: T0 }, () => toyPort.reduce(doc, "user-ann", { type: "take", item: "i-none", qty: 1, holdMs: null }));
    expect(res.error).toBe(TOY_TEXT.noItem);
    expect(res.state).toBe(doc);
    expect(JSON.stringify(doc)).toBe(frozen);
  });
});

describe.skipIf(!databaseUrl)("Handoff store (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("store");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("starts with an empty view at version 0, with the viewer in it, and creates no world", async () => {
    const view = await getView(db.sql, { worldId: "test-empty", viewer: ann, now: T0 }, toyPort);
    expect(view).toMatchObject({ protocol: 1, mode: "live", worldId: "test-empty", version: 0, serverNow: T0, unreadCount: 0 });
    expect(view.listings).toEqual([]);
    expect(view.notifications).toEqual([]);
    expect(view.viewer).toEqual({ id: ann.id, name: "Ann Lee", email: "ann@example.invalid", payMethods: [] });
    expect(view.people[ann.id]).toMatchObject({ name: "Ann Lee", demo: true, contact: "ann@example.invalid" });
    expect(await world("test-empty")).toBeUndefined();

    // Without an injected time, the view carries the database's clock.
    const live = await getView(db.sql, { worldId: "test-empty", viewer: ann }, toyPort);
    expect(Math.abs(live.serverNow - Date.now())).toBeLessThan(60_000);
  });

  it("bumps the version and logs ok for an accepted action; logs a refusal without a bump", async () => {
    const w = "test-log";
    const listed = ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    expect(listed).toMatchObject({ replay: false, toast: "Listed 1.", resultId: "i-one" });
    expect(listed.view.version).toBe(1);

    const took = ok(await act(w, bob, { type: "take", item: "i-one" }, { now: T0 + 1 }));
    expect(took.view.version).toBe(2);
    expect(took.resultId).toMatch(/^h[0-9a-f]{16}$/);

    const no = refused(await act(w, cat, { type: "take", item: "i-one" }, { now: T0 + 2 }));
    expect(no).toMatchObject({ error: TOY_TEXT.soldOut, replay: false });
    // A refusal comes back with a fresh view, so a stale screen corrects itself.
    expect(no.view.version).toBe(2);
    expect(no.view.listings[0]?.numbers).toEqual({ reserved: 1, completed: 0, available: 0 });

    const rows = await db.sql<
      { actor_id: string; type: string; ids: unknown; ok: boolean; result: unknown; version_before: number; version_after: number; at: Date }[]
    >`SELECT actor_id, type, ids, ok, result, version_before, version_after, at FROM actions WHERE world_id = ${w} ORDER BY at`;
    expect(rows.map(({ at, ...r }) => ({ ...r, at: at.getTime() }))).toEqual([
      { actor_id: ann.id, type: "stock", ids: { item: "i-one" }, ok: true, result: { toast: "Listed 1.", resultId: "i-one" }, version_before: 0, version_after: 1, at: T0 },
      { actor_id: bob.id, type: "take", ids: { item: "i-one" }, ok: true, result: { toast: "Reserved 1.", resultId: took.resultId }, version_before: 1, version_after: 2, at: T0 + 1 },
      { actor_id: cat.id, type: "take", ids: { item: "i-one" }, ok: false, result: { error: TOY_TEXT.soldOut }, version_before: 2, version_after: 2, at: T0 + 2 },
    ]);
  });

  it("answers a retry with the same request id with its first outcome, and applies it once", async () => {
    const w = "test-retry";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 2 }, { now: T0 }));
    const rid = randomUUID();
    const send = (actor: Actor, action: unknown, requestId = rid) =>
      applyAction(db.sql, { worldId: w, actor, requestId, action, now: T0 + 1 }, toyPort);

    const first = ok(await send(bob, { type: "take", item: "i-one" }));
    const again = ok(await send(bob, { type: "take", item: "i-one" }));
    expect(again).toMatchObject({ replay: true, toast: first.toast, resultId: first.resultId });
    expect(again.view.version).toBe(first.view.version);
    expect((await world(w))?.doc.stock["i-one"]?.holds).toHaveLength(1);

    // A refused action replays as the same refusal, even after it would succeed.
    const rid2 = randomUUID();
    const no = refused(await send(cat, { type: "take", item: "i-one", qty: 5 }, rid2));
    expect(no.error).toBe(TOY_TEXT.soldOut);
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 10 }, { now: T0 + 2 }));
    const noAgain = refused(await send(cat, { type: "take", item: "i-one", qty: 5 }, rid2));
    expect(noAgain).toMatchObject({ error: TOY_TEXT.soldOut, replay: true });

    // The same id with a different action is a client bug: refused as invalid, nothing changes.
    const before = (await world(w))?.version;
    expect(await send(bob, { type: "take", item: "i-one", qty: 2 })).toMatchObject({ ok: true, replay: true }); // ids match: a replay
    expect(await send(bob, { type: "withdraw", item: "i-one" })).toEqual({ ok: false, code: "invalid", error: REUSED_REQUEST_ERROR });
    expect((await world(w))?.version).toBe(before);

    // Another user's request with the same id is a different intent.
    expect(ok(await send(cat, { type: "take", item: "i-one" })).replay).toBe(false);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w} AND request_id = ${rid}`)).toBe(2);
  });

  it("refuses malformed requests before touching the database", async () => {
    const dan: Actor = { id: "user-dan", name: "Dan Ro", email: null };
    for (const requestId of ["", "not-a-uuid", "6f1d2c3b4a594e6f8a7b9c0d1e2f3a4b", `${randomUUID()} `]) {
      expect(await applyAction(db.sql, { worldId: "test-malformed", actor: dan, requestId, action: { type: "trim" } }, toyPort)).toEqual({
        ok: false,
        code: "invalid",
        error: BAD_REQUEST_ERROR,
      });
    }
    for (const action of [{ type: "nope" }, { type: "sweep" }, { type: "take", item: "constructor" }, null, "take", { type: "take", item: "__proto__" }]) {
      const o = await act("test-malformed", dan, action);
      expect(o.ok === false && o.code).toBe("invalid");
    }
    // A bug in the port's own parsing is an internal error, reported as data.
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const broken = {
        ...toyPort,
        parse: () => {
          throw new Error("parser bug");
        },
      };
      expect(await applyAction(db.sql, { worldId: "test-malformed", actor: dan, requestId: randomUUID(), action: { type: "trim" } }, broken)).toEqual({
        ok: false,
        code: "internal",
        error: INTERNAL_ERROR,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("parser bug");
    } finally {
      log.mockRestore();
    }
    expect(await world("test-malformed")).toBeUndefined();
    expect(await count(db.sql`SELECT count(*)::int AS n FROM people WHERE user_id = ${dan.id}`)).toBe(0);
    // Caller mistakes throw: actions.ts only ever passes resolved world ids and session users.
    await expect(act("prod" as WorldId, dan, { type: "trim" })).rejects.toThrow(TypeError);
    await expect(act("test-malformed", { ...dan, id: "system" }, { type: "trim" })).rejects.toThrow(TypeError);
    await expect(act("test-malformed", dan, { type: "trim" }, { lockTimeoutMs: 0 })).rejects.toThrow(TypeError);
    await expect(act("test-malformed", dan, { type: "trim" }, { now: Number.NaN })).rejects.toThrow(TypeError);
  });

  it("drains notifications into their table: one change's identical ones once, separate changes each (readiness RB-10), a retried change never again; each person sees only their own", async () => {
    const w = "test-notes";
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Hello Bob" }, { now: T0 }));
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Hello Bob" }, { now: T0 + 1 })); // another change in the same words: it arrives too
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Three in one action", copies: 3 }, { now: T0 + 2 })); // one change: written once
    const rid = randomUUID();
    const once: ApplyInput = { worldId: w, actor: ann, requestId: rid, action: { type: "note", to: bob.id, text: "Retried" }, now: T0 + 3 };
    ok(await applyAction(db.sql, once, toyPort));
    expect(await applyAction(db.sql, once, toyPort)).toMatchObject({ ok: true, replay: true }); // answered from the actions log: nothing written again
    expect((await world(w))?.doc.notifications).toEqual([]); // none at rest in the document

    let view = await getView(db.sql, { worldId: w, viewer: bob, now: T0 + 4 }, toyPort);
    expect(view.notifications.map((n) => n.text)).toEqual(["Retried", "Three in one action", "Hello Bob", "Hello Bob"]);
    expect(view.unreadCount).toBe(4);
    expect(view.notifications[3]).toMatchObject({ userId: bob.id, link: { name: "activity" }, read: false, at: T0 });

    // A read one stays read, and the same words arrive again, unread.
    expect(await markNotificationsRead(db.sql, { worldId: w, userId: bob.id, ids: [view.notifications[3]!.id] })).toBe(1);
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Hello Bob" }, { now: T0 + 5 }));
    view = await getView(db.sql, { worldId: w, viewer: bob, now: T0 + 6 }, toyPort);
    expect(view.notifications.filter((n) => n.text === "Hello Bob").map((n) => n.read)).toEqual([false, false, true]);
    expect(view.unreadCount).toBe(4);

    expect((await getView(db.sql, { worldId: w, viewer: ann, now: T0 + 6 }, toyPort)).notifications).toEqual([]);

    // A note without a link is stored as SQL NULL; a text over the table's limit is cut to it.
    ok(await act(w, ann, { type: "note", to: cat.id, text: "No link", noLink: true }, { now: T0 + 7 }));
    ok(await act(w, ann, { type: "note", to: cat.id, text: "x".repeat(2500) }, { now: T0 + 8 }));
    const catView = await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 9 }, toyPort);
    expect(catView.notifications.map((n) => [n.text.length, n.link])).toEqual([
      [2000, { name: "activity" }],
      [7, null],
    ]);
    expect(catView.notifications[0]?.text.endsWith("…")).toBe(true);
  });

  it("sends the newest 100 notifications and counts every unread one", async () => {
    const w = "test-many-notes";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    // 105 notifications straight into the table (the engine would take 105 actions to write them).
    await db.sql`
      INSERT INTO notifications (world_id, id, user_id, text, dedupe, at)
      SELECT ${w}, 'n' || i, ${bob.id}, 'Note ' || i, md5('Note ' || i), ${new Date(T0)}::timestamptz + make_interval(secs => i)
      FROM generate_series(1, 105) AS i`;
    const view = await getView(db.sql, { worldId: w, viewer: bob, now: T0 + HOUR }, toyPort);
    expect(view.notifications).toHaveLength(100);
    expect(view.notifications[0]?.text).toBe("Note 105");
    expect(view.unreadCount).toBe(105);
  });

  it("marks only the owner's notifications read, without the world's lock or a new version", async () => {
    const w = "test-read";
    ok(await act(w, ann, { type: "note", to: bob.id, text: "One" }, { now: T0 }));
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Two" }, { now: T0 + 1 }));
    ok(await act(w, ann, { type: "note", to: cat.id, text: "Three" }, { now: T0 + 2 }));
    const ids = (await getView(db.sql, { worldId: w, viewer: bob, now: T0 + 3 }, toyPort)).notifications.map((n) => n.id);
    const version = (await world(w))?.version;

    // Hold a write's locks (ann's own profile, among them) while marking: neither markRead nor saveProfile waits for it.
    const held = deferred();
    const locked = deferred();
    const holding = act(w, ann, { type: "stock", item: "i-one", listed: 1 }, {
      now: T0 + 4,
      hooks: {
        afterLock: async () => {
          locked.resolve();
          await held.promise;
        },
      },
    });
    await locked.promise;
    try {
      expect(await markNotificationsRead(db.sql, { worldId: w, userId: cat.id, ids })).toBe(0); // someone else's ids
      expect(await markNotificationsRead(db.sql, { worldId: w, userId: bob.id, ids: ["Not An Id", "constructor", ""] })).toBe(0);
      expect(await markNotificationsRead(db.sql, { worldId: w, userId: bob.id, ids: [ids[0]!, ids[0]!] })).toBe(1);
      expect(await markNotificationsRead(db.sql, { worldId: w, userId: bob.id, ids: "all" })).toBe(1);
      expect(await markNotificationsRead(db.sql, { worldId: w, userId: bob.id, ids: "all" })).toBe(0);
      expect(await saveProfile(db.sql, { userId: bob.id, payHandle: "@bob" })).toEqual({ ok: true });
    } finally {
      held.resolve();
    }
    ok(await holding);
    expect((await world(w))?.version).toBe((version ?? 0) + 1); // only the held action's own write
    expect((await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 5 }, toyPort)).unreadCount).toBe(1);
  });

  it("persists across pools: a second app instance sees the first one's writes, and the reverse", async () => {
    const w = "test-persist";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 2 }, { now: T0 }));
    ok(await act(w, bob, { type: "take", item: "i-one" }, { now: T0 + 1 }));
    const other = db.pool(2);
    const seen = await getView(other, { worldId: w, viewer: cat, now: T0 + 2 }, toyPort);
    expect(seen.version).toBe(2);
    expect(seen.listings[0]?.numbers).toEqual({ reserved: 1, completed: 0, available: 1 });
    ok(await applyAction(other, { worldId: w, actor: cat, requestId: randomUUID(), action: { type: "take", item: "i-one" }, now: T0 + 3 }, toyPort));
    const back = await getView(db.sql, { worldId: w, viewer: ann, now: T0 + 4 }, toyPort);
    expect(back.version).toBe(3);
    expect(back.listings[0]?.numbers.available).toBe(0);
  });

  it("stores an expiry at the first read after next_due, once, even when two reads race", async () => {
    const w = "test-expiry";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, bob, { type: "take", item: "i-one", holdMs: 15 * MIN }, { now: T0 }));
    expect((await world(w))?.next_due?.getTime()).toBe(T0 + 15 * MIN);

    const early = await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 14 * MIN }, toyPort);
    expect(early.version).toBe(2);
    expect(early.listings[0]?.numbers.available).toBe(0);
    expect(early.nextRefreshAt).toBe(T0 + 15 * MIN);

    const [a, b] = await Promise.all([
      getView(db.sql, { worldId: w, viewer: cat, now: T0 + 16 * MIN }, toyPort),
      getView(db.sql, { worldId: w, viewer: ann, now: T0 + 16 * MIN }, toyPort),
    ]);
    expect([a.version, b.version]).toEqual([3, 3]);
    expect(a.listings[0]?.numbers.available).toBe(1);
    const row = await world(w);
    expect(row?.version).toBe(3);
    expect(row?.next_due).toBeNull();
    expect(row?.doc.stock["i-one"]?.holds).toEqual([]);

    const sweeps = await db.sql<{ actor_id: string; type: string; ok: boolean; version_before: number; version_after: number; at: Date }[]>`
      SELECT actor_id, type, ok, version_before, version_after, at FROM actions WHERE world_id = ${w} AND actor_id = 'system'`;
    expect(sweeps.map(({ at, ...s }) => ({ ...s, at: at.getTime() }))).toEqual([
      { actor_id: "system", type: "sweep", ok: true, version_before: 2, version_after: 3, at: T0 + 16 * MIN },
    ]);
    const bobView = await getView(db.sql, { worldId: w, viewer: bob, now: T0 + 20 * MIN }, toyPort);
    expect(bobView.notifications.map((n) => n.text)).toEqual(["Your hold on i-one expired."]);
    expect(bobView.version).toBe(3); // nothing more to sweep
  });

  it("checks next_due again under the lock, so a sweep queued behind a write that already expired the hold does nothing", async () => {
    const w = "test-sweep-recheck";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, bob, { type: "take", item: "i-one", holdMs: 15 * MIN }, { now: T0 }));
    // A write holds its locks (the item among them). Every write sweeps first, so it will expire the hold.
    const locked = deferred();
    const held = deferred();
    const writing = act(w, ann, { type: "stock", item: "i-two", listed: 1 }, {
      now: T0 + 16 * MIN,
      hooks: {
        afterLock: async () => {
          locked.resolve();
          await held.promise;
        },
      },
    });
    await locked.promise;
    // Meanwhile a read sees the hold's deadline passed: its sweep runs the rules on the market as committed, and queues on the
    // item's row, which that write holds.
    const reading = getView(db.sql, { worldId: w, viewer: cat, now: T0 + 16 * MIN }, toyPort);
    await waitForLockWaiters(db, 1);
    held.resolve();
    ok(await writing);
    const view = await reading;
    expect(view.version).toBe(3); // the write's version: the sweep, decided again on what the write stored, stored nothing
    expect(view.listings.find((l) => l.id === "i-one")?.numbers.available).toBe(1);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w} AND actor_id = 'system'`)).toBe(0);
  });

  it("leaves the version alone when a sweep finds nothing to expire, and doesn't sweep that version again", async () => {
    const w = "test-noop-sweep";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 2 }, { now: T0 }));
    toyControls.phantomDue = T0 + MIN; // a deadline the rules report, but nothing acts on
    try {
      const sweeps = toyControls.sweepRuns;
      expect((await world(w))?.next_due?.getTime()).toBe(T0 + MIN);
      expect((await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 2 * MIN }, toyPort)).version).toBe(1);
      expect(toyControls.sweepRuns - sweeps).toBe(1);
      // This app instance knows that version has nothing to sweep before then, so its next reads don't sweep it again.
      expect((await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 3 * MIN }, toyPort)).version).toBe(1);
      expect(await refreshView(db.sql, { worldId: w, viewer: cat, version: 1, nextRefreshAt: null, now: T0 + 4 * MIN }, toyPort)).toEqual({ unchanged: true, version: 1 });
      expect(toyControls.sweepRuns - sweeps).toBe(1);
    } finally {
      toyControls.phantomDue = null;
    }
    ok(await act(w, bob, { type: "take", item: "i-one", holdMs: 30 * MIN }, { now: T0 + 5 * MIN }));
    expect((await world(w))?.next_due?.getTime()).toBe(T0 + 35 * MIN);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w} AND actor_id = 'system'`)).toBe(0);
  });

  it("rolls back an engine exception with a generic error, logging the type, ids and class but no message", async () => {
    const w = "test-boom";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await act(w, ann, { type: "boom", item: "i-one" }, { now: T0 + 1 })).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
      expect(log).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain('"type":"boom"');
      expect(logged).toContain('"ids":{"item":"i-one"}');
      expect(logged).toContain("EngineError");
      expect(logged).not.toContain("exploded");
    } finally {
      log.mockRestore();
    }
    expect((await world(w))?.version).toBe(1);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w} AND type = 'boom'`)).toBe(0);
  });

  it("rolls back a write whose notification the table can't take, rather than drop it silently", async () => {
    const w = "test-bad-note";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await act(w, ann, { type: "note", to: bob.id, text: "Hi", badId: true }, { now: T0 + 1 })).toEqual({
        ok: false,
        code: "internal",
        error: INTERNAL_ERROR,
      });
      expect(JSON.stringify(log.mock.calls)).toContain("BadNotificationId");
    } finally {
      log.mockRestore();
    }
    expect((await world(w))?.version).toBe(1);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM notifications WHERE world_id = ${w}`)).toBe(0);
  });

  it("still serves the view when a sweep fails, and sweeps at the next read", async () => {
    const w = "test-sweep-fails";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, bob, { type: "take", item: "i-one", holdMs: MIN }, { now: T0 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    toyControls.failSweep = 1;
    try {
      const view = await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 2 * MIN }, toyPort);
      expect(view.version).toBe(2);
      expect(JSON.stringify(log.mock.calls)).toContain("sweep failed");
    } finally {
      toyControls.failSweep = 0;
      log.mockRestore();
    }
    expect((await world(w))?.next_due?.getTime()).toBe(T0 + MIN); // nothing stored; still due
    const next = await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 3 * MIN }, toyPort);
    expect(next.version).toBe(3);
    expect(next.listings[0]?.numbers.available).toBe(1);
  });

  it("refuses a newly introduced invariant violation, but never blocks writes on old damage", async () => {
    const w = "test-invariants";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    const hold = ok(await act(w, bob, { type: "take", item: "i-one" }, { now: T0 + 1 })).resultId;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await act(w, ann, { type: "corrupt", item: "i-one" }, { now: T0 + 2 })).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("InvariantError");
      expect(logged).toContain("oversold:i-one");
    } finally {
      log.mockRestore();
    }
    expect((await world(w))?.version).toBe(2);
    expect((await world(w))?.doc.stock["i-one"]?.listed).toBe(1);

    // Damage already in the document (as a past bug would have left it) doesn't freeze the world. Each version
    // saved while it remains logs it once, by key (C-DESIGN §4.6).
    const damaged = (await world(w))!.doc;
    damaged.stock["i-one"]!.listed = 0;
    await storeDocument(db.sql, w, damaged); // a manual fix gone wrong, as one document: the next write splits it into rows again
    expect(violations(damaged)).toEqual(["oversold:i-one"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      ok(await act(w, ann, { type: "stock", item: "i-two", listed: 2 }, { now: T0 + 3 })); // version 3
      refused(await act(w, cat, { type: "take", item: "i-one" }, { now: T0 + 4 })); // no new version, nothing logged
      ok(await act(w, ann, { type: "stock", item: "i-three", listed: 1 }, { now: T0 + 5 })); // version 4
      ok(await act(w, ann, { type: "release", item: "i-one", hold }, { now: T0 + 6 })); // version 5 repairs it
      ok(await act(w, ann, { type: "stock", item: "i-four", listed: 1 }, { now: T0 + 7 })); // version 6
      const line = (version: number) =>
        `[handoff] world ${w} at version ${version} still has 1 invariant violation(s) from before (not blocking writes): oversold:i-one`;
      expect(warn.mock.calls.map((c) => c.join(" "))).toEqual([line(3), line(4)]);
    } finally {
      warn.mockRestore();
    }
    expect(violations((await world(w))!.doc)).toEqual([]);
  });

  it("reads the profiles a change names as it runs, and opening Handoff makes none (review of PR #88)", async () => {
    // The real engine names people in notification and history text from the profiles the store reads for the change. Opening
    // Handoff saves nothing, so someone who has only looked is "Someone" to the toy engine (the real one says "A classmate");
    // once they have changed something, their profile is there for every change after.
    const w = "test-people-named";
    const dan: Actor = { id: "user-dan-late", name: "Dan Okafor", email: null };
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    const looked = await getView(db.sql, { worldId: w, viewer: dan, now: T0 + 1 }, toyPort);
    expect(looked.viewer).toMatchObject({ id: dan.id, name: "Dan Okafor" }); // the session's name, though nothing was saved
    expect(await count(db.sql`SELECT count(*)::int AS n FROM people WHERE user_id = ${dan.id}`)).toBe(0);
    ok(await act(w, bob, { type: "greet", to: dan.id }, { now: T0 + 2 }));
    ok(await act(w, dan, { type: "stock", item: "i-dan", listed: 1 }, { now: T0 + 3 })); // his first change makes his profile
    expect(await count(db.sql`SELECT count(*)::int AS n FROM people WHERE user_id = ${dan.id}`)).toBe(1);
    ok(await act(w, bob, { type: "greet", to: dan.id }, { now: T0 + 4 }));
    const danView = await getView(db.sql, { worldId: w, viewer: dan, now: T0 + 5 }, toyPort);
    expect(danView.notifications.map((n) => n.text)).toEqual(["Hello, Dan.", "Hello, Someone."]);
  });

  it("review of PR #88: caps one account's open records; closing one makes room; others aren't affected", async () => {
    const w = "test-open-cap";
    const limits = { openRecords: 2, perMinute: null };
    ok(await act(w, ann, { type: "stock", item: "i-a", listed: 1 }, { now: T0, limits }));
    ok(await act(w, ann, { type: "stock", item: "i-b", listed: 1 }, { now: T0 + 1, limits }));
    const capped = refused(await act(w, ann, { type: "stock", item: "i-c", listed: 1 }, { now: T0 + 2, limits }));
    expect(capped.error).toBe(OPEN_LIMIT_ERROR); // a refusal, logged as one, so a retry gets the same answer
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w} AND NOT ok`)).toBe(1);
    expect(Object.keys((await world(w))!.doc.stock)).toEqual(["i-a", "i-b"]);
    // Changing an open record of one's own is fine at the cap; so is another account's new record.
    ok(await act(w, ann, { type: "stock", item: "i-a", listed: 3 }, { now: T0 + 3, limits }));
    ok(await act(w, bob, { type: "stock", item: "i-bob", listed: 1 }, { now: T0 + 4, limits }));
    // Closing one makes room.
    ok(await act(w, ann, { type: "withdraw", item: "i-b" }, { now: T0 + 5, limits }));
    ok(await act(w, ann, { type: "stock", item: "i-c", listed: 1 }, { now: T0 + 6, limits }));
    expect(OPEN_RECORDS_MAX).toBe(100);
  });

  it("review of PR #88: caps one account's changes a minute, without logging them; a retried click still gets its answer", async () => {
    const w = "test-rate";
    const limits = { openRecords: null, perMinute: 3 };
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0, limits }));
    const rid = randomUUID();
    ok(await applyAction(db.sql, { worldId: w, actor: ann, requestId: rid, action: { type: "stock", item: "i-one", listed: 2 }, now: T0 + 1000, limits }, toyPort));
    refused(await act(w, ann, { type: "take", item: "i-one" }, { now: T0 + 2000, limits })); // refusals count too
    expect(await act(w, ann, { type: "stock", item: "i-one", listed: 3 }, { now: T0 + 3000, limits })).toEqual({ ok: false, code: "busy", error: RATE_ERROR });
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w}`)).toBe(3); // the fourth wasn't logged
    expect((await world(w))!.doc.stock["i-one"]?.listed).toBe(2);
    // The retry of a change already made is answered from the log, over the limit or not.
    expect(await applyAction(db.sql, { worldId: w, actor: ann, requestId: rid, action: { type: "stock", item: "i-one", listed: 2 }, now: T0 + 4000, limits }, toyPort)).toMatchObject({ ok: true, replay: true });
    // Another account isn't held back by ann's pace; and a minute on, ann can go on.
    ok(await act(w, bob, { type: "take", item: "i-one" }, { now: T0 + 5000, limits }));
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 3 }, { now: T0 + 62_000, limits }));
    expect(ACTIONS_PER_MINUTE).toBe(30);
  });

  it("review of PR #88: deletes an account's Handoff data once nothing of theirs is open; their past records stay, nameless", async () => {
    const w = "test-delete-data";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, bob, { type: "take", item: "i-one" }, { now: T0 + 1 }));
    ok(await act(w, ann, { type: "note", to: bob.id, text: "For Bob" }, { now: T0 + 2 }));
    ok(await act(w, bob, { type: "note", to: ann.id, text: "For Ann" }, { now: T0 + 3 }));
    // Ann's item is open, and so is Bob's hold on it: neither may delete yet.
    expect(await deleteMyData(db.sql, { worldId: w, userId: ann.id }, toyPort)).toEqual({ ok: false, error: DELETE_OPEN_ERROR });
    expect(await deleteMyData(db.sql, { worldId: w, userId: bob.id }, toyPort)).toEqual({ ok: true }); // a toy hold isn't a record of Bob's
    ok(await act(w, ann, { type: "withdraw", item: "i-one" }, { now: T0 + 4 }));
    const before = (await world(w))!.doc;
    expect(await deleteMyData(db.sql, { worldId: w, userId: ann.id }, toyPort)).toEqual({ ok: true });
    for (const table of ["people", "notifications", "actions"] as const) {
      const column = table === "people" ? "user_id" : table === "actions" ? "actor_id" : "user_id";
      expect(await count(db.sql`SELECT count(*)::int AS n FROM ${db.sql(table)} WHERE ${db.sql(column)} = ${ann.id}`), table).toBe(0);
    }
    expect((await world(w))!.doc).toEqual(before); // the market's records stay as they were
    // A view of the market names ann as nobody in particular now; her own view is as on a first visit.
    const cats = await getView(db.sql, { worldId: w, viewer: cat, now: T0 + 5 }, toyPort);
    expect(cats.people[ann.id]?.name).toBe("A classmate");
    const anns = await getView(db.sql, { worldId: w, viewer: ann, now: T0 + 5 }, toyPort);
    expect([anns.viewer.name, anns.unreadCount, anns.notifications]).toEqual(["Ann Lee", 0, []]);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM people WHERE user_id = ${ann.id}`)).toBe(0);
  });

  it("never gives the engine anyone's email: only the projection's context carries them", async () => {
    const w = "test-no-emails";
    const runsWithEmail = toyControls.runsWithEmail;
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 2 }, { now: T0 })); // a write and its view
    ok(await act(w, bob, { type: "take", item: "i-one", holdMs: MIN }, { now: T0 + 1 }));
    refused(await act(w, ann, { type: "take", item: "i-one" }, { now: T0 + 2 })); // a refusal and its view
    const view = await getView(db.sql, { worldId: w, viewer: ann, now: T0 + 2 * MIN }, toyPort); // a sweep, then a view
    expect(view.version).toBe(3);
    expect(view.viewer.email).toBe("ann@example.invalid"); // the projection had it
    expect(toyControls.runsWithEmail - runsWithEmail).toBe(0);
  });

  it("keeps no limit on the whole market (review of PR #88), but refuses one record past RECORD_MAX_BYTES", async () => {
    const w = "test-size";
    // Past the old 5 MB limit on the one document: every record is its own row, and a change writes only its own.
    ok(await act(w, ann, { type: "pad", bytes: Math.round(5.5 * MB) }, { now: T0 }));
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 + 1 }));
    expect(Buffer.byteLength(JSON.stringify((await world(w))!.doc))).toBeGreaterThan(5.5 * MB);
    const written = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM records WHERE world_id = ${w} AND kind = 'item'`;
    expect(written[0]?.n).toBe(1);
    // One record past the limit is refused, and nothing is saved; at the limit it goes through.
    expect(await act(w, ann, { type: "memo", item: "i-one", bytes: RECORD_MAX_BYTES }, { now: T0 + 2 })).toEqual({ ok: false, code: "full", error: FULL_ERROR });
    expect((await world(w))?.version).toBe(2);
    ok(await act(w, ann, { type: "memo", item: "i-one", bytes: RECORD_MAX_BYTES - 200 }, { now: T0 + 3 }));
    // A record already past it (written before the limit changed, say) may still shrink.
    const big = (await world(w))!.doc;
    big.stock["i-one"]!.memo = "m".repeat(RECORD_MAX_BYTES + 10);
    await storeDocument(db.sql, w, big);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      ok(await act(w, ann, { type: "memo", item: "i-one", bytes: 0 }, { now: T0 + 4 }));
    } finally {
      warn.mockRestore();
    }
    expect((await world(w))!.doc.stock["i-one"]?.memo).toBeUndefined();
    ok(await act(w, ann, { type: "trim" }, { now: T0 + 5 }));
    expect(Buffer.byteLength(JSON.stringify((await world(w))!.doc))).toBeLessThan(1000);
  }, 60_000);

  it("writes a profile only when the account's name or email changed, and never shows an email as a name", async () => {
    const person = async (id: string) =>
      (await db.sql<{ xmin: string; updated_at: Date; name: string; email: string | null; pay_handle: string }[]>`
        SELECT xmin::text AS xmin, updated_at, name, email, pay_handle FROM people WHERE user_id = ${id}`)[0];
    const eve: Actor = { id: "user-eve", name: "Eve Park", email: "eve@example.invalid" };
    await ensurePerson(db.sql, eve);
    const before = await person(eve.id);
    await ensurePerson(db.sql, eve);
    const same = await person(eve.id);
    expect(same?.xmin).toBe(before?.xmin);
    expect(same?.updated_at).toEqual(before?.updated_at);

    expect(await saveProfile(db.sql, { userId: eve.id, payHandle: "@eve" })).toEqual({ ok: true });
    await ensurePerson(db.sql, { ...eve, name: "Eve Park-Lee" });
    const renamed = await person(eve.id);
    expect(renamed?.xmin).not.toBe(before?.xmin);
    expect(renamed).toMatchObject({ name: "Eve Park-Lee", email: "eve@example.invalid", pay_handle: "@eve" });
    await ensurePerson(db.sql, { ...eve, name: "Eve Park-Lee", email: null });
    expect((await person(eve.id))?.email).toBeNull();

    await ensurePerson(db.sql, { id: "user-nameless", name: null, email: "private-handle@example.invalid" });
    expect((await person("user-nameless"))?.name).toBe("Classmate");
    await ensurePerson(db.sql, { id: "user-blank", name: " \n\t ", email: null });
    expect((await person("user-blank"))?.name).toBe("Classmate");
    await ensurePerson(db.sql, { id: "user-long", name: `${"A".repeat(130)}`, email: `${"e".repeat(260)}@example.invalid` });
    expect(await person("user-long")).toMatchObject({ name: "A".repeat(120), email: null });
    await ensurePerson(db.sql, { id: "user-tabs", name: "Tab\tby\nName", email: " t@example.invalid " });
    expect(await person("user-tabs")).toMatchObject({ name: "Tab by Name", email: "t@example.invalid" });

    for (const id of ["", "system", "x".repeat(65)]) {
      await expect(ensurePerson(db.sql, { id, name: "X", email: null })).rejects.toThrow(TypeError);
    }
  });

  it("saves the payment handle (a profile from before B1), checks it, and shows it in the owner's view as one method, word for word", async () => {
    await ensurePerson(db.sql, ann);
    const methods = async () => (await getView(db.sql, { worldId: "test-profile", viewer: ann, now: T0 }, toyPort)).viewer.payMethods;
    expect(await saveProfile(db.sql, { userId: ann.id, payHandle: "  @ann-lee  " })).toEqual({ ok: true });
    expect(await methods()).toEqual([{ kind: "other", value: "@ann-lee" }]);
    expect(await saveProfile(db.sql, { userId: ann.id, payHandle: "h".repeat(61) })).toMatchObject({ ok: false });
    expect(await saveProfile(db.sql, { userId: ann.id, payHandle: "a\nb" })).toMatchObject({ ok: false });
    expect(await saveProfile(db.sql, { userId: "user-nobody", payHandle: "@x" })).toMatchObject({ ok: false });
    expect(await methods()).toEqual([{ kind: "other", value: "@ann-lee" }]);
    expect(await saveProfile(db.sql, { userId: ann.id, payHandle: "" })).toEqual({ ok: true });
    expect(await methods()).toEqual([]);
  });

  it("answers a refresh as unchanged until the version moves, a deadline passes or the tab's own nextRefreshAt comes", async () => {
    const w = "test-refresh";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, bob, { type: "take", item: "i-one", holdMs: 10 * MIN }, { now: T0 }));
    const tab = T0 + 30 * MIN; // when the tab's view said it would change
    expect(await refreshView(db.sql, { worldId: w, viewer: cat, version: 2, nextRefreshAt: tab, now: T0 + MIN }, toyPort)).toEqual({ unchanged: true, version: 2 });
    expect(await refreshView(db.sql, { worldId: w, viewer: cat, version: 2, nextRefreshAt: null, now: T0 + MIN }, toyPort)).toEqual({ unchanged: true, version: 2 });

    const moved = await refreshView(db.sql, { worldId: w, viewer: cat, version: 1, nextRefreshAt: null, now: T0 + MIN }, toyPort);
    expect(moved.unchanged === false && moved.view.version).toBe(2);

    // The tab's time has come although nothing stored is due: the whole view, at the same version.
    const reached = await refreshView(db.sql, { worldId: w, viewer: cat, version: 2, nextRefreshAt: T0 + MIN, now: T0 + MIN }, toyPort);
    expect(reached.unchanged === false && reached.view.version).toBe(2);

    const due = await refreshView(db.sql, { worldId: w, viewer: cat, version: 2, nextRefreshAt: tab, now: T0 + 11 * MIN }, toyPort);
    expect(due.unchanged === false && due.view.version).toBe(3);
    expect(due.unchanged === false && due.view.listings[0]?.numbers.available).toBe(1);

    expect(await refreshView(db.sql, { worldId: "test-refresh-none", viewer: cat, version: 0, nextRefreshAt: null, now: T0 }, toyPort)).toEqual({ unchanged: true, version: 0 });
  });

  it("takes a daily snapshot at the first write of each New York day, and keeps 7", async () => {
    const w = "test-snapshots";
    const ny = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour + 5, minute); // EST
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: ny(9, 10) }));
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 2 }, { now: ny(9, 23, 30) })); // 04:30 UTC on the 10th
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 3 }, { now: ny(10, 0, 30) }));
    const snaps = async () =>
      db.sql<{ version: number; reason: string; listed: number }[]>`
        SELECT version, reason, (doc #>> '{stock,i-one,listed}')::int AS listed
        FROM world_snapshots WHERE world_id = ${w} ORDER BY version`;
    expect([...(await snaps())]).toEqual([
      { version: 1, reason: "daily", listed: 1 },
      { version: 3, reason: "daily", listed: 3 },
    ]);
    for (let d = 11; d <= 18; d++) ok(await act(w, ann, { type: "stock", item: "i-one", listed: d }, { now: ny(d, 9) }));
    expect((await snaps()).map((s) => s.version)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it("prunes actions after 7 days, read notifications after 90, and snapshots over their caps", async () => {
    const w = "test-prune";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Old, read" }, { now: T0 + MIN }));
    ok(await act(w, ann, { type: "note", to: bob.id, text: "Old, unread" }, { now: T0 + 2 * MIN }));
    for (let d = 1; d <= 9; d++) ok(await act(w, ann, { type: "stock", item: "i-one", listed: d + 1 }, { now: T0 + d * DAY }));
    await db.sql`UPDATE notifications SET read_at = NOW() WHERE world_id = ${w} AND text = 'Old, read'`;
    for (let v = 101; v <= 105; v++) {
      await db.sql`INSERT INTO world_snapshots (world_id, version, reason, doc) VALUES (${w}, ${v}, 'before-upgrade', '{"mode":"live"}')`;
      await db.sql`INSERT INTO world_snapshots (world_id, version, reason, doc) VALUES (${w}, ${v}, 'manual', '{"mode":"live"}')`;
    }

    // Each day's first write already pruned what was over 7 days old then (day 0's three actions on day 8, day 1's on day 9).
    // Day 9, 01:00 after T0: day 2's action goes too; the read notification (9 days old) stays.
    expect(await pruneWorld(db.sql, w, T0 + 9 * DAY + HOUR)).toEqual({ actions: 1, notifications: 0, snapshots: 2 });
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w}`)).toBe(7);
    const kept = async () => [...(await db.sql<{ reason: string; n: number }[]>`
      SELECT reason, count(*)::int AS n FROM world_snapshots WHERE world_id = ${w} GROUP BY reason ORDER BY reason`)];
    expect(await kept()).toEqual([
      { reason: "before-upgrade", n: 3 },
      { reason: "daily", n: 7 },
      { reason: "manual", n: 5 },
    ]);

    // 100 days on: every action and the read notification go; the unread one stays. Daily snapshots are all over 7 days old
    // then, so only the newest two stay; before-upgrade ones keep their cap of 3, and manual ones are never pruned.
    expect(await pruneWorld(db.sql, w, T0 + 100 * DAY)).toEqual({ actions: 7, notifications: 1, snapshots: 5 });
    expect(await kept()).toEqual([
      { reason: "before-upgrade", n: 3 },
      { reason: "daily", n: 2 },
      { reason: "manual", n: 5 },
    ]);
    expect((await getView(db.sql, { worldId: w, viewer: bob, now: T0 + 100 * DAY }, toyPort)).notifications.map((n) => n.text)).toEqual(["Old, unread"]);
  });

  it("prunes at the first write of each New York day, so a quiet world's actions don't outlive 7 days (review P4)", async () => {
    const w = "test-prune-daily";
    const actions = () => count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w}`);
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 2 }, { now: T0 + MIN }));
    expect(refused(await act(w, ann, { type: "take", item: "i-none", qty: 1 }, { now: T0 + 2 * MIN })).error).toBe(TOY_TEXT.noItem);
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 3 }, { now: T0 + 7 * DAY - HOUR })); // the day's first write: nothing is 7 days old yet
    expect(await actions()).toBe(4);
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 4 }, { now: T0 + 8 * DAY })); // the next day's first write, at version 4
    expect(await actions()).toBe(2); // day 0's three are gone, the refusal too; days 7 and 8 stay
  });

  it("also prunes at every 50th version", async () => {
    const w = "test-prune-50";
    const day8 = T0 + 8 * DAY;
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: day8 })); // the day's first write prunes now, before the old rows exist
    // Three rows from 8 days earlier (as left by a busy day: the store itself never writes a row in the past).
    await db.sql`
      INSERT INTO actions (world_id, actor_id, request_id, type, ok, result, version_before, version_after, at)
      SELECT ${w}, ${ann.id}, gen_random_uuid(), 'stock', true, '{}'::jsonb, 0, 0, ${new Date(T0)} FROM generate_series(1, 3)`;
    for (let v = 2; v <= 49; v++) ok(await act(w, ann, { type: "stock", item: "i-one", listed: v }, { now: day8 + v }));
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w}`)).toBe(52);
    const fiftieth = ok(await act(w, ann, { type: "stock", item: "i-one", listed: 50 }, { now: day8 + 50 }));
    expect(fiftieth.view.version).toBe(50);
    expect(await count(db.sql`SELECT count(*)::int AS n FROM actions WHERE world_id = ${w}`)).toBe(50);
  }, 30_000);

  it("keeps daily snapshots 7 days at most, except the newest two: the rollback point before the latest write (review P4)", async () => {
    const w = "test-snapshots-age";
    const ny = (day: number, hour: number) => Date.UTC(2026, 10, day, hour + 5); // EST
    const versions = async () => (await db.sql<{ version: number }[]>`
      SELECT version FROM world_snapshots WHERE world_id = ${w} AND reason = 'daily' ORDER BY version`).map((s) => s.version);
    for (const day of [1, 2, 3]) ok(await act(w, ann, { type: "stock", item: "i-one", listed: day }, { now: ny(day, 10) }));
    expect(await versions()).toEqual([1, 2, 3]);
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 20 }, { now: ny(20, 10) })); // a week and more later
    expect(await versions()).toEqual([3, 4]);
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 21 }, { now: ny(21, 10) }));
    expect(await versions()).toEqual([4, 5]);
    for (const day of [22, 23, 24, 25, 26, 27, 28, 29]) ok(await act(w, ann, { type: "stock", item: "i-one", listed: day }, { now: ny(day, 10) }));
    expect(await versions()).toEqual([7, 8, 9, 10, 11, 12, 13]); // the newest 7, the oldest 6 days old
  });

  it("never says nothing changed when only the view failed after COMMIT, and the retry gets the outcome", async () => {
    const w = "test-after-commit";
    ok(await act(w, ann, { type: "stock", item: "i-one", listed: 1 }, { now: T0 }));
    const rid = randomUUID();
    const take = () => applyAction(db.sql, { worldId: w, actor: bob, requestId: rid, action: { type: "take", item: "i-one" }, now: T0 + 1 }, toyPort);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    toyControls.failProject = 1;
    try {
      expect(await take()).toEqual({ ok: false, code: "internal", error: SAVED_NO_VIEW_ERROR });
      expect(JSON.stringify(log.mock.calls)).toContain("view after action");
    } finally {
      toyControls.failProject = 0;
      log.mockRestore();
    }
    expect((await world(w))?.version).toBe(2);
    const retry = ok(await take());
    expect(retry).toMatchObject({ replay: true });
    expect(retry.view.version).toBe(2);
  });

  it("reports a missing table as not set up, and a wrong password too", async () => {
    // A pool whose search_path has no Handoff tables: the role or schema isn't set up.
    const missing = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: "handoff_test_missing" } });
    try {
      expect(await applyAction(missing, { worldId: "test-x", actor: ann, requestId: randomUUID(), action: { type: "trim" } }, toyPort)).toEqual({
        ok: false,
        code: "unavailable",
        reason: "not-set-up",
        error: unavailableMessage("not-set-up"),
      });
      const thrown: unknown = await getView(missing, { worldId: "test-x", viewer: ann }, toyPort).catch((e: unknown) => e);
      expect(errorCode(thrown)).toBe("42P01");
      expect(setupErrorKind(thrown)).toBe("not-set-up");
    } finally {
      await missing.end({ timeout: 5 });
    }

    // The role exists but the password is wrong (as when the admin password changed after setup).
    const url = new URL(databaseUrl!);
    url.password = `wrong-${randomUUID()}`;
    const wrong = postgres(url.toString(), { max: 1, onnotice: () => {}, connect_timeout: 10 });
    try {
      const thrown: unknown = await wrong`SELECT 1`.then(
        () => null,
        (e: unknown) => e,
      );
      expect(errorCode(thrown)).toBe("28P01");
      expect(setupErrorKind(thrown)).toBe("not-set-up");
    } finally {
      await wrong.end({ timeout: 5 });
    }
  });
});

// ── The store with the real engine (C5): the default port, and the document cache ────────
//
// Labelled TEST users (made-up ids, @example.invalid emails); no sign-in of any kind. Times are injected.

const A = TEST_A;
const B = TEST_B;
const C = TEST_C;
const RESERVED_NOTE = `Handoff B. reserved 1 ticket for [Test] Spring Formal at $35 each. They have 15 minutes to pay you and tap "I've sent payment".`;
const CANCELLED_NOTE = "Handoff B. cancelled their reservation for [Test] Spring Formal.";

describe.skipIf(!databaseUrl)("Handoff store with the real engine (Postgres)", () => {
  let rdb: TestDb;

  beforeAll(async () => {
    rdb = await createTestDb("store-real");
  }, 30_000);

  afterAll(async () => {
    await rdb?.close();
  });

  const world = (id: WorldId, now = LT0): StoreWorld => new StoreWorld(rdb.sql, id, now);

  /** A world where A has added the event and listed `qty` at $35. */
  async function listedWorld(id: WorldId, qty = 1): Promise<{ w: StoreWorld; event: string; listing: string }> {
    const w = world(id);
    const event = await w.createEvent(A);
    const listing = await w.list(A, event, { qty, ask: "35" });
    return { w, event, listing };
  }

  /** listedWorld, with A's listing taking offers (the engine tags an offer for the seller; a take at the asking price is in-app only). */
  async function offersWorld(id: WorldId, qty = 1): Promise<{ w: StoreWorld; event: string; listing: string }> {
    const w = world(id);
    const event = await w.createEvent(A);
    const listing = await w.list(A, event, { qty, ask: "35", obo: true });
    return { w, event, listing };
  }

  async function logged(worldId: WorldId) {
    return rdb.sql<{ actor_id: string; type: string; ids: Record<string, string>; ok: boolean; result: Record<string, unknown>; version_before: number; version_after: number }[]>`
      SELECT actor_id, type, ids, ok, result, version_before, version_after FROM actions WHERE world_id = ${worldId} ORDER BY at, version_after`;
  }

  /**
   * Writes a changed document in place of the world's market, as a manual fix (or a world from before the rows) would leave it: one
   * document, which the next write splits into rows again. The version stays, and so does its next deadline.
   */
  async function plant(worldId: WorldId, change: (doc: LiveWorld) => void): Promise<number> {
    const stored = (await readStoredWorld(rdb.sql, worldId))!;
    const doc = stored.doc as unknown as LiveWorld;
    change(doc);
    await storeDocument(rdb.sql, worldId, doc, { nextDue: stored.nextDue });
    return Buffer.byteLength(JSON.stringify(doc));
  }

  it("shows a first-time viewer an empty market at version 0, keeps the contract, and creates nothing", async () => {
    const view = checked(await getView(rdb.sql, { worldId: "test-real-empty", viewer: C, now: LT0 }), C.id);
    expect(view).toMatchObject({ mode: "live", version: 0, serverNow: LT0, nextRefreshAt: null, unreadCount: 0, events: [], listings: [] });
    expect(view.viewer).toEqual({ id: C.id, name: C.name, email: C.email, payMethods: [] });
    const [row] = await rdb.sql`SELECT 1 FROM worlds WHERE id = 'test-real-empty'`;
    expect(row).toBeUndefined();
  });

  it("logs an accepted action with its record ids and what the actor was told, and a refusal without a new version", async () => {
    const { w, event, listing } = await listedWorld("test-real-log");
    const own = await w.refused(A, sent.take(listing));
    expect(own.error).toBe("You can't buy your own listing.");
    expect(own.view.version).toBe(2);
    expect([...(await logged(w.worldId))]).toEqual([
      { actor_id: A.id, type: "createEvent", ids: {}, ok: true, result: { toast: "Event added. It shows as added by you, and Handoff doesn't check its details.", resultId: event }, version_before: 0, version_after: 1 },
      { actor_id: A.id, type: "addThen", ids: { "add.eventId": event, "add.tier": "t1" }, ok: true, result: { toast: expect.stringMatching(/^Ticket listed\./), resultId: listing }, version_before: 1, version_after: 2 },
      { actor_id: A.id, type: "take", ids: { listingId: listing }, ok: false, result: { error: "You can't buy your own listing." }, version_before: 2, version_after: 2 },
    ]);
  });

  it("review of PR #88: deleting one's data waits only for what's still going on, as the page shows it", async () => {
    // Two listings of one ticket each: the first sells and is handed off, never closed; the second closes mid-exchange.
    const { w, event, listing: l1 } = await listedWorld("test-real-delete-open");
    const l2 = await w.list(A, await w.createEvent(A, { title: "[Test] Another night" }), { qty: 1, ask: "30" });
    const del = (who: { id: string }) => deleteMyData(rdb.sql, { worldId: w.worldId, userId: who.id, now: w.now });
    const busy = { ok: false, error: DELETE_OPEN_ERROR };
    expect(await del(A)).toEqual(busy); // listings that can still sell
    const r1 = okOf(await w.act(B, sent.take(l1)), "B's reservation").resultId!;
    const r2 = okOf(await w.act(C, sent.take(l2)), "C's reservation").resultId!;
    for (const [who, type] of [[B, "markPaid"], [A, "confirmPayment"], [A, "markTransferred"], [B, "buyerReceived"]] as const) await w.ok(who, sent.onRequest(type, r1));
    await w.ok(C, sent.onRequest("markPaid", r2));
    await w.ok(A, { type: "withdraw", listingId: l2 }); // "Close listing": C's paid reservation goes on
    expect(await del(A)).toEqual(busy); // nothing of A's can sell, but C's exchange on A's listing isn't done
    expect(await del(C)).toEqual(busy); // and it's C's own
    for (const [who, type] of [[A, "confirmPayment"], [A, "markTransferred"], [C, "buyerReceived"]] as const) await w.ok(who, sent.onRequest(type, r2));
    // The first listing sold out and was handed off: the page offers no "Close listing" for it, so it no longer counts, though its
    // row was never closed (counted by that flag, A could never delete).
    const [row] = await rdb.sql<{ open: boolean }[]>`SELECT open FROM records WHERE world_id = ${w.worldId} AND kind = 'listing' AND id = ${l1}`;
    expect(row?.open).toBe(true);
    // An item counts while it's up, and not once its last day is past; a live request counts until it's closed.
    await w.ok(A, sent.postItem(w.now, { until: dateAfter(w.now, 1) }));
    const iso = okOf(await w.act(B, sent.request(event, { qty: 1, budget: "35", note: "", expires: dateAfter(w.now, 5) })), "B's request").resultId!;
    expect(await del(A)).toEqual(busy);
    expect(await del(B)).toEqual(busy);
    w.advance(2 * LDAY);
    expect(await del(A)).toEqual({ ok: true });
    expect(await del(B)).toEqual(busy);
    await w.ok(B, { type: "closeInterest", id: iso });
    expect(await del(B)).toEqual({ ok: true });
    expect(await del(C)).toEqual({ ok: true });
  });

  it("review of PR #88: the open-records cap counts what's still going on, so an item past its last day makes room", async () => {
    const w = world("test-real-open-cap");
    const limits = { openRecords: 2, perMinute: null };
    await w.ok(A, sent.postItem(w.now, { title: "Old lamp", until: dateAfter(w.now, 1) }), { limits });
    await w.ok(A, sent.postItem(w.now, { title: "Desk" }), { limits });
    expect((await w.refused(A, sent.postItem(w.now, { title: "Chair" }), { limits })).error).toBe(OPEN_LIMIT_ERROR);
    await w.ok(B, sent.postItem(w.now, { title: "B's chair" }), { limits }); // another account isn't held back
    w.advance(2 * LDAY);
    await w.ok(A, sent.postItem(w.now, { title: "Chair" }), { limits }); // the lamp's last day is past
    expect((await w.refused(A, sent.postItem(w.now, { title: "Stool" }), { limits })).error).toBe(OPEN_LIMIT_ERROR);
  });

  it("answers a retry with its first outcome and applies it once; a request id reused for another action is invalid", async () => {
    const { w, listing } = await listedWorld("test-real-retry", 2);
    const rid = randomUUID();
    const send = (actor: Actor, action: unknown) => applyAction(rdb.sql, { worldId: w.worldId, actor, requestId: rid, action, now: w.now });
    const first = okOf(await send(B, sent.take(listing)), "take");
    const again = okOf(await send(B, sent.take(listing)), "the retry");
    expect(again).toMatchObject({ replay: true, toast: first.toast, resultId: first.resultId });
    expect((await w.row())!.doc.requests).toHaveLength(1);
    expect(await send(B, sent.onRequest("cancel", first.resultId!))).toEqual({ ok: false, code: "invalid", error: REUSED_REQUEST_ERROR });
    expect((await w.row())!.doc.requests[0]?.status).toBe("accepted");
    // A refusal replays as the same refusal, even once the action would now succeed.
    const rid2 = randomUUID();
    const tooMany = { ...sent.take(listing), qty: 3 };
    const no = await applyAction(rdb.sql, { worldId: w.worldId, actor: C, requestId: rid2, action: tooMany, now: w.now });
    expect(no).toMatchObject({ ok: false, code: "refused", error: "Choose between 1 and 1 ticket.", replay: false });
    okOf(await w.act(B, sent.onRequest("cancel", first.resultId!)), "B cancels");
    const noAgain = await applyAction(rdb.sql, { worldId: w.worldId, actor: C, requestId: rid2, action: tooMany, now: w.now });
    expect(noAgain).toMatchObject({ ok: false, code: "refused", error: "Choose between 1 and 1 ticket.", replay: true });
  });

  it("runs a seq (list, then share with a request) as one write, reports each step, and replays the same steps", async () => {
    const w = world("test-real-seq");
    const event = await w.createEvent(A);
    const other = await w.createEvent(A, { title: "[Test] Other night" });
    const iso = okOf(await w.act(B, sent.request(event, { qty: 1, budget: "35", note: "", expires: dateAfter(w.now, 5) })), "B's request").resultId!;
    const rid = randomUUID();
    const seq = (eventId: string) => ({
      type: "seq",
      steps: [{ action: sent.list(eventId, { qty: 1, ask: "35", paid: "40", payHandle: "@a" }) }, { action: { type: "shareListing", isoId: iso, listingId: "@0" }, optional: true }],
    });
    const o = okOf(await applyAction(rdb.sql, { worldId: w.worldId, actor: A, requestId: rid, action: seq(event), now: w.now }), "the seq");
    expect(o.view.version).toBe(4); // two events, B's request, then both steps in one write
    expect(o.steps).toEqual([
      { type: "addThen", ok: true, toast: expect.stringMatching(/^Ticket listed\. 1 classmate with a matching request was alerted/), id: o.resultId },
      { type: "shareListing", ok: true, toast: "Shared with Handoff. Nothing is held: they reserve it or make an offer like anyone else.", id: expect.stringMatching(/^rsp-[0-9a-f]{16}$/) },
    ]);
    expect((await w.view(B)).responses.map((x) => x.listingId)).toEqual([o.resultId]);
    const again = await applyAction(rdb.sql, { worldId: w.worldId, actor: A, requestId: rid, action: seq(event), now: w.now });
    expect(again).toMatchObject({ ok: true, replay: true, resultId: o.resultId, steps: o.steps });
    // An optional step that fails is reported, and the step before it is kept: a listing for another event doesn't fit B's request.
    const partly = okOf(await w.act(A, seq(other)), "the seq for the other event");
    expect(partly.steps).toEqual([
      { type: "addThen", ok: true, toast: expect.stringMatching(/^Ticket listed\./), id: partly.resultId },
      { type: "shareListing", ok: false, error: "This listing doesn't fit the request. It's for a different event." },
    ]);
    expect(partly.view.listings.map((l) => l.id)).toContain(partly.resultId);
  });

  it("drains notifications into their table: every change's arrive, even in the same words while unread (readiness RB-10), and none stays in the document", async () => {
    const { w, listing } = await listedWorld("test-real-notes");
    const cycle = async () => {
      const r = okOf(await w.act(B, sent.take(listing)), "take").resultId!;
      okOf(await w.act(B, sent.onRequest("cancel", r)), "cancel");
    };
    await cycle();
    await cycle(); // the same two sentences again, while A hasn't read them: a second reservation and cancellation, so A hears of both
    let a = await w.view(A);
    expect(a.notifications.map((n) => n.text)).toEqual([CANCELLED_NOTE, RESERVED_NOTE, CANCELLED_NOTE, RESERVED_NOTE]);
    expect(a.unreadCount).toBe(4);
    expect((await w.row())!.doc.notifications).toEqual([]); // none at rest in the document
    const reserved = a.notifications.find((n) => n.text === RESERVED_NOTE)!;
    expect(await markNotificationsRead(rdb.sql, { worldId: w.worldId, userId: A.id, ids: [reserved.id] })).toBe(1);
    okOf(await w.act(B, sent.take(listing)), "take again");
    a = await w.view(A);
    expect(a.notifications.map((n) => [n.text, n.read])).toEqual([[RESERVED_NOTE, false], [CANCELLED_NOTE, false], [RESERVED_NOTE, true], [CANCELLED_NOTE, false], [RESERVED_NOTE, false]]);
    expect(a.unreadCount).toBe(4);
  });

  it("stores a lapsed hold at the first read after next_due, once, even when two reads race; the unit is back", async () => {
    const { w, listing } = await listedWorld("test-real-expiry", 2);
    const r = okOf(await w.act(B, sent.take(listing)), "take").resultId!;
    expect((await w.row())!.next_due?.getTime()).toBe(LT0 + 15 * LMIN);
    w.now = LT0 + 14 * LMIN;
    const early = await w.view(C);
    expect(early.version).toBe(3);
    expect(early.listings[0]?.numbers).toEqual({ reserved: 1, completed: 0, available: 1 });
    expect(early.nextRefreshAt).toBeNull(); // B's hold isn't C's to see; the seller's view has its end
    expect((await w.view(A)).nextRefreshAt).toBe(LT0 + 15 * LMIN);

    w.now = LT0 + 16 * LMIN;
    const [c, a] = await Promise.all([w.view(C), w.view(A)]);
    expect([c.version, a.version]).toEqual([4, 4]);
    expect(c.listings[0]?.numbers).toEqual({ reserved: 0, completed: 0, available: 2 });
    expect(c.nextRefreshAt).toBeNull();
    const row = (await w.row())!;
    expect(row.next_due).toBeNull();
    expect(row.doc.requests.find((x) => x.id === r)?.status).toBe("expired");
    const sweeps = (await logged(w.worldId)).filter((x) => x.actor_id === "system");
    expect(sweeps.map((s) => [s.type, s.ok, s.version_before, s.version_after])).toEqual([["sweep", true, 3, 4]]);
    expect((await w.view(B)).requests.find((x) => x.id === r)?.status).toBe("expired");
  });

  it("splits a world from before the rows at its first write, keeping its version and next deadline; a stale next_due sweeps nothing", async () => {
    // Review of PR #88: a world stored as one document (as every world was before the rows), with a next_due that has passed though
    // nothing is due then: the first read sweeps (a write, so the world is split first, with a before-upgrade snapshot), finds
    // nothing to store and leaves the version alone.
    const { w, listing } = await listedWorld("test-real-noop-sweep", 2);
    okOf(await w.act(B, sent.take(listing)), "take");
    const doc = (await w.row())!.doc;
    await storeDocument(rdb.sql, w.worldId, doc, { nextDue: LT0 - LMIN });
    expect((await rdb.sql`SELECT 1 FROM records WHERE world_id = ${w.worldId}`).length).toBe(0);
    w.now = LT0 + 5 * LMIN;
    expect((await w.view(C)).version).toBe(3);
    const split = (await readStoredWorld(rdb.sql, w.worldId))!;
    expect(split).toMatchObject({ version: 3, split: true, nextDue: LT0 + 15 * LMIN });
    expect(split.doc).toEqual(doc); // the same market, now as rows
    expect((await rdb.sql`SELECT kind FROM records WHERE world_id = ${w.worldId} ORDER BY kind`).map((r) => r["kind"])).toEqual(["event", "holding", "listing", "request"]);
    expect((await rdb.sql`SELECT version, reason FROM world_snapshots WHERE world_id = ${w.worldId} AND reason = 'before-upgrade'`).map((r) => [r["version"], r["reason"]])).toEqual([[3, "before-upgrade"]]);
    expect((await logged(w.worldId)).filter((x) => x.actor_id === "system")).toEqual([]);
    // And the market goes on as before: the hold lapses at its time, and is swept then.
    w.now = LT0 + 16 * LMIN;
    expect((await w.view(C)).listings[0]?.numbers).toEqual({ reserved: 0, completed: 0, available: 2 });
    expect((await w.row())!.version).toBe(4);
  });

  it("rolls back an engine exception with a generic error, logging the type, ids and class but no message", async () => {
    const { w, listing } = await listedWorld("test-real-boom");
    const exploding: EnginePort = { ...enginePort, reduce: () => { throw new Error("engine exploded near CANARY-SECRET"); } };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const o = await applyAction(rdb.sql, { worldId: w.worldId, actor: B, requestId: randomUUID(), action: sent.take(listing), now: w.now }, exploding);
      expect(o).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
      const text = JSON.stringify(log.mock.calls);
      expect(text).toContain('"type":"take"');
      expect(text).toContain(`"ids":{"listingId":"${listing}"}`);
      expect(text).toContain("EngineError");
      expect(text).not.toContain("exploded");
      expect(text).not.toContain("CANARY");
    } finally {
      log.mockRestore();
    }
    expect((await w.row())!.version).toBe(2);
    expect((await logged(w.worldId)).map((x) => x.type)).toEqual(["createEvent", "addThen"]);
    expect((await w.view(B)).listings[0]?.numbers.available).toBe(1);
  });

  it("refuses a write that introduces an invariant violation, and never blocks writes on damage that was already there", async () => {
    const { w, listing } = await listedWorld("test-real-invariants");
    // An engine bug that oversells: a take that also drops the listing's quantity to 0.
    const overselling: EnginePort = {
      ...enginePort,
      reduce(doc, actor, a) {
        const res = enginePort.reduce(doc, actor, a);
        if (res.error === undefined && a.type === "take") (res.state as unknown as LiveWorld).listings.forEach((l) => { l.listed = 0; });
        return res;
      },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const o = await applyAction(rdb.sql, { worldId: w.worldId, actor: B, requestId: randomUUID(), action: sent.take(listing), now: w.now }, overselling);
      expect(o).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
      const text = JSON.stringify(log.mock.calls);
      expect(text).toContain("InvariantError");
      expect(text).toContain(`oversold:${listing}`);
    } finally {
      log.mockRestore();
    }
    expect((await w.row())!.version).toBe(2);
    expect((await w.row())!.doc.requests).toEqual([]);

    // Damage already stored (a past bug, or a bad manual fix) never freezes the world; each saved version logs it once.
    okOf(await w.act(B, sent.take(listing)), "take");
    await plant(w.worldId, (doc) => { doc.listings[0]!.listed = 0; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      okOf(await w.act(C, sent.createEvent(w.now, { title: "[Test] Other" })), "an unrelated write"); // version 4
      expect((await w.act(C, sent.take(listing))).ok).toBe(false); // a refusal saves nothing and logs nothing
      expect(warn.mock.calls.map((x) => x.join(" "))).toEqual([
        `[handoff] world ${w.worldId} at version 4 still has 1 invariant violation(s) from before (not blocking writes): oversold:${listing}`,
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("has no limit on the whole market (review of PR #88): a 5 MB one takes writes, each writing only its own rows", async () => {
    const w = world("test-real-size");
    const event = await w.createEvent(A);
    const long = "Looking for two tickets, any section is fine, and I can pay right away by Venmo or PayPal. ".repeat(2).slice(0, 190);
    const iso = okOf(await w.act(B, sent.request(event, { qty: 2, budget: "35", note: long, expires: dateAfter(w.now, 5) })), "B's request").resultId!;
    // Thousands of finished public requests, as a long-running market would hold.
    const bytes = await plant(w.worldId, (doc) => {
      for (let k = 0; Buffer.byteLength(JSON.stringify(doc)) < 5.02 * 1024 * 1024; k++) {
        for (let j = 0; j < 500; j++) {
          const n = k * 500 + j;
          doc.interests.push({ id: `iso-${n.toString(16).padStart(16, "0")}`, userId: `user-pad-${n % 300}`, eventId: event, kind: "iso", qty: 1, budget: 30,
            note: long, expires: dateAfter(LT0, 2), status: "closed", createdAt: LT0 - LDAY, closedAt: LT0 - LDAY + 1, closedReason: "cancelled" });
        }
      }
    });
    expect(bytes).toBeGreaterThan(5 * 1024 * 1024);
    const before = (await w.row())!.version;
    okOf(await w.act(C, sent.createEvent(w.now, { title: "[Test] One more" })), "C's event"); // splits the world, then adds one row
    const edit = okOf(await w.act(B, { type: "saveInterest", data: { id: iso, eventId: event, qty: 2, budget: "35", note: "", expires: dateAfter(w.now, 5) } }), "B's shorter note");
    expect(edit.view.interests.find((i) => i.id === iso)?.note).toBe("");
    expect((await w.row())!.version).toBe(before + 2);
    // Each of the two changes wrote its own row: the rest still have the revision the split gave them.
    const revs = await rdb.sql<{ rev: number; n: number }[]>`SELECT rev, count(*)::int AS n FROM records WHERE world_id = ${w.worldId} GROUP BY rev ORDER BY rev`;
    expect(revs.find((r) => r.rev > 1)).toMatchObject({ rev: 2, n: 1 }); // B's request, changed once
  }, 60_000);

  it("refuses one record past RECORD_MAX_BYTES, but still stores a due expiry sweep on it, once (review INT-3)", async () => {
    const w = world("test-real-size-sweep");
    const event = await w.createEvent(A);
    const listing = await w.list(A, event, { qty: 1, ask: "35" });
    const r = okOf(await w.act(B, sent.take(listing)), "B's 15-minute hold").resultId!;
    const item = okOf(await w.act(A, sent.postItem(w.now)), "A's item").resultId!;
    const held = okOf(await w.act(B, { type: "requestItem", id: item, msg: "", shareContact: false }), "B's request for it").resultId!;
    okOf(await w.act(A, { type: "acceptItemReq", id: held, shareContact: true }), "A holds it for B (48 hours)");
    const backup = okOf(await w.act(C, { type: "requestItem", id: item, msg: "", shareContact: false }), "C's backup").resultId!;
    // B's reservation with a history already past the limit (as one stored before it might be).
    await plant(w.worldId, (doc) => {
      const req = doc.requests.find((x) => x.id === r)! as unknown as { history: { at: number; text: string }[] };
      for (let n = 0; Buffer.byteLength(JSON.stringify(req)) <= RECORD_MAX_BYTES + 1000; n++) req.history.push({ at: LT0, text: `Padding line ${n} of a long history.` });
    });
    const before = (await w.row())!;
    expect(before.next_due?.getTime()).toBe(LT0 + 15 * LMIN);
    w.now = LT0 + 49 * 60 * LMIN; // both holds have lapsed
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const a = await w.view(A);
      expect(a.version).toBe(before.version + 1);
      expect(error.mock.calls).toEqual([]); // no "sweep failed"
      expect(JSON.stringify(warn.mock.calls)).toContain("stored the expiry sweep although a request is");
      const row = (await w.row())!;
      expect(row.version).toBe(before.version + 1);
      expect(row.doc.requests.find((x) => x.id === r)?.status).toBe("expired");
      expect(row.doc.goodsReqs.find((g) => g.id === held)?.status).toBe("expired");
      expect(row.doc.goodsReqs.find((g) => g.id === backup)?.status).toBe("pending"); // active again
      expect(row.next_due === null || row.next_due.getTime() > w.now).toBe(true);
      // The next read finds nothing due: no second sweep, no new version.
      expect((await w.view(B)).version).toBe(before.version + 1);
      expect((await logged(w.worldId)).filter((x) => x.actor_id === "system").map((x) => [x.ok, x.version_before, x.version_after])).toEqual([[true, before.version, before.version + 1]]);
      const c = await w.view(C);
      expect(c.notifications.map((n) => n.text)).toContain('"Desk chair" is available again and your request is active. Handoff can accept or decline it.');
      // Writes that don't grow that record go through; any other record has its usual room.
      okOf(await w.act(C, sent.createEvent(w.now, { title: "[Test] One more" })), "an unrelated write");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  }, 60_000);

  it("logs a refused seq without claiming a step went through, and replays that (review INT-4)", async () => {
    const w = world("test-real-seq-refused");
    const rid = randomUUID();
    const seq = { type: "seq", steps: [
      { action: sent.createEvent(w.now) },
      { action: sent.list("@0", { qty: 9, ask: "35", paid: "40", payHandle: "@a" }) },
    ] };
    const first = await applyAction(rdb.sql, { worldId: w.worldId, actor: A, requestId: rid, action: seq, now: w.now });
    const steps = [
      { type: "createEvent", ok: false, error: "Not saved: a later step didn't go through." },
      { type: "addThen", ok: false, error: "Enter between 1 and 4 tickets (4 per person)." },
    ];
    expect(first).toMatchObject({ ok: false, code: "refused", error: "Enter between 1 and 4 tickets (4 per person).", replay: false, steps });
    if (first.ok || first.code !== "refused") throw new Error("expected a refusal");
    expect(checked(first.view, A.id).events).toEqual([]);
    expect(JSON.stringify(first)).not.toMatch(/ev-[0-9a-f]{16}|Event added/);
    expect((await w.row())?.doc.events).toEqual([]);
    expect([...(await logged(w.worldId))].map((x) => [x.type, x.ok, x.result])).toEqual([["seq", false, { error: "Enter between 1 and 4 tickets (4 per person).", steps }]]);
    const again = await applyAction(rdb.sql, { worldId: w.worldId, actor: A, requestId: rid, action: seq, now: w.now });
    expect(again).toMatchObject({ ok: false, code: "refused", replay: true, steps });
  });

  it("never logs text typed in a request, accepted or refused: the actions log keeps what the actor was told (review P4)", async () => {
    const w = world("test-real-log-text");
    const typed = (what: string) => `CANARY-TYPED ${what}`;
    const event = await w.createEvent(A, { title: `[Test] ${typed("title")}`, club: typed("club"), venue: typed("venue"), notes: typed("notes"), tiers: [{ label: typed("tier"), price: "40" }] });
    // Refusals that used to quote what was typed: a tier's name, one tier among several.
    await w.refused(A, sent.createEvent(w.now, { title: `[Test] ${typed("title 2")}`, tiers: [{ label: typed("tier 2"), price: "-1" }] }));
    await w.refused(A, sent.createEvent(w.now, { title: `[Test] ${typed("title 3")}`, tiers: [{ label: "GA", price: "40" }, { label: typed("tier 3"), price: "x" }] }));
    const listing = okOf(await w.act(A, sent.list(event, { qty: 2, ask: "35", paid: "40", payHandle: `@${typed("handle")}`.replace(/ /g, "-"), note: typed("listing note") })), "list").resultId!;
    okOf(await w.act(B, { ...sent.take(listing), msg: typed("take message") }), "take");
    await w.refused(B, { ...sent.offer(listing, "30"), msg: typed("offer message") }); // not taking offers
    okOf(await w.act(C, sent.request(event, { qty: 1, budget: "35", note: typed("request note"), expires: dateAfter(w.now, 5) })), "request");
    await w.refused(C, sent.request(event, { qty: 1, budget: "abc", note: typed("bad budget note"), expires: dateAfter(w.now, 5) }));
    const item = okOf(await w.act(A, sent.postItem(w.now, { title: typed("item"), area: typed("area"), note: typed("item note") })), "item").resultId!;
    await w.refused(A, sent.postItem(w.now, { title: typed("item 2"), price: "-5" }));
    okOf(await w.act(B, { type: "requestItem", id: item, msg: typed("goods message"), shareContact: false }), "requestItem");
    okOf(await w.act(A, { type: "seq", steps: [{ action: sent.postItem(w.now, { title: typed("seq item"), note: typed("seq note") }) }] }), "seq");
    const rows = await rdb.sql<{ type: string; ok: boolean; result: string; ids: string }[]>`
      SELECT type, ok, result::text AS result, ids::text AS ids FROM actions WHERE world_id = ${w.worldId}`;
    expect(rows.length).toBe(12);
    expect(rows.filter((x) => !x.ok).length).toBe(5);
    expect(rows.filter((x) => x.result.includes("CANARY") || x.ids.includes("CANARY")).map((x) => `${x.type}: ${x.result}`)).toEqual([]);
    expect(JSON.stringify((await w.row())!.doc)).toContain(typed("listing note")); // the scan can find them: the document keeps what was saved
  });

  it("answers a refresh as unchanged until the version moves or a hold lapses, even for a stranger who isn't told when", async () => {
    const { w, listing } = await listedWorld("test-real-refresh");
    okOf(await w.act(B, sent.take(listing)), "take");
    const c = await w.view(C);
    expect([c.version, c.nextRefreshAt]).toEqual([3, null]);
    expect(await refreshView(rdb.sql, { worldId: w.worldId, viewer: C, version: 3, nextRefreshAt: c.nextRefreshAt, now: LT0 + LMIN })).toEqual({ unchanged: true, version: 3 });
    const moved = await refreshView(rdb.sql, { worldId: w.worldId, viewer: C, version: 2, nextRefreshAt: null, now: LT0 + LMIN });
    expect(moved.unchanged === false && checked(moved.view, C.id).version).toBe(3);
    // C's next 60-second refresh after B's hold lapsed: next_due has passed, so it sweeps and brings the whole view.
    const due = await refreshView(rdb.sql, { worldId: w.worldId, viewer: C, version: 3, nextRefreshAt: c.nextRefreshAt, now: LT0 + 16 * LMIN });
    if (due.unchanged) throw new Error("the lapsed hold should bring a new view");
    expect(due.view.version).toBe(4);
    expect(due.view.listings[0]?.numbers.available).toBe(1);
  });

  it("brings the whole view at the tab's nextRefreshAt though nothing was stored then: a pickup window closing, a train leaving (review INT-1)", async () => {
    const w = world("test-real-refresh-at");
    const train = await w.createEvent(A, { kind: "train", title: "[Test] Amtrak: Philadelphia → New York", club: "Amtrak", cat: "Travel",
      start: `${dateAfter(LT0, 1)}T06:00`, openUntil: `${dateAfter(LT0, 3)}T23:00`, ticketType: "eticket", tiers: [{ label: "Coach", price: "40" }] });
    const departs = `${dateAfter(LT0, 1)}T10:00`;
    const listing = okOf(await w.act(A, { type: "addThen", add: { eventId: train, tier: "t1", qty: 1, paid: "40" }, then: {
      type: "list", qty: 1, ask: "35", note: "", viaOrganizer: false, restricted: false, method: "file", namesChecked: false, file: null,
      payHandle: "@a", membersOnly: false, obo: false, departsAt: departs } }), "the train listing").resultId!;
    const item = okOf(await w.act(A, sent.postItem(w.now, { until: dateAfter(LT0, 0) })), "an item until tonight").resultId!;
    const closes = E.atMs(dateAfter(LT0, 0)); // 23:59 tonight in Philadelphia
    const c0 = await w.view(C);
    expect(c0.nextRefreshAt).toBe(closes); // the item's pickup window closes first, then the train leaves
    expect((await w.row())!.next_due).toBeNull(); // and nothing stored is due at either time
    const refresh = (v: View, now: number) => refreshView(rdb.sql, { worldId: w.worldId, viewer: C, version: v.version, nextRefreshAt: v.nextRefreshAt, now });
    expect(await refresh(c0, closes - 1000)).toEqual({ unchanged: true, version: c0.version });
    const c1 = await refresh(c0, closes + 1000);
    if (c1.unchanged) throw new Error("the item's pickup window closed: the tab should get the whole view");
    expect(checked(c1.view, C.id).version).toBe(c0.version);
    expect(c1.view.goods.find((x) => x.id === item)?.state.key).toBe("closed");
    expect(c1.view.nextRefreshAt).toBe(E.wallToMs(departs));
    const leaves = E.wallToMs(departs);
    expect(await refresh(c1.view, leaves - 1000)).toEqual({ unchanged: true, version: c0.version });
    const c2 = await refresh(c1.view, leaves + 1000);
    if (c2.unchanged) throw new Error("the train left: the tab should get the whole view");
    expect(c2.view.listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 0, completed: 0, available: 0 });
    expect(c2.view.nextRefreshAt).toBeNull();
    expect(await refresh(c2.view, leaves + 60 * LMIN)).toEqual({ unchanged: true, version: c0.version });
  });

  it("shares one copy of the market per version among every view, and after another instance's write reads only the rows that changed (review of PR #88)", async () => {
    const pool = rdb.pool(2); // this test's own pool, so the counts are only its own
    const w = new StoreWorld(pool, "test-real-cache", LT0);
    const stats = () => documentCacheStats(pool);
    const event = await w.createEvent(A);
    const listing = await w.list(A, event, { qty: 2, ask: "35" });
    for (let i = 0; i < 6; i++) okOf(await w.act(A, sent.postItem(w.now, { title: `[Test] Thing ${i}` })), `item ${i}`); // more rows
    await w.view(B);
    const s0 = stats();
    // More tabs at the same version (B's again, C's): the same copy, nothing read but the version.
    await w.view(B);
    await w.view(C);
    expect(stats()).toMatchObject({ worlds: 1, hits: s0.hits + 2, misses: s0.misses, rowsRead: s0.rowsRead });

    // Another app instance (its own pool) takes one: this pool's next read misses, and reads only the row that changed.
    okOf(await new StoreWorld(rdb.pool(1), w.worldId, LT0).act(B, sent.take(listing)), "take from the other instance");
    expect((await w.view(A)).listings.find((l) => l.id === listing)?.numbers).toEqual({ reserved: 1, completed: 0, available: 1 });
    const s1 = stats();
    expect(s1.misses).toBe(s0.misses + 1);
    expect(s1.rowsRead - s0.rowsRead).toBe(1); // B's new reservation; every other row came from this pool's copy
    const total = await rdb.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM records WHERE world_id = ${w.worldId}`;
    expect(total[0]!.n).toBe(10); // the event, A's holding and listing, six items, and B's reservation

    // A manual fix to a row, which raises its revision (schema.sql says so), is read too, and the next write keeps it.
    await rdb.sql`
      UPDATE records SET data = jsonb_set(data, '{note}', '"Fixed by hand"'), rev = rev + 1, tally = tally + 1
      WHERE world_id = ${w.worldId} AND kind = 'listing' AND id = ${listing}`;
    expect((await w.view(A)).listings.find((l) => l.id === listing)?.note).toBe("Fixed by hand");
    expect(stats().rowsRead - s1.rowsRead).toBe(1);
    okOf(await w.act(C, sent.createEvent(w.now, { title: "[Test] Later" })), "a later write");
    expect((await w.row())!.doc.listings.find((l) => l.id === listing)?.note).toBe("Fixed by hand");
  });

  it("keeps cached documents frozen: an engine that writes into the document it was given fails, and nothing changes", async () => {
    const { w, listing } = await listedWorld("test-real-frozen");
    await w.view(B); // cached now
    const meddling: EnginePort = {
      ...enginePort,
      reduce(doc, actor, a) {
        (doc as unknown as LiveWorld).listings[0]!.ask = 1; // a write into the previous state: the cached document
        return enginePort.reduce(doc, actor, a);
      },
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const o = await applyAction(rdb.sql, { worldId: w.worldId, actor: B, requestId: randomUUID(), action: sent.take(listing), now: w.now }, meddling);
      expect(o).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
      expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
    } finally {
      log.mockRestore();
    }
    expect((await w.view(B)).listings[0]).toMatchObject({ ask: 35, numbers: { reserved: 0, completed: 0, available: 1 } });
    expect((await w.row())!.doc.listings[0]?.ask).toBe(35);
    expect(okOf(await w.act(B, sent.take(listing)), "the take, with the real engine").toast).toMatch(/^Reserved for 15 minutes\./);
  });

  it("caches only what was committed: a write that fails at COMMIT leaves no trace in any view", async () => {
    const pool = rdb.pool(1);
    const w = new StoreWorld(pool, "test-real-forget", LT0);
    const event = await w.createEvent(A);
    const listing = await w.list(A, event, { qty: 1, ask: "35" }); // version 2, cached
    await w.view(C);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failing = await w.act(B, sent.take(listing), { hooks: { async beforeCommit() { throw new Error("the connection dropped at COMMIT"); } } });
      expect(failing).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
    } finally {
      log.mockRestore();
    }
    const before = documentCacheStats(pool);
    const first = await w.view(C);
    const second = await w.view(C);
    expect([first.version, second.version]).toEqual([2, 2]);
    expect(second.listings[0]?.numbers).toEqual({ reserved: 0, completed: 0, available: 1 }); // the take never happened
    const after = documentCacheStats(pool);
    expect({ hits: after.hits - before.hits, misses: after.misses - before.misses }).toEqual({ hits: 2, misses: 0 }); // the copy from before
  });

  it("caches a world again after it was deleted and created anew (its version went back to 0)", async () => {
    const pool = rdb.pool(1);
    const w = new StoreWorld(pool, "test-real-reset", LT0);
    const event = await w.createEvent(A);
    await w.list(A, event, { qty: 1, ask: "35" });
    await w.list(B, event, { qty: 1, ask: "36" }); // version 3 is cached
    await rdb.sql`DELETE FROM worlds WHERE id = ${w.worldId}`;
    await w.createEvent(C); // a new world at version 1: the version-3 copy is another world's (made at another time), never this one's
    await w.createEvent(C, { title: "[Test] Second" });
    const before = documentCacheStats(pool);
    const view = await w.view(A);
    await w.view(B);
    const after = documentCacheStats(pool);
    expect(after.hits - before.hits).toBeGreaterThanOrEqual(1); // the new world is cached, and read from the cache
    expect(view.version).toBe(2);
    expect(view.events.map((e) => e.title).sort()).toEqual(["[Test] Second", "[Test] Spring Formal"]);
  });

  it("caches at most DOC_CACHE_WORLDS worlds per pool", async () => {
    const pool = rdb.pool(1);
    for (let i = 0; i < DOC_CACHE_WORLDS + 3; i++) okOf(await new StoreWorld(pool, `test-real-many-${i}`, LT0).act(A, sent.createEvent(LT0)), `world ${i}`);
    expect(documentCacheStats(pool).worlds).toBe(DOC_CACHE_WORLDS);
  });

  it("refuses a document in a format this code doesn't know, without changing it", async () => {
    const { w, listing } = await listedWorld("test-real-format");
    await plant(w.worldId, (doc) => { (doc as unknown as { format: number }).format = 2; });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await w.act(B, sent.take(listing))).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
      await expect(getView(rdb.sql, { worldId: w.worldId, viewer: B, now: w.now })).rejects.toThrow(/world format 1, not 2/);
    } finally {
      log.mockRestore();
    }
    const row = (await w.row())!;
    expect(row.version).toBe(2);
    expect((row.doc as unknown as WorldDoc)["format"]).toBe(2);
  });
});
