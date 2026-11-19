// The server actions' logic (handlers.ts; C-DESIGN §2.4, C-CONTRACT §1 and §4) against a real Postgres, with the real engine
// and the database's clock, as actions.ts runs them. The session's user, the pool and the world are supplied the way
// actions.ts supplies them (getCurrentUser, toolSql, resolveWorldId), here by the test, which records what was asked for.
// Labelled TEST users with made-up ids; no session cookie and no sign-in of any kind.

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HANDOFF_PROTOCOL } from "../../engine/index.js";
import { unavailableMessage } from "../db-errors.js";
import {
  PAY_METHODS_INVALID,
  STALE_ERRORS,
  handleAct,
  handleMarkRead,
  handleRefresh,
  handleSaveMyProfile,
  type ActAnswer,
  type ActionContext,
  type RefreshAnswer,
  type SessionUser,
} from "../handlers.js";
import { BAD_REQUEST_ERROR, INTERNAL_ERROR } from "../store.js";
import type { View, WorldId } from "../types.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { TEST_A, TEST_B, actions as sent, checked, wallAfter } from "./helpers/live-store.js";

const A: SessionUser = TEST_A;
const B: SessionUser = TEST_B;
const WORLD: WorldId = "test-handlers";

let db: TestDb;

/** What actions.ts supplies, with a record of what the handler asked for, in order. */
function context(o: { user?: SessionUser | null | Error; sql?: Sql | null; world?: WorldId } = {}): { ctx: ActionContext; asked: string[] } {
  const asked: string[] = [];
  const ctx: ActionContext = {
    async user() {
      asked.push("user");
      if (o.user instanceof Error) throw o.user;
      return o.user === undefined ? A : o.user;
    },
    sql() {
      asked.push("sql");
      return o.sql === undefined ? db.sql : o.sql;
    },
    worldId() {
      asked.push("world");
      return o.world ?? WORLD;
    },
  };
  return { asked, ctx };
}

const guard = (viewer: SessionUser = A) => ({ viewerId: viewer.id, protocol: HANDOFF_PROTOCOL });

/** A signed-in page's refresh that brings the whole view: never "unchanged", a stale answer, a failure or the guest view. */
function wholeView(r: RefreshAnswer, what: string): View {
  if (!("unchanged" in r) || r.unchanged) throw new Error(`${what}: expected the whole view`);
  const view = r.view;
  if ("guest" in view) throw new Error(`${what}: a signed-in page got the guest view`);
  return view;
}

describe("the server actions' guards (no database needed)", () => {
  it("answers signed_out first, without asking for the pool or the world", async () => {
    const { ctx, asked } = context({ user: null, sql: null });
    expect(await handleAct(ctx, { viewerId: "someone", protocol: 999, requestId: randomUUID(), action: {} })).toEqual({ ok: false, code: "signed_out", error: STALE_ERRORS.signed_out });
    expect(asked).toEqual(["user"]);
  });

  it("answers account_changed when the tab's account isn't the session's, and does nothing else", async () => {
    for (const input of [{ ...guard(B) }, { protocol: HANDOFF_PROTOCOL }, { viewerId: A.id.toUpperCase(), protocol: HANDOFF_PROTOCOL }, null, "x", [guard()], { ...guard(B), protocol: 999 }]) {
      const { ctx, asked } = context({ sql: null });
      expect(await handleRefresh(ctx, input), JSON.stringify(input)).toEqual({ ok: false, code: "account_changed", error: STALE_ERRORS.account_changed });
      expect(asked).toEqual(["user"]);
    }
  });

  it("answers reload when the protocol differs (a new deploy), before touching the database", async () => {
    for (const protocol of [HANDOFF_PROTOCOL + 1, 0, "1", undefined]) {
      const { ctx, asked } = context({ sql: null });
      expect(await handleSaveMyProfile(ctx, { viewerId: A.id, protocol, payHandle: "@a" })).toEqual({ ok: false, code: "reload", error: STALE_ERRORS.reload });
      expect(asked).toEqual(["user"]);
    }
  });

  it("answers unavailable (no-database) when the server has no database, and never asks for the world", async () => {
    const { ctx, asked } = context({ sql: null });
    expect(await handleAct(ctx, { ...guard(), requestId: randomUUID(), action: { type: "take" } })).toEqual({
      ok: false, code: "unavailable", reason: "no-database", error: unavailableMessage("no-database"),
    });
    expect(asked).toEqual(["user", "sql"]);
    expect(await handleMarkRead(context({ sql: null }).ctx, { ...guard(), ids: "all" })).toEqual({ ok: false, code: "unavailable" });
  });

  it("turns a failure to read the session into unavailable or internal, logging no message", async () => {
    const down = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), { code: "ECONNREFUSED" });
    expect(await handleRefresh(context({ user: down }).ctx, { ...guard(), version: 0, nextRefreshAt: null })).toEqual({
      ok: false, code: "unavailable", reason: "down", error: unavailableMessage("down"),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await handleAct(context({ user: new Error("session store blew up at CANARY") }).ctx, { ...guard(), requestId: randomUUID(), action: {} })).toEqual({
        ok: false, code: "internal", error: INTERNAL_ERROR,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("CANARY");
      expect(JSON.stringify(log.mock.calls)).toContain("[handoff] act failed");
    } finally {
      log.mockRestore();
    }
  });

});

describe.skipIf(!databaseUrl)("the server actions with the real engine (Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("handlers");
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("act: runs the action as the session's user at the database's clock, and a retry with the same id replays", async () => {
    const { ctx, asked } = context();
    const requestId = randomUUID();
    const input = { ...guard(), requestId, action: sent.createEvent(Date.now(), { start: wallAfter(Date.now(), 10) }) };
    const first = await handleAct(ctx, input);
    expect(asked).toEqual(["user", "sql", "world"]);
    if (!first.ok) throw new Error(`createEvent: ${first.code}`);
    expect(first).toMatchObject({ replay: false, resultId: expect.stringMatching(/^ev-[0-9a-f]{16}$/) });
    const view = checked(first.view, A.id);
    expect(view.events[0]?.addedBy).toBe(A.id);
    expect(Math.abs(view.serverNow - Date.now())).toBeLessThan(60_000);
    expect(await handleAct(context().ctx, input)).toMatchObject({ ok: true, replay: true, resultId: first.resultId });
    // A malformed request id, or none, is invalid, and nothing happens.
    for (const bad of [{ ...input, requestId: "not-a-uuid" }, { ...input, requestId: undefined }]) {
      expect(await handleAct(context().ctx, bad)).toEqual({ ok: false, code: "invalid", error: BAD_REQUEST_ERROR });
    }
    const [row] = await db.sql<{ version: number }[]>`SELECT version FROM worlds WHERE id = ${WORLD}`;
    expect(row?.version).toBe(1);
  });

  it("act: who acts is the session's user, whatever the tab says: B's tab can't act as A", async () => {
    const { ctx } = context({ user: B });
    const o = await handleAct(ctx, { viewerId: A.id, protocol: HANDOFF_PROTOCOL, requestId: randomUUID(), action: { type: "withdraw", listingId: "l0000000000000000" } });
    expect(o).toEqual({ ok: false, code: "account_changed", error: STALE_ERRORS.account_changed });
  });

  it("act: a pool whose search_path has no Handoff tables is unavailable (not-set-up)", async () => {
    const missing = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: "handoff_test_missing" } });
    try {
      const o = await handleAct(context({ sql: missing }).ctx, { ...guard(), requestId: randomUUID(), action: sent.createEvent(Date.now()) });
      expect(o).toEqual({ ok: false, code: "unavailable", reason: "not-set-up", error: unavailableMessage("not-set-up") });
      expect(await handleRefresh(context({ sql: missing }).ctx, { ...guard(), version: 0, nextRefreshAt: null })).toMatchObject({ ok: false, code: "unavailable", reason: "not-set-up" });
    } finally {
      await missing.end({ timeout: 5 });
    }
  });

  it("refresh: unchanged at the current version, the whole view otherwise, and for a version the tab can't have had", async () => {
    const [row] = await db.sql<{ version: number }[]>`SELECT version FROM worlds WHERE id = ${WORLD}`;
    const version = row!.version;
    expect(await handleRefresh(context({ user: B }).ctx, { ...guard(B), version, nextRefreshAt: null })).toEqual({ unchanged: true, version });
    for (const v of [version - 1, -3, 1.5, "1", undefined]) {
      const r = await handleRefresh(context({ user: B }).ctx, { ...guard(B), version: v, nextRefreshAt: null });
      expect(checked(wholeView(r, `version ${String(v)}`), B.id).version).toBe(version);
    }
  });

  it("refresh: the whole view once the tab's own nextRefreshAt has come, or when it sends none we can read (review INT-1)", async () => {
    const [row] = await db.sql<{ version: number }[]>`SELECT version FROM worlds WHERE id = ${WORLD}`;
    const version = row!.version;
    const later = Date.now() + 3_600_000;
    expect(await handleRefresh(context({ user: B }).ctx, { ...guard(B), version, nextRefreshAt: later })).toEqual({ unchanged: true, version });
    // A time that has come (by the database's clock), or a missing or malformed one: the whole view at the same version.
    for (const at of [Date.now() - 1000, 1, undefined, "soon", Number.NaN, [later]]) {
      const input = at === undefined ? { ...guard(B), version } : { ...guard(B), version, nextRefreshAt: at };
      const r = await handleRefresh(context({ user: B }).ctx, input);
      expect(checked(wholeView(r, `nextRefreshAt ${JSON.stringify(at)}`), B.id).version).toBe(version);
    }
  });

  it("markRead: the user's own notifications only, some or all; anything else is invalid", async () => {
    // B posts a public request on A's event, and A has a listing there, so A is told.
    const { ctx } = context();
    const created = await handleAct(ctx, { ...guard(), requestId: randomUUID(), action: sent.createEvent(Date.now(), { title: "[Test] Notes" }) });
    if (!created.ok) throw new Error("createEvent");
    // As the page's Sell does for a first listing (follow-on B1): how buyers pay A is saved to A's profile first.
    expect(await handleSaveMyProfile(ctx, { ...guard(), payMethods: [{ kind: "venmo", value: "@hand-test-a" }] })).toMatchObject({ ok: true });
    const listed = await handleAct(ctx, { ...guard(), requestId: randomUUID(), action: sent.list(created.resultId!, { qty: 1, ask: "35", paid: "40", payHandle: "@a" }) });
    expect(listed.ok).toBe(true);
    const posted = await handleAct(context({ user: B }).ctx, { ...guard(B), requestId: randomUUID(), action: sent.request(created.resultId!, { qty: 1, budget: "35", note: "", expires: wallAfter(Date.now(), 3).slice(0, 10) }) });
    expect(posted.ok).toBe(true);
    const unread = async (u: SessionUser) => wholeView(await handleRefresh(context({ user: u }).ctx, { ...guard(u), version: -1, nextRefreshAt: null }), "unread");
    const a = await unread(A);
    expect(a.unreadCount).toBe(1);
    expect(await handleMarkRead(context({ user: B }).ctx, { ...guard(B), ids: a.notifications.map((n) => n.id) })).toEqual({ ok: true });
    expect((await unread(A)).unreadCount).toBe(1); // B's call changed nothing of A's
    for (const ids of [undefined, "some", [1, 2], [null], { 0: "x" }, Array.from({ length: 501 }, () => "x")]) {
      expect(await handleMarkRead(context().ctx, { ...guard(), ids }), JSON.stringify(ids)?.slice(0, 40)).toEqual({ ok: false, code: "invalid" });
    }
    expect(await handleMarkRead(context().ctx, { ...guard(), ids: [a.notifications[0]!.id] })).toEqual({ ok: true });
    expect((await unread(A)).unreadCount).toBe(0);
    expect(await handleMarkRead(context().ctx, { ...guard(), ids: "all" })).toEqual({ ok: true });
  });

  it("saveMyProfile: saves or removes the payment methods and answers with the fresh view; a bad one is refused with the view", async () => {
    const C: SessionUser = { id: "handoff-test-new", name: "Handoff Test New", email: "handoff-test-new@example.invalid" };
    const saved = await handleSaveMyProfile(context({ user: C }).ctx, { ...guard(C), payMethods: [{ kind: "venmo", value: "  @hand-test-new  " }] });
    if (!saved.ok) throw new Error(`save: ${saved.code}`);
    expect(saved).toMatchObject({ replay: false, toast: "Payment methods saved.", resultId: null });
    // Normalized (Venmo without its "@"); since protocol 2 the viewer carries no legacy handle beside them.
    expect(checked(saved.view, C.id).viewer).toEqual({ id: C.id, name: C.name, email: C.email, payMethods: [{ kind: "venmo", value: "hand-test-new" }] });
    const wrong = await handleSaveMyProfile(context({ user: C }).ctx, { ...guard(C), payMethods: [{ kind: "venmo", value: "ann lee" }] });
    expect(wrong).toMatchObject({ ok: false, code: "refused", error: "Venmo: enter your username, like @ann-lee.", replay: false });
    if (wrong.ok || wrong.code !== "refused") throw new Error("expected a refusal");
    expect(wrong.view.viewer.payMethods).toEqual([{ kind: "venmo", value: "hand-test-new" }]);
    // The page before protocol 2 sent one payHandle: on its own it's invalid now, and nothing changes.
    for (const input of [{ payHandle: "@hand-test-old" }, { payHandle: 42 }, { payMethods: "venmo" }, {}]) {
      expect(await handleSaveMyProfile(context({ user: C }).ctx, { ...guard(C), ...input }), JSON.stringify(input)).toEqual({ ok: false, code: "invalid", error: PAY_METHODS_INVALID });
    }
    const removed = await handleSaveMyProfile(context({ user: C }).ctx, { ...guard(C), payMethods: [] });
    expect(removed).toMatchObject({ ok: true, toast: "Payment methods removed." });
    if (removed.ok) expect(removed.view.viewer.payMethods).toEqual([]);
  });
});
