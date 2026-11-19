// Invite to pay through the store (follow-on Batch 5, step S1; USER-INSTRUCTIONS §9 Batch 5 and §9a; FOLLOWON-PLAN §2.5-§2.7): the real
// engine behind the real store, on a throwaway Postgres schema. The engine's own rules are in invite-flow.test.ts and
// invite-flow-compat.test.ts; this file shows what only the store can:
// - the whole exchange as the page will send it (requestToBuy, invite, reserve, then the paid steps that were already there), with what
//   each party's view holds at each step: no destination before the reservation, counts only for everyone else, nothing for a guest;
// - one atomic reserve: ten invited buyers reserving the last unit at once, five rounds, give exactly one hold, and the nine others
//   are told why with their invitation still open; without the world's lock the same check fails (the negative control);
// - partial quantities, retries (the same request id) and double clicks (a new one);
// - time: a hold that lapses goes back on sale through the store's sweep, the waiting buyer hears once, and a late payment report
//   tells the seller and takes nothing back from the buyer who has the unit now; stale invitations after a price change, a pause,
//   their own deadline and a close;
// - the last-method guard under both rules (an open listing while the flow is off; an open invitation or offer once it's on), under
//   the world's lock, with the method collected at the first invitation;
// - the switch (the live page's is INVITE_FLOW_LIVE, on since step S3; E.setInviteSwitch(false) makes what came before): old exchanges finish on
//   their own terms, the old ways of starting one are refused, and a new record without the flow's mark never reaches a stamped world;
// - the new steps' notifications, in the app (outbound email was removed: review of PR #88).
// Everyone is a labelled TEST account with a made-up id and an @example.invalid address; no sign-in of any kind, nothing leaves the
// database, and no world outside this schema is touched.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as E from "../../engine/index.js";
import type { LiveWorld } from "../../engine/index.js";
import { enginePort, type EnginePort } from "../engine-port.js";
import { handleAct, type ActionContext, type SessionUser } from "../handlers.js";
import {
  INTERNAL_ERROR,
  LAST_METHOD_ERROR,
  LAST_METHOD_OPEN_ERROR,
  applyAction,
  ensurePerson,
  getGuestView,
  markNotificationsRead,
  savePayMethods,
  saveProfile,
  type ApplyHooks,
} from "../store.js";
import type { ActOutcome, Actor, View, WorldId } from "../types.js";
import { barrier, createTestDb, databaseUrl, deferred, firstWaitsFor, waitForLockWaiters, type TestDb } from "./helpers/db.js";
import { TEST_D, TEST_E, TEST_F, TEST_G, TEST_H, canSell, changeNotes } from "./helpers/accounts.js";
import { HOUR, MIN, StoreWorld, T0, TEST_A, TEST_B, TEST_C, actions as sent, checked, okOf, type SentAction } from "./helpers/live-store.js";

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

const [A, B, C, D] = [TEST_A, TEST_B, TEST_C, TEST_D];
/** The seller's handle these tests give a seller with no saved method (live-store.ts givePayHandle): one "other" method. */
const handleOf = (seller: Actor): string => `@${seller.id}`;

// The four new actions and the steps around them, as the page will send them.
const askToBuy = (listingId: string, o: { qty?: number; amount?: string } = {}): SentAction =>
  ({ type: "requestToBuy", listingId, qty: o.qty ?? 1, ...(o.amount !== undefined ? { amount: o.amount } : {}), msg: "", member: false });
const inviteToPay = (requestId: string, o: { qty?: number; price?: string } = {}): SentAction => ({ type: "invite", requestId, ...o });
const reserveIt = (requestId: string): SentAction => ({ type: "reserve", requestId, member: false });
const on = (type: string, requestId: string): SentAction => ({ type, requestId });
const lateReport = (id: string): SentAction => ({ type: "reportProblem", kind: "ticket", id, reason: E.LATE_PAYMENT });
/** Sell a ticket as the page does since protocol 2: no handle with the listing. */
function sellNew(eventId: string, qty = 1): SentAction {
  const a = sent.list(eventId, { qty, ask: "35", paid: "40", payHandle: "" });
  delete (a.then as Record<string, unknown>)["payHandle"];
  return a;
}

const numbersIn = (view: View, listingId: string) => view.listings.find((x) => x.id === listingId)?.numbers;
const mine = (view: View, requestId: string) => view.requests.find((x) => x.id === requestId);

const ASK_FIRST = "Handoff now asks the seller first. Tap Request to buy.";
const HELD_ELSEWHERE = /^Another buyer is paying for it right now\. Your invitation stays open until .+ in case it comes back\.$/;
const AVAILABLE_AGAIN = /is available again\. Reserve by .+: nothing is held until you do\.$/;

// The race's own accounts: one seller and ten buyers.
const RACE_SELLER: Actor = { id: "handoff-test-race-seller", name: "Race Seller Test", email: "race-seller@example.invalid" };
const RACERS: Actor[] = Array.from({ length: 10 }, (_, i) => ({ id: `handoff-test-racer-${i}`, name: `Racer ${i} Test`, email: `racer-${i}@example.invalid` }));
const racer = (i: number): Actor => must(RACERS[i], `racer ${i}`);

describe.skipIf(!databaseUrl)("invite to pay through the store (real engine, Postgres)", () => {
  let db: TestDb;
  let n = 0;
  beforeAll(async () => {
    db = await createTestDb("invite-flow");
  }, 30_000);
  afterAll(async () => {
    await db?.close();
  });
  // One schema for the file: every test starts with no worlds (their notifications and action log cascade away). Profiles stay, so the
  // tests about a seller's methods each use an account of their own.
  beforeEach(async () => {
    await db.sql`DELETE FROM worlds`;
  });
  // The switch back to the engine's own setting (on since step S3), whatever a test set.
  afterEach(() => {
    E.setInviteSwitch(null);
  });

  const world = (label: string, now = T0): StoreWorld => new StoreWorld(db.sql, `test-invite-${label}-${++n}` as WorldId, now);
  /** The seller's event and their listing of `qty` tickets at $35 (the seller pays out to the handle `@<id>` unless they saved methods). */
  async function listed(label: string, seller: Actor, qty: number, o: { obo?: boolean; now?: number } = {}): Promise<{ w: StoreWorld; ev: string; l: string }> {
    const w = world(label, o.now ?? T0);
    const ev = await w.createEvent(seller);
    const l = await w.list(seller, ev, { qty, ask: "35", ...(o.obo !== undefined ? { obo: o.obo } : {}) });
    return { w, ev, l };
  }
  const stored = async (w: StoreWorld) => must(await w.row(), "the world's row");
  const recordsOn = async (w: StoreWorld, listingId: string) => (await stored(w)).doc.requests.filter((r) => r.listingId === listingId);
  const recordOf = async (w: StoreWorld, requestId: string) => must((await stored(w)).doc.requests.find((r) => r.id === requestId), `record ${requestId}`);
  /** `buyer` asks to buy and `seller` invites them; the record's id. */
  async function invitedFor(w: StoreWorld, seller: Actor, buyer: Actor, listingId: string, o: { qty?: number } = {}): Promise<string> {
    const r = must((await w.ok(buyer, askToBuy(listingId, o))).resultId, "the request's id");
    await w.ok(seller, inviteToPay(r));
    return r;
  }
  const logged = async (w: StoreWorld): Promise<{ type: string; ok: boolean }[]> => [...(await db.sql<{ type: string; ok: boolean }[]>`
    SELECT type, ok FROM actions WHERE world_id = ${w.worldId} ORDER BY at, version_before`)];
  const tally = async (w: StoreWorld): Promise<{ all: number; refused: number }> => must((await db.sql<{ all: number; refused: number }[]>`
    SELECT count(*)::int AS all, count(*) FILTER (WHERE NOT ok)::int AS refused FROM actions WHERE world_id = ${w.worldId}`)[0], "the log's count");
  const refusal = (o: ActOutcome, what: string): Extract<ActOutcome, { code: "refused" }> => {
    if (o.ok || o.code !== "refused") throw new Error(`${what}: expected a refusal, got ${o.ok ? "ok" : o.code}`);
    return o;
  };

  // ── The whole exchange ─────────────────────────────────────────────────────────────────

  describe("the whole exchange, as the live page sends it (the engine's own setting: switched on in step S3)", () => {
    it("request, invitation, reservation and the paid steps: nothing is held or shown until the buyer reserves (B5.3-B5.5, B5.10)", async () => {
      expect(E.inviteFlowOn()).toBe(true); // nothing set here: the engine as the live page loads it
      const { w, l } = await listed("flow", A, 2);
      const HANDLE = handleOf(A);

      // 1. B asks to buy: nothing is held, and B isn't shown where to pay.
      const asked = await w.ok(B, askToBuy(l));
      const r = must(asked.resultId, "the request");
      expect(asked.toast).toMatch(/^Request sent\. Nothing is held: .+ has until .+ to invite you to pay\.$/);
      expect(mine(asked.view, r)).toMatchObject({ status: "requested", inviteFlow: true, buyerId: B.id, listingId: l, qty: 1, price: 35 });
      expect(mine(asked.view, r)).not.toHaveProperty("pay");
      expect(mine(asked.view, r)).not.toHaveProperty("holdUntil");
      expect(numbersIn(asked.view, l)).toEqual({ reserved: 0, completed: 0, available: 2 });
      expect(JSON.stringify(asked.view)).not.toContain(HANDLE);

      // 2. A invites B: still nothing held, still no destination; B hears once.
      const invitation = await w.ok(A, inviteToPay(r));
      expect(invitation.toast).toMatch(/^Invitation sent\. Nothing is held: it's .+'s once they reserve it, by .+\. You can invite others too\.$/);
      const invited = await w.view(B);
      expect(mine(invited, r)).toMatchObject({ status: "invited", inviteFlow: true, invitedAt: expect.any(Number), expiresAt: expect.any(Number) });
      expect(mine(invited, r)).not.toHaveProperty("pay");
      expect(mine(invited, r)).not.toHaveProperty("holdUntil");
      expect(numbersIn(invited, l)).toEqual({ reserved: 0, completed: 0, available: 2 });
      expect(JSON.stringify(invited)).not.toContain(HANDLE);
      expect(invited.notifications.map((x) => x.text)).toEqual([
        expect.stringMatching(/ invited you to pay \$35 each for 1 ticket for \[Test\] Spring Formal\. It isn't held yet: reserve it by .+, then you have up to 15 minutes to pay\.$/),
      ]);

      // 3. B reserves: one atomic step that holds it for 15 minutes and copies where to pay into the exchange, for its two parties.
      const held = await w.ok(B, reserveIt(r));
      expect(held.resultId).toBe(r);
      expect(held.toast).toMatch(/^Reserved for 15 minutes\. Pay .+ \$35 now, then tap "I've sent payment"\.$/);
      expect(mine(held.view, r)).toMatchObject({ status: "accepted", inviteFlow: true, holdUntil: w.now + 15 * MIN, pay: [{ kind: "other", value: HANDLE }] });
      expect(numbersIn(held.view, l)).toEqual({ reserved: 1, completed: 0, available: 1 });
      const sellerView = await w.view(A);
      expect(mine(sellerView, r)).toMatchObject({ status: "accepted", buyerId: B.id, holdUntil: w.now + 15 * MIN });
      expect(sellerView.notifications.filter((x) => x.text.includes("reserved 1 ticket"))).toHaveLength(1);

      // Everyone else sees the counts and nothing of the exchange; a signed-out visitor sees one fewer available and nothing else.
      const stranger = await w.view(C);
      expect(stranger.requests).toEqual([]);
      expect(numbersIn(stranger, l)).toEqual({ reserved: 1, completed: 0, available: 1 });
      expect(JSON.stringify(stranger)).not.toContain(HANDLE);
      const guest = await getGuestView(db.sql, { worldId: w.worldId, now: w.now });
      expect(guest.listings.map((x) => [x.id, x.available])).toEqual([[l, 1]]);
      const guestText = JSON.stringify(guest);
      for (const secret of [HANDLE, A.id, B.id, r, "invited", "accepted"]) expect(guestText, secret).not.toContain(secret);

      // 4. The steps that were already there finish it.
      await w.ok(B, on("markPaid", r));
      await w.ok(A, on("confirmPayment", r));
      await w.ok(A, on("markTransferred", r));
      const done = await w.ok(B, on("buyerReceived", r));
      expect(mine(done.view, r)).toMatchObject({ status: "completed", inviteFlow: true });
      expect(numbersIn(done.view, l)).toEqual({ reserved: 0, completed: 1, available: 1 });

      // Switched on, the world was stamped by its first change, before the exchange began; the old ways of starting one are refused
      // beside it and store nothing (while it was off they still worked here: that is the B5.7e test below, begun with it off).
      const row = await stored(w);
      const since = must(row.doc.inviteSince, "the stamp");
      expect(since).toBeGreaterThanOrEqual(T0);
      expect(since).toBeLessThanOrEqual(must(row.doc.requests.find((x) => x.id === r), "the record").createdAt);
      expect((await logged(w)).map((x) => x.type)).toEqual([
        "createEvent", "addThen", "requestToBuy", "invite", "reserve", "markPaid", "confirmPayment", "markTransferred", "buyerReceived",
      ]);
      expect((await w.refused(C, sent.take(l))).error).toBe(ASK_FIRST);
      expect((await w.refused(C, sent.offer(l, "30"))).error).toBe(ASK_FIRST);
      const after = await stored(w);
      expect(after.version).toBe(row.version);
      expect(after.doc.requests.map((x) => [x.id, x.inviteFlow])).toEqual([[r, true]]);
    });

    it("the buyer releases an unpaid hold in one step; the seller can't during it; whoever was waiting hears once (B5.6)", async () => {
      const { w, l } = await listed("release", A, 1);
      const rb = await invitedFor(w, A, B, l);
      const rc = await invitedFor(w, A, C, l);
      await w.ok(B, reserveIt(rb));
      const kept = /^It's reserved for .+ until .+\. If they don't pay by then, it comes back to you on its own\.$/;
      expect((await w.refused(A, on("release", rb))).error).toMatch(kept);
      expect((await w.refused(A, on("decline", rb))).error).toMatch(kept);
      expect((await w.refused(C, reserveIt(rc))).error).toMatch(HELD_ELSEWHERE);
      expect(mine(await w.view(C), rc)).toMatchObject({ status: "invited", blockedAt: expect.any(Number) });

      const freed = await w.ok(B, on("cancel", rb));
      expect(freed.toast).toBe("Reservation released. It's back on sale.");
      expect(mine(freed.view, rb)).toMatchObject({ status: "cancelled", reason: "Reservation released" });
      expect(mine(freed.view, rb)).not.toHaveProperty("pay"); // where to pay goes with the hold
      expect(numbersIn(freed.view, l)).toEqual({ reserved: 0, completed: 0, available: 1 });
      const waiting = await w.view(C);
      expect(mine(waiting, rc)).not.toHaveProperty("blockedAt");
      expect(waiting.notifications.filter((x) => AVAILABLE_AGAIN.test(x.text))).toHaveLength(1);
      expect((await w.refused(B, reserveIt(rb))).error).toBe("You released this reservation.");
      const next = await w.ok(C, reserveIt(rc));
      expect(mine(next.view, rc)).toMatchObject({ status: "accepted", holdUntil: w.now + 15 * MIN, pay: [{ kind: "other", value: handleOf(A) }] });
    });

    it("through the handlers, at the database's clock: only the invited buyer can reserve, and the hold is 15 minutes", async () => {
      const startedAt = Date.now();
      const { w, l } = await listed("handler", A, 1, { now: startedAt });
      const ctx = (user: SessionUser): ActionContext => ({ user: async () => user, sql: () => db.sql, worldId: () => w.worldId });
      const send = (who: SessionUser, action: SentAction) => handleAct(ctx(who), { viewerId: who.id, protocol: E.HANDOFF_PROTOCOL, requestId: randomUUID(), action });

      const asked = await send(B, askToBuy(l));
      if (!asked.ok) throw new Error(`requestToBuy: ${asked.code}: ${asked.error}`);
      const r = must(asked.resultId, "the request");
      expect(await send(A, inviteToPay(r))).toMatchObject({ ok: true, replay: false });
      expect(await send(C, reserveIt(r))).toMatchObject({ ok: false, code: "refused", error: "Invitation not found." });
      const held = await send(B, reserveIt(r));
      if (!held.ok) throw new Error(`reserve: ${held.code}: ${held.error}`);
      expect(held.resultId).toBe(r);
      const record = must(mine(checked(held.view, B.id), r), "B's reservation");
      expect(record).toMatchObject({ status: "accepted", inviteFlow: true, pay: [{ kind: "other", value: handleOf(A) }] });
      const length = must(record.holdUntil, "the hold's end") - held.view.serverNow;
      expect(length).toBeGreaterThan(14 * MIN);
      expect(length).toBeLessThanOrEqual(15 * MIN);
    });
  });

  // ── One atomic reserve ─────────────────────────────────────────────────────────────────

  describe("reserve is one atomic step under the world's lock (B5.5, B5.7a, B5.7b)", () => {
    it("gives the last unit to exactly 1 of 10 invited buyers who reserve at once (5 rounds), and tells the 9 others why", async () => {
      E.setInviteSwitch(true);
      for (let round = 1; round <= 5; round++) {
        const { w, l } = await listed(`last-unit-${round}`, RACE_SELLER, 1);
        const ids: string[] = [];
        for (const b of RACERS) ids.push(await invitedFor(w, RACE_SELLER, b, l));
        // Ten open invitations hold nothing: the one unit is still on sale.
        expect(numbersIn(await w.view(RACE_SELLER), l), `round ${round}`).toEqual({ reserved: 0, completed: 0, available: 1 });
        const openUntil = new Map((await recordsOn(w, l)).map((x) => [x.buyerId, must(x.expiresAt, "the invitation's deadline")]));

        const hooks = firstWaitsFor(db, RACERS.length - 1);
        const outcomes = await Promise.all(RACERS.map((b, i) => w.act(b, reserveIt(must(ids[i], "an invitation")), { hooks, lockTimeoutMs: 15_000 })));

        const won = outcomes.filter((o) => o.ok);
        expect(won, `round ${round}`).toHaveLength(1);
        const lost = outcomes.filter((o) => !o.ok);
        expect(lost, `round ${round}`).toHaveLength(9);
        for (const o of lost) {
          const no = refusal(o, `round ${round}`);
          const me = no.view.viewer.id;
          checked(no.view, me);
          expect(no.replay).toBe(false);
          expect(no.error).toBe(`Another buyer is paying for it right now. Your invitation stays open until ${E.fmtMs(must(openUntil.get(me), "the deadline"))} in case it comes back.`);
          // Their own invitation is still open, with nothing held and nowhere to pay; nobody else's record is in their view.
          expect(no.view.requests.map((x) => [x.buyerId, x.status])).toEqual([[me, "invited"]]);
          expect(no.view.requests[0]).not.toHaveProperty("pay");
          expect(no.view.requests[0]).not.toHaveProperty("holdUntil");
          expect(numbersIn(no.view, l)).toEqual({ reserved: 1, completed: 0, available: 0 });
        }
        const first = must(won[0], "the winner");
        const winner = first.ok ? first.view.viewer.id : "";
        const after = await recordsOn(w, l);
        expect(after.filter((x) => x.status === "accepted").map((x) => [x.buyerId, x.holdUntil])).toEqual([[winner, w.now + 15 * MIN]]);
        expect(after.filter((x) => x.status === "invited")).toHaveLength(9);
        expect(after.every((x) => x.inviteFlow === true)).toBe(true);
        expect(await tally(w)).toEqual({ all: 32, refused: 9 }); // createEvent, addThen, ten requests, ten invitations, ten reserves
        // The seller heard about the one reservation only.
        const seller = await w.view(RACE_SELLER);
        expect(seller.notifications.filter((x) => x.text.includes("reserved 1 ticket"))).toHaveLength(1);
        expect(numbersIn(seller, l)).toEqual({ reserved: 1, completed: 0, available: 0 });
      }
    }, 120_000);

    it("negative control: without the lock, two invited buyers are both told the last unit is theirs, and the 10-buyer check fails", async () => {
      E.setInviteSwitch(true);
      const { w, l } = await listed("no-lock", RACE_SELLER, 1);
      const r0 = await invitedFor(w, RACE_SELLER, racer(0), l);
      const r1 = await invitedFor(w, RACE_SELLER, racer(1), l);
      const before = (await stored(w)).version;
      const meet = barrier(2);
      const hooks: ApplyHooks = { afterLock: () => meet.arrive() };
      const [a, b] = await Promise.all([
        w.act(racer(0), reserveIt(r0), { lock: false, hooks }),
        w.act(racer(1), reserveIt(r1), { lock: false, hooks }),
      ]);
      expect([a.ok, b.ok]).toEqual([true, true]); // a double booking: two buyers each told to pay for the one ticket
      // Both writes were stored, with nothing to order them: the one ticket held twice, or one hold written over by the other's
      // view of the listing (a lost update). Either way the stored market isn't what the two buyers were told.
      const heldNow = (await recordsOn(w, l)).filter((x) => x.status === "accepted").length;
      expect([1, 2]).toContain(heldNow); // 2: oversold; 1: a buyer told "yours" holds nothing
      expect((await stored(w)).version).toBe(before + 2);

      // The same two buyers with the lock, also at once: exactly one has it.
      const locked = await listed("with-lock", RACE_SELLER, 1);
      const l0 = await invitedFor(locked.w, RACE_SELLER, racer(0), locked.l);
      const l1 = await invitedFor(locked.w, RACE_SELLER, racer(1), locked.l);
      const both = firstWaitsFor(db, 1);
      const [c, d] = await Promise.all([
        locked.w.act(racer(0), reserveIt(l0), { hooks: both }),
        locked.w.act(racer(1), reserveIt(l1), { hooks: both }),
      ]);
      expect([c.ok, d.ok].filter(Boolean)).toHaveLength(1);
      expect((await recordsOn(locked.w, locked.l)).filter((x) => x.status === "accepted")).toHaveLength(1);

      // The 10-buyer test's own check fails without the lock: ten "it's yours" answers where it requires exactly one.
      const burst = await listed("no-lock-burst", RACE_SELLER, 1);
      const ids: string[] = [];
      for (const x of RACERS) ids.push(await invitedFor(burst.w, RACE_SELLER, x, burst.l));
      const all = barrier(RACERS.length);
      const outcomes = await Promise.all(RACERS.map((x, i) => burst.w.act(x, reserveIt(must(ids[i], "an invitation")), { lock: false, hooks: { afterLock: () => all.arrive() } })));
      expect(outcomes.filter((o) => o.ok)).toHaveLength(RACERS.length);
      // Ten "it's yours", and a stored market that can't honor them: the ticket held more than once, or holds lost.
      const heldBurst = (await recordsOn(burst.w, burst.l)).filter((x) => x.status === "accepted").length;
      expect(heldBurst).not.toBe(0);
    }, 60_000);

    it("fills partially: 2 units and 3 invited buyers at once give 2 holds; a buyer invited for 2 never gets 1", async () => {
      const { w, l } = await listed("partial", A, 2);
      const buyers = [B, C, D];
      const ids: string[] = [];
      for (const b of buyers) ids.push(await invitedFor(w, A, b, l));
      const hooks = firstWaitsFor(db, 2);
      const outcomes = await Promise.all(buyers.map((b, i) => w.act(b, reserveIt(must(ids[i], "an invitation")), { hooks, lockTimeoutMs: 15_000 })));
      expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
      expect(outcomes.filter((o) => !o.ok)).toEqual([expect.objectContaining({ code: "refused", error: expect.stringMatching(HELD_ELSEWHERE) })]);
      expect((await recordsOn(w, l)).map((x) => x.status).sort()).toEqual(["accepted", "accepted", "invited"]);
      expect(numbersIn(await w.view(A), l)).toEqual({ reserved: 2, completed: 0, available: 0 });

      // 3 units; two buyers are each invited for 2 and reserve at once: one gets both of theirs, the other gets none (never 1 of 2).
      const big = await listed("partial-pairs", A, 3);
      const x = await invitedFor(big.w, A, B, big.l, { qty: 2 });
      const y = await invitedFor(big.w, A, C, big.l, { qty: 2 });
      expect(numbersIn(await big.w.view(A), big.l)).toEqual({ reserved: 0, completed: 0, available: 3 }); // invitations for 4 of 3 units hold nothing
      const pair = firstWaitsFor(db, 1);
      const [p, q] = await Promise.all([
        big.w.act(B, reserveIt(x), { hooks: pair, lockTimeoutMs: 15_000 }),
        big.w.act(C, reserveIt(y), { hooks: pair, lockTimeoutMs: 15_000 }),
      ]);
      expect([p.ok, q.ok].filter(Boolean)).toHaveLength(1);
      const loser = refusal(p.ok ? q : p, "the second pair");
      expect(loser.error).toMatch(HELD_ELSEWHERE);
      const pairs = await recordsOn(big.w, big.l);
      expect(pairs.map((r) => [r.status, r.qty]).sort()).toEqual([["accepted", 2], ["invited", 2]]);
      expect(numbersIn(await big.w.view(A), big.l)).toEqual({ reserved: 2, completed: 0, available: 1 });
      // The unit that's left goes to a buyer invited for one.
      const z = await invitedFor(big.w, A, D, big.l);
      const last = await big.w.ok(D, reserveIt(z));
      expect(numbersIn(last.view, big.l)).toEqual({ reserved: 3, completed: 0, available: 0 });
    });

    it("a retry replays and a double click is refused: one request, one invitation, one hold, one notification each (B5.7g)", async () => {
      const { w, l } = await listed("retry", A, 2);
      // Request to buy, sent twice with the same id (a retry), then again with a new one (a second click).
      const askId = randomUUID();
      const asked = okOf(await w.act(B, askToBuy(l), { requestId: askId }), "the request");
      const askedAgain = okOf(await w.act(B, askToBuy(l), { requestId: askId }), "the request, retried");
      expect(asked.replay).toBe(false);
      expect(askedAgain).toMatchObject({ replay: true, resultId: asked.resultId, toast: asked.toast });
      const r = must(asked.resultId, "the request");
      expect((await w.refused(B, askToBuy(l))).error).toBe("You've already asked to buy this.");
      expect(await recordsOn(w, l)).toHaveLength(1);
      expect((await w.view(A)).notifications).toHaveLength(1);

      // The invitation.
      const inviteId = randomUUID();
      const invitation = okOf(await w.act(A, inviteToPay(r), { requestId: inviteId }), "the invitation");
      expect(okOf(await w.act(A, inviteToPay(r), { requestId: inviteId }), "the invitation, retried")).toMatchObject({ replay: true, toast: invitation.toast });
      expect((await w.refused(A, inviteToPay(r))).error).toMatch(/^You've already invited .+\.$/);
      expect((await w.view(B)).notifications).toHaveLength(1);

      // The reservation: a retry a minute later replays the answer and doesn't renew the hold.
      const reserveId = randomUUID();
      const held = okOf(await w.act(B, reserveIt(r), { requestId: reserveId }), "the reservation");
      const until = w.now + 15 * MIN;
      w.advance(MIN);
      expect(okOf(await w.act(B, reserveIt(r), { requestId: reserveId }), "the reservation, retried")).toMatchObject({ replay: true, resultId: r, toast: held.toast });
      expect((await w.refused(B, reserveIt(r))).error).toBe("You've already reserved it.");
      expect(await recordOf(w, r)).toMatchObject({ status: "accepted", holdUntil: until });
      expect(numbersIn(await w.view(A), l)).toEqual({ reserved: 1, completed: 0, available: 1 });
      expect((await w.view(A)).notifications).toHaveLength(2); // the request, then the one reservation

      // The paid step, twice.
      await w.ok(B, on("markPaid", r));
      await w.refused(B, on("markPaid", r));
      expect(await recordsOn(w, l)).toHaveLength(1);
      const log = await logged(w);
      expect(log.filter((x) => x.ok).map((x) => x.type)).toEqual(["createEvent", "addThen", "requestToBuy", "invite", "reserve", "markPaid"]);
      expect(log.filter((x) => !x.ok).map((x) => x.type)).toEqual(["requestToBuy", "invite", "reserve", "markPaid"]);
    });
  });

  // ── Time ───────────────────────────────────────────────────────────────────────────────

  describe("time: lapsed holds, late payments and stale invitations (B5.7f, B5.7h, B5.7i)", () => {
    it("a hold that lapses goes back on sale by itself; a late payment report tells the seller and takes nothing back", async () => {
      E.setInviteSwitch(true);
      const { w, l } = await listed("late", A, 1);
      const rb = await invitedFor(w, A, B, l);
      const rc = await invitedFor(w, A, C, l);
      const held = await w.ok(B, reserveIt(rb));
      const until = w.now + 15 * MIN;
      expect(mine(held.view, rb)).toMatchObject({ status: "accepted", holdUntil: until });
      // The store knows when to look again: the hold's end is the world's next deadline.
      const due = must((await stored(w)).next_due, "next_due").getTime();
      expect(due).toBeGreaterThanOrEqual(until);
      expect(due).toBeLessThanOrEqual(until + 1000);

      // 15 minutes pass with no payment marked. C opens the page: the sweep stores the expiry and C hears, once, that it's back.
      w.advance(15 * MIN + 1000);
      const back = await w.view(C);
      expect(numbersIn(back, l)).toEqual({ reserved: 0, completed: 0, available: 1 });
      expect(back.notifications.filter((x) => AVAILABLE_AGAIN.test(x.text))).toHaveLength(1);
      expect(mine(back, rc)).not.toHaveProperty("blockedAt");
      expect(await recordOf(w, rb)).toMatchObject({ status: "expired", reason: "The reservation ended without payment, so it went back on sale." });
      const lapsed = await w.view(B);
      expect(mine(lapsed, rb)).toMatchObject({ status: "expired" });
      expect(mine(lapsed, rb)).not.toHaveProperty("pay"); // where to pay goes with the hold
      expect((await w.refused(B, reserveIt(rb))).error).toBe("The reservation has ended.");
      await w.refused(B, on("markPaid", rb)); // a lapsed hold can't be marked paid
      expect((await w.view(C)).notifications.filter((x) => AVAILABLE_AGAIN.test(x.text))).toHaveLength(1); // told once

      // The unit goes to C, with a hold of their own: 15 minutes from the clock's minute, so never more than 15 (here, a second less).
      const next = await w.ok(C, reserveIt(rc));
      expect(E.onClock(w.now)).toBe(w.now - 1000);
      expect(mine(next.view, rc)).toMatchObject({ status: "accepted", holdUntil: E.onClock(w.now) + 15 * MIN });
      const cBefore = await recordOf(w, rc);
      const numbersBefore = numbersIn(await w.view(A), l);
      expect(numbersBefore).toEqual({ reserved: 1, completed: 0, available: 0 });

      // B says they had paid. The seller is told; nothing is reclaimed from C.
      const told = await w.ok(B, lateReport(rb));
      expect(told.toast).toMatch(/^Reported\. .+ has been told\. Handoff can't see payments, so sort it out with them directly\.$/);
      expect(mine(told.view, rb)).toMatchObject({ status: "expired", problem: { by: B.id, role: "buyer", reason: E.LATE_PAYMENT } });
      expect(await recordOf(w, rc)).toEqual(cBefore);
      const sellerView = await w.view(A);
      expect(numbersIn(sellerView, l)).toEqual(numbersBefore);
      const notes = sellerView.notifications.filter((x) => x.text.includes("says they paid for their reservation"));
      expect(notes.map((x) => x.text)).toEqual([expect.stringMatching(/Handoff can't see payments, and nothing was re-reserved\.$/)]);
      expect(notes[0]?.text).toContain(E.fmtMs(until));
      expect((await w.refused(B, lateReport(rb))).error).toBe("A problem is already reported on this match.");
      expect((await w.refused(B, reserveIt(rb))).error).toBe("The reservation has ended.");

      // C's exchange goes on to the end, untouched by the report.
      await w.ok(C, on("markPaid", rc));
      await w.ok(A, on("confirmPayment", rc));
      await w.ok(A, on("markTransferred", rc));
      const done = await w.ok(C, on("buyerReceived", rc));
      expect(mine(done.view, rc)).toMatchObject({ status: "completed" });
      expect(numbersIn(done.view, l)).toEqual({ reserved: 0, completed: 1, available: 0 });
      expect(await recordOf(w, rb)).toMatchObject({ status: "expired", problem: { reason: E.LATE_PAYMENT } });
    });

    it("stale invitations: a price change, a pause, the deadline and a close each leave a plain answer and hold nothing", async () => {
      E.setInviteSwitch(true);
      const { w, l } = await listed("stale", A, 3);
      const rb = await invitedFor(w, A, B, l);
      const rc = await invitedFor(w, A, C, l);
      const rd = await invitedFor(w, A, D, l);

      // Price: it can't drop below an open invitation; raising it is allowed, and the invitation keeps the price it was sent at.
      const lower = await w.refused(A, { type: "editListing", listingId: l, ask: "30" });
      expect(lower.error).toMatch(/^You've invited .+ at \$35\. Keep the price at \$35 or more, or withdraw the invitation first\.$/);
      await w.ok(A, { type: "editListing", listingId: l, ask: "38" });
      const atOldPrice = await w.ok(B, reserveIt(rb));
      expect(atOldPrice.toast).toMatch(/^Reserved for 15 minutes\. Pay .+ \$35 now, then tap "I've sent payment"\.$/);
      expect(mine(atOldPrice.view, rb)).toMatchObject({ status: "accepted", price: 35 });

      // Pause: nobody can reserve, the invitation stays open, and the hold already made continues.
      await w.ok(A, { type: "pauseListing", listingId: l });
      const paused = await w.refused(C, reserveIt(rc));
      expect(paused.error).toMatch(/ has paused this listing, so you can't reserve it right now\. Your invitation stays open until .+\.$/);
      expect(mine(paused.view, rc)).toMatchObject({ status: "invited" });
      expect(mine(paused.view, rc)).not.toHaveProperty("holdUntil");
      await w.ok(B, on("markPaid", rb));
      await w.ok(A, { type: "resumeListing", listingId: l });
      const resumed = await w.ok(C, reserveIt(rc));
      expect(mine(resumed.view, rc)).toMatchObject({ status: "accepted", price: 35 });
      await w.ok(C, on("cancel", rc)); // released again: D's invitation is the one left open

      // The deadline: past it the invitation can't be reserved, and the sweep stores why.
      const open = must((await recordOf(w, rd)).expiresAt, "the invitation's deadline");
      w.advance(open - w.now + MIN);
      expect((await w.refused(D, reserveIt(rd))).error).toBe("This invitation has ended.");
      await w.view(D);
      expect(await recordOf(w, rd)).toMatchObject({ status: "expired", reason: "The invitation ended before it was reserved." });
      expect(numbersIn(await w.view(A), l)).toEqual({ reserved: 1, completed: 0, available: 2 }); // B's, marked paid, is still held

      // Close: an open request and an open invitation are declined, each buyer told; the paid exchange continues.
      const re = await invitedFor(w, A, TEST_E, l);
      const rf = must((await w.ok(TEST_F, askToBuy(l))).resultId, "F's request");
      await w.ok(A, { type: "withdraw", listingId: l });
      for (const id of [re, rf]) expect(await recordOf(w, id)).toMatchObject({ status: "declined", reason: "The seller closed this listing" });
      expect((await w.refused(TEST_E, reserveIt(re))).error).toBe("The seller closed this listing.");
      expect((await w.refused(A, inviteToPay(rf))).error).toBe("This request is closed.");
      expect((await w.refused(TEST_G, askToBuy(l))).error).toBe("This listing is closed.");
      expect((await w.view(TEST_E)).notifications.map((x) => x.text)).toContainEqual(expect.stringMatching(/ closed their listing for \[Test\] Spring Formal, so your invitation is closed\.$/));
      await w.ok(A, on("confirmPayment", rb));
      await w.ok(A, on("markTransferred", rb));
      const done = await w.ok(B, on("buyerReceived", rb));
      expect(mine(done.view, rb)).toMatchObject({ status: "completed", price: 35 });
    });
  });

  // ── The seller's payment method ────────────────────────────────────────────────────────

  describe("the seller's payment method: needed for an invitation, not for a listing (B5.2; §9a; FOLLOWON-PLAN §2.6)", () => {
    const row = async (id: string): Promise<unknown> => (await db.sql<{ pay_methods: unknown }[]>`SELECT pay_methods FROM people WHERE user_id = ${id}`)[0]?.pay_methods;
    /** A seller's profile with no way to be paid at all. */
    async function withoutMethods(seller: Actor): Promise<void> {
      await ensurePerson(db.sql, seller);
      expect(await saveProfile(db.sql, { userId: seller.id, payHandle: "" })).toEqual({ ok: true });
    }

    it("while it's switched off, posting needs a method and an open listing keeps the last one (the rule before the switch)", async () => {
      E.setInviteSwitch(false);
      const S = TEST_E;
      await withoutMethods(S);
      const w = world("guard-off");
      const at = { worldId: w.worldId, now: w.now };
      const ev = await w.createEvent(S);
      expect((await w.refused(S, sellNew(ev))).error).toBe(E.NO_PAY_METHODS);
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [{ kind: "venmo", value: "@hand-test-e" }] })).toMatchObject({ ok: true });
      const l = must((await w.ok(S, sellNew(ev))).resultId, "the listing");
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [], ...at })).toEqual({ ok: false, index: null, error: LAST_METHOD_ERROR });
      expect(await saveProfile(db.sql, { userId: S.id, payHandle: "", ...at })).toEqual({ ok: false, error: LAST_METHOD_ERROR });
      await w.ok(S, { type: "withdraw", listingId: l });
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [], ...at })).toEqual({ ok: true, methods: [] });
    });

    it("once it's on: posting needs none, the first invitation asks for one, and it's kept while an invitation is open", async () => {
      E.setInviteSwitch(true);
      const S = TEST_F;
      await withoutMethods(S);
      const w = world("guard-on");
      const at = { worldId: w.worldId, now: w.now };
      const VENMO = [{ kind: "venmo", value: "hand-test-f" }];
      const PAYPAL = [{ kind: "paypal", value: "hand-test-f@example.invalid" }];

      // Posting: no method asked for, and the listing carries none.
      const ev = await w.createEvent(S);
      const l = must((await w.ok(S, sellNew(ev, 2))).resultId, "the listing");
      expect((await stored(w)).doc.listings.find((x) => x.id === l)).not.toHaveProperty("payHandle");
      const rb = must((await w.ok(B, askToBuy(l))).resultId, "B's request");

      // The first invitation: refused in the words the page collects a method under, with nothing changed.
      const before = (await stored(w)).version;
      expect((await w.refused(S, inviteToPay(rb))).error).toBe(E.NO_PAY_METHODS);
      expect(await recordOf(w, rb)).toMatchObject({ status: "requested" });
      expect((await stored(w)).version).toBe(before);

      // A listing and a request alone need no method: one can be saved and removed again.
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [{ kind: "venmo", value: "@hand-test-f" }], ...at })).toEqual({ ok: true, methods: VENMO });
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [], ...at })).toEqual({ ok: true, methods: [] });
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [{ kind: "venmo", value: "@hand-test-f" }], ...at })).toEqual({ ok: true, methods: VENMO });

      // With a method saved the same invitation goes out. B still isn't shown where to pay.
      await w.ok(S, inviteToPay(rb));
      const invited = await w.view(B);
      expect(mine(invited, rb)).toMatchObject({ status: "invited" });
      expect(mine(invited, rb)).not.toHaveProperty("pay");
      expect(JSON.stringify(invited)).not.toContain("hand-test-f");

      // While the invitation is open the last method stays; changing it is fine.
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [], ...at })).toEqual({ ok: false, index: null, error: LAST_METHOD_OPEN_ERROR });
      expect(await saveProfile(db.sql, { userId: S.id, payHandle: "", ...at })).toEqual({ ok: false, error: LAST_METHOD_OPEN_ERROR });
      expect(await row(S.id)).toEqual(VENMO);
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: PAYPAL, ...at })).toEqual({ ok: true, methods: PAYPAL });

      // B reserves: the exchange copies where to pay, as saved at that moment. The profile is free again, and B keeps the copy.
      const held = await w.ok(B, reserveIt(rb));
      expect(mine(held.view, rb)).toMatchObject({ status: "accepted", pay: PAYPAL });
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: [], ...at })).toEqual({ ok: true, methods: [] });
      expect(mine(await w.view(B), rb)).toMatchObject({ status: "accepted", pay: PAYPAL });

      // The next buyer's invitation asks for a method again.
      const rc = must((await w.ok(C, askToBuy(l))).resultId, "C's request");
      expect((await w.refused(S, inviteToPay(rc))).error).toBe(E.NO_PAY_METHODS);
      expect(await recordOf(w, rc)).toMatchObject({ status: "requested" });
    });

    it("the guard waits for the world's lock, so an invitation sent meanwhile is counted", async () => {
      E.setInviteSwitch(true);
      const S = TEST_G;
      await withoutMethods(S);
      const METHOD = [{ kind: "zelle", value: "handoff-test-g@example.invalid" }];
      expect(await savePayMethods(db.sql, { userId: S.id, payMethods: METHOD })).toEqual({ ok: true, methods: METHOD });
      const w = world("guard-lock");
      const ev = await w.createEvent(S);
      const l = must((await w.ok(S, sellNew(ev))).resultId, "the listing");
      const rb = must((await w.ok(B, askToBuy(l))).resultId, "B's request");
      const locked = deferred();
      const release = deferred();
      const inviting = w.act(S, inviteToPay(rb), { hooks: { afterLock: async () => { locked.resolve(); await release.promise; } } });
      await locked.promise; // the invitation's transaction holds the world's lock and hasn't committed
      const removing = savePayMethods(db.sql, { userId: S.id, payMethods: [], worldId: w.worldId, now: w.now });
      try {
        await waitForLockWaiters(db, 1);
      } finally {
        release.resolve();
      }
      okOf(await inviting, "the invitation");
      expect(await removing).toEqual({ ok: false, index: null, error: LAST_METHOD_OPEN_ERROR });
      expect(await row(S.id)).toEqual(METHOD);
    });
  });

  // ── The switch ─────────────────────────────────────────────────────────────────────────

  describe("the switch (flipped for the live page in step S3; a test turns it off to make what came before)", () => {
    it("exchanges begun the old way finish on their own terms, beside new ones on the same listing (B5.7e)", async () => {
      E.setInviteSwitch(false); // before the switch: the world, its listing and two exchanges begun the old way
      const { w, l } = await listed("legacy", A, 3, { obo: true });
      const rb = must((await w.ok(B, sent.take(l))).resultId, "B's reservation");
      const rc = must((await w.ok(C, sent.offer(l, "30"))).resultId, "C's offer");
      const before = await stored(w);
      expect(before.doc.inviteSince ?? 0).toBe(0);
      const bBefore = await recordOf(w, rb);
      expect(bBefore).toMatchObject({ status: "accepted", holdUntil: w.now + 15 * MIN });

      E.setInviteSwitch(true);
      w.advance(MIN);
      // The old ways of starting an exchange are refused for everyone, and a refusal stores and stamps nothing.
      expect((await w.refused(D, sent.take(l))).error).toBe(ASK_FIRST);
      expect((await w.refused(D, sent.offer(l, "30"))).error).toBe(ASK_FIRST);
      const still = await stored(w);
      expect(still.version).toBe(before.version);
      expect(still.doc.inviteSince ?? 0).toBe(0);
      expect(await recordOf(w, rb)).toEqual(bBefore);

      // C's older offer is answered the old way, on its old terms: two hours to pay, and no mark.
      const accepted = await w.ok(A, sent.onRequest("accept", rc));
      expect(accepted.toast).toMatch(/^Offer accepted\. .+ has 2 hours to pay you\./);
      const offer = await recordOf(w, rc);
      expect(offer).toMatchObject({ status: "accepted", price: 30, holdUntil: w.now + 2 * HOUR });
      expect(offer).not.toHaveProperty("inviteFlow");
      // That first stored change after the switch stamps the world, after both old records were made.
      const since = must((await stored(w)).doc.inviteSince, "the stamp");
      expect(since).toBeGreaterThanOrEqual(w.now);
      expect(since).toBeLessThan(w.now + 1000);
      expect(since).toBeGreaterThan(bBefore.createdAt);
      expect(since).toBeGreaterThan(offer.createdAt);

      // B's reservation finishes with the steps it always had.
      await w.ok(B, on("markPaid", rb));
      await w.ok(A, on("confirmPayment", rb));
      await w.ok(A, on("markTransferred", rb));
      await w.ok(B, on("buyerReceived", rb));
      await w.ok(C, on("markPaid", rc));

      // The same listing's last unit goes the new way.
      const rd = await invitedFor(w, A, D, l);
      const held = await w.ok(D, reserveIt(rd));
      expect(numbersIn(held.view, l)).toEqual({ reserved: 2, completed: 1, available: 0 });
      const end = await stored(w);
      expect(end.doc.inviteSince).toBe(since); // stamped once
      const byId = new Map(end.doc.requests.map((x) => [x.id, [x.status, x.inviteFlow ?? null]]));
      expect([rb, rc, rd].map((id) => byId.get(id))).toEqual([["completed", null], ["paid", null], ["accepted", true]]);
    });

    it("a new exchange without the flow's mark never reaches a stamped world: an old build's reservation is refused (B5.7d, B5.8)", async () => {
      /** The engine as it was before the switch: the same reducer with the flow off for the length of one call. */
      const oldBuild: EnginePort = {
        ...enginePort,
        reduce(doc, actor, a) {
          const was = E.inviteFlowOn();
          E.setInviteSwitch(false);
          try {
            return enginePort.reduce(doc, actor, a);
          } finally {
            E.setInviteSwitch(was);
          }
        },
      };
      /** An engine bug: a request to buy stored without its mark. */
      const unmarking: EnginePort = {
        ...enginePort,
        reduce(doc, actor, a) {
          const res = enginePort.reduce(doc, actor, a);
          if (res.error === undefined && a.type === "requestToBuy") for (const r of (res.state as unknown as LiveWorld).requests) delete r.inviteFlow;
          return res;
        },
      };
      const through = (w: StoreWorld, port: EnginePort, actor: Actor, action: SentAction) =>
        applyAction(db.sql, { worldId: w.worldId, actor, requestId: randomUUID(), action, now: w.now }, port);

      // A world that was never switched: the old build's reservation is stored, as it was before the switch.
      E.setInviteSwitch(false);
      const off = await listed("unmarked-off", A, 2);
      const took = okOf(await through(off.w, oldBuild, B, sent.take(off.l)), "the old build's reservation");
      const old = await recordOf(off.w, must(took.resultId, "the reservation"));
      expect(old).toMatchObject({ status: "accepted" });
      expect(old).not.toHaveProperty("inviteFlow");

      // A world stamped by its first change after the switch.
      E.setInviteSwitch(true);
      const stamped = await listed("unmarked-on", A, 2);
      const before = await stored(stamped.w);
      expect(before.doc.inviteSince).toBeGreaterThan(0);
      stamped.w.advance(MIN);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(await through(stamped.w, oldBuild, B, sent.take(stamped.l))).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
        const text = JSON.stringify(log.mock.calls);
        expect(text).toContain("InvariantError");
        expect(text).toContain("legacy-new:");
        log.mockClear();
        expect(await through(stamped.w, unmarking, B, askToBuy(stamped.l))).toEqual({ ok: false, code: "internal", error: INTERNAL_ERROR });
        const second = JSON.stringify(log.mock.calls);
        expect(second).toContain("InvariantError");
        expect(second).toMatch(/legacy-new:|invite-shape:/);
      } finally {
        log.mockRestore();
      }
      // Nothing was stored either time.
      const after = await stored(stamped.w);
      expect(after.version).toBe(before.version);
      expect(after.doc.requests).toEqual([]);
      expect(E.inviteFlowOn()).toBe(true); // the old build's port put the switch back

      // Through the real engine the old action is refused in words, and the new one is stored with its mark.
      expect((await stamped.w.refused(B, sent.take(stamped.l))).error).toBe(ASK_FIRST);
      const r = must((await stamped.w.ok(B, askToBuy(stamped.l))).resultId, "the request");
      expect(await recordOf(stamped.w, r)).toMatchObject({ status: "requested", inviteFlow: true });
    });
  });

  // ── In-app notifications (outbound email was removed from the tool: review of PR #88) ───

  describe("the new steps' notifications, in the app", () => {
    it("a request to buy, an invitation and a late payment report each reach the right person's bell, never with where to pay", async () => {
      E.setInviteSwitch(true);
      const w = world("notes");
      await canSell(w, A);
      const ev = await w.createEvent(A);
      const l = await w.list(A, ev, { qty: 1, ask: "35" });
      /** One step with a known request id, and the notifications that change stored. */
      const step = async (actor: Actor, action: SentAction) => {
        const requestId = randomUUID();
        const ok = await w.ok(actor, action, { requestId });
        return { ok, notes: await changeNotes(w.sql, w.worldId, requestId) };
      };

      // B asks: the seller hears.
      const asked = await step(B, askToBuy(l));
      const rb = must(asked.ok.resultId, "B's request");
      expect(asked.notes.map((x) => x.userId)).toEqual([A.id]);
      w.advance(MIN);
      // A invites B: the buyer hears, with a link to their to-do list.
      const invitation = await step(A, inviteToPay(rb));
      expect(invitation.notes.map((x) => x.userId)).toEqual([B.id]);
      expect(invitation.notes[0]?.link).toEqual({ name: "activity", tab: "todo" });
      w.advance(MIN);
      // B reserves, lets the hold lapse; then reports a late payment: the seller hears.
      await step(B, reserveIt(rb));
      w.advance(16 * MIN);
      await w.view(C); // the sweep stores the lapse
      const late = await step(B, lateReport(rb));
      expect(late.notes.map((x) => x.userId)).toEqual([A.id]);

      // Every one of them is in its person's view, unread, and none says where to pay.
      const aView = await w.view(A);
      const bView = await w.view(B);
      expect(aView.unreadCount).toBeGreaterThanOrEqual(2);
      expect(bView.notifications.map((x) => x.id)).toContain(must(invitation.notes[0], "B's note").id);
      for (const x of [...asked.notes, ...invitation.notes, ...late.notes]) expect(x.text).not.toContain(handleOf(A));
      // And the bell clears them: marked read, the count drops to nothing.
      await markNotificationsRead(w.sql, { worldId: w.worldId, userId: B.id, ids: "all" });
      expect((await w.view(B)).unreadCount).toBe(0);
    });
  });
});