// Types for Handoff's pilot metrics report (USER-INSTRUCTIONS §8 item 3): what collect.ts reads in one read-only transaction
// (PilotData, internal), and the aggregate report that aggregate.ts builds from it (PilotReport, the output).
//
// The output holds counts, sums, durations, fixed words (statuses, categories, action types, problem reasons from the engine's
// fixed lists) and event ids only: never a name, email, payment handle, account or record id other than an event's, alert
// detail, private budget or offer, message, note, title or any other text someone typed.

import type { WorldDoc } from "../engine-port.js";

/**
 * The output's format. Bump it when a field changes meaning or is removed. 2 (EPV fix, Nov 8): the stock "now" (quantities, supply
 * and demand) counts a left-out account's holds and handovers on other accounts' listings and items, as the market stands, and
 * scope.stockHeldByLeftOutAccounts says how much. 3 (follow-on Batch 2, Nov 9; FOLLOWON-PLAN §2.8): ticketExchanges.payment (the
 * buyer's "I've sent payment" apart from the seller's "Payment received") and cancellationsExpirationsDisputes.closures (closed
 * listings and items by the seller's optional reason; a closure is never a sale). 4 (follow-on Batch 5, Nov 10; FOLLOWON-PLAN §2.8):
 * funnel, the stages of invite to pay for new-flow ticket records (interest, invitations, holds, the two payment steps, completion),
 * each counted once; ticketExchanges' offers, takes and heldReplies now count legacy records only (those made before invite to pay).
 */
export const PILOT_REPORT_FORMAT = 4;

/** The only world the report reads: the shared market. Test worlds ("test-…") are counted, never read. */
export const REPORT_WORLD = "live";

// ── What collect.ts reads (internal: it holds account ids, which no output carries) ──────

/** Known test and development accounts, looked up in public.users; their records are left out before counting. */
export type KnownTestAccounts = { resolved: true; ids: readonly string[] } | { resolved: false; reason: string };

/** One row of the actions log as the report reads it: never `result` (toasts and refusals) or `ids`. */
export interface ActionRow {
  type: string;
  ok: boolean;
  actorId: string;
  /** ms since the epoch */
  at: number;
}

export interface PilotData {
  /** The time the report describes (ms): the database clock inside the transaction, or a test's. */
  now: number;
  /** What the transaction itself reported: transaction_read_only and transaction_isolation. */
  transaction: { readOnly: boolean; isolation: string };
  /** The live world's row, or null when nobody has written to it yet (then the market is empty). */
  live: { version: number; createdAt: number; updatedAt: number; nextDue: number | null; doc: WorldDoc } | null;
  /** Worlds other than "live" in the table: test worlds, never read. */
  testWorlds: number;
  /** handoff.people rows: every account that has changed something in Handoff (and not deleted its data), in any world. A count only. */
  profiles: number;
  notifications: { total: number; unread: number };
  snapshots: number;
  /** The live world's actions log: how many rows are kept, the oldest, and the rows of the last 7 days. */
  actions: { retained: number; oldestAt: number | null; recent: ActionRow[] };
  /** null: not looked up (the caller didn't ask). */
  knownTestAccounts: KnownTestAccounts | null;
}

// ── The report ───────────────────────────────────────────────────────────────────────────

/** A count over all time (the live world's whole document) and over the 7 days before the report. */
export interface Count {
  allTime: number;
  last7Days: number;
}

/** Durations between stored timestamps, in minutes (one decimal). null when there are none. */
export interface Duration {
  n: number;
  medianMinutes: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
}

/** A duration measured from a record's creation, with how many records haven't reached that step (yet, or ever). */
export interface Waited extends Duration {
  without: number;
}

export interface Units {
  exchanges: number;
  units: number;
}

/** Closed listings or items by the reason their seller gave (follow-on B2): optional, so most may have none. Never sales. */
export interface ClosedByReason {
  soldElsewhere: number;
  noLongerSelling: number;
  /** Closed without a reason, including everything closed before reasons existed. */
  noReason: number;
}

/**
 * Format 4: invite to pay (follow-on Batch 5), for new-flow ticket records only (marked inviteFlow). Each stage counts a record once,
 * when it reached that stage, whatever came after, and no stage is inferred from another: a request to buy or an invitation holds
 * nothing and is never a hold, a payment or a sale.
 */
export interface InviteFunnel {
  /** Interest: a buyer asked the seller to invite them (requestToBuy). Units are what they asked for. */
  requestsToBuy: Units;
  /** Invitations to pay the seller sent: answering a request to buy, or to the owner of a public request (from one of their listings). */
  invitations: { fromRequest: Units; fromPublicRequest: Units };
  /** Successful holds: the invited buyer reserved it (at most 15 minutes to pay). */
  holds: Units;
  /** The buyer tapped "I've sent payment". What they said in Handoff, never a verified payment. */
  buyerReported: Units;
  /** The seller tapped "Payment received". */
  sellerConfirmed: Units;
  /** The buyer confirmed receipt: the only stage that counts as a completed exchange and as exchange value. */
  completed: Units;
}

export interface EventSupplyDemand {
  eventId: string;
  kind: string;
  category: string;
  /** The event's start date, New York time ("YYYY-MM-DD"). */
  startDate: string;
  /** Open to transfers now (not started, transfer window not closed). */
  openToTransfers: boolean;
  availableUnits: number;
  openListings: number;
  openRequests: number;
  requesters: number;
  unitsWanted: number;
}

export interface CategorySupplyDemand {
  category: string;
  events: number;
  availableUnits: number;
  openListings: number;
  openRequests: number;
  requesters: number;
  unitsWanted: number;
}

export interface GoodsSupplyDemand {
  category: string;
  itemsAvailable: number;
  openRequests: number;
  requesters: number;
}

export interface PilotReport {
  report: "handoff-pilot-metrics";
  format: typeof PILOT_REPORT_FORMAT;
  /** When the report was generated: the database clock (ISO, UTC). Every "now" figure is as of this time. */
  generatedAt: string;
  window: {
    /** The live world's first write, or null when it has none. */
    from: string | null;
    to: string;
    /** The start of the "last 7 days" figures. */
    last7DaysFrom: string;
    description: string;
  };
  scope: {
    world: typeof REPORT_WORLD;
    /** false: nobody has written to the live world yet, so it's an empty market. */
    liveWorldStored: boolean;
    testWorldsNotRead: number;
    knownTestAccounts: { identified: boolean; accounts: number; how: string };
    /**
     * Records in the live world by known test or development accounts (or preview sample people), left out of every activity
     * figure. Their requests on other accounts' listings and items still count in the stock now (stockHeldByLeftOutAccounts).
     */
    recordsLeftOut: {
      total: number;
      eventsAddedBy: number;
      listings: number;
      ticketRequests: number;
      publicRequests: number;
      alerts: number;
      shares: number;
      items: number;
      goodsRequests: number;
      holdings: number;
    };
    /**
     * The part of the stock now that left-out accounts hold or were handed on other accounts' listings and items: tickets reserved
     * and completed, items on hold and sold. Included in quantities (the market as it stands, as visitors see it); never activity.
     */
    stockHeldByLeftOutAccounts: { ticketsReservedNow: number; ticketsCompleted: number; itemsOnHoldNow: number; itemsSold: number };
    /** Records naming one of the preview's sample people: never expected in the live world. Included in recordsLeftOut. */
    previewSampleRecords: number;
    separation: string;
  };
  safety: { readOnlyTransaction: boolean; isolation: string; note: string };
  sources: {
    liveDocument: {
      version: number;
      firstWriteAt: string | null;
      lastWriteAt: string | null;
      bytes: number;
      /** The most the document may hold, or null: no limit on the whole since the market is rows (review of PR #88). */
      limitBytes: number | null;
      sweepDue: boolean;
    };
    profiles: number;
    notifications: { retained: number; unread: number };
    actionsLog: { retainedRows: number; oldestRetainedAt: string | null; keepDays: number };
    snapshots: number;
  };
  participants: {
    distinct: number;
    sold: number;
    bought: number;
    boughtAndSold: number;
    postedPublicRequests: number;
    setAlerts: number;
    inCompletedExchanges: number;
  };
  created: {
    /** dateOnly: added by their date alone (closing at 11:59 PM that day); noFaceValue: no ticket type with a face value (no price cap). */
    events: Count & { removed: number; dateOnly: number; noFaceValue: number };
    ticketListings: Count & { units: number };
    heldReplies: Count & { units: number };
    items: Count;
    publicRequests: Count & { forTickets: number; forGoods: number };
    alerts: Count;
    shares: Count;
  };
  quantities: {
    asOf: string;
    tickets: {
      listings: number;
      listedUnits: number;
      availableNow: number;
      reservedNow: number;
      completed: number;
      unsoldNotOpen: number;
      /** Part of unsoldNotOpen: tickets a seller's pause keeps off sale now, on this many listings. */
      pausedUnits: number;
      pausedListings: number;
      listingsOpenNow: number;
      listingsWithdrawn: number;
    };
    heldReplies: {
      replies: number;
      units: number;
      awaitingAnswer: number;
      reservedNow: number;
      completed: number;
      closedUnsold: number;
    };
    items: {
      posted: number;
      availableNow: number;
      onHoldNow: number;
      sold: number;
      withdrawn: number;
      pickupWindowOver: number;
      /** Paused by the seller now (and not on hold, sold, withdrawn or past the pickup window). */
      pausedNow: number;
      notOpenOther: number;
    };
    publicRequests: {
      liveNow: number;
      liveUnits: number;
      openPastDeadline: number;
      openEventClosed: number;
      fulfilled: number;
      cancelled: number;
      closedOther: number;
    };
    alerts: { active: number; paused: number; closed: number };
  };
  ticketExchanges: {
    /** Every ticket request, legacy and new-flow: offers + takes + heldReplies + the funnel's requestsToBuy and invitations.fromPublicRequest. */
    requests: number;
    /** Legacy (made before invite to pay): offers a seller could accept into a 2-hour hold. */
    offers: number;
    /** Legacy: "I'll take it" reservations. */
    takes: number;
    /** Legacy: tickets a seller held for one public request. */
    heldReplies: number;
    reservations: Units;
    completed: Units;
    inProgress: Units;
    endedWithoutCompletion: Units;
    neverReserved: { total: number; open: number; ended: number };
    /**
     * Format 3: the two payment steps, each counted once whatever came after. buyerReported: the buyer tapped "I've sent payment"
     * (paidAt). sellerConfirmed: the seller tapped "Payment received" (paymentConfirmedAt). What people said in Handoff, never a
     * verified payment.
     */
    payment: { buyerReported: Units; sellerConfirmed: Units };
    last7Days: { requests: number; reservations: number; completed: number };
  };
  /** Format 4: invite to pay's stages, for new-flow ticket records (also part of ticketExchanges' totals). */
  funnel: InviteFunnel;
  goodsExchanges: {
    requests: number;
    offers: number;
    holds: number;
    completed: number;
    onHoldNow: number;
    holdsEndedWithoutPickup: number;
    neverHeld: { total: number; open: number; ended: number };
    last7Days: { requests: number; holds: number; completed: number };
  };
  cancellationsExpirationsDisputes: {
    cancellations: {
      ticketReservationsCancelledByBuyer: number;
      ticketReservationsReleasedBySeller: number;
      ticketOffersAndRepliesWithdrawnByBuyer: number;
      ticketOffersAndRepliesDeclined: number;
      goodsHoldsCancelledByBuyer: number;
      goodsHoldsReleasedBySeller: number;
      goodsRequestsCancelledByBuyer: number;
      goodsRequestsDeclined: number;
      listingsWithdrawn: number;
      itemsWithdrawn: number;
      publicRequestsCancelled: number;
      alertsRemoved: number;
      otherEndings: number;
    };
    /**
     * Format 3: the closed listings and items (cancellations' listingsWithdrawn and itemsWithdrawn) by the seller's optional reason.
     * A closure ends a listing or item; it's never a sale, a completed exchange or exchange value, whatever the reason.
     */
    closures: { listings: ClosedByReason; items: ClosedByReason };
    expirations: {
      ticketReservationsBeforePayment: number;
      ticketOffersAndReplies: number;
      goodsHolds: number;
      goodsRequests: number;
      itemsUnsoldPickupWindowOver: number;
      publicRequestsOpenPastDeadline: number;
      notYetRecordedBySweep: number;
    };
    disputes: {
      paymentNotArrived: { total: number; laterConfirmed: number; cancelledByBuyer: number; releasedBySeller: number; open: number };
      problemReports: {
        total: number;
        open: number;
        resolved: number;
        tickets: number;
        goods: number;
        byBuyer: number;
        bySeller: number;
        byReason: { reason: string; count: number }[];
      };
    };
  };
  timing: {
    ticketListingToFirstInterest: Waited;
    ticketListingToFirstReservation: Waited;
    ticketListingToFirstCompletion: Waited;
    ticketReservationToCompletion: Duration;
    itemToFirstRequest: Waited;
    itemToFirstHold: Waited;
    itemToSale: Waited;
    goodsHoldToPickup: Duration;
    publicRequestToFirstSellerResponse: Waited;
  };
  supplyAndDemand: {
    asOf: string;
    tickets: { byCategory: CategorySupplyDemand[]; byEvent: EventSupplyDemand[] };
    goods: { byCategory: GoodsSupplyDemand[] };
  };
  exchangeValue: {
    label: string;
    currency: "USD";
    tickets: { exchanges: number; units: number; amount: number };
    goods: { exchanges: number; amount: number };
    total: number;
  };
  recentActivity: {
    from: string;
    to: string;
    acceptedChanges: number;
    refusedChanges: number;
    accountsWithAcceptedChange: number;
    byType: { type: string; accepted: number; refused: number }[];
    systemSweeps: number;
    leftOut: number;
  };
  integrity: { storedDocumentIssues: number; recordsNotEvaluated: number };
  definitions: Record<string, string>;
  coverage: string[];
  notTracked: string[];
}
