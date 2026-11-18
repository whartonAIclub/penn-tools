// Email updates on Postgres (follow-on Batch 4; FOLLOWON-PLAN §1.4 B4.2, B4.4, B4.5, B4.6, B4.7, B4.9, B4.10, B4.13, B4.14): preferences,
// jobs, the dispatcher and the local capture, through the real store and engine on a throwaway schema (helpers/email-db.ts). The store
// makes the jobs itself, in each action's transaction, from the engine's own tags; actTagged runs an action through it and names the tag
// each notification should carry, so each case names exactly the emails it's about and fails if the store queues anything else. Two
// tests run the dispatcher with the store's own hooks (storeDispatchDeps), as the route does. Everyone is a labelled TEST account with
// a made-up id and an @example.invalid address; no sign-in of any kind, nothing leaves the database, and no world outside this schema
// is touched.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensurePerson, markNotificationsRead, storeDispatchDeps } from "../store.js";
import type { Actor, WorldId } from "../types.js";
import { idempotencyKey, memoryCaptureSender, sqlCaptureSender } from "../email/capture.js";
import { LEASE_MS, MATCH_DAILY_CAP, dispatchEmail, insertEmailJobs, pruneEmailIn } from "../email/dispatch.js";
import { providerAllows } from "../email/gates.js";
import { emailJobRows } from "../email/kinds.js";
import {
  CONSENT_VERSION,
  EMAIL_UNAVAILABLE_ERROR,
  NOT_FOR_THIS_ACCOUNT_ERROR,
  NO_EMAIL_ADDRESS_ERROR,
  NO_PROFILE_ERROR,
  readEmailState,
  saveEmailPrefs,
} from "../email/prefs.js";
import { renderEmail } from "../email/templates.js";
import type { DispatchCounts, DispatchOptions, EmailMessage, EmailSender } from "../email/types.js";
import { databaseUrl, type TestDb } from "./helpers/db.js";
import {
  SITE,
  TEST_D,
  TEST_E,
  TEST_F,
  TEST_G,
  actTagged,
  canSell,
  capturesOf,
  changeNotes,
  createEmailTestDb,
  heartbeat,
  jobsOf,
  optIn,
  testDispatchDeps,
  to,
} from "./helpers/email-db.js";
import { DAY, HOUR, MIN, StoreWorld, T0, TEST_A, TEST_B, TEST_C, actions as sent, dateAfter } from "./helpers/live-store.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

describe.skipIf(!databaseUrl)("email updates (Postgres)", () => {
  let db: TestDb;
  let n = 0;
  beforeAll(async () => {
    db = await createEmailTestDb("email");
  }, 30_000);
  afterAll(async () => {
    await db?.close();
  });
  // One schema for the file: every test starts with no worlds (their notifications, jobs and captures cascade away), no preferences
  // and no heartbeat, so one test's jobs never reach another's dispatcher run.
  beforeEach(async () => {
    await db.sql`DELETE FROM worlds`;
    await db.sql`DELETE FROM email_prefs`;
    await db.sql`DELETE FROM email_dispatch`;
  });

  const world = (id?: WorldId): StoreWorld => new StoreWorld(db.sql, id ?? (`test-email-${++n}` as WorldId), T0);
  /** One dispatcher run at the world's time; the capture's grace is 0 unless `grace` asks for the default 2 minutes. */
  const run = (w: StoreWorld, sender: EmailSender, over: Partial<DispatchOptions> = {}, grace = false): Promise<DispatchCounts> =>
    dispatchEmail(w.sql, { sender, siteUrl: SITE, worlds: "test", ...(grace ? {} : { graceMs: 0 }), now: w.now, ...over }, testDispatchDeps());
  const counts = (over: Partial<DispatchCounts>): DispatchCounts => ({ swept: 0, claimed: 0, sent: 0, failed: 0, skipped: 0, dead: 0, expired: 0, pruned: 0, ...over });
  const state = (w: StoreWorld, who: Actor = TEST_A) => readEmailState(w.sql, { userId: who.id, worldId: w.worldId, now: w.now });

  /** A's event and A's listing of `qty` tickets at $35 (offers welcome), the capture's heartbeat fresh, and A taking exchange emails. */
  async function market(o: { qty?: number; obo?: boolean } = {}): Promise<{ w: StoreWorld; ev: string; l: string }> {
    const w = world();
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, TEST_A);
    const ev = await w.createEvent(TEST_A);
    const l = await w.list(TEST_A, ev, { qty: o.qty ?? 3, ask: "35", obo: o.obo ?? true });
    await optIn(w, TEST_A, { exchange: true });
    return { w, ev, l };
  }
  /** `buyer` offers $30 on the listing; A's notification is tagged offer.received, about the offer the action made. */
  const offer = (w: StoreWorld, buyer: Actor, l: string) => actTagged(w, buyer, sent.offer(l, "30"), to(TEST_A.id, "offer.received"));

  describe("making jobs", () => {
    it("makes a job only for an opted-in recipient of an emailed kind, while the capture's dispatcher worked in the last 10 minutes (B4.2, B4.15)", async () => {
      const w = world();
      await canSell(w, TEST_A);
      const ev = await w.createEvent(TEST_A);
      const l = await w.list(TEST_A, ev, { qty: 3, ask: "35", obo: true });
      // No dispatcher has run: email isn't offered, and turning it on is refused.
      expect(await state(w)).toEqual({ available: false, mode: null, address: TEST_A.email, exchange: false, matches: false, reconfirm: false, paused: false });
      expect(await saveEmailPrefs(w.sql, { userId: TEST_A.id, address: TEST_A.email, signIn: "dev", worldId: w.worldId, exchange: true, now: w.now }))
        .toEqual({ ok: false, error: EMAIL_UNAVAILABLE_ERROR });

      await heartbeat(w.sql, "capture", w.now);
      await optIn(w, TEST_A, { exchange: true });
      expect(await state(w)).toEqual({ available: true, mode: "capture", address: TEST_A.email, exchange: true, matches: false, reconfirm: false, paused: false });
      const first = await offer(w, TEST_B, l);
      const r = must(first.ok.resultId, "B's offer");
      expect(first.jobs).toBe(1);
      // A counter-offer goes to B, who didn't turn email on: it stays in the app.
      const counter = await actTagged(w, TEST_A, { type: "counter", requestId: r, amount: "33" }, to(TEST_B.id, "counter.received", r));
      expect(counter.notes.map((x) => x.userId)).toEqual([TEST_B.id]);
      expect(counter.jobs).toBe(0);
      // A notification the engine doesn't tag (a reservation at the asking price) stays in the app too, though A hears of it.
      const taken = await actTagged(w, TEST_C, sent.take(l), () => null);
      expect(taken.notes.map((x) => x.userId)).toEqual([TEST_A.id]);
      expect(taken.jobs).toBe(0);
      // The heartbeat goes stale: nothing more is queued, and email is no longer offered.
      w.advance(11 * MIN);
      expect((await offer(w, TEST_D, l)).jobs).toBe(0);
      expect((await state(w)).available).toBe(false);
      const jobs = await jobsOf(w.sql, w.worldId);
      expect(jobs.map((j) => [j.user_id, j.kind, j.category, j.ref, j.status, j.attempts])).toEqual([[TEST_A.id, "offer.received", "exchange", r, "pending", 0]]);
      expect(jobs[0]?.event_key).toBe(`${first.requestId}:offer.received:${r}`);
      // The live world's emails need a provider's heartbeat; the capture's never counts for it.
      await heartbeat(w.sql, "capture", w.now);
      expect((await readEmailState(w.sql, { userId: TEST_A.id, worldId: "live", now: w.now })).available).toBe(false);
    });

    it("writes a job with its notification or not at all, and only for a notification really stored for that person (B4.7)", async () => {
      const { w, l } = await market();
      const made = await offer(w, TEST_B, l);
      const r = must(made.ok.resultId, "B's offer");
      const note = must(made.notes.find((x) => x.userId === TEST_A.id), "A's notification");
      const before = await jobsOf(w.sql, w.worldId);
      const id = "0123456789abcdef";
      const change = randomUUID();
      const rows = (noteId: string, userId: string) => emailJobRows([{ id: noteId, userId, kind: "offer.received", ref: r, link: null }]);
      // A notification and its job written in one transaction that then fails: neither is kept.
      await expect(w.sql.begin(async (raw) => {
        const tx = raw as unknown as typeof w.sql;
        await tx`INSERT INTO notifications (world_id, id, user_id, text, link, dedupe, at)
                 VALUES (${w.worldId}, ${id}, ${TEST_A.id}, 'Someone made an offer.', '{"name":"activity"}'::jsonb, md5('x'), ${new Date(w.now)})`;
        expect(await insertEmailJobs(tx, { worldId: w.worldId, changeId: change, now: w.now, rows: rows(id, TEST_A.id) })).toBe(1);
        throw new Error("the action failed before COMMIT");
      })).rejects.toThrow("before COMMIT");
      expect(await db.sql`SELECT 1 FROM notifications WHERE world_id = ${w.worldId} AND id = ${id}`).toHaveLength(0);
      expect(await jobsOf(w.sql, w.worldId)).toEqual(before);
      // A notification that wasn't stored (RB-10 kept the first of the same words) gets no job, and fails nothing.
      expect(await insertEmailJobs(w.sql, { worldId: w.worldId, changeId: change, now: w.now, rows: rows(id, TEST_A.id) })).toBe(0);
      // Nor does a stored notification claimed for someone it wasn't for.
      await optIn(w, TEST_B, { exchange: true });
      expect(await insertEmailJobs(w.sql, { worldId: w.worldId, changeId: change, now: w.now, rows: rows(note.id, TEST_B.id) })).toBe(0);
    });

    it("makes one job per change, kind, record and recipient: a retried change or a second identical notice adds none (B4.14)", async () => {
      const { w, l } = await market();
      const made = await offer(w, TEST_B, l);
      const r = must(made.ok.resultId, "B's offer");
      expect(made.jobs).toBe(1);
      // The same change again (a retried click, answered from the actions log) stores nothing new and queues nothing.
      const again = await actTagged(w, TEST_B, sent.offer(l, "30"), to(TEST_A.id, "offer.received"), made.requestId);
      expect(again.ok.replay).toBe(true);
      expect(again.notes.length).toBeGreaterThan(0);
      expect(again.jobs).toBe(0);
      // Two notifications in one change about the same record, of the same kind, for the same person: one email.
      const twin = "fedcba9876543210";
      await w.sql`INSERT INTO notifications (world_id, id, user_id, text, link, dedupe, at)
                  VALUES (${w.worldId}, ${twin}, ${TEST_A.id}, 'The same offer, said again.', NULL, md5('twin'), ${new Date(w.now)})`;
      const rows = emailJobRows([{ id: twin, userId: TEST_A.id, kind: "offer.received", ref: r, link: null }]);
      expect(await insertEmailJobs(w.sql, { worldId: w.worldId, changeId: made.requestId, now: w.now, rows })).toBe(0);
      expect(await jobsOf(w.sql, w.worldId)).toHaveLength(1);
    });
  });

  describe("dispatching", () => {
    it("captures the email once, with its one link; a second run sends nothing (B4.3, B4.4; B4.12's server half)", async () => {
      const { w, ev, l } = await market();
      const made = await offer(w, TEST_B, l);
      const note = must(made.notes.find((x) => x.userId === TEST_A.id), "A's notification");
      const capture = sqlCaptureSender(w.sql);
      expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
      const captured = await capturesOf(w.sql, w.worldId);
      expect(captured).toHaveLength(1);
      const c = must(captured[0], "the capture");
      expect(c).toMatchObject({
        idempotency_key: idempotencyKey(w.worldId, note.id),
        to_address: TEST_A.email,
        subject: "Offer on your [Test] Spring Formal ticket",
        action_url: `${SITE}/tools/handoff#activity?listing=${l}`,
      });
      expect(c.body_text).toMatch(/^Handoff made an offer\. Accept, counter or decline by [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M\.\n\n/);
      expect(c.body_text).toContain(`\n\n${SITE}/tools/handoff#activity?listing=${l}\n\n`);
      expect(c.body_text).toContain(`You turned on Handoff email updates. To stop them, open Handoff settings: ${SITE}/tools/handoff#profile`); // amendment 9h: the page's new name, same link
      expect(c.body_text).not.toContain(ev); // the seller's link is the listing's card in My activity
      const [job] = await jobsOf(w.sql, w.worldId);
      expect(job).toMatchObject({ status: "sent", reason: null, attempts: 1, lease_until: null });
      expect(job?.sent_at?.getTime()).toBe(w.now);
      // Nothing is sent twice: a second run finds nothing due.
      w.advance(MIN);
      expect(await run(w, capture)).toEqual(counts({}));
      expect(await capturesOf(w.sql, w.worldId)).toHaveLength(1);
    });

    it("waits out the grace period, so a notification read in the app isn't emailed", async () => {
      const { w, l } = await market();
      await offer(w, TEST_B, l);
      const capture = sqlCaptureSender(w.sql);
      expect(await run(w, capture, {}, true)).toEqual(counts({})); // 2 minutes by default
      await markNotificationsRead(w.sql, { worldId: w.worldId, userId: TEST_A.id, ids: "all" });
      w.advance(2 * MIN);
      expect(await run(w, capture, {}, true)).toEqual(counts({ claimed: 1, skipped: 1 }));
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.status, j.reason])).toEqual([["skipped", "read_in_app"]]);
      expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
    });

    it("retries a temporary failure with the same key, marks a permanent one dead, and gives up after the fifth attempt (B4.4)", async () => {
      const { w, l } = await market();
      await offer(w, TEST_B, l);
      const flaky = memoryCaptureSender({ failWith: (_m, attempt) => (attempt === 1 ? { ok: false, retryable: true, code: "timeout" } : undefined) });
      expect(await run(w, flaky)).toEqual(counts({ claimed: 1, failed: 1 }));
      const [failed] = await jobsOf(w.sql, w.worldId);
      expect(failed).toMatchObject({ status: "failed", reason: "retry:timeout", attempts: 1, lease_until: null });
      expect(failed?.retry_at.getTime()).toBe(w.now + MIN);
      w.advance(30_000);
      expect(await run(w, flaky)).toEqual(counts({})); // not due yet
      w.advance(30_000);
      expect(await run(w, flaky)).toEqual(counts({ claimed: 1, sent: 1 }));
      expect((await jobsOf(w.sql, w.worldId))[0]).toMatchObject({ status: "sent", attempts: 2 });
      const key = must(flaky.sent[0], "the sent email").idempotencyKey;
      expect(flaky.attempts.map((m) => m.idempotencyKey)).toEqual([key, key]);

      // A permanent refusal: dead at once, never retried.
      await offer(w, TEST_C, l);
      const refusing = memoryCaptureSender({ failWith: () => ({ ok: false, retryable: false, code: "rejected" }) });
      expect(await run(w, refusing)).toEqual(counts({ claimed: 1, dead: 1 }));
      expect((await jobsOf(w.sql, w.worldId))[1]).toMatchObject({ status: "dead", reason: "rejected" });
      w.advance(2 * HOUR);
      expect(await run(w, refusing)).toEqual(counts({}));
      expect(refusing.attempts).toHaveLength(1);

      // Failing every time: retried after 1, 5, 15 and 60 minutes, then dead after the fifth attempt.
      await offer(w, TEST_D, l);
      const down = memoryCaptureSender({ failWith: () => ({ ok: false, retryable: true, code: "server_error" }) });
      const seen: DispatchCounts[] = [];
      for (const wait of [0, 1, 5, 15, 60]) {
        w.advance(wait * MIN);
        seen.push(await run(w, down));
      }
      expect(seen).toEqual([...Array<DispatchCounts>(4).fill(counts({ claimed: 1, failed: 1 })), counts({ claimed: 1, dead: 1 })]);
      expect((await jobsOf(w.sql, w.worldId))[2]).toMatchObject({ status: "dead", reason: "attempts", attempts: 5 });
      expect(down.attempts).toHaveLength(5);
      expect(new Set(down.attempts.map((m) => m.idempotencyKey)).size).toBe(1);
    });

    it("stops a run on an authentication or configuration failure: retried later, and no working heartbeat recorded", async () => {
      const { w, l } = await market();
      const okAt = w.now;
      await offer(w, TEST_B, l);
      await offer(w, TEST_C, l);
      w.advance(MIN);
      const misconfigured = memoryCaptureSender({ failWith: () => ({ ok: false, retryable: false, code: "auth" }) });
      expect(await run(w, misconfigured)).toEqual(counts({ claimed: 2, failed: 1 }));
      expect(misconfigured.attempts).toHaveLength(1); // the second was handed back unsent
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.status, j.reason, j.attempts])).toEqual([
        ["failed", "retry:auth", 1],
        ["pending", null, 0],
      ]);
      const [beat] = await w.sql<{ last_run_at: Date; last_ok_at: Date | null }[]>`SELECT last_run_at, last_ok_at FROM email_dispatch WHERE sender = 'capture'`;
      expect(beat?.last_run_at.getTime()).toBe(w.now);
      expect(beat?.last_ok_at?.getTime()).toBe(okAt); // not this run's
    });

    it("captures once after a send that failed past the outbox, or a crash that left the job leased (B4.4)", async () => {
      const { w, l } = await market();
      await offer(w, TEST_B, l);
      const capture = sqlCaptureSender(w.sql);
      // The email reached the outbox, then the send threw: the run survives, and the retry captures no second copy.
      const throwing: EmailSender = { ...capture, send: async (m: EmailMessage) => { await capture.send(m); throw new Error("lost connection"); } };
      expect(await run(w, throwing)).toEqual(counts({ claimed: 1, failed: 1 }));
      expect((await jobsOf(w.sql, w.worldId))[0]).toMatchObject({ status: "failed", reason: "retry:network" });
      w.advance(MIN);
      expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
      expect(await capturesOf(w.sql, w.worldId)).toHaveLength(1);

      // A dispatcher that died mid-send leaves its claim (sending, leased for 2 minutes) and the email already in the outbox.
      await offer(w, TEST_C, l);
      const job = must((await jobsOf(w.sql, w.worldId))[1], "the second job");
      const rel = (await testDispatchDeps().checkJobs(w.sql, w.worldId, [{ notificationId: job.notification_id, userId: job.user_id, kind: "offer.received", ref: job.ref, link: null }], w.now)).get(job.notification_id);
      if (!rel?.ok) throw new Error("the offer should be worth emailing");
      const email = must(renderEmail("offer.received", rel.facts, SITE), "the email");
      await w.sql`UPDATE email_jobs SET status = 'sending', attempts = 1, lease_until = ${new Date(w.now + LEASE_MS)}
                  WHERE world_id = ${w.worldId} AND notification_id = ${job.notification_id}`;
      expect(await capture.send({ to: must(TEST_A.email, "A's address"), subject: email.subject, text: email.text, idempotencyKey: idempotencyKey(w.worldId, job.notification_id), actionUrl: email.actionUrl }))
        .toEqual({ ok: true, providerId: null });
      w.advance(MIN);
      expect(await run(w, capture)).toEqual(counts({})); // still leased to the run that died
      w.advance(LEASE_MS);
      expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
      expect((await jobsOf(w.sql, w.worldId))[1]).toMatchObject({ status: "sent", attempts: 2 });
      const captured = await capturesOf(w.sql, w.worldId);
      expect(captured).toHaveLength(2);
      expect(captured.filter((x) => x.notification_id === job.notification_id)).toHaveLength(1);
    });

    it("records an email the provider says it already accepted (a lost answer, then a retry it won't send twice) as sent with a note, not dead", async () => {
      const { w, l } = await market();
      await offer(w, TEST_B, l);
      // The first attempt's answer is lost. On the retry the provider answers that it already took an email with this key: it sends
      // nothing more, and says so (SendResult.duplicate).
      const memory = memoryCaptureSender();
      let attempt = 0;
      const provider: EmailSender = {
        ...memory,
        send: async () => (++attempt === 1 ? { ok: false, retryable: true, code: "timeout" } : { ok: true, providerId: null, duplicate: true }),
      };
      expect(await run(w, provider)).toEqual(counts({ claimed: 1, failed: 1 }));
      w.advance(MIN);
      expect(await run(w, provider)).toEqual(counts({ claimed: 1, sent: 1 }));
      const [job] = await jobsOf(w.sql, w.worldId);
      expect(job).toMatchObject({ status: "sent", reason: "already_accepted", attempts: 2, lease_until: null });
      expect(job?.sent_at?.getTime()).toBe(w.now);
      expect(await w.sql`SELECT provider_id FROM email_jobs WHERE world_id = ${w.worldId}`).toEqual([{ provider_id: null }]);
      w.advance(2 * HOUR);
      expect(await run(w, provider)).toEqual(counts({})); // final: never tried again
      expect(attempt).toBe(2);

      // An ordinary send carries no note, and only `duplicate: true` is one.
      await offer(w, TEST_C, l);
      const odd: EmailSender = { ...memory, send: async () => ({ ok: true, providerId: "re_1", duplicate: "yes" }) as never };
      expect(await run(w, odd)).toEqual(counts({ claimed: 1, sent: 1 }));
      expect((await jobsOf(w.sql, w.worldId))[1]).toMatchObject({ status: "sent", reason: null });
    });

    it("sends separate exchanges with identical wording separately (B4.13)", async () => {
      const { w, l } = await market({ qty: 2, obo: false });
      const capture = sqlCaptureSender(w.sql);
      const paid = async (): Promise<{ r: string; p: Awaited<ReturnType<typeof actTagged>> }> => {
        const r = must((await w.ok(TEST_B, sent.take(l))).resultId, "B's reservation");
        return { r, p: await actTagged(w, TEST_B, sent.onRequest("markPaid", r), to(TEST_A.id, "payment.reported", r)) };
      };
      // B's first exchange: paid (A is emailed), then finished, so B can reserve again.
      const first = await paid();
      expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
      for (const [who, type] of [[TEST_A, "confirmPayment"], [TEST_A, "markTransferred"], [TEST_B, "buyerReceived"]] as const) await w.ok(who, sent.onRequest(type, first.r));
      // The second exchange, paid in the same words while A hasn't opened the first.
      const second = await paid();
      expect(first.p.notes.map((x) => x.text)).toEqual(second.p.notes.map((x) => x.text));
      expect([first.p.jobs, second.p.jobs]).toEqual([1, 1]);
      expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
      const captured = await capturesOf(w.sql, w.worldId);
      expect(new Set(captured.map((x) => x.idempotency_key)).size).toBe(2);
      expect(captured.map((x) => x.subject)).toEqual(["Handoff says they paid: [Test] Spring Formal", "Handoff says they paid: [Test] Spring Formal"]);
      expect(captured.map((x) => x.action_url)).toEqual([`${SITE}/tools/handoff#activity?listing=${l}`, `${SITE}/tools/handoff#activity?listing=${l}`]);
    });

    it("skips an exchange email whose step was done before it went out (B4.5)", async () => {
      const { w, l } = await market();
      await optIn(w, TEST_B, { exchange: true });
      const r = must((await w.ok(TEST_B, sent.offer(l, "30"))).resultId, "B's offer");
      expect((await actTagged(w, TEST_A, sent.onRequest("accept", r), to(TEST_B.id, "offer.accepted", r))).jobs).toBe(1);
      await w.ok(TEST_B, sent.onRequest("markPaid", r)); // B paid in the app before the email went out
      // Three jobs were queued along the way: A's about the offer (answered by the acceptance), B's about the acceptance (answered by
      // the payment), and A's about the payment, the one step still open, which goes out.
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 3, sent: 1, skipped: 2 }));
      // All three were made at the same injected instant, so they're compared by kind.
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.kind, j.user_id, j.status, j.reason]).sort()).toEqual([
        ["offer.accepted", TEST_B.id, "skipped", "not_relevant:answered"],
        ["offer.received", TEST_A.id, "skipped", "not_relevant:answered"],
        ["payment.reported", TEST_A.id, "sent", null],
      ]);
      expect((await capturesOf(w.sql, w.worldId)).map((c) => c.subject)).toEqual(["Handoff says they paid: [Test] Spring Formal"]);
    });

    it("ends a job of a kind this code doesn't send at once, rather than retrying it", async () => {
      const { w, l } = await market();
      expect((await offer(w, TEST_B, l)).jobs).toBe(1);
      // A later batch's kind, after a rollback. (Until follow-on B5 this stand-in was 'buy.requested', which this code now sends; any
      // kind it doesn't know, in the table's pattern, checks the same thing.)
      await w.sql`UPDATE email_jobs SET kind = 'later.kind' WHERE world_id = ${w.worldId}`;
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 1, dead: 1 }));
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.status, j.reason, j.lease_until])).toEqual([["dead", "unknown_kind", null]]);
      expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
    });

    it("skips an overdue job without sending it, and prunes finished jobs after 14 days and captures after 7", async () => {
      const { w, l } = await market();
      await offer(w, TEST_B, l);
      await offer(w, TEST_C, l);
      expect(await run(w, sqlCaptureSender(w.sql), { limit: 1 })).toEqual(counts({ claimed: 1, sent: 1 }));
      w.advance(25 * HOUR); // exchange emails are worth sending for 24 hours (and the offers have expired, so the world is swept)
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ swept: 1, expired: 1 }));
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.status, j.reason])).toEqual([["sent", null], ["skipped", "expired"]]);
      await w.sql`UPDATE email_capture SET captured_at = ${new Date(w.now - 8 * DAY)} WHERE world_id = ${w.worldId}`;
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ pruned: 1 })); // the capture; its job is a day old
      expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
      w.advance(15 * DAY);
      expect(await pruneEmailIn(w.sql, w.worldId, w.now)).toBe(2);
      expect(await jobsOf(w.sql, w.worldId)).toEqual([]);
    });

    it("sweeps due worlds itself, so delivery doesn't wait for anyone to open a page (B4.9)", async () => {
      const { w, l } = await market({ obo: false });
      await w.ok(TEST_B, sent.take(l)); // held for payment
      const version = async (): Promise<number> => must((await w.sql<{ version: number }[]>`SELECT version FROM worlds WHERE id = ${w.worldId}`)[0], "the world").version;
      const before = await version();
      w.advance(16 * MIN);
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ swept: 1 }));
      expect(await version()).toBe(before + 1);
      const lapse = await w.sql<{ user_id: string }[]>`SELECT user_id FROM notifications WHERE world_id = ${w.worldId} AND text LIKE '%reservation%ended%'`;
      expect(lapse.map((x) => x.user_id).sort()).toEqual([TEST_A.id, TEST_B.id].sort());
    });

    it("runs the whole server path on the engine's own tags: an offer through applyAction queues the seller's job in its write, a public request queues no seller job, and the store's hooks capture the one email (B4.1, B4.6, B4.12's server half)", async () => {
      const { w, ev, l } = await market();
      await optIn(w, TEST_A, { matches: true }); // both categories on
      // No test-side tagging: the engine tags B's offer for A, and transact makes the job in B's write.
      const rid = randomUUID();
      const offered = await w.ok(TEST_B, sent.offer(l, "30"), { requestId: rid });
      const r = must(offered.resultId, "B's offer");
      const [note, ...others] = await changeNotes(w.sql, w.worldId, rid);
      expect([note?.userId, others]).toEqual([TEST_A.id, []]);
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.notification_id, j.user_id, j.kind, j.category, j.ref, j.status, j.event_key]))
        .toEqual([[must(note, "A's notification").id, TEST_A.id, "offer.received", "exchange", r, "pending", `${rid}:offer.received:${r}`]]);
      // B4.6: C posts a public request for the event. A, with a listing for it, hears of it in the app, and no seller job is made.
      const asked = randomUUID();
      await w.ok(TEST_C, sent.request(ev, { qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 5) }), { requestId: asked });
      expect((await changeNotes(w.sql, w.worldId, asked)).map((n) => n.userId)).toContain(TEST_A.id);
      expect(await jobsOf(w.sql, w.worldId)).toHaveLength(1);
      // The dispatcher with the store's own hooks: the one job, checked on the committed document, captured with its link.
      const store = (): Promise<DispatchCounts> =>
        dispatchEmail(w.sql, { sender: sqlCaptureSender(w.sql), siteUrl: SITE, worlds: "test", graceMs: 0, now: w.now }, storeDispatchDeps);
      expect(await store()).toEqual(counts({ claimed: 1, sent: 1 }));
      expect((await capturesOf(w.sql, w.worldId)).map((c) => [c.to_address, c.subject, c.action_url]))
        .toEqual([[TEST_A.email, "Offer on your [Test] Spring Formal ticket", `${SITE}/tools/handoff#activity?listing=${l}`]]);
      w.advance(MIN);
      expect(await store()).toEqual(counts({}));
      expect(await capturesOf(w.sql, w.worldId)).toHaveLength(1);
    });

    it("runs the same with the store's own hooks, as the dispatch route does (storeDispatchDeps): a due world swept, each job checked on the committed document", async () => {
      const { w, l } = await market();
      const made = await offer(w, TEST_B, l); // A: offer.received, pending for hours
      const r = must(made.ok.resultId, "B's offer");
      await w.ok(TEST_C, sent.take(l)); // C holds one for 15 minutes
      const version = async (): Promise<number> => must((await w.sql<{ version: number }[]>`SELECT version FROM worlds WHERE id = ${w.worldId}`)[0], "the world").version;
      const before = await version();
      w.advance(16 * MIN);
      const store = (): Promise<DispatchCounts> =>
        dispatchEmail(w.sql, { sender: sqlCaptureSender(w.sql), siteUrl: SITE, worlds: "test", graceMs: 0, now: w.now }, storeDispatchDeps);
      expect(await store()).toEqual(counts({ swept: 1, claimed: 1, sent: 1 }));
      expect(await version()).toBe(before + 1); // C's lapsed hold, stored with no page open
      expect((await capturesOf(w.sql, w.worldId)).map((c) => [c.to_address, c.subject])).toEqual([[TEST_A.email, "Offer on your [Test] Spring Formal ticket"]]);
      // A job whose step was done before it went out: the store's check skips it too.
      await optIn(w, TEST_B, { exchange: true });
      expect((await actTagged(w, TEST_A, sent.onRequest("accept", r), to(TEST_B.id, "offer.accepted", r))).jobs).toBe(1);
      await w.ok(TEST_B, sent.onRequest("markPaid", r));
      // B's payment also queued A's payment.reported, the one step still open: the store's check sends that and skips the answered one.
      expect(await store()).toEqual(counts({ claimed: 2, sent: 1, skipped: 1 }));
      // The last two were made at the same injected instant, so they're compared by kind.
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.kind, j.status, j.reason]).sort()).toEqual([
        ["offer.accepted", "skipped", "not_relevant:answered"],
        ["offer.received", "sent", null],
        ["payment.reported", "sent", null],
      ]);
      expect((await capturesOf(w.sql, w.worldId)).map((c) => c.subject)).toEqual(["Offer on your [Test] Spring Formal ticket", "Handoff says they paid: [Test] Spring Formal"]);
    });
  });

  describe("consent", () => {
    it("records consent v1, its time and the session's address, never a payment contact; refuses without an address or profile (B4.2, B4.10)", async () => {
      const w = world();
      await heartbeat(w.sql, "capture", w.now);
      await ensurePerson(w.sql, TEST_A);
      await w.sql`UPDATE people SET pay_handle = 'zelle-canary@upenn.edu' WHERE user_id = ${TEST_A.id}`;
      await optIn(w, TEST_A, { exchange: true });
      const row = async () => (await w.sql<{ address: string; sign_in: string; exchange_on: boolean; matches_on: boolean; consent_version: string; consented_at: Date }[]>`
        SELECT address, sign_in, exchange_on, matches_on, consent_version, consented_at FROM email_prefs WHERE user_id = ${TEST_A.id}`)[0];
      expect(await row()).toEqual({ address: TEST_A.email, sign_in: "dev", exchange_on: true, matches_on: false, consent_version: CONSENT_VERSION, consented_at: new Date(w.now) });
      w.advance(MIN);
      await optIn(w, TEST_A, { exchange: true }); // already on: no new consent
      expect((await row())?.consented_at).toEqual(new Date(w.now - MIN));
      await optIn(w, TEST_A, { matches: true });
      expect(await row()).toMatchObject({ exchange_on: true, matches_on: true, consented_at: new Date(w.now) });
      await ensurePerson(w.sql, TEST_B);
      expect(await saveEmailPrefs(w.sql, { userId: TEST_B.id, address: null, signIn: "dev", worldId: w.worldId, matches: true, now: w.now })).toEqual({ ok: false, error: NO_EMAIL_ADDRESS_ERROR });
      expect(await saveEmailPrefs(w.sql, { userId: "handoff-test-nobody", address: "x@example.invalid", signIn: "dev", worldId: w.worldId, matches: true, now: w.now })).toEqual({ ok: false, error: NO_PROFILE_ERROR });
      await expect(saveEmailPrefs(w.sql, { userId: TEST_A.id, address: TEST_A.email, signIn: "google " as "google", worldId: w.worldId, matches: true, now: w.now })).rejects.toThrow(TypeError);
      // Turning email off needs nothing but the account, even while email isn't available.
      await w.sql`DELETE FROM email_dispatch`;
      expect(await saveEmailPrefs(w.sql, { userId: TEST_A.id, address: null, signIn: "dev", worldId: w.worldId, exchange: false, matches: false, now: w.now }))
        .toMatchObject({ ok: true, email: { available: false, exchange: false, matches: false } });
    });

    it("sends nothing to an opted-out recipient: no job without consent, and turning a category off skips what's waiting (B4.13)", async () => {
      const { w, l } = await market();
      expect((await offer(w, TEST_B, l)).jobs).toBe(1);
      await optIn(w, TEST_A, { matches: false }); // the other category: exchange emails are untouched
      expect((await jobsOf(w.sql, w.worldId)).map((j) => j.status)).toEqual(["pending"]);
      await optIn(w, TEST_A, { exchange: false });
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.status, j.reason])).toEqual([["skipped", "opted_out"]]);
      expect((await offer(w, TEST_C, l)).jobs).toBe(0);
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({}));
      // Back on: only what happens from now on. Consent is checked again when the email goes out.
      await optIn(w, TEST_A, { exchange: true });
      expect((await offer(w, TEST_D, l)).jobs).toBe(1);
      await w.sql`UPDATE email_prefs SET exchange_on = FALSE WHERE user_id = ${TEST_A.id}`; // off, with the job already queued
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 1, skipped: 1 }));
      expect((await jobsOf(w.sql, w.worldId)).map((j) => j.reason)).toEqual(["opted_out", "opted_out"]);
      expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
    });

    it("keeps each person's email to their own account and address; a changed address waits for consent again (B4.13)", async () => {
      const { w, l } = await market();
      await optIn(w, TEST_B, { exchange: true });
      const r = must((await offer(w, TEST_B, l)).ok.resultId, "B's offer");
      await markNotificationsRead(w.sql, { worldId: w.worldId, userId: TEST_B.id, ids: "all" }); // B's reads never touch A's
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 1, sent: 1 })); // A's, to A's address
      expect((await actTagged(w, TEST_A, sent.onRequest("accept", r), to(TEST_B.id, "offer.accepted", r))).jobs).toBe(1);
      // B reads it in the app before the email goes out: skipped, and A's own email isn't touched.
      await markNotificationsRead(w.sql, { worldId: w.worldId, userId: TEST_B.id, ids: "all" });
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 1, skipped: 1 }));
      const captured = await capturesOf(w.sql, w.worldId);
      expect(captured.map((x) => x.to_address)).toEqual([TEST_A.email]);
      expect(JSON.stringify(captured)).not.toContain(must(TEST_B.email, "B's address"));
      expect(Object.fromEntries((await jobsOf(w.sql, w.worldId)).map((j) => [j.user_id, [j.status, j.reason]]))).toEqual({
        [TEST_A.id]: ["sent", null],
        [TEST_B.id]: ["skipped", "read_in_app"],
      });
      // A's PennTools address changes (their next visit records it): email waits until A turns it on again, for the new address.
      const moved: Actor = { ...TEST_A, email: "handoff-test-a-new@example.invalid" };
      await ensurePerson(w.sql, moved);
      expect(await state(w)).toEqual({ available: true, mode: "capture", address: moved.email, exchange: false, matches: false, reconfirm: true, paused: false });
      const fromC = await offer(w, TEST_C, l);
      expect(fromC.jobs).toBe(1);
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 1, skipped: 1 }));
      expect((await jobsOf(w.sql, w.worldId)).find((j) => j.ref === fromC.ok.resultId)?.reason).toBe("address_changed");
      await optIn(w, moved, { exchange: true });
      expect((await state(w)).reconfirm).toBe(false);
      expect((await offer(w, TEST_D, l)).jobs).toBe(1);
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 1, sent: 1 }));
      expect((await capturesOf(w.sql, w.worldId)).at(-1)?.to_address).toBe(moved.email);
    });

    it("says email is paused while a choice is on and the dispatcher has gone quiet, so it can still be turned off, which stops what's waiting; never where no sender has worked", async () => {
      const { w, l } = await market(); // the capture works, and A takes exchange emails
      expect((await offer(w, TEST_B, l)).jobs).toBe(1); // one email waiting for A
      const on = { available: true, mode: "capture", address: TEST_A.email, exchange: true, matches: false, reconfirm: false, paused: false };
      const quiet = { ...on, available: false, mode: null, paused: true };
      expect(await state(w)).toEqual(on);
      // No dispatcher run for 11 minutes: email isn't available, and A's choice is paused, not gone.
      w.advance(11 * MIN);
      expect(await state(w)).toEqual(quiet);
      // Nothing is paused for someone with nothing on, ...
      expect(await state(w, TEST_B)).toEqual({ available: false, mode: null, address: TEST_B.email, exchange: false, matches: false, reconfirm: false, paused: false });
      // ... where the world's sender has never worked (live's is a provider: nothing of email shows there, B4.15), ...
      expect(await readEmailState(w.sql, { userId: TEST_A.id, worldId: "live", now: w.now })).toEqual({ ...quiet, paused: false });
      await heartbeat(w.sql, "provider", null, w.now); // it ran, and never worked
      expect(await readEmailState(w.sql, { userId: TEST_A.id, worldId: "live", now: w.now })).toEqual({ ...quiet, paused: false });
      // ... or while a changed address waits to be turned on again (nothing is on for it).
      const moved: Actor = { ...TEST_A, email: "handoff-test-a-new@example.invalid" };
      await ensurePerson(w.sql, moved);
      expect(await state(w)).toEqual({ ...quiet, address: moved.email, exchange: false, reconfirm: true, paused: false });
      await ensurePerson(w.sql, TEST_A);
      expect(await state(w)).toEqual(quiet);
      // Turning it off while paused works, and the email that was waiting isn't sent when the dispatcher is back.
      expect(await saveEmailPrefs(w.sql, { userId: TEST_A.id, address: TEST_A.email, signIn: "dev", worldId: w.worldId, exchange: false, now: w.now }))
        .toEqual({ ok: true, email: { ...quiet, exchange: false, paused: false } });
      expect((await jobsOf(w.sql, w.worldId)).map((j) => [j.status, j.reason])).toEqual([["skipped", "opted_out"]]);
      await heartbeat(w.sql, "capture", w.now);
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({}));
      expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
      expect(await state(w)).toEqual({ ...on, exchange: false });
    });
  });

  describe("matches", () => {
    /** C's private alert and B's public request for A's event, both taking match emails; then D lists one ticket at $35. */
    async function matched(o: { expires?: string } = {}) {
      const w = world();
      await heartbeat(w.sql, "capture", w.now);
      await canSell(w, TEST_D);
      const ev = await w.createEvent(TEST_A);
      const alert = must((await w.ok(TEST_C, { type: "joinAlert", eventId: ev, qty: 1, max: null })).resultId, "C's alert");
      const iso = must((await w.ok(TEST_B, sent.request(ev, { qty: 1, budget: "40", note: "", expires: o.expires ?? dateAfter(w.now, 5) }))).resultId, "B's request");
      await optIn(w, TEST_C, { matches: true });
      await optIn(w, TEST_B, { matches: true });
      const listed = await actTagged(w, TEST_D, sent.list(ev, { qty: 1, ask: "35", paid: "40", payHandle: `@${TEST_D.id}` }), (x) =>
        x.userId === TEST_C.id ? { kind: "match.listing", ref: alert } : x.userId === TEST_B.id ? { kind: "match.listing", ref: iso } : null);
      expect(listed.jobs).toBe(2);
      return { w, ev, alert, iso, l: must(listed.ok.resultId, "D's listing") };
    }
    const reasons = async (w: StoreWorld): Promise<Record<string, string>> =>
      Object.fromEntries((await jobsOf(w.sql, w.worldId)).map((j) => [j.user_id, `${j.status}:${j.reason ?? ""}`]));

    it("sends a match that still fits, naming the listing's public terms only", async () => {
      const { w, ev, l } = await matched();
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 2, sent: 2 }));
      const captured = await capturesOf(w.sql, w.worldId);
      const byTo = Object.fromEntries(captured.map((x) => [x.to_address, { subject: x.subject, body: x.body_text.split("\n\n")[0], url: x.action_url }]));
      expect(byTo).toEqual({
        [must(TEST_C.email, "C's address")]: { subject: "A [Test] Spring Formal ticket is available", body: "1 ticket at $35 may match your alert. It isn't held for you.", url: `${SITE}/tools/handoff#${ev}?listing=${l}` },
        [must(TEST_B.email, "B's address")]: { subject: "A [Test] Spring Formal ticket is available", body: "1 ticket at $35 may match your request. It isn't held for you.", url: `${SITE}/tools/handoff#${ev}?listing=${l}` },
      });
    });

    it("skips a match whose alert was paused or whose request was fulfilled (B4.5)", async () => {
      const { w, alert, iso } = await matched();
      await w.ok(TEST_C, { type: "setAlert", id: alert, paused: true });
      await w.ok(TEST_B, { type: "closeInterest", id: iso, reason: "fulfilled" });
      expect(await run(w, sqlCaptureSender(w.sql))).toEqual(counts({ claimed: 2, skipped: 2 }));
      expect(await reasons(w)).toEqual({ [TEST_C.id]: "skipped:not_relevant:paused", [TEST_B.id]: "skipped:not_relevant:closed" });
    });

    it("skips a match whose listing was paused, closed or sold out, or whose request expired (B4.5)", async () => {
      let m = await matched();
      await m.w.ok(TEST_D, { type: "pauseListing", listingId: m.l });
      expect(await run(m.w, sqlCaptureSender(m.w.sql))).toEqual(counts({ claimed: 2, skipped: 2 }));
      expect(await reasons(m.w)).toEqual({ [TEST_C.id]: "skipped:not_relevant:paused", [TEST_B.id]: "skipped:not_relevant:paused" });

      m = await matched();
      await m.w.ok(TEST_D, { type: "withdraw", listingId: m.l });
      await run(m.w, sqlCaptureSender(m.w.sql));
      expect(await reasons(m.w)).toEqual({ [TEST_C.id]: "skipped:not_relevant:closed", [TEST_B.id]: "skipped:not_relevant:closed" });

      m = await matched();
      await m.w.ok(TEST_E, sent.take(m.l)); // the only ticket, reserved by someone else
      await run(m.w, sqlCaptureSender(m.w.sql));
      expect(await reasons(m.w)).toEqual({ [TEST_C.id]: "skipped:not_relevant:no_longer_matches", [TEST_B.id]: "skipped:not_relevant:no_longer_matches" });

      m = await matched({ expires: dateAfter(T0, 0) }); // B needed it by 23:59 tonight
      m.w.advance(12 * HOUR - 30_000); // 23:59:30, inside the 12 hours a match email is worth sending
      await run(m.w, sqlCaptureSender(m.w.sql));
      expect((await reasons(m.w))[TEST_B.id]).toBe("skipped:not_relevant:expired");
    });

    it("sends at most 5 match emails a day to one person", async () => {
      const w = world();
      await heartbeat(w.sql, "capture", w.now);
      const sellers = [TEST_A, TEST_B, TEST_D, TEST_E, TEST_F, TEST_G];
      for (const s of sellers) await canSell(w, s);
      const ev = await w.createEvent(TEST_A);
      const alert = must((await w.ok(TEST_C, { type: "joinAlert", eventId: ev, qty: 1, max: null })).resultId, "C's alert");
      await optIn(w, TEST_C, { matches: true });
      for (const s of sellers) {
        const listed = await actTagged(w, s, sent.list(ev, { qty: 1, ask: "35", paid: "40", payHandle: `@${s.id}` }), to(TEST_C.id, "match.listing", alert));
        expect(listed.jobs).toBe(1);
      }
      expect(await run(w, sqlCaptureSender(w.sql), { limit: 10 })).toEqual(counts({ claimed: 6, sent: MATCH_DAILY_CAP, skipped: 1 }));
      expect((await jobsOf(w.sql, w.worldId)).filter((j) => j.reason === "daily_cap")).toHaveLength(1);
    });

    it("keeps to 5 a day when two dispatcher runs overlap: a match another run's sends could put past the cap waits for the next run", async () => {
      const w = world();
      await heartbeat(w.sql, "capture", w.now);
      const sellers = [TEST_A, TEST_B, TEST_D, TEST_E, TEST_F, TEST_G];
      for (const s of sellers) await canSell(w, s);
      const ev = await w.createEvent(TEST_A);
      const alert = must((await w.ok(TEST_C, { type: "joinAlert", eventId: ev, qty: 1, max: null })).resultId, "C's alert");
      await optIn(w, TEST_C, { matches: true });
      for (const s of sellers) {
        const listed = await actTagged(w, s, sent.list(ev, { qty: 1, ask: "35", paid: "40", payHandle: `@${s.id}` }), to(TEST_C.id, "match.listing", alert));
        expect(listed.jobs).toBe(1);
      }
      // Two runs of three jobs each. Each send waits until the other run is sending too (or half a second), so the runs reach every cap
      // check side by side: the overlap that let a sixth email through.
      const capture = sqlCaptureSender(w.sql);
      let inFlight = 0;
      const waiting: (() => void)[] = [];
      const paired: EmailSender = {
        ...capture,
        send: async (m: EmailMessage) => {
          inFlight += 1;
          if (inFlight >= 2) for (const go of waiting.splice(0)) go();
          else await new Promise<void>((resolve) => { waiting.push(resolve); setTimeout(resolve, 500); });
          try {
            return await capture.send(m);
          } finally {
            inFlight -= 1;
          }
        },
      };
      const [a, b] = await Promise.all([run(w, paired, { limit: 3 }), run(w, paired, { limit: 3 })]);
      expect([a.claimed, b.claimed]).toEqual([3, 3]);
      const after = await jobsOf(w.sql, w.worldId);
      const sentNow = after.filter((j) => j.status === "sent").length;
      expect(sentNow).toBeLessThanOrEqual(MATCH_DAILY_CAP);
      expect(sentNow).toBe(a.sent + b.sent);
      expect(sentNow).toBeGreaterThanOrEqual(MATCH_DAILY_CAP - 1); // only a job that could pass the cap waits
      // Whatever wasn't sent was handed back as it was (no attempt used, nothing final), for the next run to decide.
      expect(after.filter((j) => j.status !== "sent").map((j) => [j.status, j.reason, j.attempts, j.lease_until])).toEqual(
        Array.from({ length: 6 - sentNow }, () => ["pending", null, 0, null]));
      expect(await capturesOf(w.sql, w.worldId)).toHaveLength(sentNow);

      // The next run, on its own, sends up to the cap and skips the rest: 5 emails that day, never 6, and none twice.
      await run(w, capture, { limit: 10 });
      const end = await jobsOf(w.sql, w.worldId);
      expect(end.map((j) => `${j.status}:${j.reason ?? ""}`).sort()).toEqual([...Array<string>(MATCH_DAILY_CAP).fill("sent:"), "skipped:daily_cap"]);
      const captured = await capturesOf(w.sql, w.worldId);
      expect(captured).toHaveLength(MATCH_DAILY_CAP);
      expect(new Set(captured.map((x) => x.notification_id)).size).toBe(MATCH_DAILY_CAP);
    });
  });

  describe("no configuration, and the provider's gate", () => {
    it("offers nothing, queues nothing and sends nothing while no dispatcher works (B4.13, B4.15)", async () => {
      const w = world();
      await canSell(w, TEST_A);
      const ev = await w.createEvent(TEST_A);
      const l = await w.list(TEST_A, ev, { qty: 2, ask: "35", obo: true });
      // Preferences saved earlier, and no heartbeat now: no job.
      await w.sql`INSERT INTO email_prefs (user_id, address, sign_in, exchange_on, matches_on, consent_version, consented_at)
                  VALUES (${TEST_A.id}, ${must(TEST_A.email, "A's address")}, 'dev', TRUE, TRUE, 'v1', ${new Date(w.now - DAY)})`;
      expect((await offer(w, TEST_B, l)).jobs).toBe(0);
      // A sender that isn't ready: the run is recorded, nothing is claimed, and email stays unavailable.
      const notReady = memoryCaptureSender({ ready: false });
      expect(await run(w, notReady)).toEqual(counts({}));
      const [beat] = await w.sql<{ last_run_at: Date; last_ok_at: Date | null }[]>`SELECT last_run_at, last_ok_at FROM email_dispatch WHERE sender = 'capture'`;
      expect(beat?.last_run_at.getTime()).toBe(w.now);
      expect(beat?.last_ok_at).toBeNull();
      expect((await state(w)).available).toBe(false);
      expect((await offer(w, TEST_C, l)).jobs).toBe(0);
      expect(notReady.attempts).toEqual([]);
      // A heartbeat 10 minutes old no longer counts.
      await heartbeat(w.sql, "capture", w.now - 10 * MIN);
      expect((await state(w)).available).toBe(false);
    });

    it("never lets a provider send to the shared development identity or a TEST account, and never captures the live world (B4.10)", async () => {
      // This schema's own "live" world: throwaway, like the rest of the schema.
      const w = world("live");
      await heartbeat(w.sql, "provider", w.now);
      const localDev: Actor = { id: "local-dev-user", name: "Local Developer", email: "dev@localhost" };
      const pennTest: Actor = { ...TEST_B, email: "handoff-test-b@wharton.upenn.edu" }; // a TEST session minted with a Penn-looking domain
      await canSell(w, localDev);
      const ev = await w.createEvent(localDev);
      const l = await w.list(localDev, ev, { qty: 2, ask: "35", obo: true });
      await ensurePerson(w.sql, pennTest);
      // Neither can turn real email on: the development sign-in, and a TEST account even when signed in with Google.
      for (const [who, signIn] of [[localDev, "dev"], [localDev, "google"], [pennTest, "google"], [pennTest, "dev"]] as const) {
        expect(await saveEmailPrefs(w.sql, { userId: who.id, address: who.email, signIn, worldId: w.worldId, exchange: true, now: w.now }), `${who.id} ${signIn}`)
          .toEqual({ ok: false, error: NOT_FOR_THIS_ACCOUNT_ERROR });
      }
      expect(await w.sql`SELECT 1 FROM email_prefs`).toHaveLength(0);
      // A classmate signed in with Google at a Penn address can.
      const penn: Actor = { id: "penn-ann-lee", name: "Ann Lee", email: "ann.lee@wharton.upenn.edu" };
      await ensurePerson(w.sql, penn);
      expect(await saveEmailPrefs(w.sql, { userId: penn.id, address: penn.email, signIn: "google", worldId: w.worldId, exchange: true, now: w.now }))
        .toMatchObject({ ok: true, email: { available: true, mode: "provider", address: penn.email, exchange: true } });
      // Rows that say they did anyway (saved before this check, or by hand): the dispatcher's own gate still sends nothing.
      for (const [who, signIn] of [[localDev, "dev"], [pennTest, "google"]] as const) {
        await w.sql`INSERT INTO email_prefs (user_id, address, sign_in, exchange_on, matches_on, consent_version, consented_at)
                    VALUES (${who.id}, ${must(who.email, "the address")}, ${signIn}, TRUE, FALSE, 'v1', ${new Date(w.now)})`;
      }
      const r = must((await actTagged(w, pennTest, sent.offer(l, "30"), to(localDev.id, "offer.received"))).ok.resultId, "the offer");
      expect((await actTagged(w, localDev, sent.onRequest("accept", r), to(pennTest.id, "offer.accepted", r))).jobs).toBe(1);
      expect(await jobsOf(w.sql, w.worldId)).toHaveLength(2);
      const provider = memoryCaptureSender({ kind: "provider", allows: (x) => providerAllows(x.address, x.signIn) });
      w.advance(2 * MIN);
      const done = await dispatchEmail(w.sql, { sender: provider, siteUrl: "https://penntools.example.org", worlds: "live", now: w.now }, testDispatchDeps());
      expect(done).toEqual(counts({ claimed: 2, skipped: 2 }));
      expect((await jobsOf(w.sql, w.worldId)).map((j) => j.reason)).toEqual(["recipient_not_allowed", "recipient_not_allowed"]);
      expect(provider.attempts).toEqual([]);
      // The capture never handles live, a provider never handles test worlds, and a provider always waits out the grace period.
      const capture = sqlCaptureSender(w.sql);
      await expect(dispatchEmail(w.sql, { sender: capture, siteUrl: SITE, worlds: "live", now: w.now }, testDispatchDeps())).rejects.toThrow(TypeError);
      await expect(dispatchEmail(w.sql, { sender: provider, siteUrl: SITE, worlds: "test", now: w.now }, testDispatchDeps())).rejects.toThrow(TypeError);
      await expect(dispatchEmail(w.sql, { sender: provider, siteUrl: SITE, worlds: "live", graceMs: 0, now: w.now }, testDispatchDeps())).rejects.toThrow(TypeError);
      expect(await capture.send({ to: "ann@upenn.edu", subject: "s", text: "t", idempotencyKey: idempotencyKey("live", "0123456789abcdef"), actionUrl: SITE }))
        .toEqual({ ok: false, retryable: false, code: "rejected" });
      expect(await db.sql`SELECT 1 FROM email_capture`).toHaveLength(0);
    });
  });
});
