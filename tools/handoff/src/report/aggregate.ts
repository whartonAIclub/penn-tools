// The pilot report's figures (USER-INSTRUCTIONS §8 item 3): pure functions over what collect.ts read. Nothing here touches the
// database.
//
// The live document is evaluated with the engine's own read-only rules at the report's time, as the app's views are: rState and
// gState for each request's state (a deadline that has passed counts as expired even before the server's sweep stores it),
// listingNumbers for reserved and completed units, itemState for items, and the guest projection for what is open to take now and
// for live public requests (the same figures signed-out visitors see). It runs on a frozen copy, with no one's profile, so it can't
// change the document or name anyone; nothing is swept or stored.
//
// Records by known test or development accounts (and by the preview's sample people, never expected here) are removed first, so
// every activity figure describes the remaining accounts only. The stock "now" (quantities, supply and demand) is the market as it
// stands: the remaining accounts' listings and items, with every request on them, a left-out account's included, since its hold or
// handover takes real stock that visitors see as gone (EPV M1); scope.stockHeldByLeftOutAccounts says how much. The output carries
// counts, sums, durations, fixed words and event ids.

import {
  CATS,
  EV,
  FINAL,
  GFINAL,
  GOODS_CATS,
  LATE_PAYMENT,
  PROBLEMS,
  SAMPLE_PEOPLE,
  access,
  departed,
  gState,
  invariantViolations,
  isExpired,
  itemState,
  listingNumbers,
  pickupOver,
  rState,
  reserves,
} from "../../engine/index.js";
import type {
  EngineEvent,
  GoodsEval,
  GoodsRequest as StoredGoodsRequest,
  Holding as StoredHolding,
  Interest as StoredInterest,
  Item as StoredItem,
  Listing as StoredListing,
  LiveWorld,
  RequestEval,
  Share as StoredShare,
  StoredEvent,
  TicketRequest as StoredRequest,
} from "../../engine/index.js";
import { enginePort } from "../engine-port.js";
import type { WorldDoc } from "../engine-port.js";
import { ACTIONS_KEEP_DAYS } from "../store.js";
import type { GuestView } from "../types.js";
import { PILOT_REPORT_FORMAT, REPORT_WORLD } from "./types.js";
import type {
  CategorySupplyDemand,
  ClosedByReason,
  Count,
  Duration,
  EventSupplyDemand,
  GoodsSupplyDemand,
  PilotData,
  PilotReport,
  Units,
  Waited,
} from "./types.js";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const RECENT_MS = ACTIONS_KEEP_DAYS * DAY_MS;
/** actions.actor_id of the server's expiry sweeps (store.ts). */
const SYSTEM_ACTOR = "system";
const ENDED: ReadonlySet<string> = new Set<string>(FINAL);
const GOODS_ENDED: ReadonlySet<string> = new Set<string>(GFINAL);
const PAYMENT_CONFIRMED: ReadonlySet<string> = new Set(["confirmed", "sent", "completed"]);
const EVENT_CATEGORIES: ReadonlySet<string> = new Set(Object.keys(CATS));
const GOODS_CATEGORIES: ReadonlySet<string> = new Set(Object.keys(GOODS_CATS));
const EVENT_KINDS: ReadonlySet<string> = new Set(["event", "train", "trek"]);
/** The reasons "There's a problem" offers (the engine's fixed lists); anything else is reported as "(other)", never as typed. */
const PROBLEM_REASONS: ReadonlySet<string> = new Set([
  ...PROBLEMS.ticket.buyer,
  ...PROBLEMS.ticket.seller,
  ...PROBLEMS.goods.buyer,
  ...PROBLEMS.goods.seller,
  LATE_PAYMENT, // follow-on B5: the buyer's report on an ended new-flow reservation
]);
const ACTION_TYPE = /^[A-Za-z]{1,40}$/;

export interface BuildOptions {
  /** More accounts to leave out (tests: made-up ids), besides those collect.ts identified. */
  excludeUserIds?: readonly string[];
}

/** The report, from what collect.ts read. Pure: the same data and options give the same report. */
export function buildPilotReport(data: PilotData, opts: BuildOptions = {}): PilotReport {
  const now = data.now;
  if (!Number.isFinite(now)) throw new TypeError("Handoff report: the data has no time.");
  const full = deepFreeze((data.live ? data.live.doc : enginePort.empty()) as unknown as LiveWorld);
  const version = data.live ? data.live.version : 0;

  const known = data.knownTestAccounts;
  const given = [...new Set(opts.excludeUserIds ?? [])];
  const knownIds = known && known.resolved ? known.ids : [];
  const sampleIds = Object.keys(SAMPLE_PEOPLE);
  const out = new Set<string>([...knownIds, ...given, ...sampleIds]);
  const { doc, market, left } = withoutAccounts(full, out);
  const sample = sumOf(Object.values(withoutAccounts(full, new Set(sampleIds)).left));
  const leftTotal = sumOf(Object.values(left));

  // The two documents hold the same events, so the engine evaluates either at the report's time; the guest projection installs `market`.
  const m = enginePort.run({ doc: market as unknown as WorldDoc, people: [], now }, () => measure(doc, market, now, version, out));
  const issues = data.live
    ? enginePort.run({ doc: full as unknown as WorldDoc, people: [], now }, () => invariantViolations(full).length)
    : 0;

  const accounts = knownIds.length + given.length;
  const identified = (known !== null && known.resolved) || given.length > 0;
  const how = [
    known === null
      ? "public.users not looked up"
      : known.resolved
        ? "public.users: google_id 'local-dev' or 'handoff-test-…', or an @example.invalid email"
        : `not identified: ${known.reason}`,
    ...(given.length > 0 ? [`${given.length} given by the caller`] : []),
  ].join("; ");

  return {
    report: "handoff-pilot-metrics",
    format: PILOT_REPORT_FORMAT,
    generatedAt: iso(now),
    window: {
      from: data.live ? iso(data.live.createdAt) : null,
      to: iso(now),
      last7DaysFrom: iso(now - RECENT_MS),
      description:
        "All time: every record in the live world, from its first write through the report's time. Figures marked " +
        "\"now\" are as of the report's time; \"last 7 days\" figures count records by their creation (or reservation, or " +
        "completion) stamp in the 7 days before it.",
    },
    scope: {
      world: REPORT_WORLD,
      liveWorldStored: data.live !== null,
      testWorldsNotRead: data.testWorlds,
      knownTestAccounts: { identified, accounts, how },
      recordsLeftOut: { total: leftTotal, ...left },
      stockHeldByLeftOutAccounts: m.leftOutStock,
      previewSampleRecords: sample,
      separation: separation(identified, accounts, leftTotal, data.testWorlds, known),
    },
    safety: {
      readOnlyTransaction: data.transaction.readOnly,
      isolation: data.transaction.isolation,
      note:
        "Every read ran in one REPEATABLE READ, READ ONLY transaction, in which Postgres refuses any write. Deadlines are " +
        "evaluated in memory and never stored: no profile is created, nothing is swept and no notification is marked read.",
    },
    sources: {
      liveDocument: {
        version,
        firstWriteAt: data.live ? iso(data.live.createdAt) : null,
        lastWriteAt: data.live ? iso(data.live.updatedAt) : null,
        bytes: data.live ? Buffer.byteLength(JSON.stringify(full), "utf8") : 0,
        limitBytes: null, // review of PR #88: the market is rows, with no limit on the whole (one record at most RECORD_MAX_BYTES)
        sweepDue: data.live !== null && data.live.nextDue !== null && data.live.nextDue <= now,
      },
      profiles: data.profiles,
      notifications: { retained: data.notifications.total, unread: data.notifications.unread },
      actionsLog: {
        retainedRows: data.actions.retained,
        oldestRetainedAt: data.actions.oldestAt === null ? null : iso(data.actions.oldestAt),
        keepDays: ACTIONS_KEEP_DAYS,
      },
      snapshots: data.snapshots,
    },
    participants: m.participants,
    created: m.created,
    quantities: { asOf: iso(now), ...m.quantities },
    ticketExchanges: m.ticketExchanges,
    funnel: m.funnel,
    goodsExchanges: m.goodsExchanges,
    cancellationsExpirationsDisputes: m.endings,
    timing: m.timing,
    supplyAndDemand: { asOf: iso(now), tickets: { byCategory: m.supply.byCategory, byEvent: m.supply.byEvent }, goods: { byCategory: m.supply.goods } },
    exchangeValue: {
      label: "User-confirmed exchange value (agreed prices both people confirmed in Handoff; not verified payments)",
      currency: "USD",
      ...m.value,
    },
    recentActivity: recentActivity(data, out, now),
    integrity: { storedDocumentIssues: issues, recordsNotEvaluated: m.notEvaluated },
    definitions: { ...DEFINITIONS },
    coverage: [...COVERAGE],
    notTracked: [...NOT_TRACKED],
  };
}

// ── Leaving out known test accounts ──────────────────────────────────────────────────────

type LeftOut = Omit<PilotReport["scope"]["recordsLeftOut"], "total">;

/**
 * The document without the records of the given accounts: their listings (and every request on them), held replies to their
 * public requests, their requests, alerts, shares, items (and every request for them), goods requests and tickets. Events stay,
 * since other people's records may refer to them, but `eventsAddedBy` counts the ones they added, which "created" leaves out.
 * `market` is the same, except that their ticket and goods requests on the remaining listings and items stay: the stock as it stands
 * (a hold or handover of theirs takes a real ticket or item, which visitors see as gone). It's used for the "now" stock only, never
 * for activity.
 */
function withoutAccounts(doc: LiveWorld, out: ReadonlySet<string>): { doc: LiveWorld; market: LiveWorld; left: LeftOut } {
  const left: LeftOut = { eventsAddedBy: 0, listings: 0, ticketRequests: 0, publicRequests: 0, alerts: 0, shares: 0, items: 0, goodsRequests: 0, holdings: 0 };
  if (out.size === 0) return { doc, market: doc, left };
  const by = (id: unknown): boolean => typeof id === "string" && out.has(id);

  left.eventsAddedBy = list<StoredEvent>(doc, "events").filter((e) => by(e.createdBy)).length;
  const interests = list<StoredInterest>(doc, "interests");
  const goneIsos = new Set(interests.filter((i) => by(i.userId)).map((i) => i.id));
  for (const i of interests) {
    if (!goneIsos.has(i.id)) continue;
    if (i.kind === "iso") left.publicRequests += 1;
    else left.alerts += 1;
  }

  const listings = list<StoredListing>(doc, "listings");
  const goneListings = new Set(listings.filter((l) => by(l.sellerId) || (typeof l.isoReplyFor === "string" && goneIsos.has(l.isoReplyFor))).map((l) => l.id));
  const goods = list<StoredItem>(doc, "goods");
  const goneItems = new Set(goods.filter((it) => by(it.sellerId)).map((it) => it.id));

  const requests = list<StoredRequest>(doc, "requests");
  const keptRequests = requests.filter((r) => !(by(r.buyerId) || goneListings.has(r.listingId)));
  const goodsReqs = list<StoredGoodsRequest>(doc, "goodsReqs");
  const keptGoodsReqs = goodsReqs.filter((g) => !(by(g.buyerId) || goneItems.has(g.itemId)));
  const shares = list<StoredShare>(doc, "responses");
  const keptShares = shares.filter(
    (x) =>
      !(by(x.sellerId) || goneIsos.has(x.isoId) || (typeof x.listingId === "string" && goneListings.has(x.listingId)) || (typeof x.itemId === "string" && goneItems.has(x.itemId))),
  );
  const holdings = list<StoredHolding>(doc, "holdings");
  const keptHoldings = holdings.filter((h) => !by(h.userId));

  left.listings = goneListings.size;
  left.items = goneItems.size;
  left.ticketRequests = requests.length - keptRequests.length;
  left.goodsRequests = goodsReqs.length - keptGoodsReqs.length;
  left.shares = shares.length - keptShares.length;
  left.holdings = holdings.length - keptHoldings.length;
  const kept: LiveWorld = {
    ...doc,
    listings: listings.filter((l) => !goneListings.has(l.id)),
    requests: keptRequests,
    interests: interests.filter((i) => !goneIsos.has(i.id)),
    responses: keptShares,
    goods: goods.filter((it) => !goneItems.has(it.id)),
    goodsReqs: keptGoodsReqs,
    holdings: keptHoldings,
  };
  return {
    doc: kept,
    market: {
      ...kept,
      requests: requests.filter((r) => !goneListings.has(r.listingId)),
      goodsReqs: goodsReqs.filter((g) => !goneItems.has(g.itemId)),
    },
    left,
  };
}

// ── The figures (inside withEngine, at the report's time) ────────────────────────────────

interface Measured {
  participants: PilotReport["participants"];
  created: PilotReport["created"];
  quantities: Omit<PilotReport["quantities"], "asOf">;
  ticketExchanges: PilotReport["ticketExchanges"];
  funnel: PilotReport["funnel"];
  goodsExchanges: PilotReport["goodsExchanges"];
  endings: PilotReport["cancellationsExpirationsDisputes"];
  timing: PilotReport["timing"];
  supply: { byCategory: CategorySupplyDemand[]; byEvent: EventSupplyDemand[]; goods: GoodsSupplyDemand[] };
  value: Pick<PilotReport["exchangeValue"], "tickets" | "goods" | "total">;
  leftOutStock: PilotReport["scope"]["stockHeldByLeftOutAccounts"];
  notEvaluated: number;
}

/** doc: without the left-out accounts' records (activity); market: the stock as it stands (withoutAccounts). */
function measure(doc: LiveWorld, market: LiveWorld, now: number, version: number, out: ReadonlySet<string>): Measured {
  let notEvaluated = 0;
  const keep = (ok: boolean): boolean => {
    if (!ok) notEvaluated += 1;
    return ok;
  };
  const hasEvent = (id: unknown): boolean => typeof id === "string" && EV[id] !== undefined;
  const recent = (t: unknown): boolean => isNum(t) && t > now - RECENT_MS && t <= now;

  // The records the figures use: those whose event, listing, item and request are in the document (as the views do).
  const events = list<StoredEvent>(doc, "events");
  const listings = list<StoredListing>(doc, "listings").filter((l) => keep(hasEvent(l.eventId)));
  const listingById = new Map(listings.map((l) => [l.id, l] as const));
  const requests = list<StoredRequest>(doc, "requests").filter((r) => keep(hasEvent(r.eventId) && listingById.has(r.listingId) && r.flow === "quick"));
  const interests = list<StoredInterest>(doc, "interests").filter((i) => keep(i.eventId == null ? !!i.goods : hasEvent(i.eventId)));
  const goods = list<StoredItem>(doc, "goods");
  const itemById = new Map(goods.map((it) => [it.id, it] as const));
  const goodsReqs = list<StoredGoodsRequest>(doc, "goodsReqs").filter((g) => keep(itemById.has(g.itemId)));
  const interestIds = new Set(interests.map((i) => i.id));
  const shares = list<StoredShare>(doc, "responses").filter((x) => keep(interestIds.has(x.isoId)));

  const publicListings = listings.filter((l) => typeof l.isoReplyFor !== "string");
  const replies = listings.filter((l) => typeof l.isoReplyFor === "string");
  const isos = interests.filter((i) => i.kind === "iso");
  const alerts = interests.filter((i) => i.kind !== "iso"); // private: anything that isn't a public request

  const byListing = groupBy(requests, (r) => r.listingId);
  const byItem = groupBy(goodsReqs, (g) => g.itemId);
  const rEval = new Map<string, RequestEval>(requests.map((r) => [r.id, rState(r)]));
  const gEval = new Map<string, GoodsEval>(goodsReqs.map((g) => [g.id, gState(g, must(itemById.get(g.itemId)))]));
  const stOf = (r: StoredRequest): string => must(rEval.get(r.id)).st;
  const gStOf = (g: StoredGoodsRequest): string => must(gEval.get(g.id)).st;
  const reqsOf = (l: StoredListing): StoredRequest[] => byListing.get(l.id) ?? [];

  // The stock as it stands, for the figures "now" (quantities, supply and demand): the same listings and items, with every request
  // on them, a left-out account's included, since its hold or handover takes a real ticket or item that visitors see as gone
  // (EPV M1). Never used for activity: those requests aren't exchanges, reservations or participants here.
  const stockRequests = list<StoredRequest>(market, "requests").filter((r) => hasEvent(r.eventId) && listingById.has(r.listingId) && r.flow === "quick");
  const stockGoodsReqs = list<StoredGoodsRequest>(market, "goodsReqs").filter((g) => itemById.has(g.itemId));
  const stockByListing = groupBy(stockRequests, (r) => r.listingId);
  const stockByItem = groupBy(stockGoodsReqs, (g) => g.itemId);
  const stockOf = (l: StoredListing) => listingNumbers({ requests: stockByListing.get(l.id) ?? [] }, l);
  const itemStockState = (it: StoredItem) => itemState({ goodsReqs: stockByItem.get(it.id) ?? [] }, it).key;

  // What anyone could take or see now: the guest projection of the market as it stands, at this time (C-CONTRACT §7).
  const guest: GuestView = enginePort.guest(market as unknown as WorldDoc, { worldId: REPORT_WORLD, version, now });

  // ── Participants ──
  const sellers = new Set<string>();
  const buyers = new Set<string>();
  const requesters = new Set<string>();
  const alerters = new Set<string>();
  const completers = new Set<string>();
  for (const l of listings) sellers.add(l.sellerId);
  for (const it of goods) sellers.add(it.sellerId);
  for (const r of requests) {
    // A held reply's request is the seller's doing; its requester acts only by accepting it. The same for an invitation a seller sent
    // to a public request's owner (follow-on B5, fromIso): the owner acts only by reserving it.
    if ((r.isoReply !== true && typeof r.fromIso !== "string") || isNum(r.acceptedAt)) buyers.add(r.buyerId);
    if (stOf(r) === "completed") {
      completers.add(r.buyerId);
      completers.add(must(listingById.get(r.listingId)).sellerId);
    }
  }
  for (const g of goodsReqs) {
    buyers.add(g.buyerId);
    if (gStOf(g) === "completed") {
      completers.add(g.buyerId);
      completers.add(must(itemById.get(g.itemId)).sellerId);
    }
  }
  for (const i of isos) requesters.add(i.userId);
  for (const a of alerts) alerters.add(a.userId);
  const everyone = new Set([...sellers, ...buyers, ...requesters, ...alerters]);
  const participants: PilotReport["participants"] = {
    distinct: everyone.size,
    sold: sellers.size,
    bought: buyers.size,
    boughtAndSold: [...sellers].filter((id) => buyers.has(id)).length,
    postedPublicRequests: requesters.size,
    setAlerts: alerters.size,
    inCompletedExchanges: completers.size,
  };

  // ── Created ──
  const countOf = <T>(xs: readonly T[], at: (x: T) => unknown): Count => ({ allTime: xs.length, last7Days: xs.filter((x) => recent(at(x))).length });
  const realEvents = events.filter((e) => !(typeof e.createdBy === "string" && out.has(e.createdBy)));
  const created: PilotReport["created"] = {
    events: {
      ...countOf(realEvents, (e) => e.createdAt),
      removed: realEvents.filter((e) => isNum(e.removedAt)).length,
      // Forms round 2: added by their date alone (they close at 11:59 PM that day), and with no face value given (no price cap).
      dateOnly: realEvents.filter((e) => typeof e.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.start)).length,
      noFaceValue: realEvents.filter((e) => !(Array.isArray(e.tiers) && e.tiers.some((t) => isNum(t?.price)))).length,
    },
    ticketListings: { ...countOf(publicListings, (l) => l.createdAt), units: sumOf(publicListings.map((l) => num(l.listed))) },
    heldReplies: { ...countOf(replies, (l) => l.createdAt), units: sumOf(replies.map((l) => num(l.listed))) },
    items: countOf(goods, (it) => it.createdAt),
    publicRequests: {
      ...countOf(isos, (i) => i.createdAt),
      forTickets: isos.filter((i) => i.eventId != null).length,
      forGoods: isos.filter((i) => i.eventId == null).length,
    },
    alerts: countOf(alerts, (a) => a.createdAt),
    shares: countOf(shares, (x) => x.createdAt),
  };

  // ── Quantities now ──
  let listedUnits = 0;
  let reservedNow = 0;
  let completedUnits = 0;
  let pausedListings = 0;
  let pausedUnits = 0;
  for (const l of publicListings) {
    const n = stockOf(l);
    listedUnits += num(l.listed);
    reservedNow += n.reserved;
    completedUnits += n.completed;
    // A seller's pause (the stored pausedAt; resuming removes it) keeps what's left off sale, while nothing else would.
    const ev = EV[l.eventId];
    if (isNum(pausedAt(l)) && !isNum(l.withdrawnAt) && !departed(l) && ev !== undefined && access(ev).ok && n.completed < num(l.listed)) {
      pausedListings += 1;
      pausedUnits += Math.max(0, num(l.listed) - n.reserved - n.completed);
    }
  }
  const availableNow = sumOf(guest.listings.map((g) => g.available));
  let replyUnits = 0;
  let awaiting = 0;
  let replyReserved = 0;
  let replyCompleted = 0;
  for (const l of replies) {
    replyUnits += num(l.listed);
    for (const r of reqsOf(l)) {
      const e = must(rEval.get(r.id));
      if (e.st === "proposed") awaiting += num(r.qty);
      else if (e.st === "completed") replyCompleted += num(r.qty);
      else if (reserves(e)) replyReserved += num(r.qty);
    }
  }
  // sold, withdrawn, closed (pickup window over) and reserved (on hold) come first in itemState; a pause after those.
  const itemKeys = tally(
    goods.map((it) => {
      const key = itemStockState(it);
      return ["sold", "withdrawn", "closed", "reserved"].includes(key) ? key : isNum(pausedAt(it)) && !pickupOver(it) ? "paused" : key;
    }),
  );
  // How much of that stock left-out accounts hold or were handed: part of reservedNow, completed, onHoldNow and sold, never activity.
  const leftOutStock: Measured["leftOutStock"] = { ticketsReservedNow: 0, ticketsCompleted: 0, itemsOnHoldNow: 0, itemsSold: 0 };
  const leftOutBuyer = (id: unknown): boolean => typeof id === "string" && out.has(id);
  const publicIds = new Set(publicListings.map((l) => l.id));
  for (const r of stockRequests) {
    if (!leftOutBuyer(r.buyerId) || !publicIds.has(r.listingId)) continue;
    const e = rState(r);
    if (e.st === "completed") leftOutStock.ticketsCompleted += num(r.qty);
    else if (reserves(e)) leftOutStock.ticketsReservedNow += num(r.qty);
  }
  for (const it of goods) {
    const theirs = (stockByItem.get(it.id) ?? []).filter((g) => leftOutBuyer(g.buyerId));
    if (theirs.length === 0) continue;
    const key = itemStockState(it);
    if (key === "reserved" && theirs.some((g) => gState(g, it).st === "accepted")) leftOutStock.itemsOnHoldNow += 1;
    if (key === "sold" && theirs.some((g) => gState(g, it).st === "completed")) leftOutStock.itemsSold += 1;
  }
  const itemsAvailable = guest.goods.length;
  const liveIds = new Set(guest.wanted.map((w) => w.id));
  const requestStates = tally(
    isos.map((i) =>
      i.status === "open"
        ? liveIds.has(i.id) ? "live" : isExpired(i) ? "pastDeadline" : "eventClosed"
        : i.closedReason === "fulfilled" ? "fulfilled" : i.closedReason === "cancelled" ? "cancelled" : "closedOther",
    ),
  );
  const alertStates = tally(alerts.map((a) => (a.status === "open" ? (a.paused ? "paused" : "active") : "closed")));
  const quantities: Measured["quantities"] = {
    tickets: {
      listings: publicListings.length,
      listedUnits,
      availableNow,
      reservedNow,
      completed: completedUnits,
      unsoldNotOpen: Math.max(0, listedUnits - completedUnits - reservedNow - availableNow),
      pausedUnits,
      pausedListings,
      listingsOpenNow: guest.listings.length,
      listingsWithdrawn: publicListings.filter((l) => isNum(l.withdrawnAt)).length,
    },
    heldReplies: {
      replies: replies.length,
      units: replyUnits,
      awaitingAnswer: awaiting,
      reservedNow: replyReserved,
      completed: replyCompleted,
      closedUnsold: Math.max(0, replyUnits - awaiting - replyReserved - replyCompleted),
    },
    items: {
      posted: goods.length,
      availableNow: itemsAvailable,
      onHoldNow: itemKeys.get("reserved") ?? 0,
      sold: itemKeys.get("sold") ?? 0,
      withdrawn: itemKeys.get("withdrawn") ?? 0,
      pickupWindowOver: itemKeys.get("closed") ?? 0,
      pausedNow: itemKeys.get("paused") ?? 0,
      notOpenOther: Math.max(
        0,
        goods.length -
          itemsAvailable -
          (itemKeys.get("reserved") ?? 0) -
          (itemKeys.get("sold") ?? 0) -
          (itemKeys.get("withdrawn") ?? 0) -
          (itemKeys.get("closed") ?? 0) -
          (itemKeys.get("paused") ?? 0),
      ),
    },
    publicRequests: {
      liveNow: guest.wanted.length,
      liveUnits: sumOf(guest.wanted.map((w) => num(w.qty))),
      openPastDeadline: requestStates.get("pastDeadline") ?? 0,
      openEventClosed: requestStates.get("eventClosed") ?? 0,
      fulfilled: requestStates.get("fulfilled") ?? 0,
      cancelled: requestStates.get("cancelled") ?? 0,
      closedOther: requestStates.get("closedOther") ?? 0,
    },
    alerts: { active: alertStates.get("active") ?? 0, paused: alertStates.get("paused") ?? 0, closed: alertStates.get("closed") ?? 0 },
  };

  // ── Ticket exchanges, their endings and disputes ──
  const cancellations: PilotReport["cancellationsExpirationsDisputes"]["cancellations"] = {
    ticketReservationsCancelledByBuyer: 0,
    ticketReservationsReleasedBySeller: 0,
    ticketOffersAndRepliesWithdrawnByBuyer: 0,
    ticketOffersAndRepliesDeclined: 0,
    goodsHoldsCancelledByBuyer: 0,
    goodsHoldsReleasedBySeller: 0,
    goodsRequestsCancelledByBuyer: 0,
    goodsRequestsDeclined: 0,
    listingsWithdrawn: quantities.tickets.listingsWithdrawn,
    itemsWithdrawn: quantities.items.withdrawn,
    publicRequestsCancelled: quantities.publicRequests.cancelled,
    alertsRemoved: quantities.alerts.closed,
    otherEndings: 0,
  };
  const expirations: PilotReport["cancellationsExpirationsDisputes"]["expirations"] = {
    ticketReservationsBeforePayment: 0,
    ticketOffersAndReplies: 0,
    goodsHolds: 0,
    goodsRequests: 0,
    itemsUnsoldPickupWindowOver: quantities.items.pickupWindowOver,
    publicRequestsOpenPastDeadline: quantities.publicRequests.openPastDeadline,
    notYetRecordedBySweep: 0,
  };
  const reservations = units();
  const completed = units();
  const inProgress = units();
  const endedReserved = units();
  let neverOpen = 0;
  let neverEnded = 0;
  for (const r of requests) {
    const st = stOf(r);
    const qty = num(r.qty);
    if (isNum(r.acceptedAt) || st === "completed") {
      add(reservations, qty);
      if (st === "completed") add(completed, qty);
      else if (ENDED.has(st)) {
        add(endedReserved, qty);
        if (st === "cancelled") cancellations.ticketReservationsCancelledByBuyer += 1;
        else if (st === "released") cancellations.ticketReservationsReleasedBySeller += 1;
        else if (st === "expired") expirations.ticketReservationsBeforePayment += 1;
        else cancellations.otherEndings += 1;
      } else add(inProgress, qty);
    } else if (ENDED.has(st)) {
      neverEnded += 1;
      if (st === "declined") cancellations.ticketOffersAndRepliesDeclined += 1;
      else if (st === "cancelled") cancellations.ticketOffersAndRepliesWithdrawnByBuyer += 1;
      else if (st === "expired") expirations.ticketOffersAndReplies += 1;
      else cancellations.otherEndings += 1;
    } else neverOpen += 1;
    if (st === "expired" && r.status !== "expired") expirations.notYetRecordedBySweep += 1;
  }
  // The two payment steps (format 3): the buyer's word ("I've sent payment", paidAt) and the seller's ("Payment received",
  // paymentConfirmedAt), each counted once, whatever came after (a dispute, a cancellation or the completion). Never a verified payment.
  const buyerReported = units();
  const sellerConfirmed = units();
  for (const r of requests) {
    if (isNum(r.paidAt)) add(buyerReported, num(r.qty));
    if (isNum(r.paymentConfirmedAt)) add(sellerConfirmed, num(r.qty));
  }
  // Invite to pay (format 4): the stages of new-flow records (inviteFlow), each counted once when the record reached it, whatever came
  // after. A request to buy or an invitation holds nothing, so neither is ever a hold, a payment or a sale; a stage is read from its own
  // stamp only (invitedAt, acceptedAt, paidAt, paymentConfirmedAt, the completed state), never inferred from another.
  const isNew = (r: StoredRequest): boolean => r.inviteFlow === true;
  const funnel: PilotReport["funnel"] = {
    requestsToBuy: units(),
    invitations: { fromRequest: units(), fromPublicRequest: units() },
    holds: units(),
    buyerReported: units(),
    sellerConfirmed: units(),
    completed: units(),
  };
  for (const r of requests) {
    if (!isNew(r)) continue;
    const qty = num(r.qty);
    const toRequester = typeof r.fromIso === "string"; // the seller invited a public request's owner: no request to buy came first
    if (!toRequester) add(funnel.requestsToBuy, isNum(r.wantedQty) ? r.wantedQty : qty); // what the buyer asked for, before a partial invitation
    if (isNum(r.invitedAt)) add(toRequester ? funnel.invitations.fromPublicRequest : funnel.invitations.fromRequest, qty);
    if (isNum(r.acceptedAt)) add(funnel.holds, qty);
    if (isNum(r.paidAt)) add(funnel.buyerReported, qty);
    if (isNum(r.paymentConfirmedAt)) add(funnel.sellerConfirmed, qty);
    if (stOf(r) === "completed") add(funnel.completed, qty);
  }
  const ticketExchanges: PilotReport["ticketExchanges"] = {
    requests: requests.length,
    // Legacy records only (made before invite to pay); new-flow records are in the funnel.
    offers: requests.filter((r) => !isNew(r) && r.isoReply !== true && r.isOffer === true).length,
    takes: requests.filter((r) => !isNew(r) && r.isoReply !== true && r.isOffer !== true).length,
    heldReplies: requests.filter((r) => !isNew(r) && r.isoReply === true).length,
    reservations,
    completed,
    inProgress,
    endedWithoutCompletion: endedReserved,
    neverReserved: { total: neverOpen + neverEnded, open: neverOpen, ended: neverEnded },
    payment: { buyerReported, sellerConfirmed },
    last7Days: {
      requests: requests.filter((r) => recent(r.createdAt)).length,
      reservations: requests.filter((r) => recent(r.acceptedAt)).length,
      completed: requests.filter((r) => stOf(r) === "completed" && recent(r.completedAt)).length,
    },
  };

  let holds = 0;
  let goodsDone = 0;
  let onHold = 0;
  let holdsEnded = 0;
  let notHeldOpen = 0;
  let notHeldEnded = 0;
  for (const g of goodsReqs) {
    const st = gStOf(g);
    if (isNum(g.acceptedAt) || st === "completed") {
      holds += 1;
      if (st === "completed") goodsDone += 1;
      else if (GOODS_ENDED.has(st)) {
        holdsEnded += 1;
        if (st === "cancelled") cancellations.goodsHoldsCancelledByBuyer += 1;
        else if (st === "released") cancellations.goodsHoldsReleasedBySeller += 1;
        else if (st === "expired") expirations.goodsHolds += 1;
        else cancellations.otherEndings += 1;
      } else onHold += 1;
    } else if (GOODS_ENDED.has(st)) {
      notHeldEnded += 1;
      if (st === "declined") cancellations.goodsRequestsDeclined += 1;
      else if (st === "cancelled") cancellations.goodsRequestsCancelledByBuyer += 1;
      else if (st === "expired") expirations.goodsRequests += 1;
      else cancellations.otherEndings += 1;
    } else notHeldOpen += 1;
    if (st === "expired" && g.status !== "expired") expirations.notYetRecordedBySweep += 1;
  }
  const goodsExchanges: PilotReport["goodsExchanges"] = {
    requests: goodsReqs.length,
    offers: goodsReqs.filter((g) => g.isOffer === true).length,
    holds,
    completed: goodsDone,
    onHoldNow: onHold,
    holdsEndedWithoutPickup: holdsEnded,
    neverHeld: { total: notHeldOpen + notHeldEnded, open: notHeldOpen, ended: notHeldEnded },
    last7Days: {
      requests: goodsReqs.filter((g) => recent(g.createdAt)).length,
      holds: goodsReqs.filter((g) => recent(g.acceptedAt)).length,
      completed: goodsReqs.filter((g) => gStOf(g) === "completed" && recent(g.completedAt)).length,
    },
  };

  const disputed = requests.filter((r) => isNum(r.payDisputedAt));
  const laterConfirmed = disputed.filter((r) => isNum(r.paymentConfirmedAt) || PAYMENT_CONFIRMED.has(stOf(r))).length;
  const disputeCancelled = disputed.filter((r) => !isNum(r.paymentConfirmedAt) && stOf(r) === "cancelled").length;
  const disputeReleased = disputed.filter((r) => !isNum(r.paymentConfirmedAt) && stOf(r) === "released").length;
  const problems = [
    ...requests.map((r) => ({ kind: "tickets" as const, p: r.problem })),
    ...goodsReqs.map((g) => ({ kind: "goods" as const, p: g.problem })),
  ].filter((x): x is { kind: "tickets" | "goods"; p: NonNullable<StoredRequest["problem"]> } => typeof x.p === "object" && x.p !== null);
  const reasons = tally(problems.map(({ p }) => (PROBLEM_REASONS.has(p.reason) ? p.reason : "(other)")));
  // Closures (format 3): the listings and items their sellers closed, by the reason given (optional; follow-on B2). Held replies close
  // on their own when their match ends, so only public listings count, as listingsWithdrawn does. Never a sale.
  const byReason = (xs: readonly { closeReason?: unknown }[]): ClosedByReason => ({
    soldElsewhere: xs.filter((x) => x.closeReason === "soldElsewhere").length,
    noLongerSelling: xs.filter((x) => x.closeReason === "noLongerSelling").length,
    noReason: xs.filter((x) => x.closeReason !== "soldElsewhere" && x.closeReason !== "noLongerSelling").length,
  });
  const closures = {
    listings: byReason(publicListings.filter((l) => isNum(l.withdrawnAt))),
    items: byReason(goods.filter((it) => isNum(it.withdrawnAt) && !isNum(it.soldAt))),
  };
  const endings: PilotReport["cancellationsExpirationsDisputes"] = {
    cancellations,
    closures,
    expirations,
    disputes: {
      paymentNotArrived: {
        total: disputed.length,
        laterConfirmed,
        cancelledByBuyer: disputeCancelled,
        releasedBySeller: disputeReleased,
        open: disputed.length - laterConfirmed - disputeCancelled - disputeReleased,
      },
      problemReports: {
        total: problems.length,
        open: problems.filter(({ p }) => !isNum(p.resolvedAt)).length,
        resolved: problems.filter(({ p }) => isNum(p.resolvedAt)).length,
        tickets: problems.filter((x) => x.kind === "tickets").length,
        goods: problems.filter((x) => x.kind === "goods").length,
        byBuyer: problems.filter(({ p }) => p.role === "buyer").length,
        bySeller: problems.filter(({ p }) => p.role === "seller").length,
        byReason: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1)),
      },
    },
  };

  // ── Timing ──
  const sharesByIso = groupBy(shares, (x) => x.isoId);
  const repliesByIso = groupBy(replies, (l) => l.isoReplyFor ?? "");
  // Follow-on B5: a seller's invitation to a public request's owner is a response to that request, never a buyer's interest in the listing.
  const invitesByIso = groupBy(requests.filter((r) => typeof r.fromIso === "string"), (r) => r.fromIso ?? "");
  const fromBuyer = (l: StoredListing): StoredRequest[] => reqsOf(l).filter((r) => typeof r.fromIso !== "string");
  const firstAfter = <T>(start: unknown, xs: readonly T[], at: (x: T) => unknown): number | null => {
    if (!isNum(start)) return null;
    const times = xs.map(at).filter(isNum);
    return times.length > 0 ? Math.max(0, Math.min(...times) - start) : null;
  };
  const timing: PilotReport["timing"] = {
    ticketListingToFirstInterest: waited(publicListings.map((l) => firstAfter(l.createdAt, fromBuyer(l), (r) => r.createdAt))),
    ticketListingToFirstReservation: waited(publicListings.map((l) => firstAfter(l.createdAt, reqsOf(l), (r) => r.acceptedAt))),
    ticketListingToFirstCompletion: waited(
      publicListings.map((l) => firstAfter(l.createdAt, reqsOf(l).filter((r) => stOf(r) === "completed"), (r) => r.completedAt)),
    ),
    ticketReservationToCompletion: duration(
      requests.filter((r) => stOf(r) === "completed").map((r) => (isNum(r.acceptedAt) && isNum(r.completedAt) ? Math.max(0, r.completedAt - r.acceptedAt) : null)),
    ),
    itemToFirstRequest: waited(goods.map((it) => firstAfter(it.createdAt, byItem.get(it.id) ?? [], (g) => g.createdAt))),
    itemToFirstHold: waited(goods.map((it) => firstAfter(it.createdAt, byItem.get(it.id) ?? [], (g) => g.acceptedAt))),
    itemToSale: waited(goods.map((it) => (isNum(it.soldAt) && isNum(it.createdAt) ? Math.max(0, it.soldAt - it.createdAt) : null))),
    goodsHoldToPickup: duration(
      goodsReqs.filter((g) => gStOf(g) === "completed").map((g) => (isNum(g.acceptedAt) && isNum(g.completedAt) ? Math.max(0, g.completedAt - g.acceptedAt) : null)),
    ),
    publicRequestToFirstSellerResponse: waited(
      isos.map((i) =>
        firstAfter(
          i.createdAt,
          [
            ...(sharesByIso.get(i.id) ?? []).map((x) => x.createdAt),
            ...(repliesByIso.get(i.id) ?? []).map((l) => l.createdAt),
            ...(invitesByIso.get(i.id) ?? []).map((r) => r.createdAt),
          ],
          (t) => t,
        ),
      ),
    ),
  };

  // ── Supply and outstanding demand now (the guest view's open listings, items and live public requests) ──
  interface Acc {
    availableUnits: number;
    openListings: number;
    openRequests: number;
    unitsWanted: number;
    requesters: Set<string>;
  }
  const isoOwner = new Map(isos.map((i) => [i.id, i.userId] as const));
  const perEvent = new Map<string, Acc>();
  const acc = (id: string): Acc => {
    let a = perEvent.get(id);
    if (!a) {
      a = { availableUnits: 0, openListings: 0, openRequests: 0, unitsWanted: 0, requesters: new Set() };
      perEvent.set(id, a);
    }
    return a;
  };
  for (const l of guest.listings) {
    const a = acc(l.eventId);
    a.availableUnits += num(l.available);
    a.openListings += 1;
  }
  const perGoods = new Map<string, { itemsAvailable: number; openRequests: number; requesters: Set<string> }>();
  const goodsAcc = (cat: string | undefined) => {
    // §9q item 6: an item posted without a category is "(unspecified)" (honest, never guessed), as an event added without one is.
    const key = cat === undefined || cat === "" ? "(unspecified)" : GOODS_CATEGORIES.has(cat) ? cat : "(other)";
    let a = perGoods.get(key);
    if (!a) {
      a = { itemsAvailable: 0, openRequests: 0, requesters: new Set() };
      perGoods.set(key, a);
    }
    return a;
  };
  for (const it of guest.goods) goodsAcc(it.cat).itemsAvailable += 1;
  for (const w of guest.wanted) {
    const owner = isoOwner.get(w.id);
    if (w.eventId) {
      const a = acc(w.eventId);
      a.openRequests += 1;
      a.unitsWanted += num(w.qty);
      if (owner !== undefined) a.requesters.add(owner);
    } else if (w.goods) {
      const a = goodsAcc(w.goods.cat);
      a.openRequests += 1;
      if (owner !== undefined) a.requesters.add(owner);
    }
  }
  const byEvent: EventSupplyDemand[] = [...perEvent]
    .map(([eventId, a]) => {
      const ev = EV[eventId];
      return {
        eventId,
        kind: ev && EVENT_KINDS.has(String(ev.kind)) ? String(ev.kind) : "event",
        category: categoryOf(ev),
        startDate: ev && /^\d{4}-\d{2}-\d{2}/.test(ev.start) ? ev.start.slice(0, 10) : "",
        openToTransfers: ev ? access(ev).ok : false,
        availableUnits: a.availableUnits,
        openListings: a.openListings,
        openRequests: a.openRequests,
        requesters: a.requesters.size,
        unitsWanted: a.unitsWanted,
      };
    })
    .sort((x, y) => (x.startDate < y.startDate ? -1 : x.startDate > y.startDate ? 1 : x.eventId < y.eventId ? -1 : 1));
  const perCategory = new Map<string, Acc & { events: number }>();
  for (const [eventId, a] of perEvent) {
    const cat = categoryOf(EV[eventId]);
    const c = perCategory.get(cat) ?? { events: 0, availableUnits: 0, openListings: 0, openRequests: 0, unitsWanted: 0, requesters: new Set<string>() };
    c.events += 1;
    c.availableUnits += a.availableUnits;
    c.openListings += a.openListings;
    c.openRequests += a.openRequests;
    c.unitsWanted += a.unitsWanted;
    for (const id of a.requesters) c.requesters.add(id);
    perCategory.set(cat, c);
  }
  const byCategory: CategorySupplyDemand[] = [...perCategory]
    .map(([category, c]) => ({
      category,
      events: c.events,
      availableUnits: c.availableUnits,
      openListings: c.openListings,
      openRequests: c.openRequests,
      requesters: c.requesters.size,
      unitsWanted: c.unitsWanted,
    }))
    .sort((x, y) => (x.category < y.category ? -1 : 1));
  const goodsRows: GoodsSupplyDemand[] = [...perGoods]
    .map(([category, a]) => ({ category, itemsAvailable: a.itemsAvailable, openRequests: a.openRequests, requesters: a.requesters.size }))
    .sort((x, y) => (x.category < y.category ? -1 : 1));

  // ── User-confirmed exchange value ──
  const doneTickets = requests.filter((r) => stOf(r) === "completed");
  const ticketAmount = cents(sumOf(doneTickets.map((r) => (num(r.price) + num(r.topUp)) * num(r.qty))));
  const doneGoods = goodsReqs.filter((g) => gStOf(g) === "completed");
  const goodsAmount = cents(sumOf(doneGoods.map((g) => num(g.price))));
  const value: Measured["value"] = {
    tickets: { exchanges: doneTickets.length, units: sumOf(doneTickets.map((r) => num(r.qty))), amount: ticketAmount },
    goods: { exchanges: doneGoods.length, amount: goodsAmount },
    total: cents(ticketAmount + goodsAmount),
  };

  return {
    participants,
    created,
    quantities,
    ticketExchanges,
    funnel,
    goodsExchanges,
    endings,
    timing,
    supply: { byCategory, byEvent, goods: goodsRows },
    value,
    leftOutStock,
    notEvaluated,
  };
}

// ── The actions log's last 7 days ────────────────────────────────────────────────────────

function recentActivity(data: PilotData, out: ReadonlySet<string>, now: number): PilotReport["recentActivity"] {
  const byType = new Map<string, { accepted: number; refused: number }>();
  const accounts = new Set<string>();
  let accepted = 0;
  let refused = 0;
  let sweeps = 0;
  let leftOut = 0;
  for (const a of data.actions.recent) {
    if (!(a.at > now - RECENT_MS && a.at <= now)) continue;
    if (a.actorId === SYSTEM_ACTOR) {
      sweeps += 1;
      continue;
    }
    if (out.has(a.actorId)) {
      leftOut += 1;
      continue;
    }
    const type = ACTION_TYPE.test(a.type) ? a.type : "(other)";
    const t = byType.get(type) ?? { accepted: 0, refused: 0 };
    if (a.ok) {
      t.accepted += 1;
      accepted += 1;
      accounts.add(a.actorId);
    } else {
      t.refused += 1;
      refused += 1;
    }
    byType.set(type, t);
  }
  return {
    from: iso(now - RECENT_MS),
    to: iso(now),
    acceptedChanges: accepted,
    refusedChanges: refused,
    accountsWithAcceptedChange: accounts.size,
    byType: [...byType].map(([type, t]) => ({ type, ...t })).sort((x, y) => (x.type < y.type ? -1 : 1)),
    systemSweeps: sweeps,
    leftOut,
  };
}

function separation(
  identified: boolean,
  accounts: number,
  leftOut: number,
  testWorlds: number,
  known: PilotData["knownTestAccounts"],
): string {
  const worlds = `Test worlds (${testWorlds} present) and throwaway test schemas are never read.`;
  const others = "Testing with any other account (for example a real Penn account used to try things out) can't be told apart from real use.";
  if (!identified) {
    const why = known === null ? "they weren't looked up" : known.resolved ? "none were given" : known.reason;
    return `${worlds} Known TEST and Local Developer accounts could not be identified (${why}), so if they acted in the live world, their activity is included and can't be separated. ${others}`;
  }
  return `${worlds} ${accounts} known TEST or development account(s) were identified; ${leftOut} of their record(s) in the live world were left out of every activity figure; their holds and handovers on other accounts' listings and items still count in the stock now, as visitors see it (stockHeldByLeftOutAccounts). ${others}`;
}

// ── Text that goes with every report ─────────────────────────────────────────────────────

const DEFINITIONS: Readonly<Record<string, string>> = Object.freeze({
  participants:
    "distinct: accounts with at least one successful listing (tickets, a held reply or a goods item), ticket offer or reservation, " +
    "accepted held reply, goods request, public request or private alert in the live world. An account counts once whatever its " +
    "roles: someone who buys and sells is one participant (boughtAndSold counts them). Refused and retried changes create no " +
    "record, so they never count. Adding an event, or a ticket to one's profile, doesn't on its own make a participant. Profiles " +
    "(handoff.people) and visits are not participants. Each role counts accounts, whatever came of it: sold: accounts that " +
    "listed tickets (a public listing or a held reply) or posted a goods item, whether or not anything sold. bought: accounts " +
    "that made a ticket offer or reservation, accepted a held reply or requested a goods item, whether or not it completed. " +
    "boughtAndSold: accounts in both. postedPublicRequests, setAlerts: accounts with a public request, or a private alert. " +
    "inCompletedExchanges: accounts on either side of a completed ticket exchange or goods pickup. With invite to pay, a request " +
    "to buy counts as buying; an invitation a seller sent to a public request's owner counts for that owner only once they " +
    "reserve it.",
  created:
    "Records created by successful changes: all time, and in the last 7 days by their creation stamp. Events count only those " +
    "added by accounts that weren't left out. Held replies (tickets a seller held for one public request) are counted apart from " +
    "public listings. Units are tickets listed.",
  quantities:
    "As of the report's time: the stock as it stands, on the listings and items of the accounts that weren't left out. A left-out " +
    "account's hold or handover on one takes real stock, so it counts here as reserved, completed, on hold or sold (as visitors " +
    "see it), and in none of the activity figures; scope.stockHeldByLeftOutAccounts says how much. " +
    "Tickets (public listings): listedUnits = availableNow + reservedNow + completed + unsoldNotOpen. " +
    "availableNow: what anyone signed in could take now (the number Available and signed-out visitors see). reservedNow: held for " +
    "a buyer from the reservation until the buyer confirms receipt (unpaid, paid, payment confirmed or sent). completed: handed " +
    "over (the buyer confirmed receipt). unsoldNotOpen: listed but neither sold, reserved nor open to take now (withdrawn, paused " +
    "by the seller, the train left, the event started or its transfer window closed); pausedUnits is the part a seller's pause " +
    "keeps off sale now, on pausedListings listings. Items: available, on hold, sold (pickup confirmed), withdrawn, pickup window " +
    "over (the item's last day passed: its pickup-by date, or its listing's expiry where the seller chose no pickup deadline), paused " +
    "by the seller; notOpenOther is anything else not on sale now. Public requests: live (open, before the deadline, on an " +
    "event that still takes requests: what Wanted shows) with the units still wanted (a partial transfer lowers a request's " +
    "quantity), open past the deadline, open on an event that no longer takes requests, fulfilled, cancelled or closed without a " +
    "reason. Alerts: counts only, never per event.",
  ticketExchanges:
    "One exchange is one ticket request: one buyer, one listing, one or more units (units = tickets). requests counts them all: " +
    "the legacy offers, takes (\"I'll take it\") and held replies, made before invite to pay, plus the new-flow records in funnel " +
    "(its requestsToBuy and invitations.fromPublicRequest). offers, takes and heldReplies are legacy figures: they count legacy " +
    "records only. reservations: requests that reached a reservation (a legacy take or accepted offer, counter or held reply, or " +
    "a new-flow hold, when the invited buyer reserved it). completed: the buyer confirmed receipt after the seller confirmed the " +
    "payment. inProgress: reserved now, not completed. endedWithoutCompletion: reserved, then cancelled, released or expired. " +
    "neverReserved: offers, held replies, requests to buy and invitations that never became a reservation: still open, or ended " +
    "(declined, withdrawn or expired). payment: the two payment steps, each counted once " +
    "whatever came after: buyerReported, the buyer tapped \"I've sent payment\"; sellerConfirmed, the seller tapped \"Payment " +
    "received\". Both are what people said in Handoff, which can't see payments: never a verified payment.",
  funnel:
    "Invite to pay, for new-flow ticket records only (legacy records are in ticketExchanges' offers, takes and heldReplies, never " +
    "here). Each stage counts a record once, when it reached that stage, whatever came after, and no stage is inferred from " +
    "another. requestsToBuy: interest, a buyer asked the seller to invite them (units: what they asked for). invitations: the " +
    "seller invited a buyer to pay: fromRequest answers a request to buy, fromPublicRequest goes to a public request's owner " +
    "from one of the seller's listings (units: what was invited, which may be fewer than were asked for). holds: the invited " +
    "buyer reserved it, for at most 15 minutes. buyerReported: the buyer tapped \"I've sent payment\". sellerConfirmed: the " +
    "seller tapped \"Payment received\". completed: the buyer confirmed receipt. A request to buy or an invitation holds " +
    "nothing: neither is a hold, a payment or a sale, and only completed counts as a completed exchange and as exchange value. " +
    "The payment stages are what people said in Handoff, never a verified payment.",
  goodsExchanges:
    "One exchange is one goods request for one item. holds: requests the seller accepted. completed: the buyer confirmed pickup " +
    "(the item is sold). onHoldNow: held now. holdsEndedWithoutPickup: cancelled by the buyer, released by the seller or expired " +
    "after the hold. neverHeld: requests and offers never accepted: still open (pending or waiting as a backup), or ended.",
  cancellationsExpirationsDisputes:
    "Each ending by who or what ended it. Expirations are evaluated at the report's time, as the app's views do; " +
    "notYetRecordedBySweep counts those the server hasn't stored yet (the report never stores them). Public requests don't " +
    "expire as records: they stay open past their deadline. paymentNotArrived: paid reservations where the seller said " +
    "\"Payment hasn't arrived\", by outcome. problemReports: \"There's a problem\" reports, by the engine's fixed reasons; a match " +
    "holds one report at a time. Handoff doesn't review them in the pilot. closures: the listings and items sellers closed " +
    "(listingsWithdrawn and itemsWithdrawn), by the optional reason they gave (sold elsewhere, no longer selling, or none, which " +
    "includes everything closed before reasons existed). A closure is never a sale: \"sold elsewhere\" records nothing sold in " +
    "Handoff, and no closure counts as a completed exchange or exchange value. With invite to pay, the ticket offers and replies " +
    "withdrawn, declined or expired include requests to buy and invitations that ended before a reservation. A late-payment " +
    "report (\"I paid, but the reservation ended\") is a problem report on an ended reservation: it changes no stock and no " +
    "other figure.",
  timing:
    "Minutes between stored timestamps (the database clock at each change): median, minimum and maximum over the records that " +
    "reached the step. without: records that haven't (yet, or ever), which the figures leave out. Ticket listings: to the first " +
    "offer, request to buy or reservation (first interest; a seller's own invitation to a public request's owner isn't a buyer's " +
    "interest), the first reserved request, the first completed exchange. Reservation to completion: " +
    "per completed exchange. Items: to the first request, the first hold, the sale (pickup confirmed). Public requests: to the " +
    "first \"I have this\" share, held reply or invitation to pay from a seller.",
  supplyAndDemand:
    "As of the report's time. Supply: units anyone signed in could take now (public listings on events open to transfers) and " +
    "items on sale. Outstanding demand: live public requests: how many, distinct requesters, units still wanted. These are the " +
    "counts the public guest view shows for the listings, items and requests of the accounts that weren't left out (a left-out " +
    "account's hold on one of them takes it off sale here too). Events are named by id, kind, category and start date only; " +
    "an event added without a category is counted as \"(unspecified)\", and so is an item posted without one. Private alerts are never included.",
  exchangeValue:
    "User-confirmed exchange value, not verified payments. Tickets: agreed unit price (plus any top-up) × units for completed " +
    "exchanges, where the seller confirmed the payment arrived and the buyer confirmed receipt. Goods: the agreed price of items " +
    "whose pickup the buyer confirmed (Handoff doesn't record goods payments). Payments happen outside Handoff and aren't checked.",
  recentActivity:
    "The live world's actions log over the last 7 days, which it always holds in full (pruning only deletes older rows): changes " +
    "the server accepted and changes the rules refused, by type, and the accounts with at least one accepted change. Refused " +
    "changes are counted only here, never as activity. A retry writes nothing; invalid, busy, failed or oversized changes aren't " +
    "logged. systemSweeps: the server's expiry sweeps.",
  integrity:
    "storedDocumentIssues: invariant violations in the stored live document (the store refuses new ones, so this should be 0). " +
    "recordsNotEvaluated: records whose event, listing, item or request is missing, left out of every figure.",
});

const COVERAGE: readonly string[] = Object.freeze([
  "Scope: the live world (the shared market) only. Test worlds and throwaway test schemas are never read.",
  "All-time figures come from the live world's shared document, which keeps every record a successful change created (nothing is deleted from it; archiving isn't built), so they cover all activity since its first write.",
  "The document keeps each record's current state and key timestamps, not every step: an edited or partly fulfilled public request keeps only its latest values, alert edits and pauses keep no history, and a match holds one problem report at a time.",
  "Seller edits and pauses of listings and items: only what is paused now is counted. An edit, or a pause since resumed, leaves only a line in the record's history, which the report doesn't read; reservations and offers keep the price they were made at, so exchange value is unaffected by edits.",
  "Cancellations, declines, releases and expiries have no time of their own, so they're counted but never timed.",
  "Expiry is evaluated at the report's time without storing it, so figures can include expiries the server hasn't recorded yet (notYetRecordedBySweep).",
  "Refused changes: the last 7 days only (the actions log keeps 7 days). Retries write nothing, so they can't be counted.",
  "Known TEST and Local Developer accounts are identified from public.users when the connection may read it; testing with any other account can't be told apart from real use. Their records are left out of every activity figure, but their holds and handovers on other accounts' listings and items stay in the stock now, since that stock is really gone.",
  "Profiles (handoff.people) exist for every account that has changed something in Handoff, in any world, including test and development accounts, so they're never used as participants.",
  "Money is what the two people confirmed in Handoff, not verified payments.",
  "Past states (such as stock on a given day) can't be rebuilt beyond the timestamps; daily snapshots cover at most 7 days and aren't used.",
  "Notifications are counted only; read ones are deleted after 90 days.",
]);

const NOT_TRACKED: readonly string[] = Object.freeze([
  "Visits, page views and unique visitors",
  "Signed-out (guest) browsing",
  "Searches, filters and category choices",
  "Conversion funnels from views or visits (only recorded steps can be followed: request, invitation, reservation, the two payment steps, completion)",
  "Opens of event, listing, item and request pages, and of shared links",
  "Sign-ins, sessions, devices, browsers and locations",
  "Notification clicks (only whether a notification was marked read)",
  "Retries (a retried change is answered from its first outcome and writes nothing)",
  "Changes that failed validation, timed out, failed or would have passed the size limit",
  "Refused changes older than 7 days",
  "Listing and item edits, and pauses since resumed, as countable events (only a line of free-text history is kept)",
  "Payments, payment amounts and ticket delivery themselves (they happen outside Handoff)",
  "Time on page, abandoned forms and drafts kept in browsers",
]);

// ── Small helpers ────────────────────────────────────────────────────────────────────────

function list<T>(doc: LiveWorld, key: string): T[] {
  const v = (doc as unknown as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** A listing's or item's pause stamp (live: pausedAt, set by a seller's pause and removed when they resume), whatever its declared type. */
function pausedAt(x: object): unknown {
  return (x as { pausedAt?: unknown }).pausedAt;
}

function num(v: unknown): number {
  return isNum(v) ? v : 0;
}

function sumOf(xs: readonly number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

function cents(x: number): number {
  return Math.round(x * 100) / 100;
}

function units(): Units {
  return { exchanges: 0, units: 0 };
}

function add(u: Units, qty: number): void {
  u.exchanges += 1;
  u.units += qty;
}

function tally(keys: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const a = m.get(k);
    if (a) a.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** An event's category as the report names it: one of the engine's, "(unspecified)" for an event added without one (simplification
 *  batch: honest, never guessed), or "(other)" for anything else. */
function categoryOf(ev: EngineEvent | undefined): string {
  if (ev && ev.cat === "") return "(unspecified)";
  return ev && EVENT_CATEGORIES.has(ev.cat) ? ev.cat : "(other)";
}

/** Minutes, one decimal. */
function minutes(ms: number): number {
  return Math.round(ms / (MINUTE_MS / 10)) / 10;
}

function duration(values: readonly (number | null)[]): Duration {
  const xs = values.filter(isNum).sort((a, b) => a - b);
  if (xs.length === 0) return { n: 0, medianMinutes: null, minMinutes: null, maxMinutes: null };
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 === 1 ? must(xs[mid]) : (must(xs[mid - 1]) + must(xs[mid])) / 2;
  return { n: xs.length, medianMinutes: minutes(median), minMinutes: minutes(must(xs[0])), maxMinutes: minutes(must(xs[xs.length - 1])) };
}

function waited(values: readonly (number | null)[]): Waited {
  const d = duration(values);
  return { ...d, without: values.length - d.n };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("Handoff report: a record it checked is missing.");
  return v;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
