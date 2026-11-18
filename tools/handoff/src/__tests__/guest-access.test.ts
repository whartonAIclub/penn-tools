// Guest access through the store and the server actions (C-CONTRACT.md §7; store.ts getGuestView and refreshGuestView,
// handlers.ts), against a real Postgres (a throwaway schema) with the real engine:
// - A guest read writes nothing and takes no lock: no profile row, no world, no expiry sweep, no action or notification, even
//   while a stored deadline is past due; the engine runs it with no one's profile row.
// - A guest's counts are a signed-in classmate's, through the store, right after a hold, a sale, the last unit and a lapse.
// - refreshGuestView answers "unchanged" on refreshView's terms, and otherwise brings the whole guest view.
// - The server actions: a refresh from a signed-out visitor's page (viewerId null) gets the guest view, never a personal one; a
//   page that had an account gets signed_out; a visitor's page after they signed in gets account_changed. Every change without a
//   session is signed_out before anything is read (all 40 action types, seq, unknown types, markRead, saveMyProfile), and
//   nothing changes.
// Labelled TEST users with made-up ids and @example.invalid emails. No session cookie and no sign-in of any kind: the handlers
// get the session's user from the test, as actions.ts gets it from getCurrentUser.

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HANDOFF_PROTOCOL } from "../../engine/index.js";
import { unavailableMessage } from "../db-errors.js";
import { enginePort, type EnginePort } from "../engine-port.js";
import { STALE_ERRORS, handleAct, handleMarkRead, handleRefresh, handleSaveMyProfile, type ActionContext, type SessionUser } from "../handlers.js";
import { LIVE_ACTIONS, parseAction } from "../live.js";
import { applyAction, getGuestView, refreshGuestView } from "../store.js";
import type { GuestView, View, WorldId } from "../types.js";
import { guestContractViolations } from "./helpers/contract.js";
import { createTestDb, databaseUrl, deferred, type TestDb } from "./helpers/db.js";
import { MIN, StoreWorld, T0, TEST_A as A, TEST_B as B, TEST_C as C, actions, checked, dateAfter, wallAfter } from "./helpers/live-store.js";
import { toyControls, toyPort } from "./helpers/toy-port.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

const D: SessionUser = { id: "handoff-test-d", name: "Handoff Test D", email: "handoff-test-d@example.invalid" };

let db: TestDb;

/** Everything a guest call could change: the worlds (version, row identity, due time, document), profiles, and every other table. */
async function dbState(): Promise<unknown> {
  const worlds = await db.sql`SELECT id, version, xmin::text AS xmin, next_due, md5(doc::text) AS doc, updated_at FROM worlds ORDER BY id`;
  const people = await db.sql`SELECT user_id, name, email, pay_handle, updated_at FROM people ORDER BY user_id`;
  const counts = await db.sql`
    SELECT (SELECT count(*)::int FROM actions) AS actions, (SELECT count(*)::int FROM notifications) AS notifications,
           (SELECT count(*)::int FROM notifications WHERE read_at IS NOT NULL) AS read, (SELECT count(*)::int FROM world_snapshots) AS snapshots`;
  return JSON.parse(JSON.stringify({ worlds, people, counts }));
}

/** A guest view, checked against C-CONTRACT §7. */
function guestChecked(g: GuestView): GuestView {
  expect(guestContractViolations(g), "the guest contract").toEqual([]);
  return g;
}

const sleep = (ms: number) => new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

// One throwaway schema for the whole file (each block below skips without a database).
beforeAll(async () => {
  if (databaseUrl) db = await createTestDb("guest");
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe.skipIf(!databaseUrl)("guest access through the store (real engine, Postgres)", () => {
  it("an empty world: an empty guest view at version 0, and nothing is created (no world row, no profile row)", async () => {
    const before = await dbState();
    expect(before).toMatchObject({ worlds: [], people: [] });
    const v = guestChecked(await getGuestView(db.sql, { worldId: "test-guest-empty", now: T0 }));
    expect(v).toEqual({ protocol: HANDOFF_PROTOCOL, mode: "live", guest: true, viewer: null, worldId: "test-guest-empty", version: 0, serverNow: T0,
      nextRefreshAt: null, events: [], listings: [], goods: [], wanted: [], closedWanted: [] }); // closedWanted: SELL6-N1 (§9x item 1)
    expect(await refreshGuestView(db.sql, { worldId: "test-guest-empty", version: 0, nextRefreshAt: null, now: T0 })).toEqual({ unchanged: true, version: 0 });
    expect(await dbState()).toEqual(before);
  });

  it("a guest's counts are a signed-in classmate's after a hold, a sale and the last unit; a lapse shows at once, with nothing written", async () => {
    const w = new StoreWorld(db.sql, "test-guest-counts", T0);
    const ev = await w.createEvent(A);
    const l = await w.list(A, ev, { qty: 2, ask: "35" });
    const guestCount = async () => guestChecked(await getGuestView(db.sql, { worldId: w.worldId, now: w.now })).listings.find((x) => x.id === l)?.available;
    const classmateCount = async () => (await w.view(C)).listings.find((x) => x.id === l)?.numbers.available;
    expect([await guestCount(), await classmateCount()]).toEqual([2, 2]);
    const r1 = (await w.ok(B, actions.take(l))).resultId!;
    expect([await guestCount(), await classmateCount()]).toEqual([1, 1]);
    for (const [who, type] of [[B, "markPaid"], [A, "confirmPayment"], [A, "markTransferred"], [B, "buyerReceived"]] as const) await w.ok(who, actions.onRequest(type, r1));
    expect([await guestCount(), await classmateCount()]).toEqual([1, 1]); // sold: still 1 left
    const r2 = (await w.ok(D, actions.take(l))).resultId!; // the last one, held for D
    expect([await guestCount(), await classmateCount()]).toEqual([undefined, 0]); // nobody could take one now: not in the guest view

    // D's hold lapses, and no one signed in reads: the stored deadline is past due.
    const held = (await w.row())!.doc.requests.find((x) => x.id === r2)!.holdUntil!;
    w.advance(held - w.now + MIN);
    const row = (await w.row())!;
    expect(row.next_due!.getTime()).toBeLessThanOrEqual(w.now);
    const before = await dbState();
    const g = guestChecked(await getGuestView(db.sql, { worldId: w.worldId, now: w.now }));
    expect([g.version, g.listings.find((x) => x.id === l)?.available]).toEqual([row.version, 1]); // back at once, before any sweep
    // Due: each guest refresh brings the whole view (built at its time) until a signed-in read stores the sweep.
    const due = await refreshGuestView(db.sql, { worldId: w.worldId, version: g.version, nextRefreshAt: g.nextRefreshAt, now: w.now });
    expect(due.unchanged).toBe(false);
    expect(await dbState()).toEqual(before); // no sweep, no profile row, no action, nothing at all
    // A signed-in classmate's read sweeps it; the counts still agree, and the guest's refresh goes quiet.
    expect(await classmateCount()).toBe(1);
    const swept = (await w.row())!;
    expect(swept.version).toBe(row.version + 1);
    const g2 = guestChecked(await getGuestView(db.sql, { worldId: w.worldId, now: w.now }));
    expect(g2.listings.find((x) => x.id === l)?.available).toBe(1);
    expect(await refreshGuestView(db.sql, { worldId: w.worldId, version: g2.version, nextRefreshAt: g2.nextRefreshAt, now: w.now })).toEqual({ unchanged: true, version: g2.version });
  });

  it("takes no lock: a guest read and refresh go through while a writer holds the world's row", async () => {
    const w = new StoreWorld(db.sql, "test-guest-lock", T0);
    const ev = await w.createEvent(A);
    await w.list(A, ev, { qty: 1, ask: "35" });
    const holder = db.pool(1);
    const locked = deferred();
    const release = deferred();
    const tx = holder.begin(async (t) => {
      await (t as unknown as Sql)`SELECT version FROM worlds WHERE id = ${w.worldId} FOR UPDATE`;
      locked.resolve();
      await release.promise;
    });
    try {
      await locked.promise;
      const read = await Promise.race([getGuestView(db.sql, { worldId: w.worldId, now: w.now }), sleep(3000)]);
      expect(read).not.toBe("timeout");
      const refresh = await Promise.race([refreshGuestView(db.sql, { worldId: w.worldId, version: -1, nextRefreshAt: null, now: w.now }), sleep(3000)]);
      expect(refresh).not.toBe("timeout");
      if (read === "timeout") throw new Error("unreachable");
      expect(read.listings).toHaveLength(1);
    } finally {
      release.resolve();
      await tx;
    }
  });

  it("the engine runs a guest view with no one's profile row, and the guest view is the same whoever has a profile", async () => {
    const w = new StoreWorld(db.sql, "test-guest-people", T0);
    const ev = await w.createEvent(A, { notes: "CANARY-EVENT-NOTE" });
    await w.list(A, ev, { qty: 2, ask: "35" });
    const runs: number[] = [];
    const spy: EnginePort = { ...enginePort, run: (ctx, fn) => { runs.push(ctx.people.length); return enginePort.run(ctx, fn); } };
    const g = await getGuestView(db.sql, { worldId: w.worldId, now: w.now }, spy);
    await refreshGuestView(db.sql, { worldId: w.worldId, version: -1, nextRefreshAt: null, now: w.now }, spy);
    expect(runs).toEqual([0, 0]);
    const text = JSON.stringify(g);
    for (const v of [A.id, A.name!, "Handoff A.", A.email!, "@handoff-test-a", "CANARY-EVENT-NOTE"]) expect(text, v).not.toContain(v);
    // The signed-in view of the same world names A (the canaries are real).
    expect(JSON.stringify(await w.view(B))).toContain("Handoff A.");
  });
});

describe.skipIf(!databaseUrl)("refreshGuestView's answers (the store's stand-in engine, Postgres)", () => {
  const ann = { id: "user-ann", name: "Ann Lee", email: "ann@example.invalid" };
  const bob = { id: "user-bob", name: "Bob Diaz", email: "bob@example.invalid" };
  const act = (actor: typeof ann, action: Record<string, unknown>, now: number) =>
    applyAction(db.sql, { worldId: "test-guest-toy", actor, requestId: randomUUID(), action, now }, toyPort);

  it("unchanged at the tab's version while nothing is due and its nextRefreshAt hasn't come; the whole guest view otherwise; never a sweep", async () => {
    const W: WorldId = "test-guest-toy";
    expect((await act(ann, { type: "stock", item: "i-one", listed: 2 }, T0)).ok).toBe(true);
    const at = T0 + MIN;
    expect(await refreshGuestView(db.sql, { worldId: W, version: 1, nextRefreshAt: null, now: at }, toyPort)).toEqual({ unchanged: true, version: 1 });
    expect(await refreshGuestView(db.sql, { worldId: W, version: 1, nextRefreshAt: at + 1, now: at }, toyPort)).toEqual({ unchanged: true, version: 1 });
    const moved = await refreshGuestView(db.sql, { worldId: W, version: 0, nextRefreshAt: null, now: at }, toyPort);
    expect(moved).toMatchObject({ unchanged: false, view: { guest: true, viewer: null, version: 1, listings: [{ id: "i-one", available: 2 }] } });
    const reached = await refreshGuestView(db.sql, { worldId: W, version: 1, nextRefreshAt: at, now: at }, toyPort);
    expect(reached.unchanged).toBe(false);
    // Bob holds one for 10 minutes; after it lapses (stored deadline past due), a guest's refresh at the same version brings the
    // whole view with both available again, and never sweeps (a signed-in read would).
    expect((await act(bob, { type: "take", item: "i-one", qty: 1, holdMs: 10 * MIN }, at)).ok).toBe(true);
    const held = await refreshGuestView(db.sql, { worldId: W, version: 1, nextRefreshAt: null, now: at + MIN }, toyPort);
    expect(held).toMatchObject({ unchanged: false, view: { version: 2, listings: [{ id: "i-one", available: 1 }] } });
    const sweeps = toyControls.sweepRuns;
    const later = at + 11 * MIN;
    const lapsed = await refreshGuestView(db.sql, { worldId: W, version: 2, nextRefreshAt: null, now: later }, toyPort);
    expect(lapsed).toMatchObject({ unchanged: false, view: { version: 2, listings: [{ id: "i-one", available: 2 }] } });
    expect(await refreshGuestView(db.sql, { worldId: W, version: 2, nextRefreshAt: null, now: later }, toyPort)).toMatchObject({ unchanged: false });
    expect(toyControls.sweepRuns).toBe(sweeps);
    // A world with no row: unchanged at version 0. A malformed time is the caller's mistake.
    expect(await refreshGuestView(db.sql, { worldId: "test-guest-none", version: 0, nextRefreshAt: null, now: T0 }, toyPort)).toEqual({ unchanged: true, version: 0 });
    await expect(refreshGuestView(db.sql, { worldId: W, version: 2, nextRefreshAt: Number.NaN, now: later }, toyPort)).rejects.toThrow(TypeError);
    await expect(getGuestView(db.sql, { worldId: "not-a-world" as WorldId })).rejects.toThrow(TypeError);
  });
});

// ── The server actions for a signed-out visitor ──────────────────────────────────────────

const WORLD: WorldId = "test-guest-handlers";

/** What actions.ts supplies, with a record of what the handler asked for, in order (as in handlers.test.ts). */
function context(o: { user?: SessionUser | null; sql?: Sql | null } = {}): { ctx: ActionContext; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    ctx: {
      async user() {
        asked.push("user");
        return o.user === undefined ? null : o.user;
      },
      sql() {
        asked.push("sql");
        return o.sql === undefined ? db.sql : o.sql;
      },
      worldId() {
        asked.push("world");
        return WORLD;
      },
    },
  };
}

/** A signed-out visitor's page: no viewer. A signed-in page sends its viewer's id. */
const visitor = { viewerId: null, protocol: HANDOFF_PROTOCOL };
const page = (u: SessionUser) => ({ viewerId: u.id, protocol: HANDOFF_PROTOCOL });

const CANARY = {
  handle: "CANARY-HANDLE-A", // A's Venmo username (follow-on B1), as stored; shown "@CANARY-HANDLE-A"
  listingPay: "@CANARY-LISTING-PAY", // typed with A's listing as the page before protocol 2 did: dropped, so stored nowhere
  eventNote: "CANARY-EVENT-NOTE",
  venue: "CANARY-VENUE 4521 Pine St",
  listingNote: "CANARY-LISTING-NOTE",
  takeMsg: "CANARY-TAKE-MSG",
  offer: "31.37",
  offerMsg: "CANARY-OFFER-MSG",
  requestNote: "CANARY-REQUEST-NOTE",
  budget: "33.73",
  alertMax: "29.37",
  area: "CANARY-AREA Grays Ferry",
  itemNote: "CANARY-ITEM-NOTE",
  goodsMsg: "CANARY-GOODS-MSG",
  goodsBudget: "44.47",
} as const;

describe.skipIf(!databaseUrl)("the server actions for a signed-out visitor (real engine, Postgres, the database's clock)", () => {
  const ids = { ev: "", l: "", spare: "", r: "", o: "", iso: "", alert: "", it: "", g: "", share: "", goodsIso: "" };

  /** Runs one action as a signed-in TEST user through the handler, as the page does; it must be accepted. */
  async function ok(u: SessionUser, action: Record<string, unknown>): Promise<string> {
    const o = await handleAct(context({ user: u }).ctx, { ...page(u), requestId: randomUUID(), action });
    if (!o.ok) throw new Error(`${String(action["type"])} by ${u.id}: ${o.code}${"error" in o ? `: ${o.error}` : ""}`);
    return o.resultId ?? "";
  }

  beforeAll(async () => {
    // A market with every kind of record, made through the handlers by signed-in TEST users, at the database's clock.
    const now = Date.now();
    const saved = await handleSaveMyProfile(context({ user: A }).ctx, { ...page(A), payMethods: [{ kind: "venmo", value: `@${CANARY.handle}` }] });
    if (!saved.ok) throw new Error("saveMyProfile");
    ids.ev = await ok(A, actions.createEvent(now, { start: wallAfter(now, 10), venue: CANARY.venue, notes: CANARY.eventNote,
      tiers: [{ label: "General admission", price: "40" }, { label: "VIP", price: "60" }] }));
    ids.l = await ok(A, actions.list(ids.ev, { qty: 2, ask: "35", paid: "40", payHandle: CANARY.listingPay, obo: true, note: CANARY.listingNote }));
    ids.spare = await ok(A, { type: "addHolding", eventId: ids.ev, tier: "t2", qty: 2, paid: "50" });
    ids.r = await ok(B, { ...actions.take(ids.l), msg: CANARY.takeMsg });
    ids.o = await ok(C, { ...actions.offer(ids.l, CANARY.offer), msg: CANARY.offerMsg });
    ids.iso = await ok(D, actions.request(ids.ev, { qty: 1, budget: CANARY.budget, note: CANARY.requestNote, expires: dateAfter(now, 5) }));
    ids.alert = await ok(C, { type: "joinAlert", eventId: ids.ev, qty: 2, max: CANARY.alertMax });
    ids.it = await ok(A, actions.postItem(now, { area: CANARY.area, note: CANARY.itemNote }));
    ids.g = await ok(B, { type: "requestItem", id: ids.it, msg: CANARY.goodsMsg, shareContact: false });
    ids.share = await ok(A, { type: "shareListing", isoId: ids.iso, listingId: ids.l });
    ids.goodsIso = await ok(C, { type: "saveInterest", data: { qty: 1, budget: CANARY.goodsBudget, note: "", expires: dateAfter(now, 10), goods: { title: "Desk chair", cat: "Furniture" } } });
  }, 30_000);

  it("refresh from a signed-out visitor's page (viewerId null): the guest view, never a personal one, with the classmates' counts", async () => {
    const { ctx, asked } = context();
    const r = await handleRefresh(ctx, { ...visitor, version: -1, nextRefreshAt: null });
    expect(asked).toEqual(["user", "sql", "world"]);
    if (!("unchanged" in r) || r.unchanged) throw new Error("expected the whole guest view");
    const g = r.view;
    if (!("guest" in g)) throw new Error("a signed-out visitor got a personal view");
    guestChecked(g);
    expect([g.guest, g.viewer, Object.keys(g).includes("people"), Object.keys(g).includes("notifications")]).toEqual([true, null, false, false]);
    const text = JSON.stringify(g);
    const leaks = [...Object.values(CANARY), A.id, B.id, C.id, D.id, A.name!, B.name!, C.name!, D.name!, "Handoff A.", "Handoff B.", "Handoff C.", "Handoff D.",
      A.email!, B.email!, C.email!, D.email!, ids.r, ids.o, ids.alert, ids.g, ids.share, ids.spare].filter((v) => text.includes(v));
    expect(leaks).toEqual([]);
    // What a signed-in classmate (D) is told, for the same listing and requests.
    const d = await handleRefresh(context({ user: D }).ctx, { ...page(D), version: -1, nextRefreshAt: null });
    if (!("unchanged" in d) || d.unchanged || "guest" in d.view) throw new Error("expected D's whole view");
    const dv: View = checked(d.view, D.id);
    expect(g.listings.find((l) => l.id === ids.l)?.available).toBe(dv.listings.find((l) => l.id === ids.l)?.numbers.available);
    expect(g.listings.find((l) => l.id === ids.l)?.available).toBe(1); // 2 listed, B holds 1; C's offer holds nothing
    expect(g.wanted.map((i) => i.id).sort()).toEqual([ids.iso, ids.goodsIso].sort());
    expect(g.goods.map((it) => it.id)).toEqual([ids.it]); // B's request doesn't hold it
    // The same page asks again with what it shows: nothing new.
    expect(await handleRefresh(context().ctx, { ...visitor, version: g.version, nextRefreshAt: g.nextRefreshAt })).toEqual({ unchanged: true, version: g.version });
    // No made-up visitor: every profile row in this schema is one of the signed-in TEST users this file acts as.
    const actors = new Set([A.id, B.id, C.id, D.id, "user-ann", "user-bob"]);
    const profiles = await db.sql<{ user_id: string }[]>`SELECT user_id FROM people`;
    expect(profiles.map((p) => p.user_id).filter((id) => !actors.has(id))).toEqual([]);
    expect(profiles.length).toBeGreaterThanOrEqual(4);
  });

  it("refresh without a session from a page that had an account (any viewerId but null): signed_out, never the guest view; nothing else is read", async () => {
    for (const input of [page(A), { protocol: HANDOFF_PROTOCOL }, { viewerId: undefined, protocol: HANDOFF_PROTOCOL }, { viewerId: "", protocol: HANDOFF_PROTOCOL },
      { viewerId: 0, protocol: HANDOFF_PROTOCOL }, { viewerId: "null", protocol: HANDOFF_PROTOCOL }, null, "x", [visitor]]) {
      const { ctx, asked } = context();
      expect(await handleRefresh(ctx, input === null || typeof input !== "object" || Array.isArray(input) ? input : { ...input, version: -1, nextRefreshAt: null }), JSON.stringify(input))
        .toEqual({ ok: false, code: "signed_out", error: STALE_ERRORS.signed_out });
      expect(asked).toEqual(["user"]);
    }
  });

  it("a visitor's page once they've signed in: account_changed; a new release: reload; no database: unavailable", async () => {
    const signedIn = context({ user: A });
    expect(await handleRefresh(signedIn.ctx, { ...visitor, version: -1, nextRefreshAt: null })).toEqual({ ok: false, code: "account_changed", error: STALE_ERRORS.account_changed });
    expect(signedIn.asked).toEqual(["user"]);
    const released = context();
    expect(await handleRefresh(released.ctx, { viewerId: null, protocol: HANDOFF_PROTOCOL + 1, version: -1, nextRefreshAt: null })).toEqual({ ok: false, code: "reload", error: STALE_ERRORS.reload });
    expect(released.asked).toEqual(["user"]);
    const none = context({ sql: null });
    expect(await handleRefresh(none.ctx, { ...visitor, version: -1, nextRefreshAt: null })).toEqual({ ok: false, code: "unavailable", reason: "no-database", error: unavailableMessage("no-database") });
    expect(none.asked).toEqual(["user", "sql"]);
    const missing = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: "handoff_test_missing" } });
    try {
      expect(await handleRefresh(context({ sql: missing }).ctx, { ...visitor, version: -1, nextRefreshAt: null })).toMatchObject({ ok: false, code: "unavailable", reason: "not-set-up" });
    } finally {
      await missing.end({ timeout: 5 });
    }
  });

  it("every change without a session is signed_out before anything is read, for all 54 action types, seq and anything else; nothing changes", async () => {
    const now = Date.now();
    const valid: Record<string, Record<string, unknown>> = {
      createEvent: actions.createEvent(now, { title: "[Test] Guest Gala", start: wallAfter(now, 12) }),
      removeEvent: { type: "removeEvent", eventId: ids.ev },
      addHolding: { type: "addHolding", eventId: ids.ev, tier: "t1", qty: 1, paid: "40" },
      addThen: actions.list(ids.ev, { qty: 1, ask: "35", paid: "40", payHandle: "@guest" }),
      // One-form Sell (§9l): Post ticket, with a new event made with it, needs a session like every other change.
      postTicket: { type: "postTicket", event: { kind: "event", title: "[Test] Guest Mixer", start: dateAfter(now, 12) }, qty: 1, ask: "30", note: "", method: "file", obo: false },
      // One-form Request (§9m item 3): Post request, with a new event made with it, needs a session too.
      postRequest: { type: "postRequest", event: { kind: "event", title: "[Test] Guest Oysters", start: dateAfter(now, 12) } },
      list: { type: "list", holdingId: ids.spare, qty: 1, ask: "55", method: "app", payHandle: "@guest", file: null },
      withdraw: { type: "withdraw", listingId: ids.l },
      editListing: { type: "editListing", listingId: ids.l, ask: "30", obo: true, minOffer: "20", note: "" },
      pauseListing: { type: "pauseListing", listingId: ids.l },
      resumeListing: { type: "resumeListing", listingId: ids.l },
      take: actions.take(ids.l),
      offer: actions.offer(ids.l, "30"),
      counter: { type: "counter", requestId: ids.o, amount: "33" },
      accept: { type: "accept", requestId: ids.o },
      decline: { type: "decline", requestId: ids.o },
      respond: { type: "respond", requestId: ids.o, accept: true, member: false },
      markPaid: actions.onRequest("markPaid", ids.r),
      confirmPayment: actions.onRequest("confirmPayment", ids.r),
      paymentMissing: actions.onRequest("paymentMissing", ids.r),
      markTransferred: actions.onRequest("markTransferred", ids.r),
      buyerReceived: actions.onRequest("buyerReceived", ids.r),
      cancel: actions.onRequest("cancel", ids.r),
      release: actions.onRequest("release", ids.r),
      isoReply: { type: "isoReply", isoId: ids.iso, holdingId: ids.spare, qty: 1, counter: false, price: "", method: "app", namesChecked: false, file: null, payHandle: "@guest", note: "", membersOnly: false },
      // Invite to pay (follow-on B5): asking to buy, inviting, inviting a public request's poster and reserving all need a session.
      requestToBuy: { type: "requestToBuy", listingId: ids.l, qty: 1, amount: "", msg: "", member: false },
      invite: { type: "invite", requestId: ids.o },
      inviteRequester: { type: "inviteRequester", isoId: ids.iso, listingId: ids.l, qty: 1 },
      reserve: { type: "reserve", requestId: ids.r, member: false },
      // §9v item 2 (SELL5-M3): "I have this" in one submission needs a session too.
      answerRequest: { type: "answerRequest", isoId: ids.iso, ask: "30", note: "", obo: false },
      postItem: actions.postItem(now, { title: "Guest lamp" }),
      withdrawItem: { type: "withdrawItem", id: ids.it },
      editItem: { type: "editItem", id: ids.it, price: "25", obo: false, minOffer: "", note: "" },
      // §9s item 6: an item's photo, set or removed, needs a session like every other change.
      setItemPhoto: { type: "setItemPhoto", id: ids.it },
      removeItemPhoto: { type: "removeItemPhoto", id: ids.it },
      pauseItem: { type: "pauseItem", id: ids.it },
      resumeItem: { type: "resumeItem", id: ids.it },
      requestItem: { type: "requestItem", id: ids.it, msg: "", shareContact: false },
      acceptItemReq: { type: "acceptItemReq", id: ids.g, shareContact: true },
      declineItemReq: { type: "declineItemReq", id: ids.g },
      releaseItemReq: { type: "releaseItemReq", id: ids.g },
      cancelItemReq: { type: "cancelItemReq", id: ids.g },
      itemPickedUp: { type: "itemPickedUp", id: ids.g },
      itemConsent: { type: "itemConsent", id: ids.g, side: "buyer" },
      setPickup: { type: "setPickup", id: ids.g, at: wallAfter(now, 2, "17:00") },
      reportProblem: { type: "reportProblem", kind: "ticket", id: ids.r, reason: "Something else" },
      resolveProblem: { type: "resolveProblem", kind: "ticket", id: ids.r },
      saveInterest: actions.request(ids.ev, { qty: 1, budget: "35", note: "", expires: dateAfter(now, 4) }),
      joinAlert: { type: "joinAlert", eventId: ids.ev, qty: 1, max: "30" },
      setAlert: { type: "setAlert", id: ids.alert, paused: true },
      closeInterest: { type: "closeInterest", id: ids.iso, reason: "cancelled" },
      shareListing: { type: "shareListing", isoId: ids.iso, listingId: ids.l },
      shareItem: { type: "shareItem", isoId: ids.goodsIso, itemId: ids.it },
      withdrawShare: { type: "withdrawShare", id: ids.share },
      seq: { type: "seq", steps: [{ action: actions.list(ids.ev, { qty: 1, ask: "35", paid: "40", payHandle: "@guest" }) }, { action: { type: "shareListing", isoId: ids.iso, listingId: "@0" }, optional: true }] },
    };
    expect(Object.keys(valid).sort()).toEqual([...LIVE_ACTIONS].sort());
    // Each would reach the engine with a session: its shape passes the input gate, so only the missing session refuses it.
    expect(Object.entries(valid).filter(([, a]) => !parseAction(a).ok).map(([t]) => t)).toEqual([]);
    const others: unknown[] = [{ type: "sweep" }, { type: "hack" }, { type: "" }, null, "take", [actions.take(ids.l)]];

    const before = await dbState();
    const refusal = { ok: false, code: "signed_out", error: STALE_ERRORS.signed_out };
    for (const viewerId of [null, A.id, undefined]) {
      for (const action of [...Object.values(valid), ...others]) {
        const { ctx, asked } = context();
        const input = { viewerId, protocol: HANDOFF_PROTOCOL, requestId: randomUUID(), action };
        expect(await handleAct(ctx, input), `${JSON.stringify(action)?.slice(0, 60)} from ${String(viewerId)}`).toEqual(refusal);
        expect(asked).toEqual(["user"]);
      }
      const read = context();
      expect(await handleMarkRead(read.ctx, { viewerId, protocol: HANDOFF_PROTOCOL, ids: "all" })).toEqual({ ok: false, code: "signed_out" });
      expect(await handleMarkRead(read.ctx, { viewerId, protocol: HANDOFF_PROTOCOL, ids: ["n0000000000000000"] })).toEqual({ ok: false, code: "signed_out" });
      expect(read.asked).toEqual(["user", "user"]);
      const profile = context();
      expect(await handleSaveMyProfile(profile.ctx, { viewerId, protocol: HANDOFF_PROTOCOL, payHandle: "@guest-handle" })).toEqual(refusal);
      expect(profile.asked).toEqual(["user"]);
    }
    expect(await dbState()).toEqual(before); // nothing at all changed: worlds, profiles, actions, notifications, snapshots

    // The control: the same take, with a session, is accepted. The refusals above were the missing session's. And the guest's
    // count follows at once: the last ticket is held now, so the listing leaves the guest view.
    const taken = await handleAct(context({ user: D }).ctx, { ...page(D), requestId: randomUUID(), action: valid["take"] });
    expect(taken).toMatchObject({ ok: true });
    const after = await handleRefresh(context().ctx, { ...visitor, version: -1, nextRefreshAt: null });
    if (!("unchanged" in after) || after.unchanged || !("guest" in after.view)) throw new Error("expected the whole guest view");
    expect(after.view.listings.find((l) => l.id === ids.l)).toBeUndefined();
    expect(JSON.stringify(after.view)).not.toMatch(/handoff-test-|Handoff Test|example\.invalid/);
  });
});
