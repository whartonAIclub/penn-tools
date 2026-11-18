// The three emails of invite to pay, through the dispatcher (follow-on Batch 5, step S2; USER-INSTRUCTIONS §9 Batch 5; FOLLOWON-PLAN
// §1.5 B5.9 and §2.4's table): buy.requested (to the seller), buy.invited (to the buyer, from either way of inviting) and payment.late
// (to the seller). The real engine behind the real store on a throwaway Postgres schema, with the store making the jobs in each action's
// own transaction from the engine's tags, and the dispatcher deciding at send time. The kinds' rows, relevance branches and templates
// have their unit tests in email-templates.test.ts, note-tags.test.ts and invite-flow-compat.test.ts, and one run of all three emails is
// in invite-flow-store.test.ts; this file shows what those don't:
// - an invitation that ended before its email went out is skipped however it ended (declined by the buyer, withdrawn by the seller,
//   its listing closed, or its own deadline), by either way of inviting, while one that's still open is sent; the in-app notification
//   is there either way; an open invitation on a paused listing isn't emailed either (it can't be reserved from meanwhile);
// - consent: no email without the recipient's own opt-in to exchange emails, none after they turn it off or their address changes,
//   none for something they already read in the app;
// - a provider never gets the shared development identity or a TEST account for any of the three kinds, even with a preference row
//   that says otherwise, while a classmate's address signed in with Google does reach it (a memory sender: nothing leaves the process);
// - each email is built from facts only: the plan's words, one link, 24 hours to live, and never a price, an offer, a note, a budget
//   or where to pay, though the in-app notification of the same step names the amounts.
// Everyone is a labelled TEST account with a made-up id and an @example.invalid address, or a made-up person for the provider's gate;
// no sign-in of any kind, nothing leaves the database or the process, and no world outside this schema is touched.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { memoryCaptureSender, sqlCaptureSender } from "../email/capture.js";
import { dispatchEmail } from "../email/dispatch.js";
import { providerAllows } from "../email/gates.js";
import { EMAIL_KINDS, EXCHANGE_TTL_MS } from "../email/kinds.js";
import { NOT_FOR_THIS_ACCOUNT_ERROR, saveEmailPrefs } from "../email/prefs.js";
import { FOOTER } from "../email/templates.js";
import type { DispatchCounts, DispatchOptions, EmailSender } from "../email/types.js";
import { ensurePerson, markNotificationsRead, savePayMethods } from "../store.js";
import type { Actor, WorldId } from "../types.js";
import { databaseUrl, type TestDb } from "./helpers/db.js";
import {
  SITE,
  TEST_D,
  TEST_E,
  TEST_F,
  TEST_G,
  TEST_H,
  actTagged,
  canSell,
  capturesOf,
  createEmailTestDb,
  heartbeat,
  jobsOf,
  optIn,
  testDispatchDeps,
  to,
} from "./helpers/email-db.js";
import { HOUR, MIN, StoreWorld, T0, TEST_A, TEST_B, TEST_C, actions as sent, dateAfter, type SentAction } from "./helpers/live-store.js";

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

const [A, B, C, D, F, G, H] = [TEST_A, TEST_B, TEST_C, TEST_D, TEST_F, TEST_G, TEST_H];
const EE = TEST_E; // "E" is the engine
const addr = (p: Actor): string => must(p.email, `${p.id}'s address`);

// The new actions, as the page sends them.
const askToBuy = (listingId: string, o: { qty?: number; amount?: string; msg?: string } = {}): SentAction =>
  ({ type: "requestToBuy", listingId, qty: o.qty ?? 1, ...(o.amount !== undefined ? { amount: o.amount } : {}), msg: o.msg ?? "", member: false });
const inviteToPay = (requestId: string, o: { qty?: number; price?: string } = {}): SentAction => ({ type: "invite", requestId, ...o });
const inviteRequester = (isoId: string, listingId: string, o: { price?: string } = {}): SentAction => ({ type: "inviteRequester", isoId, listingId, qty: 1, ...o });
const reserveIt = (requestId: string): SentAction => ({ type: "reserve", requestId, member: false });
const on = (type: string, requestId: string): SentAction => ({ type, requestId });
const lateReport = (id: string): SentAction => ({ type: "reportProblem", kind: "ticket", id, reason: E.LATE_PAYMENT });
const resolveReport = (id: string): SentAction => ({ type: "resolveProblem", kind: "ticket", id });
/** A step that's told in the app only: any job the store makes for it fails the test (actTagged). */
const inApp = (): null => null;

const TITLE = "[Test] Spring Formal";

describe.skipIf(!databaseUrl)("invite to pay: the three emails through the dispatcher (real engine, Postgres)", () => {
  let db: TestDb;
  let n = 0;
  beforeAll(async () => {
    db = await createEmailTestDb("invite-email");
  }, 30_000);
  afterAll(async () => {
    await db?.close();
  });
  // One schema for the file: every test starts with no worlds (their notifications, jobs and captures cascade away), no email
  // preferences, no heartbeat, and the shared TEST profiles under their own addresses again (two tests change one).
  beforeEach(async () => {
    await db.sql`DELETE FROM worlds`;
    await db.sql`DELETE FROM email_prefs`;
    await db.sql`DELETE FROM email_dispatch`;
    for (const p of [A, B, C]) await ensurePerson(db.sql, p);
  });
  // The switch back to the engine's own setting, whatever a test set (each test here turns invite to pay on for itself).
  afterEach(() => {
    E.setInviteSwitch(null);
  });

  const world = (label: string, now = T0): StoreWorld => new StoreWorld(db.sql, `test-s2mail-${label}-${++n}` as WorldId, now);
  const run = (w: StoreWorld, sender: EmailSender, over: Partial<DispatchOptions> = {}): Promise<DispatchCounts> =>
    dispatchEmail(w.sql, { sender, siteUrl: SITE, worlds: "test", graceMs: 0, now: w.now, ...over }, testDispatchDeps());
  const counts = (over: Partial<DispatchCounts>): DispatchCounts => ({ swept: 0, claimed: 0, sent: 0, failed: 0, skipped: 0, dead: 0, expired: 0, pruned: 0, ...over });
  type JobLine = (string | null)[];
  /** Jobs made in the same instant of the test's clock have no order of their own, so both sides of a comparison are sorted. */
  const sorted = (lines: JobLine[]): JobLine[] => [...lines].sort((x, y) => (x.join("|") < y.join("|") ? -1 : 1));
  /** Every job of the world as [recipient, kind, record, status, reason], sorted. */
  const jobLines = async (w: StoreWorld): Promise<JobLine[]> => sorted((await jobsOf(w.sql, w.worldId)).map((j) => [j.user_id, j.kind, j.ref, j.status, j.reason]));
  /** What the app told one person, oldest first. */
  const toldInApp = async (w: StoreWorld, who: Actor): Promise<string[]> => (await w.sql<{ text: string }[]>`
    SELECT text FROM notifications WHERE world_id = ${w.worldId} AND user_id = ${who.id} ORDER BY at, id`).map((x) => x.text);
  const recordOf = async (w: StoreWorld, requestId: string) => must(must(await w.row(), "the world's row").doc.requests.find((r) => r.id === requestId), `record ${requestId}`);
  /** The hold on a reservation runs out and the store's sweep puts it back on sale (its notes stay in the app). */
  async function lapse(w: StoreWorld, sender: "capture" | "provider", viewer: Actor): Promise<void> {
    w.advance(16 * MIN);
    await heartbeat(w.sql, sender, w.now);
    await w.view(viewer);
  }

  it("skips an invitation's email once the invitation has ended, however it ended, and still sends one that's open (B5.9)", async () => {
    E.setInviteSwitch(true);
    const w = world("ended");
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, A);
    const ev1 = await w.createEvent(A);
    const ev2 = await w.createEvent(A, { title: "[Test] Fall Mixer" });
    const l1 = await w.list(A, ev1, { qty: 3, ask: "35" });
    const l2 = await w.list(A, ev2, { qty: 1, ask: "35" });
    for (const p of [A, B, C, D, EE, F, G, H]) await optIn(w, p, { exchange: true });
    const capture = sqlCaptureSender(w.sql);
    const ask = async (buyer: Actor, listingId: string): Promise<string> => {
      const done = await actTagged(w, buyer, askToBuy(listingId), to(A.id, "buy.requested"));
      expect(done.jobs, `${buyer.id}'s request`).toBe(1);
      return must(done.ok.resultId, `${buyer.id}'s request`);
    };
    const invite = async (buyer: Actor, requestId: string): Promise<void> => {
      expect((await actTagged(w, A, inviteToPay(requestId), to(buyer.id, "buy.invited", requestId))).jobs, `${buyer.id}'s invitation`).toBe(1);
    };

    // Noon: E asks and the seller's email goes out (the control: a request that still waits is sent). Then A invites E, and invites F
    // from F's public request, with no request to buy before it. Nobody opens the page again.
    const re = await ask(EE, l1);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
    await invite(EE, re);
    const iso = must((await actTagged(w, F, sent.request(ev1, { qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 5) }), inApp)).ok.resultId, "F's public request");
    const fromRequest = await actTagged(w, A, inviteRequester(iso, l1), to(F.id, "buy.invited"));
    const rf = must(fromRequest.ok.resultId, "F's invitation");
    expect(fromRequest.jobs).toBe(1);

    // Five hours on, with the dispatcher not having run since: B, C and D ask for the first listing and G and H for the second. A
    // invites B, C, D and G; H's request still waits.
    w.advance(5 * HOUR);
    await heartbeat(w.sql, "capture", w.now);
    const rb = await ask(B, l1);
    const rc = await ask(C, l1);
    const rd = await ask(D, l1);
    const rg = await ask(G, l2);
    for (const [p, r] of [[B, rb], [C, rc], [D, rd], [G, rg]] as const) await invite(p, r);
    const rh = await ask(H, l2);
    // Three invitations end by someone's choice, each told in the app only: C declines theirs, A withdraws D's, and A closes the
    // second listing, which closes G's invitation and H's request with it.
    expect((await actTagged(w, C, on("cancel", rc), inApp)).jobs).toBe(0);
    expect((await actTagged(w, A, on("decline", rd), inApp)).jobs).toBe(0);
    expect((await actTagged(w, A, { type: "withdraw", listingId: l2, reason: "soldElsewhere" }, inApp)).jobs).toBe(0);
    expect((await recordOf(w, rc)).status).toBe("cancelled");
    expect((await recordOf(w, rd)).status).toBe("declined");
    expect((await recordOf(w, rg)).status).toBe("declined");
    expect((await recordOf(w, rh)).status).toBe("declined");

    // An hour and a minute later E's and F's invitations, six hours old, have run out; B's has five hours left. The dispatcher runs
    // with no page open: it stores the two that ran out (the sweep), then decides each waiting email on what's true now.
    w.advance(HOUR + MIN);
    expect((await recordOf(w, re)).status).toBe("invited"); // not stored as ended yet: nobody has looked
    expect(await run(w, capture)).toEqual(counts({ swept: 1, claimed: 11, sent: 1, skipped: 10 }));
    expect((await recordOf(w, re)).status).toBe("expired");
    expect((await recordOf(w, rf)).status).toBe("expired");
    expect((await recordOf(w, rb)).status).toBe("invited");
    expect(await jobLines(w)).toEqual(sorted([
      [A.id, "buy.requested", re, "sent", null],
      [EE.id, "buy.invited", re, "skipped", "not_relevant:expired"], // its own deadline, after a request to buy
      [F.id, "buy.invited", rf, "skipped", "not_relevant:expired"], // its own deadline, after a public request
      [A.id, "buy.requested", rb, "skipped", "not_relevant:answered"], // A already invited B
      [A.id, "buy.requested", rc, "skipped", "not_relevant:closed"],
      [A.id, "buy.requested", rd, "skipped", "not_relevant:closed"],
      [A.id, "buy.requested", rg, "skipped", "not_relevant:closed"],
      [B.id, "buy.invited", rb, "sent", null], // still open: the one invitation worth an email
      [C.id, "buy.invited", rc, "skipped", "not_relevant:closed"], // the buyer declined it
      [D.id, "buy.invited", rd, "skipped", "not_relevant:closed"], // the seller withdrew it
      [G.id, "buy.invited", rg, "skipped", "not_relevant:closed"], // the seller closed the listing
      [A.id, "buy.requested", rh, "skipped", "not_relevant:closed"], // a request on a closed listing
    ]));
    // Two emails in the outbox, both for something still waiting when they went: none for an ended invitation.
    const captures = await capturesOf(w.sql, w.worldId);
    expect(captures.map((c) => [c.to_address, c.subject])).toEqual([
      [addr(A), `Handoff wants to buy: ${TITLE}`],
      [addr(B), `Handoff invited you to pay: ${TITLE}`],
    ]);
    expect(captures[1]?.action_url).toBe(`${SITE}/tools/handoff#${ev1}?listing=${l1}`);
    // The app told every one of them, whatever became of the email.
    for (const p of [B, C, D, EE, G]) expect((await toldInApp(w, p))[0], p.id).toMatch(/^Handoff invited you to pay \$35 each for 1 ticket for /);
    expect((await toldInApp(w, F)).filter((t) => t.includes("invited you to pay"))).toEqual([expect.stringMatching(/^Handoff \S+ invited you to pay \$35 each for 1 ticket for \[Test\] Spring Formal, for your request\. It isn't held yet: /)]);
    expect((await toldInApp(w, EE)).at(-1)).toBe(`The invitation for ${TITLE} ended before it was reserved.`);
    expect((await toldInApp(w, F)).at(-1)).toBe(`The invitation for ${TITLE} ended before it was reserved.`);
    expect((await toldInApp(w, D)).at(-1)).toBe(`Handoff withdrew their invitation for ${TITLE}.`);
    expect((await toldInApp(w, G)).at(-1)).toBe("Handoff closed their listing for [Test] Fall Mixer, so your invitation is closed.");
    // A second run finds nothing left to do, and nothing more is captured.
    expect(await run(w, capture)).toEqual(counts({}));
    expect(await capturesOf(w.sql, w.worldId)).toHaveLength(2);
  });

  it("holds back an invitation's email while its listing is paused, and emails the next invitation once it's resumed (B5.9)", async () => {
    E.setInviteSwitch(true);
    const w = world("paused");
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, A);
    const ev = await w.createEvent(A);
    const l = await w.list(A, ev, { qty: 2, ask: "35" });
    for (const p of [A, B, C]) await optIn(w, p, { exchange: true });
    const capture = sqlCaptureSender(w.sql);

    // B asks, A invites B, and A pauses the listing before either email has gone out. The pause is told in the app only.
    const rb = must((await actTagged(w, B, askToBuy(l), to(A.id, "buy.requested"))).ok.resultId, "B's request");
    expect((await actTagged(w, A, inviteToPay(rb), to(B.id, "buy.invited", rb))).jobs).toBe(1);
    expect((await actTagged(w, A, { type: "pauseListing", listingId: l }, inApp)).jobs).toBe(0);
    // The invitation is still open and keeps its deadline, but B can't reserve from it now: its email isn't worth sending.
    expect((await recordOf(w, rb)).status).toBe("invited");
    expect(await run(w, capture)).toEqual(counts({ claimed: 2, skipped: 2 }));
    expect(await jobLines(w)).toEqual(sorted([
      [A.id, "buy.requested", rb, "skipped", "not_relevant:answered"],
      [B.id, "buy.invited", rb, "skipped", "not_relevant:paused"],
    ]));
    expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
    expect((await toldInApp(w, B)).at(-1)).toMatch(/^Handoff paused their listing for \[Test\] Spring Formal, so you can't reserve it until they resume it\. Your invitation stays open until /);

    // A resumes it (told in the app only: the skipped email isn't sent late). C asks and is invited: that one goes out.
    w.advance(MIN);
    await heartbeat(w.sql, "capture", w.now);
    expect((await actTagged(w, A, { type: "resumeListing", listingId: l }, inApp)).jobs).toBe(0);
    expect((await toldInApp(w, B)).at(-1)).toMatch(/^Handoff resumed their listing for \[Test\] Spring Formal, so you can reserve it again\. Your invitation is open until /);
    const rc = must((await actTagged(w, C, askToBuy(l), to(A.id, "buy.requested"))).ok.resultId, "C's request");
    expect((await actTagged(w, A, inviteToPay(rc), to(C.id, "buy.invited", rc))).jobs).toBe(1);
    expect(await run(w, capture)).toEqual(counts({ claimed: 2, sent: 1, skipped: 1 }));
    expect(await jobLines(w)).toEqual(sorted([
      [A.id, "buy.requested", rb, "skipped", "not_relevant:answered"],
      [B.id, "buy.invited", rb, "skipped", "not_relevant:paused"],
      [A.id, "buy.requested", rc, "skipped", "not_relevant:answered"],
      [C.id, "buy.invited", rc, "sent", null],
    ]));
    expect((await capturesOf(w.sql, w.worldId)).map((c) => [c.to_address, c.subject])).toEqual([[addr(C), `Handoff invited you to pay: ${TITLE}`]]);
  });

  it("skips the seller's email about a late payment once the buyer marked it resolved, and sends the next report (B5.9)", async () => {
    E.setInviteSwitch(true);
    const w = world("resolved");
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, A);
    const ev = await w.createEvent(A);
    const l = await w.list(A, ev, { qty: 1, ask: "35" });
    await optIn(w, A, { exchange: true });
    const capture = sqlCaptureSender(w.sql);
    const rb = must((await actTagged(w, B, askToBuy(l), to(A.id, "buy.requested"))).ok.resultId, "B's request");
    await w.ok(A, inviteToPay(rb));
    await w.ok(B, reserveIt(rb));
    await lapse(w, "capture", B);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, skipped: 1 })); // the request's email: the reservation it led to has ended
    expect((await actTagged(w, B, lateReport(rb), to(A.id, "payment.late", rb))).jobs).toBe(1);
    expect((await actTagged(w, B, resolveReport(rb), inApp)).jobs).toBe(0);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, skipped: 1 }));
    // B reports it again (the first was a mistake to close): a new notification, a new job, and this one is sent.
    w.advance(MIN);
    expect((await actTagged(w, B, lateReport(rb), to(A.id, "payment.late", rb))).jobs).toBe(1);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
    expect(await jobLines(w)).toEqual(sorted([
      [A.id, "buy.requested", rb, "skipped", "not_relevant:expired"],
      [A.id, "payment.late", rb, "skipped", "not_relevant:answered"], // the buyer marked the report resolved
      [A.id, "payment.late", rb, "sent", null],
    ]));
    expect((await capturesOf(w.sql, w.worldId)).map((c) => [c.to_address, c.subject, c.action_url])).toEqual([
      [addr(A), `Handoff says they paid after the reservation ended: ${TITLE}`, `${SITE}/tools/handoff#activity?listing=${l}`],
    ]);
    // The report changed nothing else: the reservation stays ended and the ticket stays on sale.
    expect(await recordOf(w, rb)).toMatchObject({ status: "expired", problem: { reason: E.LATE_PAYMENT } });
    expect((await w.view(C)).listings.find((x) => x.id === l)?.numbers).toMatchObject({ available: 1, reserved: 0 });
  });

  it("emails the new steps only to people who turned exchange emails on, and stops when they turn them off (B5.9)", async () => {
    E.setInviteSwitch(true);
    const w = world("consent");
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, A);
    const ev = await w.createEvent(A);
    const l = await w.list(A, ev, { qty: 2, ask: "35" });
    const capture = sqlCaptureSender(w.sql);

    // 1. Nobody turned email on. Each step is told in the app, to the person it's for, and nothing is queued.
    const asked = await actTagged(w, B, askToBuy(l), to(A.id, "buy.requested"));
    const rb = must(asked.ok.resultId, "B's request");
    expect([asked.notes.map((x) => x.userId), asked.jobs]).toEqual([[A.id], 0]);
    const invitedB = await actTagged(w, A, inviteToPay(rb), to(B.id, "buy.invited", rb));
    expect([invitedB.notes.map((x) => x.userId), invitedB.jobs]).toEqual([[B.id], 0]);
    await w.ok(B, reserveIt(rb));
    await lapse(w, "capture", B);
    const lateB = await actTagged(w, B, lateReport(rb), to(A.id, "payment.late", rb));
    expect([lateB.notes.map((x) => x.userId), lateB.jobs]).toEqual([[A.id], 0]);
    expect(await jobLines(w)).toEqual([]);
    expect(await run(w, capture)).toEqual(counts({}));

    // 2. Match emails only, the other category: these are exchange emails, so still nothing.
    await optIn(w, A, { matches: true });
    await optIn(w, C, { matches: true });
    const rc = must((await actTagged(w, C, askToBuy(l), to(A.id, "buy.requested"))).ok.resultId, "C's request");
    expect((await actTagged(w, A, inviteToPay(rc), to(C.id, "buy.invited", rc))).jobs).toBe(0);
    expect(await jobLines(w)).toEqual([]);

    // 3. A and the buyers turn exchange emails on. D asks: A's email waits. A turns them off before it goes: skipped, never sent.
    for (const p of [A, C, D, EE]) await optIn(w, p, { exchange: true });
    const rd = must((await actTagged(w, D, askToBuy(l), to(A.id, "buy.requested"))).ok.resultId, "D's request");
    expect(await jobLines(w)).toEqual([[A.id, "buy.requested", rd, "pending", null]]);
    await optIn(w, A, { exchange: false });
    expect(await jobLines(w)).toEqual([[A.id, "buy.requested", rd, "skipped", "opted_out"]]);
    expect(await run(w, capture)).toEqual(counts({}));
    // Back on: only what happens from now on. A invites D; D's preference goes off with the job already queued, and consent is
    // checked again when the email would go out.
    await optIn(w, A, { exchange: true });
    expect((await actTagged(w, A, inviteToPay(rd), to(D.id, "buy.invited", rd))).jobs).toBe(1);
    await w.sql`UPDATE email_prefs SET exchange_on = FALSE WHERE user_id = ${D.id}`;
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, skipped: 1 }));
    // E asks, and A's email goes out (the control: with consent, it's sent). A invites E, who reads it in the app first.
    const re = must((await actTagged(w, EE, askToBuy(l), to(A.id, "buy.requested"))).ok.resultId, "E's request");
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
    expect((await actTagged(w, A, inviteToPay(re), to(EE.id, "buy.invited", re))).jobs).toBe(1);
    expect(await markNotificationsRead(w.sql, { worldId: w.worldId, userId: EE.id, ids: "all" })).toBe(1);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, skipped: 1 }));
    // C reserves, lets it lapse and reports a late payment: A's email waits. A's PennTools address changes before it goes (their
    // next visit records it): email waits until A turns it on again, for the new address.
    await w.ok(C, reserveIt(rc));
    await lapse(w, "capture", C);
    expect((await actTagged(w, C, lateReport(rc), to(A.id, "payment.late", rc))).jobs).toBe(1);
    const moved: Actor = { ...A, email: "handoff-test-a-new@example.invalid" };
    await ensurePerson(w.sql, moved);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, skipped: 1 }));
    // A turns it on for the new address; C resolves the report and makes it again: that one goes to the new address.
    await optIn(w, moved, { exchange: true });
    expect((await actTagged(w, C, resolveReport(rc), inApp)).jobs).toBe(0);
    w.advance(MIN);
    expect((await actTagged(w, C, lateReport(rc), to(A.id, "payment.late", rc))).jobs).toBe(1);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));

    expect(await jobLines(w)).toEqual(sorted([
      [A.id, "buy.requested", rd, "skipped", "opted_out"],
      [D.id, "buy.invited", rd, "skipped", "opted_out"],
      [A.id, "buy.requested", re, "sent", null],
      [EE.id, "buy.invited", re, "skipped", "read_in_app"],
      [A.id, "payment.late", rc, "skipped", "address_changed"],
      [A.id, "payment.late", rc, "sent", null],
    ]));
    // Only the two emails with consent at send time were captured, each to its recipient's own address at that time.
    expect((await capturesOf(w.sql, w.worldId)).map((c) => [c.to_address, c.subject])).toEqual([
      [addr(A), `Handoff wants to buy: ${TITLE}`],
      [addr(moved), `Handoff says they paid after the reservation ended: ${TITLE}`],
    ]);
    // Everyone was told in the app all along: B and C, who never got an email, have their invitations there.
    expect((await toldInApp(w, B))[0]).toMatch(/^Handoff invited you to pay \$35 each for 1 ticket for /);
    expect((await toldInApp(w, C))[0]).toMatch(/^Handoff invited you to pay \$35 each for 1 ticket for /);
  });

  it("never lets a provider send any of the three to the shared development identity or a TEST account (B5.9, B4.10)", async () => {
    E.setInviteSwitch(true);
    // This schema's own "live" world: throwaway, like the rest of the schema. A provider handles only a world with that id.
    const w = new StoreWorld(db.sql, "live" as WorldId, T0);
    await heartbeat(w.sql, "provider", w.now);
    const localDev: Actor = { id: "local-dev-user", name: "Local Developer", email: "dev@localhost" };
    const pennTest: Actor = { ...B, email: "handoff-test-b@wharton.upenn.edu" }; // a TEST session minted with a Penn-looking domain
    const penn: Actor = { id: "penn-ann-lee", name: "Ann Lee", email: "ann.lee@wharton.upenn.edu" }; // a made-up classmate: the control
    // The gate itself: the development sign-in, and a TEST account under either sign-in, are refused; a Penn address with Google isn't.
    expect([
      providerAllows(addr(localDev), "dev"), providerAllows(addr(localDev), "google"), providerAllows(addr(pennTest), "google"),
      providerAllows(addr(pennTest), "dev"), providerAllows(addr(C), "dev"), providerAllows(addr(C), "google"), providerAllows(addr(penn), "dev"),
    ]).toEqual([false, false, false, false, false, false, false]);
    expect(providerAllows(addr(penn), "google")).toBe(true);

    await canSell(w, localDev);
    await canSell(w, penn);
    const ev = await w.createEvent(localDev);
    const l = await w.list(localDev, ev, { qty: 2, ask: "35" });
    const l2 = await w.list(penn, ev, { qty: 1, ask: "35" });
    await ensurePerson(w.sql, pennTest);
    // None of the three can turn real email on.
    for (const [who, signIn] of [[localDev, "dev"], [localDev, "google"], [pennTest, "google"], [pennTest, "dev"], [C, "dev"], [C, "google"]] as const) {
      expect(await saveEmailPrefs(w.sql, { userId: who.id, address: who.email, signIn, worldId: w.worldId, exchange: true, now: w.now }), `${who.id} ${signIn}`)
        .toEqual({ ok: false, error: NOT_FOR_THIS_ACCOUNT_ERROR });
    }
    expect(await w.sql`SELECT 1 FROM email_prefs`).toHaveLength(0);
    // The classmate can, through the same call.
    expect(await saveEmailPrefs(w.sql, { userId: penn.id, address: penn.email, signIn: "google", worldId: w.worldId, exchange: true, now: w.now }))
      .toMatchObject({ ok: true, email: { available: true, mode: "provider", exchange: true } });
    // Rows that say they did anyway (saved before this check, or by hand), so the store does queue their emails.
    for (const [who, signIn] of [[localDev, "dev"], [pennTest, "google"], [C, "dev"]] as const) {
      await w.sql`INSERT INTO email_prefs (user_id, address, sign_in, exchange_on, matches_on, consent_version, consented_at)
                  VALUES (${who.id}, ${addr(who)}, ${signIn}, TRUE, FALSE, 'v1', ${new Date(w.now)})`;
    }

    // All three kinds, to all three: two requests to the development identity's listing and its invitations to both TEST accounts;
    // a request to the classmate's listing (the control); then a reservation that lapses and its late payment report.
    const r1 = must((await actTagged(w, pennTest, askToBuy(l), to(localDev.id, "buy.requested"))).ok.resultId, "the first request");
    const r2 = must((await actTagged(w, C, askToBuy(l), to(localDev.id, "buy.requested"))).ok.resultId, "the second request");
    expect((await actTagged(w, localDev, inviteToPay(r1), to(pennTest.id, "buy.invited", r1))).jobs).toBe(1);
    expect((await actTagged(w, localDev, inviteToPay(r2), to(C.id, "buy.invited", r2))).jobs).toBe(1);
    const r3 = must((await actTagged(w, pennTest, askToBuy(l2), to(penn.id, "buy.requested"))).ok.resultId, "the request to the classmate");
    await w.ok(pennTest, reserveIt(r1));
    await lapse(w, "provider", pennTest);
    expect((await actTagged(w, pennTest, lateReport(r1), to(localDev.id, "payment.late", r1))).jobs).toBe(1);
    expect(await jobsOf(w.sql, w.worldId)).toHaveLength(6);

    const provider = memoryCaptureSender({ kind: "provider", allows: (x) => providerAllows(x.address, x.signIn) });
    w.advance(2 * MIN); // a provider always waits out the grace period
    const done = await dispatchEmail(w.sql, { sender: provider, siteUrl: "https://penntools.example.org", worlds: "live", now: w.now }, testDispatchDeps());
    expect(done).toEqual(counts({ claimed: 6, sent: 1, skipped: 5 }));
    expect(await jobLines(w)).toEqual(sorted([
      [localDev.id, "buy.requested", r1, "skipped", "recipient_not_allowed"],
      [localDev.id, "buy.requested", r2, "skipped", "recipient_not_allowed"],
      [pennTest.id, "buy.invited", r1, "skipped", "recipient_not_allowed"],
      [C.id, "buy.invited", r2, "skipped", "recipient_not_allowed"],
      [penn.id, "buy.requested", r3, "sent", null],
      [localDev.id, "payment.late", r1, "skipped", "recipient_not_allowed"],
    ]));
    // The provider was handed exactly one email, the classmate's; nothing for the development identity or a TEST account ever reached it.
    expect(provider.attempts.map((m) => [m.to, m.subject, m.actionUrl])).toEqual([
      [addr(penn), `Handoff wants to buy: ${TITLE}`, `https://penntools.example.org/tools/handoff#activity?listing=${l2}`],
    ]);
    // And the local capture never takes the live world's email.
    await expect(dispatchEmail(w.sql, { sender: sqlCaptureSender(w.sql), siteUrl: SITE, worlds: "live", now: w.now }, testDispatchDeps())).rejects.toThrow(TypeError);
    expect(await db.sql`SELECT 1 FROM email_capture`).toHaveLength(0);
  });

  it("builds each email from facts only: the plan's words, one link, 24 hours, and never a price, a note or where to pay (B5.9)", async () => {
    E.setInviteSwitch(true);
    const w = world("facts");
    await heartbeat(w.sql, "capture", w.now);
    // This test's own people, so their first names read in the emails and the seller's saved methods touch no other test.
    const seller: Actor = { id: "handoff-test-s2-quill", name: "Quill Test", email: "handoff-test-s2-quill@example.invalid" };
    const buyer: Actor = { id: "handoff-test-s2-bram", name: "Bram Test", email: "handoff-test-s2-bram@example.invalid" };
    const poster: Actor = { id: "handoff-test-s2-pia", name: "Pia Test", email: "handoff-test-s2-pia@example.invalid" };
    // Everything an email must never carry is planted where the engine can see it: where to pay, the listing's note and lowest
    // offer, the buyer's offer and message, the invitation's prices, and the public request's budget and note.
    const PLANTED = ["canary-venmo-s2", "canary-zelle-s2", "CANARY-NOTE", "CANARY-MSG", "CANARY-REQ", "37.25", "21.75", "33.50", "34.75", "36.50", "35.25"];
    await ensurePerson(w.sql, seller);
    expect(await savePayMethods(db.sql, { userId: seller.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-s2" }, { kind: "zelle", value: "canary-zelle-s2@example.invalid" }] }))
      .toMatchObject({ ok: true });
    const ev = await w.createEvent(seller);
    const listing = sent.list(ev, { qty: 2, ask: "37.25", paid: "40", payHandle: "", obo: true, minOffer: "21.75", note: "CANARY-NOTE row 12" });
    delete (listing.then as Record<string, unknown>)["payHandle"]; // as the page sends it since protocol 2
    const l = must((await w.ok(seller, listing)).resultId, "the listing");
    for (const p of [seller, buyer, poster]) await optIn(w, p, { exchange: true });
    const outbox = memoryCaptureSender();

    // The request to buy, with an offer and a message. The app's notification names both prices; the email names neither.
    const asked = await actTagged(w, buyer, askToBuy(l, { amount: "33.50", msg: "CANARY-MSG text me" }), to(seller.id, "buy.requested"));
    const rb = must(asked.ok.resultId, "the request");
    expect(asked.notes.map((x) => x.text)).toEqual([expect.stringMatching(/^Bram T\. wants 1 ticket for \[Test\] Spring Formal and offers \$33\.50 each \(you're asking \$37\.25\)\. Invite them to pay, or decline, by /)]);
    const askedDue = E.fmtMs(must((await recordOf(w, rb)).expiresAt, "the request's deadline"));
    // A retry of the same change (the same request id) queues nothing more.
    expect((await actTagged(w, buyer, askToBuy(l, { amount: "33.50", msg: "CANARY-MSG text me" }), to(seller.id, "buy.requested"), asked.requestId)).jobs).toBe(0);
    expect(await run(w, outbox)).toEqual(counts({ claimed: 1, sent: 1 }));
    w.advance(MIN);

    // The invitation, at a price of the seller's choosing.
    const invitation = await actTagged(w, seller, inviteToPay(rb, { price: "34.75" }), to(buyer.id, "buy.invited", rb));
    expect(invitation.notes.map((x) => x.text)).toEqual([expect.stringMatching(/^Quill invited you to pay \$34\.75 each for 1 ticket for \[Test\] Spring Formal\. It isn't held yet: reserve it by /)]);
    const invitedDue = E.fmtMs(must((await recordOf(w, rb)).expiresAt, "the invitation's deadline"));
    expect(await run(w, outbox)).toEqual(counts({ claimed: 1, sent: 1 }));
    w.advance(MIN);

    // The invitation from a public request, which has a budget and a note of its own.
    const iso = must((await actTagged(w, poster, sent.request(ev, { qty: 1, budget: "36.50", note: "CANARY-REQ aisle seat", expires: dateAfter(w.now, 5) }), inApp)).ok.resultId, "the public request");
    const fromRequest = await actTagged(w, seller, inviteRequester(iso, l, { price: "35.25" }), to(poster.id, "buy.invited"));
    const rp = must(fromRequest.ok.resultId, "the poster's invitation");
    expect(fromRequest.notes.map((x) => x.text)).toEqual([expect.stringMatching(/^Quill T\. invited you to pay \$35\.25 each for 1 ticket for \[Test\] Spring Formal, for your request\. It isn't held yet: reserve it by /)]);
    const posterDue = E.fmtMs(must((await recordOf(w, rp)).expiresAt, "the poster's invitation's deadline"));
    expect(await run(w, outbox)).toEqual(counts({ claimed: 1, sent: 1 }));

    // The buyer reserves: only now do the payment instructions exist on the record. The hold lapses, and the buyer reports a late payment.
    expect((await actTagged(w, buyer, reserveIt(rb), inApp)).jobs).toBe(0);
    expect(JSON.stringify((await recordOf(w, rb)).pay)).toContain("canary-venmo-s2");
    await lapse(w, "capture", buyer);
    const late = await actTagged(w, buyer, lateReport(rb), to(seller.id, "payment.late", rb));
    expect(late.notes.map((x) => x.text)).toEqual([expect.stringMatching(/^Bram T\. says they paid for their reservation for \[Test\] Spring Formal, which ended at /)]);
    expect(await run(w, outbox)).toEqual(counts({ claimed: 1, sent: 1 }));

    // Four emails, each the plan's subject and body, its one link, and the footer; the HTML says the same.
    const profile = `${SITE}/tools/handoff#profile`;
    const activity = `${SITE}/tools/handoff#activity?listing=${l}`;
    const eventPage = `${SITE}/tools/handoff#${ev}?listing=${l}`;
    const text = (body: string, url: string): string => `${body}\n\n${url}\n\n${FOOTER} ${profile}\n`;
    expect(outbox.attempts).toHaveLength(4);
    expect(outbox.sent.map((m) => ({ to: m.to, subject: m.subject, text: m.text, actionUrl: m.actionUrl }))).toEqual([
      { to: addr(seller), subject: `Bram wants to buy: ${TITLE}`, text: text(`Invite them to pay, or decline, by ${askedDue}.`, activity), actionUrl: activity },
      { to: addr(buyer), subject: `Quill invited you to pay: ${TITLE}`, text: text(`It isn't held yet: reserve it by ${invitedDue}, then you have up to 15 minutes to pay.`, eventPage), actionUrl: eventPage },
      { to: addr(poster), subject: `Quill invited you to pay: ${TITLE}`, text: text(`It isn't held yet: reserve it by ${posterDue}, then you have up to 15 minutes to pay.`, eventPage), actionUrl: eventPage },
      { to: addr(seller), subject: `Bram says they paid after the reservation ended: ${TITLE}`, text: text("If the money arrived, sort it out with Bram. Handoff can't see payments.", activity), actionUrl: activity },
    ]);
    for (const m of outbox.sent) {
      const all = `${m.subject}\n${m.text}\n${m.html ?? ""}\n${m.actionUrl ?? ""}\n${m.idempotencyKey}`;
      expect(m.html, m.subject).toContain("Open in Handoff");
      expect(all, m.subject).not.toContain("$"); // no amount of any kind
      expect(all, m.subject).not.toMatch(/venmo|zelle|paypal|canary/i);
      for (const secret of PLANTED) expect(all, `${m.subject}: ${secret}`).not.toContain(secret);
      // One link to act on, and the profile link to turn email off: nothing else.
      expect(m.text.match(/https?:\/\/\S+/g)).toEqual([m.actionUrl, profile]);
    }
    // The table's row for each: an exchange email about a ticket request, worth sending for 24 hours.
    for (const kind of ["buy.requested", "buy.invited", "payment.late"] as const) {
      expect(EMAIL_KINDS[kind]).toMatchObject({ category: "exchange", ttlMs: 24 * HOUR, ref: "request" });
    }
    expect(EXCHANGE_TTL_MS).toBe(24 * HOUR);
    const stored = await w.sql<{ kind: string; category: string; ttl_s: number }[]>`
      SELECT kind, category, extract(epoch FROM (expires_at - created_at))::int AS ttl_s FROM email_jobs WHERE world_id = ${w.worldId} ORDER BY created_at, notification_id`;
    expect(stored.map((j) => [j.kind, j.category, j.ttl_s])).toEqual([
      ["buy.requested", "exchange", 86_400], ["buy.invited", "exchange", 86_400], ["buy.invited", "exchange", 86_400], ["payment.late", "exchange", 86_400],
    ]);
    // A job stores ids and its kind only: none of the planted values is in the queue either.
    const queue = JSON.stringify(await w.sql`SELECT * FROM email_jobs WHERE world_id = ${w.worldId}`);
    for (const secret of PLANTED) expect(queue, secret).not.toContain(secret);
  });

  it("emails a shared listing in the words the app uses for it: ask to buy it (the B5 fix round, F1)", async () => {
    E.setInviteSwitch(true);
    const w = world("share");
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, A);
    const ev = await w.createEvent(A);
    const l = await w.list(A, ev, { qty: 1, ask: "35" });
    await optIn(w, F, { matches: true });
    const capture = sqlCaptureSender(w.sql);
    // F posts a public request; A shares the listing with it: one notification in the app, and its email's job.
    const iso = must((await actTagged(w, F, sent.request(ev, { qty: 1, budget: "40", note: "", expires: dateAfter(w.now, 5) }), inApp)).ok.resultId, "F's public request");
    const shared = await actTagged(w, A, { type: "shareListing", isoId: iso, listingId: l }, to(F.id, "share.listing"));
    expect(shared.jobs).toBe(1);
    expect(shared.notes.map((x) => x.text)).toEqual([
      expect.stringMatching(/ shared a listing for \[Test\] Spring Formal with your request: 1 ticket at \$35\. It isn't held for you: ask to buy it on the event page\.$/),
    ]);
    expect(await run(w, capture)).toEqual(counts({ claimed: 1, sent: 1 }));
    const captures = await capturesOf(w.sql, w.worldId);
    expect(captures.map((c) => [c.to_address, c.subject, c.action_url])).toEqual([[addr(F), "Handoff shared a listing for your request", `${SITE}/tools/handoff#${ev}?listing=${l}`]]);
    // The email's one sentence names the step the app's note names, never the earlier flow's reserve or offer.
    expect(captures[0]?.body_text.split("\n")[0]).toBe("It isn't held for you: ask to buy it on its page.");
    expect(captures[0]?.body_text).not.toMatch(/reserve it or make an offer/);
  });

  it("drops an email nobody picked up for 24 hours, unsent (the table's 24 h)", async () => {
    E.setInviteSwitch(true);
    const w = world("ttl");
    await heartbeat(w.sql, "capture", w.now);
    await canSell(w, A);
    // An event far enough out that the late report is still open a day later.
    const ev = await w.createEvent(A);
    const l = await w.list(A, ev, { qty: 1, ask: "35" });
    await optIn(w, A, { exchange: true });
    const rb = must((await w.ok(B, askToBuy(l))).resultId, "B's request");
    await w.ok(A, inviteToPay(rb));
    await w.ok(B, reserveIt(rb));
    await lapse(w, "capture", B);
    expect((await actTagged(w, B, lateReport(rb), to(A.id, "payment.late", rb))).jobs).toBe(1);
    // No dispatcher for a day: the report is still open, but its email is too old to be worth sending.
    w.advance(24 * HOUR);
    const done = await run(w, sqlCaptureSender(w.sql));
    expect({ claimed: done.claimed, sent: done.sent, expired: done.expired }).toEqual({ claimed: 0, sent: 0, expired: 2 });
    expect(await jobLines(w)).toEqual(sorted([
      [A.id, "buy.requested", rb, "skipped", "expired"],
      [A.id, "payment.late", rb, "skipped", "expired"],
    ]));
    expect(await capturesOf(w.sql, w.worldId)).toEqual([]);
    expect((await recordOf(w, rb)).problem).toMatchObject({ reason: E.LATE_PAYMENT });
  });
});
