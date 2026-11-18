// The pilot metrics report (src/report; USER-INSTRUCTIONS §8 item 3), against a throwaway schema with representative data built
// through the real store and engine (applyAction, as the page's server actions call it, at injected times).
//
// One pilot day in the "live" world of the throwaway schema, checked at points along the way: an empty market; a partial exchange
// (3 listed, 2 handed over, 1 left) with a retried reservation; refused changes; one person buying and selling; a partly fulfilled
// public request; cancelled, declined and expired exchanges, an expiry the server hasn't swept yet, a payment dispute and a problem
// report; and a known test account and a test world, both left out. Every report is checked for planted private values, and the
// database is fingerprinted around each one: the report reads in a READ ONLY transaction and changes nothing.
//
// Labelled test accounts with made-up ids, never a session or sign-in of any kind.

import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGuestView, getView, savePayMethods } from "../store.js";
import type { ApplyInput } from "../store.js";
import { pilotReportMarkdown, runPilotReport } from "../report/index.js";
import type { PilotReport } from "../report/index.js";
import type { Actor } from "../types.js";
import { createTestDb, databaseUrl, type TestDb } from "./helpers/db.js";
import { MIN, StoreWorld, T0, actions, dateAfter, okOf, refusedOf, type Ok, type SentAction } from "./helpers/live-store.js";
import { pinLegacyFlow } from "./helpers/legacy-flow.js";

// Follow-on B5, the switch (S3): this suite's exchanges begin the old way (take, offer, a held reply), which stays the rule for
// records from before invitations. It runs with invite to pay pinned off (helpers/legacy-flow.ts) and keeps every expectation.
pinLegacyFlow();

/** A labelled test account whose name, email and id are all planted: none may reach a report. */
const person = (key: string): Actor => ({ id: `acct-${key}-q7x`, name: `Canary${key} Plantedname`, email: `canary-${key}@example.invalid` });
const A = person("a"); // sells tickets, buys an item
const B = person("b"); // buys tickets, sells items
const C = person("c"); // only refused changes
const D = person("d"); // a public request, partly fulfilled
const F = person("f"); // a reservation left unpaid
const G = person("g"); // an offer, declined
const H = person("h"); // an offer, left to expire
const J = person("j"); // a private alert
const K = person("k"); // cancels a ticket reservation and a goods hold
const M = person("m"); // pays, the seller says it didn't arrive, cancels
const T = person("t"); // a known test account: left out
const X = person("x"); // the test world only
const Y = person("y"); // the test world only
const EVERYONE = [A, B, C, D, F, G, H, J, K, M, T, X, Y];

/** Planted private values: amounts nobody but the parties may see, and typed text. Text canaries all contain "canary". */
const PRIVATE_AMOUNTS = ["38.71", "37.29", "23.17", "21.43"];
const PROBLEM = "The ticket didn't work";

const TABLES = ["worlds", "people", "notifications", "actions", "world_snapshots"] as const;

let db: TestDb;
let live: StoreWorld;
let other: StoreWorld;
const ids = { E1: "", L1: "", L2: "", R1: "", RF: "", RH: "", ISO_D: "", G1: "", G2: "", GR1: "", GR2: "", RM: "", RK: "" };

async function ok(w: StoreWorld, who: Actor, action: SentAction, extra: Partial<ApplyInput> = {}): Promise<Ok> {
  return okOf(await w.act(who, action, extra), `${action.type} by ${who.id}`);
}
async function refused(w: StoreWorld, who: Actor, action: SentAction): Promise<void> {
  refusedOf(await w.act(who, action), `${action.type} by ${who.id}`);
}
const take = (listingId: string, qty = 1, msg = ""): SentAction => ({ type: "take", listingId, qty, amount: "", msg, member: false });
const offer = (listingId: string, amount: string): SentAction => ({ type: "offer", listingId, qty: 1, amount, msg: "", member: false });
const at = (w: StoreWorld, minutes: number): void => {
  w.now = T0 + minutes * MIN;
};
async function steps(w: StoreWorld, list: readonly [number, Actor, SentAction][]): Promise<void> {
  for (const [minutes, who, action] of list) {
    at(w, minutes);
    await ok(w, who, action);
  }
}

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

/** The report, with the database fingerprinted before and after, and its output scanned for every planted value. */
async function report(opts: { now: number; excludeUserIds?: readonly string[]; identifyTestAccounts?: boolean }, sql: Sql = db.sql): Promise<PilotReport> {
  const before = await fingerprint(sql);
  const r = await runPilotReport(sql, opts);
  expect(await fingerprint(sql), "the report changed the database").toEqual(before);
  expect(r.safety).toMatchObject({ readOnlyTransaction: true, isolation: "repeatable read" });
  const text = JSON.stringify(r) + "\n" + pilotReportMarkdown(r);
  expect(text).not.toMatch(/canary/i);
  for (const p of EVERYONE) expect(text, `account id ${p.id}`).not.toContain(p.id);
  // A planted amount must not appear as a number anywhere. A longer digit run around it (a timestamp's "…:23.172Z") is not that amount.
  for (const amount of PRIVATE_AMOUNTS) expect(text, `private amount ${amount}`).not.toMatch(new RegExp(`(?<!\\d)${amount.replace(".", "\\.")}(?!\\d)`));
  return r;
}

/** Every number in a value, with its path. */
function numbersIn(x: unknown, path = ""): [string, number][] {
  if (typeof x === "number") return [[path, x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => numbersIn(v, `${path}[${i}]`));
  if (x !== null && typeof x === "object") return Object.entries(x).flatMap(([k, v]) => numbersIn(v, path ? `${path}.${k}` : k));
  return [];
}

async function stored(id: string): Promise<{ status: string } | undefined> {
  const row = await live.row();
  const requests = (row?.doc.requests ?? []) as { id: string; status: string }[];
  return requests.find((r) => r.id === id);
}

describe.skipIf(!databaseUrl)("pilot metrics report: read-only, live market only (real store, Postgres)", () => {
  beforeAll(async () => {
    db = await createTestDb("report");
    live = new StoreWorld(db.sql, "live", T0);
    other = new StoreWorld(db.sql, "test-report-other", T0);
  }, 30_000);

  afterAll(async () => {
    await db?.close();
  });

  it("an empty market: zeros, the coverage limits and what isn't tracked; reading creates nothing", async () => {
    const r = await report({ now: T0 });
    expect(r.scope).toMatchObject({ world: "live", liveWorldStored: false, testWorldsNotRead: 0, previewSampleRecords: 0 });
    expect(r.window.from).toBeNull();
    expect(r.generatedAt).toBe(new Date(T0).toISOString());
    const sections = [r.participants, r.created, r.quantities, r.ticketExchanges, r.goodsExchanges, r.cancellationsExpirationsDisputes, r.timing, r.exchangeValue, r.recentActivity];
    expect(numbersIn(sections).filter(([, n]) => n !== 0)).toEqual([]);
    expect(r.supplyAndDemand.tickets.byEvent).toEqual([]);
    expect(r.sources).toMatchObject({ profiles: 0, snapshots: 0, notifications: { retained: 0, unread: 0 }, actionsLog: { retainedRows: 0, keepDays: 7 } });
    expect(r.integrity).toEqual({ storedDocumentIssues: 0, recordsNotEvaluated: 0 });
    expect(r.coverage.length).toBeGreaterThanOrEqual(10);
    for (const missing of [/^Visits/, /^Searches/, /funnels/, /^Retries/, /Payments/]) expect(r.notTracked.some((s) => missing.test(s)), String(missing)).toBe(true);
    for (const key of ["participants", "quantities", "ticketExchanges", "timing", "supplyAndDemand", "exchangeValue", "recentActivity"]) {
      expect(r.definitions[key], key).toMatch(/\w/);
    }
    expect(r.exchangeValue.label).toMatch(/User-confirmed.*not verified payments/);
    const md = pilotReportMarkdown(r);
    for (const heading of ["## Activity", "## Now", "## Cancellations, expirations, disputes", "## Time to", "## Supply and outstanding demand now", "## User-confirmed exchange value (not verified payments)", "## Coverage limits", "## Not tracked"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("the live world has none yet");
    // Reading made no world, profile or anything else.
    expect(await live.row()).toBeUndefined();
  });

  it("a partial exchange: 3 listed, 2 handed over, 1 left; a retried reservation counts once", async () => {
    at(live, 0);
    ids.E1 = (await ok(live, A, actions.createEvent(T0, {
      title: "CANARY-TITLE Spring Formal", club: "CANARY-CLUB", venue: "CANARY-VENUE 3401 Walnut St", notes: "CANARY-NOTES call 215-555-0199",
      officialUrl: "https://canary.example.com/formal",
    }))).resultId!;
    // A saved payment method (follow-on B1), planted: B's reservation copies it, and no report may carry it.
    expect(await savePayMethods(db.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-a" }] })).toMatchObject({ ok: true });
    at(live, 1);
    ids.L1 = (await ok(live, A, actions.list(ids.E1, { qty: 3, ask: "35", paid: "40", payHandle: "@canary-pay-a", note: "CANARY-LISTING-NOTE" }))).resultId!;
    at(live, 2);
    const requestId = randomUUID();
    ids.R1 = (await ok(live, B, take(ids.L1, 2, "CANARY-MSG-B"), { requestId })).resultId!;
    const retry = await live.act(B, take(ids.L1, 2, "CANARY-MSG-B"), { requestId });
    expect(retry).toMatchObject({ ok: true, replay: true, resultId: ids.R1 });
    await steps(live, [
      [3, B, actions.onRequest("markPaid", ids.R1)],
      [4, A, actions.onRequest("confirmPayment", ids.R1)],
      [5, A, actions.onRequest("markTransferred", ids.R1)],
      [6, B, actions.onRequest("buyerReceived", ids.R1)],
    ]);

    const r = await report({ now: live.now });
    expect(r.scope.liveWorldStored).toBe(true);
    expect(r.quantities.tickets).toEqual({
      listings: 1, listedUnits: 3, availableNow: 1, reservedNow: 0, completed: 2, unsoldNotOpen: 0, pausedUnits: 0, pausedListings: 0, listingsOpenNow: 1, listingsWithdrawn: 0,
    });
    expect(r.ticketExchanges).toMatchObject({
      requests: 1, takes: 1, offers: 0, reservations: { exchanges: 1, units: 2 }, completed: { exchanges: 1, units: 2 }, inProgress: { exchanges: 0, units: 0 },
    });
    expect(r.participants).toEqual({ distinct: 2, sold: 1, bought: 1, boughtAndSold: 0, postedPublicRequests: 0, setAlerts: 0, inCompletedExchanges: 2 });
    expect(r.exchangeValue.tickets).toEqual({ exchanges: 1, units: 2, amount: 70 });
    expect(r.timing.ticketListingToFirstInterest).toEqual({ n: 1, medianMinutes: 1, minMinutes: 1, maxMinutes: 1, without: 0 });
    expect(r.timing.ticketListingToFirstCompletion).toEqual({ n: 1, medianMinutes: 5, minMinutes: 5, maxMinutes: 5, without: 0 });
    expect(r.timing.ticketReservationToCompletion).toEqual({ n: 1, medianMinutes: 4, minMinutes: 4, maxMinutes: 4 });
    expect(r.supplyAndDemand.tickets.byEvent).toEqual([
      { eventId: ids.E1, kind: "event", category: "Parties", startDate: dateAfter(T0, 10), openToTransfers: true, availableUnits: 1, openListings: 1, openRequests: 0, requesters: 0, unitsWanted: 0 },
    ]);
    // The retry was answered from the first outcome: one take in the log, one reservation in the market.
    expect(r.recentActivity.byType.find((t) => t.type === "take")).toEqual({ type: "take", accepted: 1, refused: 0 });
  });

  it("refused changes create no activity: they show only as refused in the actions log", async () => {
    at(live, 7);
    await refused(live, C, take(ids.L1, 5)); // only 1 left
    await refused(live, C, offer(ids.L1, "30")); // this seller isn't taking offers
    await refused(live, C, actions.onRequest("buyerReceived", ids.R1)); // not the buyer
    await refused(live, A, take(ids.L1)); // one's own listing
    const r = await report({ now: live.now });
    expect(r.participants.distinct).toBe(2);
    expect(r.ticketExchanges.requests).toBe(1);
    // createEvent, addThen, take, markPaid, confirmPayment, markTransferred, buyerReceived: 7 accepted; the retry wrote nothing.
    expect(r.recentActivity).toMatchObject({ acceptedChanges: 7, refusedChanges: 4, accountsWithAcceptedChange: 2 });
    expect(r.recentActivity.byType.find((t) => t.type === "take")).toEqual({ type: "take", accepted: 1, refused: 2 });
    // C has a profile (any signed-in change makes one) but isn't a participant.
    expect(r.sources.profiles).toBe(3);
  });

  it("one person buying and selling counts once", async () => {
    at(live, 8);
    ids.G1 = (await ok(live, B, actions.postItem(live.now, { title: "CANARY-ITEM desk chair", area: "CANARY-AREA Rittenhouse", note: "CANARY-ITEM-NOTE", price: "30" }))).resultId!;
    at(live, 9);
    ids.GR1 = (await ok(live, A, { type: "requestItem", id: ids.G1, msg: "CANARY-GOODS-MSG", shareContact: true })).resultId!;
    await steps(live, [
      [10, B, { type: "acceptItemReq", id: ids.GR1, shareContact: true }],
      [11, A, { type: "itemPickedUp", id: ids.GR1 }],
    ]);
    const r = await report({ now: live.now });
    expect(r.participants).toEqual({ distinct: 2, sold: 2, bought: 2, boughtAndSold: 2, postedPublicRequests: 0, setAlerts: 0, inCompletedExchanges: 2 });
    expect(r.goodsExchanges).toMatchObject({ requests: 1, holds: 1, completed: 1, onHoldNow: 0, holdsEndedWithoutPickup: 0 });
    expect(r.quantities.items).toMatchObject({ posted: 1, sold: 1, availableNow: 0 });
    expect(r.exchangeValue).toMatchObject({ goods: { exchanges: 1, amount: 30 }, total: 100 });
    expect(r.timing.itemToSale).toEqual({ n: 1, medianMinutes: 3, minMinutes: 3, maxMinutes: 3, without: 0 });
  });

  it("a public request partly fulfilled: its remaining units stay outstanding demand", async () => {
    at(live, 12);
    ids.ISO_D = (await ok(live, D, actions.request(ids.E1, { qty: 3, budget: "38.71", note: "CANARY-ISO-NOTE", expires: dateAfter(live.now, 5) }))).resultId!;
    at(live, 13);
    const rd = (await ok(live, D, take(ids.L1))).resultId!;
    await steps(live, [
      [14, D, actions.onRequest("markPaid", rd)],
      [15, A, actions.onRequest("confirmPayment", rd)],
      [16, A, actions.onRequest("markTransferred", rd)],
      [17, D, actions.onRequest("buyerReceived", rd)],
    ]);
    const r = await report({ now: live.now });
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 3, completed: 3, availableNow: 0, listingsOpenNow: 0 });
    expect(r.quantities.publicRequests).toMatchObject({ liveNow: 1, liveUnits: 2, fulfilled: 0 });
    expect(r.supplyAndDemand.tickets.byEvent).toEqual([
      { eventId: ids.E1, kind: "event", category: "Parties", startDate: dateAfter(T0, 10), openToTransfers: true, availableUnits: 0, openListings: 0, openRequests: 1, requesters: 1, unitsWanted: 2 },
    ]);
    expect(r.ticketExchanges.completed).toEqual({ exchanges: 2, units: 3 });
    expect(r.timing.ticketReservationToCompletion).toEqual({ n: 2, medianMinutes: 4, minMinutes: 4, maxMinutes: 4 });
  });

  it("an expired hold counts as expired before the server's sweep stores it, and the report doesn't store it", async () => {
    at(live, 20);
    ids.L2 = (await ok(live, A, actions.list(ids.E1, { qty: 3, ask: "30", paid: "40", payHandle: "@canary-pay-a", obo: true, minOffer: "20" }))).resultId!;
    at(live, 21);
    await ok(live, A, { type: "shareListing", isoId: ids.ISO_D, listingId: ids.L2 });
    at(live, 22);
    ids.RK = (await ok(live, K, take(ids.L2))).resultId!;
    at(live, 23);
    await ok(live, K, actions.onRequest("cancel", ids.RK));
    at(live, 24);
    ids.RF = (await ok(live, F, take(ids.L2))).resultId!; // held 15 minutes for payment, never paid
    at(live, 25);
    const rg = (await ok(live, G, offer(ids.L2, "23.17"))).resultId!;
    at(live, 26);
    await ok(live, A, actions.onRequest("decline", rg));
    at(live, 27);
    ids.RH = (await ok(live, H, offer(ids.L2, "21.43"))).resultId!; // open for 6 hours
    await steps(live, [
      [28, J, { type: "joinAlert", eventId: ids.E1, qty: 1, max: "37.29" }],
      [29, B, { type: "reportProblem", kind: "ticket", id: ids.R1, reason: PROBLEM }],
    ]);

    at(live, 30); // F's reservation is in progress: listed 6 = 2 available + 1 reserved + 3 completed
    const holding = await report({ now: live.now });
    expect(holding.quantities.tickets).toMatchObject({ listedUnits: 6, availableNow: 2, reservedNow: 1, completed: 3, unsoldNotOpen: 0 });
    expect(holding.ticketExchanges).toMatchObject({ inProgress: { exchanges: 1, units: 1 }, neverReserved: { total: 2, open: 1, ended: 1 } });
    expect(holding.supplyAndDemand.tickets.byEvent[0]).toMatchObject({ availableUnits: 2, openListings: 1, openRequests: 1, unitsWanted: 2 });

    at(live, 45); // F's hold ended at 39 minutes; nothing has read or written since
    const row = await live.row();
    const r = await report({ now: live.now });
    expect(await live.row()).toEqual(row);
    expect(await stored(ids.RF)).toMatchObject({ status: "accepted" });
    expect(r.sources.liveDocument.sweepDue).toBe(true);
    expect(r.cancellationsExpirationsDisputes.expirations).toMatchObject({ ticketReservationsBeforePayment: 1, notYetRecordedBySweep: 1 });
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 6, availableNow: 3, reservedNow: 0, completed: 3 });

    // A signed-in visit sweeps and stores it; the figures stay the same.
    at(live, 46);
    await getView(db.sql, { worldId: "live", viewer: A, now: live.now });
    expect(await stored(ids.RF)).toMatchObject({ status: "expired" });
    const swept = await report({ now: live.now });
    expect(swept.cancellationsExpirationsDisputes.expirations).toMatchObject({ ticketReservationsBeforePayment: 1, notYetRecordedBySweep: 0 });
    expect(swept.sources.liveDocument.sweepDue).toBe(false);
    expect(swept.recentActivity.systemSweeps).toBe(1);
  });

  it("cancelled and expired exchanges, a payment dispute and a problem report, each counted by who or what ended it", async () => {
    at(live, 50);
    ids.RM = (await ok(live, M, take(ids.L2))).resultId!;
    await steps(live, [
      [51, M, actions.onRequest("markPaid", ids.RM)],
      [52, A, actions.onRequest("paymentMissing", ids.RM)],
      [53, M, actions.onRequest("cancel", ids.RM)],
    ]);
    at(live, 55);
    ids.G2 = (await ok(live, B, actions.postItem(live.now, { title: "CANARY-ITEM-2 textbook", cat: "Books & supplies", price: "15" }))).resultId!;
    at(live, 56);
    ids.GR2 = (await ok(live, K, { type: "requestItem", id: ids.G2, msg: "", shareContact: true })).resultId!;
    await steps(live, [
      [57, B, { type: "acceptItemReq", id: ids.GR2, shareContact: true }],
      [58, K, { type: "cancelItemReq", id: ids.GR2 }],
    ]);
    at(live, 7 * 60); // H's offer lapsed at 6 h 27 min, unswept

    const r = await report({ now: live.now });
    const ced = r.cancellationsExpirationsDisputes;
    expect(ced.cancellations).toEqual({
      ticketReservationsCancelledByBuyer: 2, ticketReservationsReleasedBySeller: 0, ticketOffersAndRepliesWithdrawnByBuyer: 0, ticketOffersAndRepliesDeclined: 1,
      goodsHoldsCancelledByBuyer: 1, goodsHoldsReleasedBySeller: 0, goodsRequestsCancelledByBuyer: 0, goodsRequestsDeclined: 0,
      listingsWithdrawn: 0, itemsWithdrawn: 0, publicRequestsCancelled: 0, alertsRemoved: 0, otherEndings: 0,
    });
    expect(ced.expirations).toEqual({
      ticketReservationsBeforePayment: 1, ticketOffersAndReplies: 1, goodsHolds: 0, goodsRequests: 0, itemsUnsoldPickupWindowOver: 0,
      publicRequestsOpenPastDeadline: 0, notYetRecordedBySweep: 1,
    });
    expect(ced.disputes).toEqual({
      paymentNotArrived: { total: 1, laterConfirmed: 0, cancelledByBuyer: 1, releasedBySeller: 0, open: 0 },
      problemReports: { total: 1, open: 1, resolved: 0, tickets: 1, goods: 0, byBuyer: 1, bySeller: 0, byReason: [{ reason: PROBLEM, count: 1 }] },
    });
    expect(r.ticketExchanges).toEqual({
      requests: 7, offers: 2, takes: 5, heldReplies: 0,
      reservations: { exchanges: 5, units: 6 }, completed: { exchanges: 2, units: 3 }, inProgress: { exchanges: 0, units: 0 },
      endedWithoutCompletion: { exchanges: 3, units: 3 }, neverReserved: { total: 2, open: 0, ended: 2 },
      // Format 3: B's (2 tickets) and D's exchanges were paid and confirmed; M said they paid, A said it hadn't arrived, and M cancelled.
      payment: { buyerReported: { exchanges: 3, units: 4 }, sellerConfirmed: { exchanges: 2, units: 3 } },
      last7Days: { requests: 7, reservations: 5, completed: 2 },
    });
    expect(ced.closures).toEqual({ listings: { soldElsewhere: 0, noLongerSelling: 0, noReason: 0 }, items: { soldElsewhere: 0, noLongerSelling: 0, noReason: 0 } });
    expect(r.goodsExchanges).toEqual({
      requests: 2, offers: 0, holds: 2, completed: 1, onHoldNow: 0, holdsEndedWithoutPickup: 1, neverHeld: { total: 0, open: 0, ended: 0 },
      last7Days: { requests: 2, holds: 2, completed: 1 },
    });
  });

  it("test worlds and a known test account are left out of every figure", async () => {
    // A test world with a whole exchange, by accounts that never touch the live market, and by A.
    at(other, 0);
    const ev = (await ok(other, X, actions.createEvent(other.now))).resultId!;
    at(other, 1);
    // Protocol 2 (follow-on B1): a seller is paid through their profile, saved before a first listing (as the page does).
    await savePayMethods(db.sql, { userId: X.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-x" }] });
    const l = (await ok(other, X, actions.list(ev, { qty: 2, ask: "35", paid: "40", payHandle: "@x" }))).resultId!;
    at(other, 2);
    const rq = (await ok(other, Y, take(l))).resultId!;
    await steps(other, [
      [3, Y, actions.onRequest("markPaid", rq)],
      [4, X, actions.onRequest("confirmPayment", rq)],
      [5, X, actions.onRequest("markTransferred", rq)],
      [6, Y, actions.onRequest("buyerReceived", rq)],
      [7, A, actions.createEvent(T0 + 7 * MIN, { title: "CANARY test-world event" })],
    ]);

    // The known test account T in the live world: an event, a listing (with B's reservation on it), an item, a request, an alert.
    const tAt = (m: number): number => T0 + m * MIN;
    at(live, 60);
    await ok(live, T, actions.createEvent(tAt(60), { title: "CANARY-T event", cat: "Sports" }));
    at(live, 61);
    await savePayMethods(db.sql, { userId: T.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-t" }] }); // protocol 2: the profile pays
    const lt = (await ok(live, T, actions.list(ids.E1, { qty: 4, ask: "30", paid: "40", payHandle: "@canary-pay-t" }))).resultId!;
    await steps(live, [
      [62, B, take(lt)],
      [63, T, actions.postItem(tAt(63), { title: "CANARY-T item", cat: "Electronics", price: "50" })],
      [64, T, { type: "saveInterest", data: { qty: 1, budget: "50", note: "CANARY-T note", expires: dateAfter(tAt(64), 10), goods: { title: "CANARY-WANTED item", cat: "Electronics" } } }],
      [65, T, { type: "joinAlert", eventId: ids.E1, qty: 1 }],
    ]);
    at(live, 7 * 60);

    const r = await report({ now: live.now, excludeUserIds: [T.id] });
    expect(r.scope).toMatchObject({
      testWorldsNotRead: 1,
      knownTestAccounts: { identified: true, accounts: 1, how: "public.users not looked up; 1 given by the caller" },
      recordsLeftOut: { total: 7, eventsAddedBy: 1, listings: 1, ticketRequests: 1, publicRequests: 1, alerts: 1, shares: 0, items: 1, goodsRequests: 0, holdings: 1 },
      previewSampleRecords: 0,
    });
    expect(r.scope.separation).toMatch(/can't be told apart/);
    expect(r.participants).toEqual({ distinct: 9, sold: 2, bought: 8, boughtAndSold: 2, postedPublicRequests: 1, setAlerts: 1, inCompletedExchanges: 3 });
    expect(r.created).toEqual({
      events: { allTime: 1, last7Days: 1, removed: 0, dateOnly: 0, noFaceValue: 0 }, // forms round 2: an event with a time and a face value
      ticketListings: { allTime: 2, last7Days: 2, units: 6 },
      heldReplies: { allTime: 0, last7Days: 0, units: 0 },
      items: { allTime: 2, last7Days: 2 },
      publicRequests: { allTime: 1, last7Days: 1, forTickets: 1, forGoods: 0 },
      alerts: { allTime: 1, last7Days: 1 },
      shares: { allTime: 1, last7Days: 1 },
    });
    expect(r.quantities).toMatchObject({
      tickets: { listings: 2, listedUnits: 6, availableNow: 3, reservedNow: 0, completed: 3, unsoldNotOpen: 0, listingsOpenNow: 1 },
      heldReplies: { replies: 0, units: 0 },
      items: { posted: 2, availableNow: 1, onHoldNow: 0, sold: 1, withdrawn: 0, pickupWindowOver: 0, pausedNow: 0, notOpenOther: 0 },
      publicRequests: { liveNow: 1, liveUnits: 2, openPastDeadline: 0, openEventClosed: 0, fulfilled: 0, cancelled: 0, closedOther: 0 },
      alerts: { active: 1, paused: 0, closed: 0 },
    });
    expect(r.ticketExchanges.requests).toBe(7);
    expect(r.cancellationsExpirationsDisputes.expirations.notYetRecordedBySweep).toBe(1);
    expect(r.supplyAndDemand.tickets.byCategory).toEqual([
      { category: "Parties", events: 1, availableUnits: 3, openListings: 1, openRequests: 1, requesters: 1, unitsWanted: 2 },
    ]);
    expect(r.supplyAndDemand.goods.byCategory).toEqual([{ category: "Books & supplies", itemsAvailable: 1, openRequests: 0, requesters: 0 }]);
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 2, units: 3, amount: 105 }, goods: { exchanges: 1, amount: 30 }, total: 135 });
    expect(r.timing).toEqual({
      ticketListingToFirstInterest: { n: 2, medianMinutes: 1.5, minMinutes: 1, maxMinutes: 2, without: 0 },
      ticketListingToFirstReservation: { n: 2, medianMinutes: 1.5, minMinutes: 1, maxMinutes: 2, without: 0 },
      ticketListingToFirstCompletion: { n: 1, medianMinutes: 5, minMinutes: 5, maxMinutes: 5, without: 1 },
      ticketReservationToCompletion: { n: 2, medianMinutes: 4, minMinutes: 4, maxMinutes: 4 },
      itemToFirstRequest: { n: 2, medianMinutes: 1, minMinutes: 1, maxMinutes: 1, without: 0 },
      itemToFirstHold: { n: 2, medianMinutes: 2, minMinutes: 2, maxMinutes: 2, without: 0 },
      itemToSale: { n: 1, medianMinutes: 3, minMinutes: 3, maxMinutes: 3, without: 1 },
      goodsHoldToPickup: { n: 1, medianMinutes: 1, minMinutes: 1, maxMinutes: 1 },
      publicRequestToFirstSellerResponse: { n: 1, medianMinutes: 9, minMinutes: 9, maxMinutes: 9, without: 0 },
    });
    // The actions log: T's 5 changes left out; B's reservation on T's listing is B's own change, so it counts there.
    expect(r.recentActivity).toMatchObject({ acceptedChanges: 36, refusedChanges: 4, accountsWithAcceptedChange: 9, systemSweeps: 1, leftOut: 5 });
    expect(r.sources).toMatchObject({ profiles: 13, snapshots: 1, actionsLog: { retainedRows: 46 } });
    expect(r.integrity).toEqual({ storedDocumentIssues: 0, recordsNotEvaluated: 0 });

    // Without T left out, T's records count, and the report says the accounts weren't identified.
    const all = await report({ now: live.now });
    expect(all.scope).toMatchObject({ knownTestAccounts: { identified: false, accounts: 0 }, recordsLeftOut: { total: 0 } });
    expect(all.scope.separation).toMatch(/could not be identified/);
    expect(all.participants.distinct).toBe(10);
    expect(all.created).toMatchObject({ events: { allTime: 2 }, ticketListings: { allTime: 3, units: 10 }, items: { allTime: 3 }, publicRequests: { allTime: 2, forGoods: 1 }, alerts: { allTime: 2 } });
    expect(all.ticketExchanges).toMatchObject({ requests: 8, reservations: { exchanges: 6, units: 7 }, endedWithoutCompletion: { exchanges: 4, units: 4 } });
    expect(all.quantities.tickets).toMatchObject({ listedUnits: 10, availableNow: 7 });
    // The test world's exchange is in neither report.
    expect(all.exchangeValue.tickets).toEqual({ exchanges: 2, units: 3, amount: 105 });
  });

  it("identifies the local TEST and Local Developer accounts from public.users when it may read it, changing no figure here", async () => {
    const [users] = await db.admin<{ present: boolean }[]>`SELECT to_regclass('public.users') IS NOT NULL AS present`;
    const r = await report({ now: live.now, identifyTestAccounts: true, excludeUserIds: [T.id] });
    expect(r.scope.knownTestAccounts.identified).toBe(true);
    if (users?.present) expect(r.scope.knownTestAccounts.how).toMatch(/^public\.users: google_id 'local-dev' or 'handoff-test-…', or an @example\.invalid email; 1 given by the caller$/);
    // None of those accounts acted in this schema's live world, so the figures are the same.
    const plain = await report({ now: live.now, excludeUserIds: [T.id] });
    expect(r.participants).toEqual(plain.participants);
    expect(r.scope.recordsLeftOut).toEqual(plain.scope.recordsLeftOut);
  });

  it("can't write: Postgres refuses a write inside the report's transaction, and nothing changes", async () => {
    const before = await fingerprint(db.sql);
    await expect(
      runPilotReport(db.sql, {
        now: live.now,
        hooks: {
          async inTransaction(tx) {
            await tx`INSERT INTO people (user_id, name) VALUES ('report-write-probe', 'probe')`;
          },
        },
      }),
    ).rejects.toMatchObject({ code: "25006" }); // read_only_sql_transaction
    expect(await fingerprint(db.sql)).toEqual(before);
    const [probe] = await db.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM people WHERE user_id = 'report-write-probe'`;
    expect(probe?.n).toBe(0);
    // Unread notifications stay unread, and the unswept offer stays as stored.
    expect(await stored(ids.RH)).toMatchObject({ status: "pending" });
  });

  it("the Markdown summary carries the headline figures and labels money as user-confirmed", async () => {
    const r = await report({ now: live.now, excludeUserIds: [T.id] });
    const md = pilotReportMarkdown(r);
    expect(md).toContain("| Participants: distinct accounts (a buyer who also sells counts once) | 9 | – |");
    // The roles say what they count (EPV M2): selling is listing, buying is asking, neither means it completed; completions have their own row.
    expect(r.definitions["participants"]).toMatch(/sold: accounts that listed tickets \(a public listing or a held reply\) or posted a goods item, whether or not anything sold\./);
    expect(r.definitions["participants"]).toMatch(/bought: accounts that made a ticket offer or reservation, accepted a held reply or requested a goods item, whether or not it completed\./);
    expect(md).not.toContain("Of whom sold / bought / both");
    expect(md).toContain("| Of whom selling (listed tickets or an item) / buying (offered, reserved or requested) / both, completed or not | 2 / 8 / 2 | – |");
    expect(md).toContain("| Of whom in a completed exchange (either side) | 3 | – |");
    expect(md).toContain("Tickets $105.00 (2 exchanges, 3 tickets) · goods $30.00 (1 pickups) · total $135.00.");
    expect(md).toContain(`| ${ids.E1} | event | Parties | ${dateAfter(T0, 10)} | yes | 3 | 1 | 2 |`);
    expect(md).toMatch(/36 accepted changes by 9 accounts; 4 refused by the rules \(never counted as activity\)/);
  });
});

describe.skipIf(!databaseUrl)("pilot metrics report: withdrawn and paused stock is listed, unsold and not open", () => {
  let pdb: TestDb;
  let w: StoreWorld;
  beforeAll(async () => {
    pdb = await createTestDb("report-pause");
    w = new StoreWorld(pdb.sql, "live", T0);
  }, 30_000);
  afterAll(async () => {
    await pdb?.close();
  });

  it("listed = available + reserved + completed + unsold and not open; a pause shows as paused, never as available", async () => {
    at(w, 0);
    const ev = (await ok(w, A, actions.createEvent(T0, { tiers: [{ label: "General", price: "40" }, { label: "Balcony", price: "45" }] }))).resultId!;
    at(w, 1);
    await savePayMethods(pdb.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-a" }] }); // protocol 2: the profile pays
    const l = (await ok(w, A, actions.list(ev, { qty: 3, ask: "35", paid: "40", payHandle: "@a" }))).resultId!;
    at(w, 2);
    await ok(w, B, take(l)); // reserved, unpaid (held until minute 17)
    at(w, 3);
    await ok(w, A, { type: "pauseListing", listingId: l });
    at(w, 4);
    // A second ticket type: one holding per type and person.
    const second = { ...actions.list(ev, { qty: 1, ask: "35", paid: "40", payHandle: "@a" }), add: { eventId: ev, tier: "t2", qty: 1, paid: "40" } };
    const l2 = (await ok(w, A, second)).resultId!;
    at(w, 5);
    await ok(w, A, { type: "withdraw", listingId: l2 });
    at(w, 6);
    const i1 = (await ok(w, A, actions.postItem(w.now, { title: "Lamp" }))).resultId!;
    at(w, 7);
    await ok(w, A, { type: "pauseItem", id: i1 });
    at(w, 8);
    const i2 = (await ok(w, A, actions.postItem(w.now, { title: "Shelf" }))).resultId!;
    at(w, 9);
    await ok(w, A, { type: "withdrawItem", id: i2 });

    at(w, 10);
    const r = await runPilotReport(pdb.sql, { now: w.now });
    expect(r.safety).toMatchObject({ readOnlyTransaction: true, isolation: "repeatable read" });
    expect(r.quantities.tickets).toEqual({
      listings: 2, listedUnits: 4, availableNow: 0, reservedNow: 1, completed: 0, unsoldNotOpen: 3, pausedUnits: 2, pausedListings: 1, listingsOpenNow: 0, listingsWithdrawn: 1,
    });
    expect(r.quantities.items).toEqual({ posted: 2, availableNow: 0, onHoldNow: 0, sold: 0, withdrawn: 1, pickupWindowOver: 0, pausedNow: 1, notOpenOther: 0 });
    expect(r.cancellationsExpirationsDisputes.cancellations).toMatchObject({ listingsWithdrawn: 1, itemsWithdrawn: 1 });
    expect(r.supplyAndDemand.tickets.byEvent).toEqual([]); // nothing open to take, no request
    expect(r.supplyAndDemand.goods.byCategory).toEqual([]);

    // Resumed: the paused tickets and the item are on sale again.
    at(w, 11);
    await ok(w, A, { type: "resumeListing", listingId: l });
    await ok(w, A, { type: "resumeItem", id: i1 });
    const resumed = await runPilotReport(pdb.sql, { now: w.now });
    expect(resumed.quantities.tickets).toMatchObject({ availableNow: 2, reservedNow: 1, unsoldNotOpen: 1, pausedUnits: 0, pausedListings: 0, listingsOpenNow: 1 });
    expect(resumed.quantities.items).toMatchObject({ availableNow: 1, pausedNow: 0, withdrawn: 1 });
  });
});

describe.skipIf(!databaseUrl)("pilot metrics report, format 3: closures by reason are never sales; the two payment steps apart (follow-on B2)", () => {
  let cdb: TestDb;
  let w: StoreWorld;
  beforeAll(async () => {
    cdb = await createTestDb("report-closures");
    w = new StoreWorld(cdb.sql, "live", T0);
  }, 30_000);
  afterAll(async () => {
    await cdb?.close();
  });

  it("counts each close under its reason (or none) and nowhere as a sale, completion or value; buyer-reported and seller-confirmed payment apart", async () => {
    at(w, 0);
    const ev = (await ok(w, A, actions.createEvent(T0, { tiers: [{ label: "General", price: "40" }, { label: "Balcony", price: "45" }, { label: "Box", price: "50" }] }))).resultId!;
    await savePayMethods(cdb.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-a" }] }); // protocol 2: the profile pays
    const listTier = (tier: string, qty: number) => ({ ...actions.list(ev, { qty, ask: "35", paid: "40", payHandle: "@a" }), add: { eventId: ev, tier, qty, paid: "40" } });
    at(w, 1);
    const l1 = (await ok(w, A, listTier("t1", 2))).resultId!; // 4 per person: 2 + 1 + 1
    at(w, 2);
    const rb = (await ok(w, B, take(l1))).resultId!;
    await steps(w, [
      [3, B, actions.onRequest("markPaid", rb)],
      [4, A, actions.onRequest("confirmPayment", rb)],
      [5, A, actions.onRequest("markTransferred", rb)],
      [6, B, actions.onRequest("buyerReceived", rb)],
    ]);
    at(w, 7);
    const l2 = (await ok(w, A, listTier("t2", 1))).resultId!;
    at(w, 8);
    const rk = (await ok(w, K, take(l2))).resultId!;
    await steps(w, [[9, K, actions.onRequest("markPaid", rk)]]); // K says they paid; A hasn't confirmed it
    at(w, 10);
    const l3 = (await ok(w, A, listTier("t3", 1))).resultId!;
    const g1 = (await ok(w, A, actions.postItem(w.now, { title: "Floor lamp", price: "20" }))).resultId!;
    const g2 = (await ok(w, A, actions.postItem(w.now, { title: "Bookshelf", price: "25" }))).resultId!;

    at(w, 11);
    const before = await report({ now: w.now }, cdb.sql);
    expect(before.ticketExchanges.completed).toEqual({ exchanges: 1, units: 1 });
    expect(before.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 35 }, goods: { exchanges: 0, amount: 0 }, total: 35 });
    expect(before.ticketExchanges.payment).toEqual({ buyerReported: { exchanges: 2, units: 2 }, sellerConfirmed: { exchanges: 1, units: 1 } });

    // A closes everything: two listings and an item with a reason, one listing and one item without.
    await steps(w, [
      [12, A, { type: "withdraw", listingId: l1, reason: "soldElsewhere" }],
      [13, A, { type: "withdraw", listingId: l2, reason: "noLongerSelling" }], // K's paid reservation goes on
      [14, A, { type: "withdraw", listingId: l3 }],
      [15, A, { type: "withdrawItem", id: g1, reason: "soldElsewhere" }],
      [16, A, { type: "withdrawItem", id: g2 }],
    ]);
    at(w, 17);
    const r = await report({ now: w.now }, cdb.sql);
    expect(r.format).toBe(4); // 3 when closures by reason and the two payment steps arrived; 4 adds the invite-to-pay funnel (follow-on B5)
    const ced = r.cancellationsExpirationsDisputes;
    expect(ced.closures).toEqual({ listings: { soldElsewhere: 1, noLongerSelling: 1, noReason: 1 }, items: { soldElsewhere: 1, noLongerSelling: 0, noReason: 1 } });
    expect(ced.cancellations).toMatchObject({ listingsWithdrawn: 3, itemsWithdrawn: 2 });
    // Never a sale: the same completed exchanges and value as before the closes; no item sold.
    expect(r.ticketExchanges.completed).toEqual(before.ticketExchanges.completed);
    expect(r.exchangeValue).toEqual(before.exchangeValue);
    expect(r.goodsExchanges.completed).toBe(0);
    expect(r.quantities.items).toMatchObject({ posted: 2, sold: 0, withdrawn: 2, availableNow: 0 });
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 4, availableNow: 0, reservedNow: 1, completed: 1, unsoldNotOpen: 2, listingsOpenNow: 0, listingsWithdrawn: 3 });
    // The payment steps, each once: B's paid and confirmed; K's paid only (still in progress on the closed listing).
    expect(r.ticketExchanges.payment).toEqual({ buyerReported: { exchanges: 2, units: 2 }, sellerConfirmed: { exchanges: 1, units: 1 } });
    expect(r.ticketExchanges.inProgress).toEqual({ exchanges: 1, units: 1 });
    expect(r.definitions["cancellationsExpirationsDisputes"]).toMatch(/A closure is never a sale/);
    expect(r.definitions["ticketExchanges"]).toMatch(/never a verified payment/);
    const md = pilotReportMarkdown(r);
    expect(md).toContain("- **Closed by the seller, by the reason they gave** (a closure is never a sale): listings: sold elsewhere 1, no longer selling 1, no reason 1; items: sold elsewhere 1, no longer selling 0, no reason 1.");
    expect(md).toContain("- **Payment steps** (what people said in Handoff, which can't see payments): the buyer said \"I've sent payment\" on 2 exchanges (2 tickets); the seller confirmed \"Payment received\" on 1 (1 tickets).");
  });
});

describe.skipIf(!databaseUrl)("pilot metrics report: a left-out account's holds on other accounts' listings and items (EPV M1)", () => {
  let mdb: TestDb;
  let w: StoreWorld;
  beforeAll(async () => {
    mdb = await createTestDb("report-mixed");
    w = new StoreWorld(mdb.sql, "live", T0);
  }, 30_000);
  afterAll(async () => {
    await mdb?.close();
  });

  it("stock now is the market as it stands (what visitors see), while the left-out account's exchanges stay out of every activity figure", async () => {
    // A (a real seller) lists 4 tickets. T, a left-out test account, buys one all the way through and holds another; B (real) holds one.
    at(w, 0);
    const ev = (await ok(w, A, actions.createEvent(T0))).resultId!;
    at(w, 1);
    await savePayMethods(mdb.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-a" }] }); // protocol 2: the profile pays
    const l = (await ok(w, A, actions.list(ev, { qty: 4, ask: "30", paid: "40", payHandle: "@canary-pay-a" }))).resultId!;
    at(w, 2);
    const rt = (await ok(w, T, take(l))).resultId!;
    await steps(w, [
      [3, T, actions.onRequest("markPaid", rt)],
      [4, A, actions.onRequest("confirmPayment", rt)],
      [5, A, actions.onRequest("markTransferred", rt)],
      [6, T, actions.onRequest("buyerReceived", rt)],
      [7, T, take(l)], // held for T (unpaid) until minute 22
      [8, B, take(l)], // held for B until minute 23
    ]);
    // A's two items: one on hold for T, one sold to T.
    at(w, 9);
    const g1 = (await ok(w, A, actions.postItem(w.now, { title: "Floor lamp", price: "20" }))).resultId!;
    const g2 = (await ok(w, A, actions.postItem(w.now, { title: "Bookshelf", price: "25" }))).resultId!;
    at(w, 10);
    const q1 = (await ok(w, T, { type: "requestItem", id: g1, msg: "", shareContact: true })).resultId!;
    const q2 = (await ok(w, T, { type: "requestItem", id: g2, msg: "", shareContact: true })).resultId!;
    await steps(w, [
      [11, A, { type: "acceptItemReq", id: q1, shareContact: true }],
      [11, A, { type: "acceptItemReq", id: q2, shareContact: true }],
      [12, T, { type: "itemPickedUp", id: q2 }],
    ]);

    at(w, 13);
    const market = await getGuestView(mdb.sql, { worldId: "live", now: w.now }); // what signed-out visitors (and every classmate's counts) see
    const visible = market.listings.filter((x) => x.id === l).reduce((t, x) => t + x.available, 0);
    expect(visible).toBe(1);
    expect(market.goods).toEqual([]);
    const r = await report({ now: w.now, excludeUserIds: [T.id] }, mdb.sql);
    // The stock as it stands: T's handover and hold take real tickets and items, as visitors see.
    expect(r.quantities.tickets).toEqual({
      listings: 1, listedUnits: 4, availableNow: 1, reservedNow: 2, completed: 1, unsoldNotOpen: 0, pausedUnits: 0, pausedListings: 0, listingsOpenNow: 1, listingsWithdrawn: 0,
    });
    expect(r.quantities.tickets.availableNow).toBe(visible);
    expect(r.supplyAndDemand.tickets.byEvent.map((e) => [e.eventId, e.availableUnits, e.openListings])).toEqual([[ev, 1, 1]]);
    expect(r.quantities.items).toEqual({ posted: 2, availableNow: 0, onHoldNow: 1, sold: 1, withdrawn: 0, pickupWindowOver: 0, pausedNow: 0, notOpenOther: 0 });
    expect(r.supplyAndDemand.goods.byCategory).toEqual([]);
    // How much of that stock went to the left-out account, said once, and never activity.
    expect(r.scope.stockHeldByLeftOutAccounts).toEqual({ ticketsReservedNow: 1, ticketsCompleted: 1, itemsOnHoldNow: 1, itemsSold: 1 });
    expect(r.scope.recordsLeftOut).toMatchObject({ total: 5, ticketRequests: 2, goodsRequests: 2, holdings: 1, listings: 0, items: 0 }); // the holding: the ticket T was handed
    expect(r.scope.separation).toMatch(/left out of every activity figure; their holds and handovers on other accounts' listings and items still count in the stock now/);
    expect(r.participants).toEqual({ distinct: 2, sold: 1, bought: 1, boughtAndSold: 0, postedPublicRequests: 0, setAlerts: 0, inCompletedExchanges: 0 });
    expect(r.ticketExchanges).toMatchObject({ requests: 1, takes: 1, reservations: { exchanges: 1, units: 1 }, completed: { exchanges: 0, units: 0 }, inProgress: { exchanges: 1, units: 1 } });
    expect(r.goodsExchanges).toMatchObject({ requests: 0, holds: 0, completed: 0, onHoldNow: 0 });
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 0, units: 0, amount: 0 }, goods: { exchanges: 0, amount: 0 }, total: 0 });
    expect(r.timing.ticketListingToFirstInterest).toEqual({ n: 1, medianMinutes: 7, minMinutes: 7, maxMinutes: 7, without: 0 }); // B's, not T's
    const md = pilotReportMarkdown(r);
    expect(md).toContain("1 available to take now, 2 reserved, 1 completed, 0 unsold and not open (withdrawn, paused or closed). Known test accounts hold 1 of the reserved and were handed 1 of the completed; their exchanges aren't counted as activity.");
    expect(md).toContain("0 on sale, 1 on hold, 1 sold, 0 withdrawn, 0 pickup window over, 0 paused. Known test accounts hold 1 of those on hold and bought 1 of those sold; their exchanges aren't counted as activity.");

    // A pause keeps off sale what every hold leaves (1 ticket), not T's tickets as well.
    at(w, 14);
    await ok(w, A, { type: "pauseListing", listingId: l });
    const p = await report({ now: w.now, excludeUserIds: [T.id] }, mdb.sql);
    expect(p.quantities.tickets).toMatchObject({ listedUnits: 4, availableNow: 0, reservedNow: 2, completed: 1, unsoldNotOpen: 1, pausedUnits: 1, pausedListings: 1, listingsOpenNow: 0 });

    // Without T identified, T's records are counted as anyone's, and the stock is the same.
    const all = await report({ now: w.now }, mdb.sql);
    expect(all.quantities.tickets).toEqual(p.quantities.tickets);
    expect(all.scope.stockHeldByLeftOutAccounts).toEqual({ ticketsReservedNow: 0, ticketsCompleted: 0, itemsOnHoldNow: 0, itemsSold: 0 });
    expect(all.ticketExchanges).toMatchObject({ requests: 3, reservations: { exchanges: 3, units: 3 }, completed: { exchanges: 1, units: 1 } });
  });
});

describe.skipIf(!databaseUrl)("pilot metrics report, format 4: the invite-to-pay funnel, each stage apart and counted once (follow-on B5, M1 and M2)", () => {
  let fdb: TestDb;
  let w: StoreWorld;
  beforeAll(async () => {
    fdb = await createTestDb("report-funnel");
    w = new StoreWorld(fdb.sql, "live", T0);
  }, 30_000);
  afterAll(async () => {
    await fdb?.close();
  });

  const ZERO = { exchanges: 0, units: 0 };
  const one = (units = 1) => ({ exchanges: 1, units });
  const ask = (listingId: string, qty = 1, amount = "", msg = ""): SentAction => ({ type: "requestToBuy", listingId, qty, amount, msg, member: false });
  const reserve = (requestId: string): SentAction => ({ type: "reserve", requestId, member: false });

  it("interest, invitations, holds, buyer-reported payment, seller-confirmed payment and completion are separate figures; a request or an invitation is never a hold or a sale", async () => {
    at(w, 0);
    const ev = (await ok(w, A, actions.createEvent(T0))).resultId!;
    await savePayMethods(fdb.sql, { userId: A.id, payMethods: [{ kind: "venmo", value: "@canary-venmo-a" }] });
    at(w, 1);
    const l = (await ok(w, A, actions.list(ev, { qty: 4, ask: "30", paid: "40", payHandle: "@canary-pay-a", obo: true }))).resultId!;
    const stock = async (): Promise<Record<string, number>> => {
      const t = (await report({ now: w.now, excludeUserIds: [T.id] }, fdb.sql)).quantities.tickets;
      return { availableNow: t.availableNow, reservedNow: t.reservedNow, completed: t.completed };
    };

    // Interest: B asks to buy two. Nothing is held, reserved, paid or sold.
    at(w, 2);
    const rb = (await ok(w, B, ask(l, 2, "", "CANARY-BUY-NOTE"))).resultId!;
    at(w, 3);
    let r = await report({ now: w.now }, fdb.sql);
    expect(r.format).toBe(4);
    expect(r.funnel).toEqual({ requestsToBuy: one(2), invitations: { fromRequest: ZERO, fromPublicRequest: ZERO }, holds: ZERO, buyerReported: ZERO, sellerConfirmed: ZERO, completed: ZERO });
    expect(r.ticketExchanges).toMatchObject({ requests: 1, offers: 0, takes: 0, heldReplies: 0, reservations: ZERO, completed: ZERO, inProgress: ZERO, neverReserved: { total: 1, open: 1, ended: 0 } });
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 4, availableNow: 4, reservedNow: 0, completed: 0 });
    expect(r.exchangeValue.total).toBe(0);

    // An invitation, for one of the two: still nothing held. Units asked for stay what the buyer asked.
    await ok(w, A, { type: "invite", requestId: rb, qty: 1 });
    at(w, 4);
    r = await report({ now: w.now }, fdb.sql);
    expect(r.funnel).toEqual({ requestsToBuy: one(2), invitations: { fromRequest: one(), fromPublicRequest: ZERO }, holds: ZERO, buyerReported: ZERO, sellerConfirmed: ZERO, completed: ZERO });
    expect(r.ticketExchanges).toMatchObject({ requests: 1, reservations: ZERO, neverReserved: { total: 1, open: 1, ended: 0 } });
    expect(r.quantities.tickets).toMatchObject({ availableNow: 4, reservedNow: 0, completed: 0 });

    // A hold: the invited buyer reserved it.
    await ok(w, B, reserve(rb));
    at(w, 5);
    r = await report({ now: w.now }, fdb.sql);
    expect(r.funnel).toMatchObject({ requestsToBuy: one(2), invitations: { fromRequest: one() }, holds: one(), buyerReported: ZERO, sellerConfirmed: ZERO, completed: ZERO });
    expect(r.ticketExchanges).toMatchObject({ reservations: one(), inProgress: one(), completed: ZERO, neverReserved: { total: 0, open: 0, ended: 0 } });
    expect(r.quantities.tickets).toMatchObject({ availableNow: 3, reservedNow: 1, completed: 0 });

    // The buyer's word, then the seller's, then the handover: each stage moves alone.
    await ok(w, B, actions.onRequest("markPaid", rb));
    at(w, 6);
    r = await report({ now: w.now }, fdb.sql);
    expect(r.funnel).toMatchObject({ holds: one(), buyerReported: one(), sellerConfirmed: ZERO, completed: ZERO });
    await ok(w, A, actions.onRequest("confirmPayment", rb));
    at(w, 7);
    r = await report({ now: w.now }, fdb.sql);
    expect(r.funnel).toMatchObject({ buyerReported: one(), sellerConfirmed: one(), completed: ZERO });
    expect(r.exchangeValue.total).toBe(0); // a confirmed payment isn't a completed exchange
    await steps(w, [
      [7, A, actions.onRequest("markTransferred", rb)],
      [8, B, actions.onRequest("buyerReceived", rb)],
    ]);
    at(w, 9);
    r = await report({ now: w.now }, fdb.sql);
    expect(r.funnel).toEqual({ requestsToBuy: one(2), invitations: { fromRequest: one(), fromPublicRequest: ZERO }, holds: one(), buyerReported: one(), sellerConfirmed: one(), completed: one() });
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 30 }, total: 30 });
    expect(await stock()).toEqual({ availableNow: 3, reservedNow: 0, completed: 1 });

    // K asks with an offer (a private amount), is invited at it, reserves, then releases without paying: a hold that ended, never a sale.
    const rk = (await ok(w, K, ask(l, 1, "23.17"))).resultId!;
    await steps(w, [
      [10, A, { type: "invite", requestId: rk }],
      [11, K, reserve(rk)],
      [12, K, actions.onRequest("cancel", rk)],
    ]);
    // F asks and is declined; G asks and is invited, and leaves it there: interest and an invitation, nothing more.
    at(w, 13);
    const rf = (await ok(w, F, ask(l))).resultId!;
    const rg = (await ok(w, G, ask(l))).resultId!;
    await steps(w, [
      [14, A, actions.onRequest("decline", rf)],
      [14, A, { type: "invite", requestId: rg }],
    ]);
    // D posted a public request; A invites D from the listing. No request to buy came first. D reserves and says they paid.
    at(w, 15);
    const iso = (await ok(w, D, actions.request(ev, { qty: 1, budget: "38.71", note: "CANARY-ISO-NOTE", expires: dateAfter(w.now, 5) }))).resultId!;
    at(w, 16);
    const rd = (await ok(w, A, { type: "inviteRequester", isoId: iso, listingId: l, qty: 1 })).resultId!;
    await steps(w, [
      [17, D, reserve(rd)],
      [18, D, actions.onRequest("markPaid", rd)],
    ]);
    // T, a known test account, goes as far as a hold: left out of every stage when identified.
    at(w, 19);
    const rt = (await ok(w, T, ask(l))).resultId!;
    await steps(w, [
      [20, A, { type: "invite", requestId: rt }],
      [21, T, reserve(rt)],
    ]);
    // M reserves the old way ("I'll take it", the way in before the switch; this suite runs with it open): a legacy figure, never in the funnel.
    at(w, 22);
    const rm = (await ok(w, M, take(l))).resultId!;
    expect(rm).toMatch(/^r[0-9a-f]{16}$/);

    at(w, 23);
    r = await report({ now: w.now, excludeUserIds: [T.id] }, fdb.sql);
    expect(r.funnel).toEqual({
      requestsToBuy: { exchanges: 4, units: 5 }, // B (2 asked), K, F, G; not D, who was invited without asking
      invitations: { fromRequest: { exchanges: 3, units: 3 }, fromPublicRequest: one() }, // B, K, G; D
      holds: { exchanges: 3, units: 3 }, // B, K (released), D
      buyerReported: { exchanges: 2, units: 2 }, // B, D
      sellerConfirmed: one(), // B
      completed: one(), // B
    });
    // The legacy figures count legacy records only, and every request once.
    expect(r.ticketExchanges).toMatchObject({
      requests: 6, offers: 0, takes: 1, heldReplies: 0,
      reservations: { exchanges: 4, units: 4 }, // the three holds and M's take
      completed: one(),
      inProgress: { exchanges: 2, units: 2 }, // D (paid), M (unpaid)
      endedWithoutCompletion: one(), // K
      neverReserved: { total: 2, open: 1, ended: 1 }, // G's invitation; F's declined request
      payment: { buyerReported: { exchanges: 2, units: 2 }, sellerConfirmed: one() },
    });
    expect(r.ticketExchanges.requests).toBe(r.ticketExchanges.offers + r.ticketExchanges.takes + r.ticketExchanges.heldReplies + r.funnel.requestsToBuy.exchanges + r.funnel.invitations.fromPublicRequest.exchanges);
    // Only the completed exchange is value; the open invitation and the declined request took no stock.
    expect(r.exchangeValue).toMatchObject({ tickets: { exchanges: 1, units: 1, amount: 30 }, total: 30 });
    expect(r.quantities.tickets).toMatchObject({ listedUnits: 4, availableNow: 0, reservedNow: 3, completed: 1 }); // D, T and M hold one each
    expect(r.scope.stockHeldByLeftOutAccounts).toMatchObject({ ticketsReservedNow: 1, ticketsCompleted: 0 });
    expect(r.definitions["funnel"]).toMatch(/A request to buy or an invitation holds nothing: neither is a hold, a payment or a sale/);
    expect(r.definitions["funnel"]).toMatch(/never a verified payment/);
    expect(r.notTracked.some((s) => /funnels/.test(s))).toBe(true);
    const md = pilotReportMarkdown(r);
    expect(md).toContain(
      "- **Invite to pay** (new ticket requests; each stage counted once, and a request or an invitation holds nothing and is never a sale): " +
        "requests to buy 4 (5 tickets); invitations to pay 3 (3 tickets) answering a request to buy and 1 (1 tickets) sent to a public request's owner; " +
        "holds (the buyer reserved it) 3 (3 tickets); buyer said \"I've sent payment\" 2 (2 tickets); seller confirmed \"Payment received\" 1 (1 tickets); completed 1 (1 tickets). " +
        "The offers, \"I'll take it\" reservations and held replies above are legacy figures, from before invite to pay.",
    );
    expect(md).toContain("| Ticket requests: legacy offers + \"I'll take it\" + held replies + invite to pay | 6 (0 + 1 + 0 + 5) |");

    // Without T identified, T's request, invitation and hold count as anyone's.
    const all = await report({ now: w.now }, fdb.sql);
    expect(all.funnel).toMatchObject({ requestsToBuy: { exchanges: 5, units: 6 }, invitations: { fromRequest: { exchanges: 4, units: 4 }, fromPublicRequest: one() }, holds: { exchanges: 4, units: 4 }, completed: one() });
    expect(all.quantities.tickets).toEqual(r.quantities.tickets);

    // An invitation that lapses, and a hold that lapses, move no later stage: G's invitation and T's and M's holds end; D's paid one stays.
    at(w, 23 + 7 * 60);
    const later = await report({ now: w.now, excludeUserIds: [T.id] }, fdb.sql);
    expect(later.funnel).toEqual(r.funnel);
    expect(later.ticketExchanges).toMatchObject({ inProgress: one(), endedWithoutCompletion: { exchanges: 2, units: 2 }, neverReserved: { total: 2, open: 0, ended: 2 }, completed: one() });
    expect(later.exchangeValue.total).toBe(30);
  });
});
