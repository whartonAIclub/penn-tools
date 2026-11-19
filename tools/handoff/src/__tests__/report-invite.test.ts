// The pilot report's figures for invite to pay (format 4; follow-on Batch 5, step S2; USER-INSTRUCTIONS METRICS and FOLLOWON-PLAN
// §1.5 M1-M2, §2.8), one case at a time, each on an empty "live" world of this file's own throwaway schema, built through the real
// store and engine at injected times. report.test.ts walks one buyer through every stage; this file takes the cases the brief names:
// - one person buying and selling counts once, in each stage they reached;
// - a retried request to buy, invitation, reservation or payment step counts once, and a second tap that isn't a retry is refused
//   and counts nowhere but the actions log;
// - requests to buy and invitations that ran out stay interest and invitations: never a hold, a payment or a sale;
// - a late payment report is a problem report and nothing else: no stock moves, no payment step, no value;
// - a closed listing ("sold elsewhere" or not) and the invitations it ends are never a sale;
// - a known test account's records are left out of every stage, on either side;
// - the legacy figures count legacy records only, are labelled legacy, and exchange value counts completed exchanges of either kind.
// Every report is scanned for planted names, ids, amounts and text, and the database is fingerprinted around it (the report reads in
// a READ ONLY transaction and changes nothing).
//
// Labelled test accounts with made-up ids, never a session or sign-in of any kind; nothing outside this schema is read or written.

import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as E from "../../engine/index.js";
import { pilotReportMarkdown, runPilotReport } from "../report/index.js";
import type { InviteFunnel, PilotReport, Units } from "../report/types.js";
import { ensurePerson, savePayMethods } from "../store.js";
import type { ApplyInput } from "../store.js";
import type { Actor } from "../types.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { HOUR, MIN, StoreWorld, T0, actions, dateAfter, okOf, refusedOf, type Ok, type SentAction } from "./helpers/live-store.js";

/** A labelled test account whose name, email and id are all planted: none may reach a report. */
const person = (key: string): Actor => ({ id: `acct-s2${key}-k9w`, name: `Canary${key} Plantedname`, email: `canary-s2-${key}@example.invalid` });
const A = person("a");
const B = person("b");
const C = person("c");
const D = person("d");
const F = person("f");
const G = person("g");
const K = person("k");
const M = person("m");
const T = person("t"); // a known test account: left out when named
const EVERYONE = [A, B, C, D, F, G, K, M, T];

/** Amounts only the two parties may see (an offer, a lowest offer, a budget), on records that never complete. */
const PRIVATE_AMOUNTS = ["23.17", "26.59", "21.43", "38.71"];
const TABLES = ["worlds", "people", "notifications", "actions", "world_snapshots"] as const;

const ZERO: Units = { exchanges: 0, units: 0 };
const n = (exchanges: number, units = exchanges): Units => ({ exchanges, units });
/** The funnel with every stage not named at zero. */
const stages = (o: { asked?: Units; invited?: Units; invitedFromPublicRequest?: Units; holds?: Units; buyerReported?: Units; sellerConfirmed?: Units; completed?: Units }): InviteFunnel => ({
  requestsToBuy: o.asked ?? ZERO,
  invitations: { fromRequest: o.invited ?? ZERO, fromPublicRequest: o.invitedFromPublicRequest ?? ZERO },
  holds: o.holds ?? ZERO,
  buyerReported: o.buyerReported ?? ZERO,
  sellerConfirmed: o.sellerConfirmed ?? ZERO,
  completed: o.completed ?? ZERO,
});

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`missing ${what}`);
  return v;
}

// The actions, as the page sends them.
const ask = (listingId: string, qty = 1, amount?: string): SentAction =>
  ({ type: "requestToBuy", listingId, qty, ...(amount !== undefined ? { amount } : {}), msg: "CANARY-BUY-NOTE", member: false });
const invite = (requestId: string, qty?: number): SentAction => ({ type: "invite", requestId, ...(qty !== undefined ? { qty } : {}) });
const inviteRequester = (isoId: string, listingId: string): SentAction => ({ type: "inviteRequester", isoId, listingId, qty: 1 });
const reserve = (requestId: string): SentAction => ({ type: "reserve", requestId, member: false });
const on = actions.onRequest;
const lateReport = (id: string): SentAction => ({ type: "reportProblem", kind: "ticket", id, reason: E.LATE_PAYMENT });
// The legacy actions, for records made before invite to pay.
const take = (listingId: string): SentAction => ({ type: "take", listingId, qty: 1, amount: "", msg: "", member: false });
const offer = (listingId: string, amount: string): SentAction => ({ type: "offer", listingId, qty: 1, amount, msg: "", member: false });

/** Each table's row count and a checksum of every row with its row version (xmin): any insert, update or delete changes it. */
async function fingerprint(sql: Sql): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const table of TABLES) {
    const [row] = await sql.unsafe<{ n: number; sum: string }[]>(
      `SELECT count(*)::int AS n, md5(coalesce(string_agg(t.xmin::text || ':' || t::text, '|' ORDER BY t::text), '')) AS sum FROM ${table} t`,
    );
    out[table] = `${row?.n}:${row?.sum}`;
  }
  return out;
}

describe.skipIf(!databaseUrl)("pilot metrics report: invite to pay, case by case (real store, Postgres)", () => {
  let db: TestDb;
  let w: StoreWorld;

  beforeAll(async () => {
    db = await createTestDb("report-invite");
  }, 30_000);
  afterAll(async () => {
    await db?.close();
  });
  // Every test starts on an empty market: this schema's own "live" world (the only id the report reads) with nothing stored, no
  // profiles, and invite to pay switched on, as it will be once the switch lands.
  beforeEach(async () => {
    await db.sql`DELETE FROM worlds`;
    await db.sql`DELETE FROM people`;
    w = new StoreWorld(db.sql, "live", T0);
    E.setInviteSwitch(true);
  });
  afterEach(() => {
    E.setInviteSwitch(null);
  });

  const at = (minutes: number): void => {
    w.now = T0 + minutes * MIN;
  };
  const ok = async (who: Actor, action: SentAction, extra: Partial<ApplyInput> = {}): Promise<Ok> => okOf(await w.act(who, action, extra), `${action.type} by ${who.id}`);
  const refused = async (who: Actor, action: SentAction): Promise<void> => {
    refusedOf(await w.act(who, action), `${action.type} by ${who.id}`);
  };
  /** The change, then the same change again under the same request id, as a retry after a lost reply sends it. */
  async function twice(who: Actor, action: SentAction): Promise<Ok> {
    const requestId = randomUUID();
    const first = await ok(who, action, { requestId });
    const again = await w.act(who, action, { requestId });
    expect(again, `${action.type}, retried`).toMatchObject({ ok: true, replay: true, ...(first.resultId ? { resultId: first.resultId } : {}) });
    return first;
  }
  async function steps(list: readonly [number, Actor, SentAction][]): Promise<void> {
    for (const [minutes, who, action] of list) {
      at(minutes);
      await ok(who, action);
    }
  }
  /** A public listing by someone with a saved way to be paid (planted: no report may carry it). */
  async function sell(who: Actor, eventId: string, qty: number, price: string, over: { obo?: boolean; minOffer?: string } = {}): Promise<string> {
    await ensurePerson(db.sql, who);
    expect(await savePayMethods(db.sql, { userId: who.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-s2" }] })).toMatchObject({ ok: true });
    const a = actions.list(eventId, { qty, ask: price, paid: "40", payHandle: "", note: "CANARY-LISTING-NOTE", ...over });
    delete (a.then as Record<string, unknown>)["payHandle"]; // as the page sends it since protocol 2
    return must((await ok(who, a)).resultId, "the listing");
  }
  const event = async (who: Actor, title = "CANARY-TITLE Spring Formal"): Promise<string> => must((await ok(who, actions.createEvent(T0, { title }))).resultId, "the event");
  /** From a hold to a completed exchange: the buyer's word, the seller's, the handover and the buyer's receipt, a minute apart. */
  const complete = (buyer: Actor, seller: Actor, requestId: string, from: number): Promise<void> =>
    steps([
      [from, buyer, on("markPaid", requestId)],
      [from + 1, seller, on("confirmPayment", requestId)],
      [from + 2, seller, on("markTransferred", requestId)],
      [from + 3, buyer, on("buyerReceived", requestId)],
    ]);

  /**
   * The report as of the test's clock: the database fingerprinted before and after, the output scanned for every planted value, and
   * the rules that hold for any report checked: every ticket request is counted once, as a legacy record or a new-flow one; no stage
   * outnumbers the one before it; and exchange value counts exactly the completed exchanges.
   */
  async function report(opts: { excludeUserIds?: readonly string[] } = {}): Promise<PilotReport> {
    const before = await fingerprint(db.sql);
    const r = await runPilotReport(db.sql, { now: w.now, ...opts });
    expect(await fingerprint(db.sql), "the report changed the database").toEqual(before);
    expect(r.format).toBe(4);
    expect(r.safety).toMatchObject({ readOnlyTransaction: true, isolation: "repeatable read" });
    const text = JSON.stringify(r) + "\n" + pilotReportMarkdown(r);
    expect(text).not.toMatch(/canary/i);
    for (const p of EVERYONE) expect(text, `account id ${p.id}`).not.toContain(p.id);
    // A planted amount must not appear as a number anywhere. A longer digit run around it (a timestamp's "…:23.172Z") is not that amount.
    for (const amount of PRIVATE_AMOUNTS) expect(text, `private amount ${amount}`).not.toMatch(new RegExp(`(?<!\\d)${amount.replace(".", "\\.")}(?!\\d)`));
    const f = r.funnel;
    const t = r.ticketExchanges;
    expect(t.requests, "every ticket request once").toBe(t.offers + t.takes + t.heldReplies + f.requestsToBuy.exchanges + f.invitations.fromPublicRequest.exchanges);
    expect(f.holds.exchanges).toBeLessThanOrEqual(f.invitations.fromRequest.exchanges + f.invitations.fromPublicRequest.exchanges);
    expect(f.invitations.fromRequest.exchanges).toBeLessThanOrEqual(f.requestsToBuy.exchanges);
    expect(f.buyerReported.exchanges).toBeLessThanOrEqual(f.holds.exchanges);
    expect(f.sellerConfirmed.exchanges).toBeLessThanOrEqual(f.buyerReported.exchanges);
    expect(f.completed.exchanges).toBeLessThanOrEqual(f.sellerConfirmed.exchanges);
    expect(f.completed.exchanges).toBeLessThanOrEqual(t.completed.exchanges);
    expect(r.exchangeValue.tickets.exchanges, "value counts completed exchanges only").toBe(t.completed.exchanges);
    expect(r.exchangeValue.tickets.units).toBe(t.completed.units);
    expect(r.integrity).toEqual({ storedDocumentIssues: 0, recordsNotEvaluated: 0 });
    return r;
  }

  it("one person buying and selling counts once, in each stage they reached; a public request's owner buys only once they reserve", async () => {
    at(0);
    const ev1 = await event(A);
    const ev2 = await event(B, "CANARY-TITLE Fall Mixer");
    at(1);
    const lA = await sell(A, ev1, 2, "30");
    const lB = await sell(B, ev2, 1, "28");
    // Each asks for the other's ticket, each invites the other, each reserves. B's purchase goes all the way; A's stays a hold.
    at(2);
    const rB = must((await ok(B, ask(lA))).resultId, "B's request");
    const rA = must((await ok(A, ask(lB))).resultId, "A's request");
    await steps([
      [3, A, invite(rB)],
      [3, B, invite(rA)],
      [4, B, reserve(rB)],
      [4, A, reserve(rA)],
    ]);
    await complete(B, A, rB, 5);
    at(9);
    let r = await report();
    expect(r.participants).toEqual({ distinct: 2, sold: 2, bought: 2, boughtAndSold: 2, postedPublicRequests: 0, setAlerts: 0, inCompletedExchanges: 2 });
    expect(r.funnel).toEqual(stages({ asked: n(2), invited: n(2), holds: n(2), buyerReported: n(1), sellerConfirmed: n(1), completed: n(1) }));
    expect(r.ticketExchanges).toMatchObject({ requests: 2, offers: 0, takes: 0, heldReplies: 0, reservations: n(2), completed: n(1), inProgress: n(1), endedWithoutCompletion: ZERO });
    expect(r.quantities.tickets).toMatchObject({ listings: 2, listedUnits: 3, availableNow: 1, reservedNow: 1, completed: 1 });
    // One completed exchange is the whole value: A's hold on B's ticket, at $28, is not a sale.
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 30 }, total: 30 });
    expect(pilotReportMarkdown(r)).toContain("| Participants: distinct accounts (a buyer who also sells counts once) | 2 | – |");
    // A says they paid and B says it arrived. Both steps count, each once; a payment both people confirmed is still not a completed
    // exchange, so it is no value and A is in no completed exchange as a buyer yet.
    await steps([
      [9, A, on("markPaid", rA)],
      [9, B, on("confirmPayment", rA)],
    ]);
    r = await report();
    expect(r.funnel).toEqual(stages({ asked: n(2), invited: n(2), holds: n(2), buyerReported: n(2), sellerConfirmed: n(2), completed: n(1) }));
    expect(r.ticketExchanges).toMatchObject({ reservations: n(2), completed: n(1), inProgress: n(1), payment: { buyerReported: n(2), sellerConfirmed: n(2) } });
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 30 }, total: 30 });
    expect(r.quantities.tickets).toMatchObject({ availableNow: 1, reservedNow: 1, completed: 1 });

    // C posts a public request and A invites C from the listing. C hasn't done anything as a buyer yet: one more participant (for
    // the request), one more invitation, and nobody new buying.
    at(10);
    const iso = must((await ok(C, actions.request(ev1, { qty: 1, budget: "38.71", note: "CANARY-ISO-NOTE", expires: dateAfter(w.now, 5) }))).resultId, "C's public request");
    at(11);
    const rC = must((await ok(A, inviteRequester(iso, lA))).resultId, "C's invitation");
    r = await report();
    expect(r.participants).toEqual({ distinct: 3, sold: 2, bought: 2, boughtAndSold: 2, postedPublicRequests: 1, setAlerts: 0, inCompletedExchanges: 2 });
    expect(r.funnel).toEqual(stages({ asked: n(2), invited: n(2), invitedFromPublicRequest: n(1), holds: n(2), buyerReported: n(2), sellerConfirmed: n(2), completed: n(1) }));
    expect(r.quantities.tickets).toMatchObject({ availableNow: 1, reservedNow: 1, completed: 1 }); // the invitation took no stock
    // C reserves: now C is buying, and it's a hold.
    at(12);
    await ok(C, reserve(rC));
    r = await report();
    expect(r.participants).toMatchObject({ distinct: 3, sold: 2, bought: 3, boughtAndSold: 2, inCompletedExchanges: 2 });
    expect(r.funnel).toEqual(stages({ asked: n(2), invited: n(2), invitedFromPublicRequest: n(1), holds: n(3), buyerReported: n(2), sellerConfirmed: n(2), completed: n(1) }));
    expect(r.quantities.tickets).toMatchObject({ availableNow: 0, reservedNow: 2, completed: 1 });
    expect(r.exchangeValue.total).toBe(30);
  });

  it("a retried request to buy, invitation, reservation or payment step counts once; a second tap is refused and counts nowhere else", async () => {
    at(0);
    const ev = await event(A);
    at(1);
    const l = await sell(A, ev, 3, "30");
    at(2);
    const rb = must((await twice(B, ask(l, 2))).resultId, "B's request");
    await refused(B, ask(l, 1)); // a second tap, not a retry: one open request per buyer and listing
    at(3);
    await twice(A, invite(rb));
    await refused(A, invite(rb));
    at(4);
    await twice(B, reserve(rb));
    await refused(B, reserve(rb));
    at(5);
    await twice(B, on("markPaid", rb));
    at(6);
    await twice(A, on("confirmPayment", rb));
    at(7);
    await twice(A, on("markTransferred", rb));
    at(8);
    await twice(B, on("buyerReceived", rb));
    at(9);
    const iso = must((await twice(C, actions.request(ev, { qty: 1, budget: "38.71", note: "CANARY-ISO-NOTE", expires: dateAfter(w.now, 5) }))).resultId, "C's public request");
    at(10);
    await twice(A, inviteRequester(iso, l));
    await refused(A, inviteRequester(iso, l));

    at(11);
    const r = await report();
    // One record at every stage, for the two tickets B asked for; one invitation to C.
    expect(r.funnel).toEqual(stages({ asked: n(1, 2), invited: n(1, 2), invitedFromPublicRequest: n(1), holds: n(1, 2), buyerReported: n(1, 2), sellerConfirmed: n(1, 2), completed: n(1, 2) }));
    expect(r.ticketExchanges).toMatchObject({ requests: 2, reservations: n(1, 2), completed: n(1, 2), neverReserved: { total: 1, open: 1, ended: 0 }, payment: { buyerReported: n(1, 2), sellerConfirmed: n(1, 2) } });
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 3, availableNow: 1, reservedNow: 0, completed: 2 });
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 2, amount: 60 }, total: 60 });
    expect(r.created.publicRequests.allTime).toBe(1);
    expect(r.participants).toMatchObject({ distinct: 3, sold: 1, bought: 1, postedPublicRequests: 1 });
    // The log has each accepted change once (a retry writes nothing) and the four second taps as refused.
    expect(r.recentActivity).toMatchObject({ acceptedChanges: 11, refusedChanges: 4, accountsWithAcceptedChange: 3 });
    const logged = (type: string) => r.recentActivity.byType.find((x) => x.type === type);
    expect(logged("requestToBuy")).toEqual({ type: "requestToBuy", accepted: 1, refused: 1 });
    expect(logged("invite")).toEqual({ type: "invite", accepted: 1, refused: 1 });
    expect(logged("reserve")).toEqual({ type: "reserve", accepted: 1, refused: 1 });
    expect(logged("inviteRequester")).toEqual({ type: "inviteRequester", accepted: 1, refused: 1 });
    for (const type of ["markPaid", "confirmPayment", "markTransferred", "buyerReceived"]) expect(logged(type), type).toEqual({ type, accepted: 1, refused: 0 });
  });

  it("requests and invitations that ran out stay interest and invitations: never a hold, a payment or a sale, swept or not", async () => {
    at(0);
    const ev = await event(A);
    at(1);
    const l = await sell(A, ev, 3, "30");
    // B asks and is never answered. C asks for two and is invited for one. D is invited from a public request. F asks, is invited and
    // reserves. Then everyone walks away.
    at(2);
    await ok(B, ask(l));
    const rc = must((await ok(C, ask(l, 2))).resultId, "C's request");
    at(3);
    await ok(A, invite(rc, 1));
    at(4);
    const iso = must((await ok(D, actions.request(ev, { qty: 1, budget: "38.71", note: "CANARY-ISO-NOTE", expires: dateAfter(w.now, 5) }))).resultId, "D's public request");
    at(5);
    await ok(A, inviteRequester(iso, l));
    at(6);
    const rf = must((await ok(F, ask(l))).resultId, "F's request");
    await steps([
      [7, A, invite(rf)],
      [8, F, reserve(rf)],
    ]);
    at(9);
    const open = await report();
    const made = stages({ asked: n(3, 4), invited: n(2), invitedFromPublicRequest: n(1), holds: n(1) }); // B 1, C 2 asked (1 invited), F 1; D invited
    expect(open.funnel).toEqual(made);
    expect(open.ticketExchanges).toMatchObject({ requests: 4, reservations: n(1), inProgress: n(1), neverReserved: { total: 3, open: 3, ended: 0 } });
    expect(open.quantities.tickets).toMatchObject({ listedUnits: 3, availableNow: 2, reservedNow: 1, completed: 0 });

    // Seven hours on, with nobody having opened the page: the request, both invitations and the hold have all run out.
    w.now = T0 + 7 * HOUR;
    const lapsed = await report();
    expect(lapsed.funnel).toEqual(made); // what was asked and invited is still what was asked and invited
    expect(lapsed.ticketExchanges).toMatchObject({
      requests: 4, reservations: n(1), completed: ZERO, inProgress: ZERO, endedWithoutCompletion: n(1),
      neverReserved: { total: 3, open: 0, ended: 3 }, payment: { buyerReported: ZERO, sellerConfirmed: ZERO },
    });
    expect(lapsed.cancellationsExpirationsDisputes.expirations).toMatchObject({ ticketOffersAndReplies: 3, ticketReservationsBeforePayment: 1, notYetRecordedBySweep: 4 });
    expect(lapsed.quantities.tickets).toMatchObject({ listedUnits: 3, availableNow: 3, reservedNow: 0, completed: 0 }); // nothing stayed held
    expect(lapsed.exchangeValue).toMatchObject({ tickets: { exchanges: 0, units: 0, amount: 0 }, total: 0 });
    // B, C and F asked, so they count as buying; D was only ever invited.
    expect(lapsed.participants).toEqual({ distinct: 5, sold: 1, bought: 3, boughtAndSold: 0, postedPublicRequests: 1, setAlerts: 0, inCompletedExchanges: 0 });
    expect(lapsed.quantities.publicRequests).toMatchObject({ liveNow: 1, liveUnits: 1 }); // D's request is still wanted
    expect(lapsed.recentActivity.systemSweeps).toBe(0);

    // Someone opens the page and the server stores the endings: the same figures, now recorded.
    await w.view(A);
    const swept = await report();
    expect(swept.funnel).toEqual(made);
    expect(swept.cancellationsExpirationsDisputes.expirations).toMatchObject({ ticketOffersAndReplies: 3, ticketReservationsBeforePayment: 1, notYetRecordedBySweep: 0 });
    expect(swept.ticketExchanges).toEqual(lapsed.ticketExchanges);
    expect(swept.quantities.tickets).toEqual(lapsed.quantities.tickets);
    expect(swept.participants).toEqual(lapsed.participants);
    expect(swept.exchangeValue.total).toBe(0);
    expect(swept.recentActivity.systemSweeps).toBe(1);
  });

  it("a late payment report is a problem report and nothing else: no stock moves, no payment step, no value", async () => {
    at(0);
    const ev = await event(A);
    at(1);
    const l = await sell(A, ev, 1, "30");
    at(2);
    const rb = must((await ok(B, ask(l))).resultId, "B's request");
    await steps([
      [3, A, invite(rb)],
      [4, B, reserve(rb)],
    ]);
    // The 15 minutes pass without "I've sent payment"; the server stores the ending.
    at(20);
    await w.view(B);
    const lapsed = await report();
    expect(lapsed.funnel).toEqual(stages({ asked: n(1), invited: n(1), holds: n(1) }));
    expect(lapsed.cancellationsExpirationsDisputes.expirations).toMatchObject({ ticketReservationsBeforePayment: 1, notYetRecordedBySweep: 0 });
    expect(lapsed.cancellationsExpirationsDisputes.disputes.problemReports).toMatchObject({ total: 0, open: 0 });
    expect(lapsed.quantities.tickets).toMatchObject({ availableNow: 1, reservedNow: 0, completed: 0 });

    // B says they paid after it ended.
    at(21);
    await ok(B, lateReport(rb));
    at(22);
    const reported = await report();
    expect(reported.cancellationsExpirationsDisputes.disputes.problemReports).toEqual({
      total: 1, open: 1, resolved: 0, tickets: 1, goods: 0, byBuyer: 1, bySeller: 0, byReason: [{ reason: E.LATE_PAYMENT, count: 1 }],
    });
    // Nothing else moved: it isn't "I've sent payment", it isn't a payment dispute, the ticket is still on sale and nothing was sold.
    expect(reported.funnel).toEqual(lapsed.funnel);
    expect(reported.ticketExchanges).toEqual(lapsed.ticketExchanges);
    expect(reported.ticketExchanges.payment).toEqual({ buyerReported: ZERO, sellerConfirmed: ZERO });
    expect(reported.quantities).toEqual({ ...lapsed.quantities, asOf: reported.quantities.asOf });
    expect(reported.participants).toEqual(lapsed.participants);
    expect(reported.exchangeValue).toEqual(lapsed.exchangeValue);
    expect(reported.exchangeValue.total).toBe(0);
    expect(reported.cancellationsExpirationsDisputes.cancellations).toEqual(lapsed.cancellationsExpirationsDisputes.cancellations);
    expect(reported.cancellationsExpirationsDisputes.expirations).toEqual(lapsed.cancellationsExpirationsDisputes.expirations);
    expect(reported.cancellationsExpirationsDisputes.disputes.paymentNotArrived).toEqual({ total: 0, laterConfirmed: 0, cancelledByBuyer: 0, releasedBySeller: 0, open: 0 });
    expect(reported.definitions["cancellationsExpirationsDisputes"]).toMatch(/A late-payment report .* is a problem report on an ended reservation: it changes no stock and no other figure\./);

    // The ticket really is still on sale: C asks, is invited, reserves and completes. That one exchange is the only sale.
    at(23);
    const rc = must((await ok(C, ask(l))).resultId, "C's request");
    await steps([
      [24, A, invite(rc)],
      [25, C, reserve(rc)],
    ]);
    await complete(C, A, rc, 26);
    at(30);
    const sold = await report();
    expect(sold.funnel).toEqual(stages({ asked: n(2), invited: n(2), holds: n(2), buyerReported: n(1), sellerConfirmed: n(1), completed: n(1) }));
    expect(sold.quantities.tickets).toMatchObject({ listedUnits: 1, availableNow: 0, reservedNow: 0, completed: 1 });
    expect(sold.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 30 }, total: 30 });
    expect(sold.cancellationsExpirationsDisputes.disputes.problemReports).toMatchObject({ total: 1, open: 1, resolved: 0 });
    // B marks the report resolved: still one report, now resolved, and still nothing else.
    at(31);
    await ok(B, { type: "resolveProblem", kind: "ticket", id: rb });
    const resolved = await report();
    expect(resolved.cancellationsExpirationsDisputes.disputes.problemReports).toMatchObject({ total: 1, open: 0, resolved: 1, byReason: [{ reason: E.LATE_PAYMENT, count: 1 }] });
    expect(resolved.funnel).toEqual(sold.funnel);
    expect(resolved.exchangeValue).toEqual(sold.exchangeValue);
  });

  it("a closed listing and the invitations it ends are never a sale, whatever reason the seller gives", async () => {
    at(0);
    const ev1 = await event(A);
    const ev2 = await event(A, "CANARY-TITLE Fall Mixer");
    at(1);
    const l1 = await sell(A, ev1, 2, "30");
    const l2 = await sell(A, ev2, 1, "32");
    // The first listing: B asks, C asks and is invited, then A closes it as sold elsewhere.
    at(2);
    await ok(B, ask(l1));
    const rc = must((await ok(C, ask(l1))).resultId, "C's request");
    await steps([
      [3, A, invite(rc)],
      [4, A, { type: "withdraw", listingId: l1, reason: "soldElsewhere" }],
    ]);
    // The second: D is invited and declines; F is invited and A withdraws the invitation; then A closes it, no longer selling.
    at(5);
    const rd = must((await ok(D, ask(l2))).resultId, "D's request");
    await steps([
      [6, A, invite(rd)],
      [7, D, on("cancel", rd)],
    ]);
    at(8);
    const rf = must((await ok(F, ask(l2))).resultId, "F's request");
    await steps([
      [9, A, invite(rf)],
      [10, A, on("decline", rf)],
      [11, A, { type: "withdraw", listingId: l2, reason: "noLongerSelling" }],
    ]);

    at(12);
    const r = await report();
    // Four people asked and three were invited; that is all that happened.
    expect(r.funnel).toEqual(stages({ asked: n(4), invited: n(3) }));
    expect(r.ticketExchanges).toMatchObject({
      requests: 4, reservations: ZERO, completed: ZERO, inProgress: ZERO, endedWithoutCompletion: ZERO,
      neverReserved: { total: 4, open: 0, ended: 4 }, payment: { buyerReported: ZERO, sellerConfirmed: ZERO },
    });
    expect(r.cancellationsExpirationsDisputes.closures.listings).toEqual({ soldElsewhere: 1, noLongerSelling: 1, noReason: 0 });
    expect(r.cancellationsExpirationsDisputes.cancellations).toMatchObject({
      listingsWithdrawn: 2,
      ticketOffersAndRepliesDeclined: 3, // B's request and C's invitation (the listing closed), F's invitation (withdrawn by the seller)
      ticketOffersAndRepliesWithdrawnByBuyer: 1, // D declined the invitation
      ticketReservationsCancelledByBuyer: 0, ticketReservationsReleasedBySeller: 0,
    });
    // "Sold elsewhere" sold nothing here: no completed ticket, no completed exchange, no value, nobody in a completed exchange.
    expect(r.quantities.tickets).toMatchObject({ listings: 2, listedUnits: 3, availableNow: 0, reservedNow: 0, completed: 0, unsoldNotOpen: 3, listingsWithdrawn: 2 });
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 0, units: 0, amount: 0 }, goods: { exchanges: 0, amount: 0 }, total: 0 });
    expect(r.participants).toEqual({ distinct: 5, sold: 1, bought: 4, boughtAndSold: 0, postedPublicRequests: 0, setAlerts: 0, inCompletedExchanges: 0 });
    expect(r.definitions["cancellationsExpirationsDisputes"]).toMatch(/A closure is never a sale/);
    expect(r.definitions["funnel"]).toMatch(/A request to buy or an invitation holds nothing: neither is a hold, a payment or a sale, and only completed counts as a completed exchange and as exchange value\./);
    expect(pilotReportMarkdown(r)).toContain("requests to buy 4 (4 tickets); invitations to pay 3 (3 tickets) answering a request to buy and 0 (0 tickets) sent to a public request's owner; holds (the buyer reserved it) 0 (0 tickets);");
  });

  it("a known test account is left out of every stage, as buyer and as seller, and its completed exchanges are no value", async () => {
    at(0);
    const ev1 = await event(A);
    const ev2 = await event(T, "CANARY-TITLE Fall Mixer");
    at(1);
    const lA = await sell(A, ev1, 2, "30");
    const lT = await sell(T, ev2, 1, "25");
    // T buys from A, and B buys from T, both to completion. C asks A and is invited: the one record with no test account in it.
    at(2);
    const rt = must((await ok(T, ask(lA))).resultId, "T's request");
    const rb = must((await ok(B, ask(lT))).resultId, "B's request");
    const rc = must((await ok(C, ask(lA))).resultId, "C's request");
    await steps([
      [3, A, invite(rt)],
      [3, T, invite(rb)],
      [3, A, invite(rc)],
      [4, T, reserve(rt)],
      [4, B, reserve(rb)],
    ]);
    await complete(T, A, rt, 5);
    await complete(B, T, rb, 5);

    at(9);
    const r = await report({ excludeUserIds: [T.id] });
    expect(r.funnel).toEqual(stages({ asked: n(1), invited: n(1) })); // C only
    expect(r.ticketExchanges).toMatchObject({ requests: 1, reservations: ZERO, completed: ZERO, payment: { buyerReported: ZERO, sellerConfirmed: ZERO }, neverReserved: { total: 1, open: 1, ended: 0 } });
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 0, units: 0, amount: 0 }, total: 0 });
    expect(r.participants).toEqual({ distinct: 2, sold: 1, bought: 1, boughtAndSold: 0, postedPublicRequests: 0, setAlerts: 0, inCompletedExchanges: 0 });
    expect(r.scope.recordsLeftOut).toMatchObject({ eventsAddedBy: 1, listings: 1, ticketRequests: 2 });
    // The market as it stands still shows A's ticket gone to the test account, and says so; that is stock, never activity.
    expect(r.quantities.tickets).toMatchObject({ listings: 1, listedUnits: 2, availableNow: 1, reservedNow: 0, completed: 1 });
    expect(r.scope.stockHeldByLeftOutAccounts).toMatchObject({ ticketsReservedNow: 0, ticketsCompleted: 1 });
    expect(r.recentActivity.leftOut).toBeGreaterThan(0);

    // Not named, the same records count as anyone's: that is what leaving the account out removes.
    const all = await report();
    expect(all.funnel).toEqual(stages({ asked: n(3), invited: n(3), holds: n(2), buyerReported: n(2), sellerConfirmed: n(2), completed: n(2) }));
    expect(all.exchangeValue).toMatchObject({ tickets: { exchanges: 2, units: 2, amount: 55 }, total: 55 });
    expect(all.participants).toMatchObject({ distinct: 4, sold: 2, bought: 3, boughtAndSold: 1, inCompletedExchanges: 3 });
    expect(all.quantities.tickets).toMatchObject({ listings: 2, listedUnits: 3, availableNow: 1, completed: 2 });
  });

  it("legacy figures count legacy records only and are labelled legacy; value counts completed exchanges of either kind", async () => {
    // Before invite to pay: M reserves with "I'll take it" and completes; G makes an offer the seller could accept into a hold.
    E.setInviteSwitch(false);
    at(0);
    const ev = await event(A);
    at(1);
    const l = await sell(A, ev, 4, "30", { obo: true, minOffer: "21.43" });
    at(2);
    const rm = must((await ok(M, take(l))).resultId, "M's reservation");
    await ok(G, offer(l, "23.17"));
    await complete(M, A, rm, 3);
    // Invite to pay lands. The old ways in are refused; K asks to buy with an offer, is invited at it and reserves.
    E.setInviteSwitch(true);
    at(8);
    await refused(K, take(l));
    await refused(K, offer(l, "26.59"));
    at(9);
    const rk = must((await ok(K, ask(l, 1, "26.59"))).resultId, "K's request");
    await steps([
      [10, A, invite(rk)],
      [11, K, reserve(rk)],
    ]);

    at(12);
    const r = await report();
    // Legacy: one offer and one take. K's request carries an offer too, but it's a new-flow record: in the funnel, never a legacy offer.
    expect(r.ticketExchanges).toMatchObject({
      requests: 3, offers: 1, takes: 1, heldReplies: 0,
      reservations: n(2), completed: n(1), inProgress: n(1), neverReserved: { total: 1, open: 1, ended: 0 },
      payment: { buyerReported: n(1), sellerConfirmed: n(1) }, // M's two payment steps, over every record
    });
    // The funnel is the new flow only: M's legacy hold, payment steps and completion aren't in it.
    expect(r.funnel).toEqual(stages({ asked: n(1), invited: n(1), holds: n(1) }));
    // Value: the completed exchange, which is the legacy one. K's hold, at a private price, is no value.
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 30 }, total: 30 });
    expect(r.exchangeValue.label).toMatch(/not verified payments/);
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 4, availableNow: 2, reservedNow: 1, completed: 1 });
    const logged = (type: string) => r.recentActivity.byType.find((x) => x.type === type);
    expect(logged("take")).toEqual({ type: "take", accepted: 1, refused: 1 });
    expect(logged("offer")).toEqual({ type: "offer", accepted: 1, refused: 1 });
    // Labelled, in the definitions and in the readable report.
    expect(r.definitions["ticketExchanges"]).toMatch(/offers, takes and heldReplies are legacy figures: they count legacy records only\./);
    expect(r.definitions["funnel"]).toMatch(/for new-flow ticket records only \(legacy records are in ticketExchanges' offers, takes and heldReplies, never here\)/);
    const md = pilotReportMarkdown(r);
    expect(md).toContain("| Ticket requests: legacy offers + \"I'll take it\" + held replies + invite to pay | 3 (1 + 1 + 0 + 1) |");
    expect(md).toContain("The offers, \"I'll take it\" reservations and held replies above are legacy figures, from before invite to pay.");
    expect(md).toContain("requests to buy 1 (1 tickets); invitations to pay 1 (1 tickets) answering a request to buy and 0 (0 tickets) sent to a public request's owner; holds (the buyer reserved it) 1 (1 tickets); buyer said \"I've sent payment\" 0 (0 tickets); seller confirmed \"Payment received\" 0 (0 tickets); completed 0 (0 tickets).");
  });
});
