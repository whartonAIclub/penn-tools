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
import { CONSENT_VERSION, EMAIL_UNAVAILABLE_ERROR, NOT_FOR_THIS_ACCOUNT_ERROR, NO_EMAIL_ADDRESS_ERROR } from "../email/prefs.js";
import type { SignInKind } from "../email/types.js";
import {
  EMAIL_PREFS_INVALID,
  EMAIL_PREFS_SAVED,
  PAY_METHODS_INVALID,
  STALE_ERRORS,
  handleAct,
  handleMarkRead,
  handleRefresh,
  handleSaveEmailPrefs,
  handleSaveMyProfile,
  type ActAnswer,
  type ActionContext,
  type RefreshAnswer,
  type SessionUser,
} from "../handlers.js";
import { BAD_REQUEST_ERROR, INTERNAL_ERROR } from "../store.js";
import type { View, WorldId } from "../types.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { heartbeat } from "./helpers/email-db.js";
import { TEST_A, TEST_B, actions as sent, checked, wallAfter } from "./helpers/live-store.js";

const A: SessionUser = TEST_A;
const B: SessionUser = TEST_B;
const WORLD: WorldId = "test-handlers";

let db: TestDb;

/**
 * What actions.ts supplies, with a record of what the handler asked for, in order. `signIn` is the server's sign-in provider ("dev"
 * by default, as in local development); null leaves it out, as the contexts written before follow-on B4 do.
 */
function context(o: { user?: SessionUser | null | Error; sql?: Sql | null; world?: WorldId; signIn?: SignInKind | null } = {}): { ctx: ActionContext; asked: string[] } {
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
  if (o.signIn !== null) {
    ctx.signIn = () => {
      asked.push("signIn");
      return o.signIn ?? "dev";
    };
  }
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

  it("saveEmailPrefs: signed out, another account or another protocol is stale before anything else, and the sign-in is never asked", async () => {
    const on = { exchange: true };
    const signedOut = context({ user: null, sql: null });
    expect(await handleSaveEmailPrefs(signedOut.ctx, { ...guard(), ...on })).toEqual({ ok: false, code: "signed_out", error: STALE_ERRORS.signed_out });
    expect(signedOut.asked).toEqual(["user"]);
    const other = context({ sql: null });
    expect(await handleSaveEmailPrefs(other.ctx, { ...guard(B), ...on })).toEqual({ ok: false, code: "account_changed", error: STALE_ERRORS.account_changed });
    expect(other.asked).toEqual(["user"]);
    const old = context({ sql: null });
    expect(await handleSaveEmailPrefs(old.ctx, { viewerId: A.id, protocol: HANDOFF_PROTOCOL + 1, ...on })).toEqual({ ok: false, code: "reload", error: STALE_ERRORS.reload });
    expect(old.asked).toEqual(["user"]);
    const noDb = context({ sql: null });
    expect(await handleSaveEmailPrefs(noDb.ctx, { ...guard(), ...on })).toEqual({ ok: false, code: "unavailable", reason: "no-database", error: unavailableMessage("no-database") });
    expect(noDb.asked).toEqual(["user", "sql"]);
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

  // ── saveEmailPrefs (follow-on B4) ─────────────────────────────────────────────────────

  /** The person's stored preferences, or undefined. */
  const prefsOf = async (u: SessionUser) =>
    (await db.sql<{ address: string; sign_in: string; exchange_on: boolean; matches_on: boolean; consent_version: string }[]>`
      SELECT address, sign_in, exchange_on, matches_on, consent_version FROM email_prefs WHERE user_id = ${u.id}`)[0];
  /** A refusal's words, after checking it came with the fresh view, as every refusal does. */
  const refusedWith = (o: ActAnswer, viewer: SessionUser): string => {
    if (o.ok || o.code !== "refused") throw new Error(`expected a refusal, got ${JSON.stringify(o.ok ? "ok" : o.code)}`);
    checked(o.view, viewer.id); // the contract, the owner's email envelope included
    expect(o.view.email).toBeDefined();
    return o.error;
  };
  /** A dispatcher heartbeat from just now (the handler runs at the database's clock), or none. */
  const beat = async (sender: "capture" | "provider" | null): Promise<void> => {
    await db.sql`DELETE FROM email_dispatch`;
    if (sender) await heartbeat(db.sql, sender, Date.now());
  };

  it("saveEmailPrefs: neither category, or anything but true or false, is invalid, and nothing is stored", async () => {
    await beat("capture");
    for (const input of [{}, { exchange: "yes" }, { matches: 1 }, { exchange: null }, { exchange: true, matches: "no" }, { exchange: undefined }]) {
      expect(await handleSaveEmailPrefs(context().ctx, { ...guard(), ...input }), JSON.stringify(input)).toEqual({ ok: false, code: "invalid", error: EMAIL_PREFS_INVALID });
    }
    expect(await prefsOf(A)).toBeUndefined();
  });

  it("saveEmailPrefs: turning on is refused while email isn't available, and for an account without an address; nothing is stored", async () => {
    await beat(null);
    const unavailable = await handleSaveEmailPrefs(context().ctx, { ...guard(), exchange: true });
    expect(refusedWith(unavailable, A)).toBe(EMAIL_UNAVAILABLE_ERROR);
    if (!unavailable.ok && unavailable.code === "refused") {
      expect(unavailable.view.email).toEqual({ available: false, mode: null, address: A.email, exchange: false, matches: false, reconfirm: false, paused: false });
    }
    await beat("provider"); // a provider's heartbeat doesn't make email available in a test world: that's the capture's
    expect(refusedWith(await handleSaveEmailPrefs(context().ctx, { ...guard(), matches: true }), A)).toBe(EMAIL_UNAVAILABLE_ERROR);
    expect(await prefsOf(A)).toBeUndefined();
    await beat("capture");
    const noAddress: SessionUser = { id: "handoff-test-no-address", name: "Handoff Test No Address", email: null };
    expect(refusedWith(await handleSaveEmailPrefs(context({ user: noAddress }).ctx, { ...guard(noAddress), exchange: true }), noAddress)).toBe(NO_EMAIL_ADDRESS_ERROR);
    expect(await prefsOf(noAddress)).toBeUndefined();
  });

  it("saveEmailPrefs: turns a category on with the session's address and sign-in, never ones the page sends; the development sign-in is recorded as such", async () => {
    await beat("capture");
    const { ctx, asked } = context({ signIn: "dev" });
    const planted = { address: "planted@upenn.edu", email: "planted@upenn.edu", signIn: "google", sign_in: "google", userId: B.id };
    const on = await handleSaveEmailPrefs(ctx, { ...guard(), exchange: true, ...planted });
    if (!on.ok) throw new Error(`saveEmailPrefs: ${on.code}`);
    expect(on).toMatchObject({ replay: false, toast: EMAIL_PREFS_SAVED, resultId: null });
    expect(checked(on.view, A.id).viewer.id).toBe(A.id);
    // The answer's view shows the result: on, for the session's own address.
    expect(on.view.email).toEqual({ available: true, mode: "capture", address: A.email, exchange: true, matches: false, reconfirm: false, paused: false });
    expect(asked).toEqual(["user", "sql", "world", "signIn"]);
    expect(await prefsOf(A)).toEqual({ address: A.email, sign_in: "dev", exchange_on: true, matches_on: false, consent_version: CONSENT_VERSION });
    expect(await prefsOf(B)).toBeUndefined();
    // A context that doesn't say how the session signed in counts as the development sign-in; only "google" is Google.
    const C: SessionUser = { id: "handoff-test-email-c", name: "Handoff Test Email C", email: "handoff-test-email-c@example.invalid" };
    expect(await handleSaveEmailPrefs(context({ user: C, signIn: null }).ctx, { ...guard(C), matches: true })).toMatchObject({ ok: true });
    expect((await prefsOf(C))?.sign_in).toBe("dev");
    const D: SessionUser = { id: "handoff-test-email-d", name: "Handoff Test Email D", email: "handoff-test-email-d@example.invalid" };
    expect(await handleSaveEmailPrefs(context({ user: D, signIn: "google" }).ctx, { ...guard(D), matches: true })).toMatchObject({ ok: true });
    expect((await prefsOf(D))?.sign_in).toBe("google");
  });

  it("saveEmailPrefs: real email (live) is never turned on for the development identity or a TEST account; a Penn Google account can", async () => {
    // This schema's own "live": nothing in it is written (a view of it creates no world), and the provider's heartbeat is a row here.
    await beat("provider");
    const live = { world: "live" as WorldId };
    const localDev: SessionUser = { id: "local-dev-user", name: "Local Developer", email: "dev@localhost" };
    const pennTest: SessionUser = { id: "handoff-test-penn", name: "Handoff Test Penn", email: "handoff-test-penn@wharton.upenn.edu" };
    const penn: SessionUser = { id: "penn-ann-lee", name: "Ann Lee", email: "ann.lee@wharton.upenn.edu" };
    for (const [who, signIn] of [[localDev, "dev"], [localDev, "google"], [pennTest, "google"], [penn, "dev"]] as const) {
      const o = await handleSaveEmailPrefs(context({ ...live, user: who, signIn }).ctx, { ...guard(who), exchange: true });
      expect(refusedWith(o, who), `${who.id} ${signIn}`).toBe(NOT_FOR_THIS_ACCOUNT_ERROR);
      expect(await prefsOf(who)).toBeUndefined();
    }
    expect(await handleSaveEmailPrefs(context({ ...live, user: penn, signIn: "google" }).ctx, { ...guard(penn), exchange: true })).toMatchObject({ ok: true, toast: EMAIL_PREFS_SAVED });
    expect(await prefsOf(penn)).toMatchObject({ address: penn.email, sign_in: "google", exchange_on: true });
    // Without a working provider, live isn't available even for them.
    await beat("capture");
    expect(refusedWith(await handleSaveEmailPrefs(context({ ...live, user: penn, signIn: "google" }).ctx, { ...guard(penn), matches: true }), penn)).toBe(EMAIL_UNAVAILABLE_ERROR);
    expect(await db.sql`SELECT 1 FROM worlds WHERE id = 'live'`).toHaveLength(0);
  });

  it("saveEmailPrefs: turning off always works, with no dispatcher and no address, and skips that person's waiting emails", async () => {
    await beat("capture");
    const E: SessionUser = { id: "handoff-test-email-e", name: "Handoff Test Email E", email: "handoff-test-email-e@example.invalid" };
    expect(await handleSaveEmailPrefs(context({ user: E }).ctx, { ...guard(E), exchange: true, matches: true })).toMatchObject({ ok: true });
    // One email waiting for E in another world (as the store queues it): a notification and its job.
    await db.sql`INSERT INTO worlds (id, doc) VALUES ('test-handlers-email', '{"mode":"live"}') ON CONFLICT (id) DO NOTHING`;
    await db.sql`INSERT INTO notifications (world_id, id, user_id, text, dedupe, at) VALUES ('test-handlers-email', 'n-email-e', ${E.id}, 'Hi', md5('n-email-e'), NOW())`;
    await db.sql`
      INSERT INTO email_jobs (world_id, notification_id, user_id, kind, category, ref, link, event_key, retry_at, expires_at, created_at)
      VALUES ('test-handlers-email', 'n-email-e', ${E.id}, 'offer.received', 'exchange', 'r1', '{"name":"activity"}', ${`${randomUUID()}:offer.received:r1`},
              NOW(), NOW() + interval '1 day', NOW())`;
    await beat(null); // email isn't available any more, and the account has lost its address
    const noAddress: SessionUser = { ...E, email: null };
    const off = await handleSaveEmailPrefs(context({ user: noAddress }).ctx, { ...guard(noAddress), exchange: false });
    expect(off).toMatchObject({ ok: true, toast: EMAIL_PREFS_SAVED });
    expect(await prefsOf(E)).toMatchObject({ exchange_on: false, matches_on: false }); // matches went off with the address it was for
    const [job] = await db.sql<{ status: string; reason: string | null }[]>`SELECT status, reason FROM email_jobs WHERE notification_id = 'n-email-e'`;
    expect(job).toEqual({ status: "skipped", reason: "opted_out" });
    // Off again, or off for someone who never turned anything on: still fine, and nothing is created for them.
    expect(await handleSaveEmailPrefs(context({ user: noAddress }).ctx, { ...guard(noAddress), exchange: false, matches: false })).toMatchObject({ ok: true });
    const F: SessionUser = { id: "handoff-test-email-f", name: "Handoff Test Email F", email: null };
    expect(await handleSaveEmailPrefs(context({ user: F }).ctx, { ...guard(F), matches: false })).toMatchObject({ ok: true });
    expect(await prefsOf(F)).toBeUndefined();
  });
});
