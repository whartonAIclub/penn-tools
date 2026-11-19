// Types for Handoff's server side: the store (store.ts), the projection and the page
// folder's server actions. The engine (engine/index.js) is plain JavaScript; these types
// describe only what TypeScript reads or builds.
//
// A View is built on the server from allowlists (who sees which field: C-CONTRACT.md §2),
// never by copying a stored record and deleting fields. A field that isn't declared here is
// a field the server never sends. Fields marked optional are absent when unset, as in the
// prototype's records, so the UI's existing checks keep working.

import type { PhotoRef } from "./photo.js";

/** "live" is the shared market; "test-…" worlds exist only for development checks and tests. */
export type WorldId = "live" | `test-${string}`;

/** The signed-in user. Always from the session (getCurrentUser), never from the request. */
export interface Actor {
  id: string;
  name: string | null;
  email: string | null;
}

/** Why Handoff's data can't be used: no DATABASE_URL, the role/schema/tables missing, or the database down. */
export type SetupErrorKind = "no-database" | "not-set-up" | "down";

// ── Payment methods (follow-on B1; C-CONTRACT §1, §2) ───────────────────────────────────

/**
 * How a seller is paid outside Handoff. "other" is a handle saved before B1 (asked for as "Venmo or PayPal"): read word for word,
 * never given a provider's name, never saved again. Handoff checks the format only; it never processes or verifies a payment.
 */
export type PayKind = "venmo" | "zelle" | "paypal" | "other";
/**
 * A method as stored and sent, normalized by the engine's checkPayMethods: Venmo "ann-lee" (no "@"), Zelle "ann@upenn.edu" or
 * "+12155550142", PayPal as typed; "other" a legacy handle as it was saved. The engine's formatPayMethod gives what people read.
 */
export interface PayMethod {
  kind: PayKind;
  value: string;
}
/** A method as the page sends it to saveMyProfile: the kinds a person can save. */
export interface PayMethodInput {
  kind: "venmo" | "zelle" | "paypal";
  value: string;
}

/**
 * Follow-on B2: why a seller closed a listing or an item (withdraw, withdrawItem with `reason`): optional, seen only by the seller, and
 * never a sale ("Sold elsewhere" records nothing sold in Handoff). The engine's CLOSE_REASONS names them.
 */
export type CloseReason = "soldElsewhere" | "noLongerSelling";

// ── Rows the store reads ─────────────────────────────────────────────────────────────────

/** A row of handoff.people: the account's name and email (saved by its first change, refreshed by each one after) and how they're paid. */
export interface PersonRow {
  userId: string;
  /** The account's full name ("Classmate" when the account has none). */
  name: string;
  /** The account's email. Null on writes: the engine never sees emails. */
  email: string | null;
  /** The handle saved before B1 ("" when unset; emptied once methods are saved). Read as one "other" method in payMethods. */
  payHandle: string;
  /**
   * 0-2 methods, the first preferred (follow-on B1): pay_methods, or when none are saved a non-empty pay_handle as one method of
   * kind "other", word for word, or none. Never prefilled from the account's email.
   */
  payMethods: PayMethod[];
}

/** Where a notification leads, as the engine writes it: { name: "event", id }, { name: "activity", tab }, … */
export interface NotificationLink {
  name: string;
  id?: string;
  tab?: string;
  listing?: string;
}

/** A notification as its recipient receives it (their own only, the newest 100). */
export interface ViewNotification {
  id: string;
  userId: string;
  text: string;
  link: NotificationLink | null;
  /** When it was written, in ms since the epoch. */
  at: number;
  read: boolean;
}

/** The store reads notifications in the shape the view sends. */
export type NotificationRow = ViewNotification;

// ── Records in a view ────────────────────────────────────────────────────────────────────

/** One line of a record's history, written by the engine. */
export interface HistoryEntry {
  at: number;
  text: string;
}

/** "There's a problem" on a request or goods request: the reporter and the other party only. */
export interface ProblemReport {
  by: string;
  role: "buyer" | "seller";
  reason: string;
  at: number;
  resolvedAt?: number;
}

/** Each side's consent to share contact details. */
export interface Consent {
  buyer?: boolean;
  seller?: boolean;
}

export interface EventTier {
  /** "t1" to "t3" for events users add. */
  id: string;
  label: string;
  /** The face value; null (forms round 2) on an event's or a train's one implicit ticket type added without one: no price cap. */
  price: number | null;
  /** Where the price came from, e.g. "entered by Langston". */
  src: string;
}

export interface EventSource {
  text: string;
  url?: string;
}

export interface EventTag {
  label: string;
  tone: string;
  icon: string;
  line: string;
  restricted?: boolean;
}

/** An event, train or trek: the engine's normalizeEvent output (C-DESIGN §7.3), which every page reads. */
export interface ViewEvent {
  id: string;
  kind: "event" | "train" | "trek";
  title: string;
  club: string;
  cat: string;
  /** New York wall time, "YYYY-MM-DDTHH:MM". */
  start: string;
  end?: string;
  openUntil?: string;
  rangePrefix?: string;
  venue: string;
  attend: "all" | "members";
  tiers: EventTier[];
  perPerson: number;
  /** The transfer cutoff (New York wall time), or null. */
  deadline: string | null;
  namesChecked?: boolean;
  methods?: string[];
  noOrganizer?: boolean;
  paperTicket?: boolean;
  tag?: EventTag;
  officialUrl?: string;
  policy: string;
  basePolicy: string;
  policyChanged: boolean;
  soldOut: boolean;
  policyNote: string;
  blurb: string;
  path: string;
  payment: string;
  sources: EventSource[];
  statusNote: string;
  sourcesNote: string;
  interestSeed: number;
  cap: number | null;
  userAdded: true;
  createdAt: number;
  /** The id of the person who added it, shown as "Added by <First L.>". */
  addedBy: string;
  /** What the person who added it wrote (blurb shows it as "From <First L.>: …"); the browser re-normalizes events from it. */
  notes?: string;
  /** Set by removeEvent. A removed event is sent only while a record in the view still refers to it. */
  removedAt?: number;
  /** The stored record isn't a quick event, so the server refuses actions on it ("This kind of event isn't available in the pilot."). */
  unsupported?: true;
  /**
   * The creator only: true while no listing or public request refers to the event (removeEvent's rule: records that were
   * public when made). Private alerts and self-reported tickets never change it; removing the event turns those alerts off
   * and tells their owners.
   */
  canRemove?: boolean;
}

/** A holding: sent to its owner only. */
export interface Holding {
  id: string;
  userId: string;
  eventId: string;
  tier: string | null;
  qty: number;
  paid: number | null;
  paidAdj?: number;
  /** "self-reported" or "transferred" in live. */
  source: string;
}

/** A listing's counts, computed on the server with every request, so viewers see counts but never who holds what. */
export interface ListingNumbers {
  reserved: number;
  completed: number;
  available: number;
}

/** Written once for listings on events with a no-show rule (none in live). Times in ms, as the engine writes them. */
export interface ListingRecord {
  listedAt: number;
  eventStart: number;
  hoursBefore: number;
  meets24: boolean;
  qty: number;
  ask: number;
}

export interface ViewListing {
  id: string;
  eventId: string;
  sellerId: string;
  listed: number;
  ask: number;
  paid: number | null;
  tier: string | null;
  method?: string;
  namesChecked?: boolean;
  membersOnly?: boolean;
  /** §9q item 5: the club a members-only ticket is for, named by its seller when the event names none. */
  memberClub?: string;
  restricted?: boolean;
  /** §9v item 4 (SELL5-M2): a club its seller named for an event that names none (informational: it restricts nothing). */
  club?: string;
  /** §9v item 5 (SELL5-M2): the seller's own short restriction, read before anyone asks to buy. */
  restriction?: string;
  obo: boolean;
  minOffer?: number;
  departsAt?: string;
  note: string;
  createdAt: number;
  withdrawnAt?: number;
  /**
   * Its seller paused it (pauseListing) at this time, for everyone: while paused, numbers.available is 0 and nothing new can be
   * reserved or offered; what was already agreed goes on. Absent once resumed. The engine's listingState (key "sellerPaused") and
   * listingPaused say whether the pause is what keeps it off sale: it can stay on a listing that has since ended.
   */
  pausedAt?: number;
  numbers: ListingNumbers;
  /**
   * The earliest moment `numbers` change without any action, among the times this viewer may know, or null: the listing's
   * train leaving, and holds lapsing on requests the viewer is a party to. Never another person's hold.
   */
  numbersUntil: number | null;
  /** The source of the seller's holding, for "Seller says they have it · not verified". */
  source: string;
  /**
   * A held reply: the request it answers. Held replies go to the seller and that requester only, and carry this field, so
   * the browser never counts them as public listings (publicListingsFor).
   */
  isoReplyFor?: string;
  /**
   * A handle stored with the listing (a legacy listing, posted with a typed handle before B1's page): the seller, and a buyer whose
   * request on it is accepted or later and has no copy of its own (`pay`: reserved before B1). Since protocol 2 no new listing has one.
   */
  payHandle?: string;
  /**
   * Follow-on B1: the kinds of payment a buyer would use, before committing: the seller's saved methods' kinds, or ["other"] for a
   * listing paid through its own handle. Every signed-in viewer; absent when there are none; never in the guest view.
   */
  payKinds?: PayKind[];
  /** Follow-on B2: why the seller closed it ("Close listing"), when they gave a reason. The seller only; closing is never a sale. */
  closeReason?: CloseReason;
  /** The seller only. */
  history?: HistoryEntry[];
  holdingId?: string;
  record?: ListingRecord;
}

export type QuickStatus =
  | "pending"
  | "countered"
  | "proposed"
  /** Follow-on B5 (invite to pay): a request to buy, then the seller's invitation. Neither holds stock or shows where to pay. */
  | "requested"
  | "invited"
  | "accepted"
  | "paid"
  | "confirmed"
  | "sent"
  | "completed"
  | "declined"
  | "cancelled"
  | "released"
  | "expired";

/** A ticket request: sent to its buyer and to the listing's seller only (others see only `numbers`). */
export interface TicketRequest {
  id: string;
  listingId: string;
  eventId: string;
  buyerId: string;
  qty: number;
  topUp: number;
  price: number;
  isOffer?: boolean;
  departsAt?: string;
  msg: string;
  status: QuickStatus;
  createdAt: number;
  flow: "quick";
  consent: Consent;
  reports: { seller?: number; buyer?: number };
  history: HistoryEntry[];
  reason?: string;
  problem?: ProblemReport;
  expiresAt?: number;
  acceptedAt?: number;
  holdUntil?: number;
  memberConfirmed?: boolean;
  isoReply?: boolean;
  isCounter?: boolean;
  counterPrice?: number;
  counteredAt?: number;
  paidAt?: number;
  paymentConfirmedAt?: number;
  deliveredAt?: number;
  completedAt?: number;
  restoredAt?: number;
  /** Live (C-DESIGN §8.3): the seller said the payment hasn't arrived, and when they may release it. */
  payDisputedAt?: number;
  releaseAfter?: number;
  /**
   * Follow-on B1: where to pay, as copied when it was reserved (the seller's methods then, or a legacy listing's handle as "other"),
   * never rewritten. Both parties, only while it's reserved, paid, confirmed, sent or completed. Absent on exchanges reserved before B1
   * (their listing's payHandle applies) and before or after a reservation that ended unpaid.
   */
  pay?: PayMethod[];
  /** Follow-on B1: the method the buyer says they paid with (markPaid's via), one of `pay`'s kinds. Both parties. */
  paidVia?: PayKind;
  /**
   * Follow-on B5 (FOLLOWON-PLAN §2.5, §2.7): the record follows invite to pay: `requested` → `invited` → `accepted` (reserve's hold of
   * at most 15 minutes) → today's steps. Absent on every record made under the earlier rules, which keep them.
   */
  inviteFlow?: true;
  /** B5: when the seller invited the buyer to pay. */
  invitedAt?: number;
  /** B5: the public request (interest id) the seller's invitation answers. */
  fromIso?: string;
  /** B5: how many the buyer asked for, when the invitation confirms fewer. */
  wantedQty?: number;
  /** B5: since when another buyer holds units this invitation needs; cleared when they come back. */
  blockedAt?: number;
}

/** A public request (kind "iso") or a private alert (kind "alert", its owner only). */
export interface Interest {
  id: string;
  userId: string;
  eventId: string | null;
  kind: "iso" | "alert";
  qty: number;
  budget: number | null;
  note: string;
  /** "YYYY-MM-DD", meaning 23:59 that day in New York, or null. */
  expires: string | null;
  status: "open" | "closed";
  createdAt: number;
  updatedAt?: number;
  goods?: { title: string; cat: string };
  /** The owner only. */
  closedAt?: number;
  closedReason?: "fulfilled" | "cancelled";
  /** Alerts (the owner only): the private price cap (null: any price), and whether it's paused. */
  max?: number | null;
  paused?: boolean;
}

/** An "I have this" share: the seller and the requester only. It holds nothing. */
export interface Share {
  id: string;
  isoId: string;
  listingId?: string;
  itemId?: string;
  sellerId: string;
  createdAt: number;
  status: "open" | "withdrawn";
  partial: boolean;
  withdrawnAt?: number;
}

export interface ItemState {
  /** "sellerPaused": its seller paused it and nobody holds it (a hold agreed before the pause reads "reserved" while it lasts). */
  key: "sold" | "withdrawn" | "closed" | "reserved" | "sellerPaused" | "available";
  label: string;
  tone: string;
}

export interface ViewItem {
  id: string;
  sellerId: string;
  title: string;
  /** §9q item 6: its category, condition and pickup area are there only where its seller stated them; nothing is guessed. */
  cat?: string;
  cond?: string;
  price: number;
  obo: boolean;
  minOffer?: number;
  area?: string;
  /** "YYYY-MM-DD": the item's last day, open through the end of it in New York. A pickup-by date its seller chose, unless noPickupBy. */
  until: string;
  /** §9q item 6: its seller chose no pickup deadline: `until` is only when the listing expires, and is never worded "pickup by". */
  noPickupBy?: true;
  note: string;
  /**
   * §9s item 6: the item's photo, while the item hasn't ended (not sold, closed or past its last day): its version and size in pixels.
   * The image itself is served at /tools/handoff/photo/<item id>?v=<v>, to whoever this view shows the item to. Never bytes.
   */
  pic?: PhotoRef;
  createdAt: number;
  soldAt?: number;
  withdrawnAt?: number;
  /**
   * Its seller paused it (pauseItem) at this time, for everyone: nobody can request it and no request can be accepted until it's
   * resumed; a hold already agreed goes on. Absent once resumed. The engine's itemPaused says whether it's still open.
   */
  pausedAt?: number;
  /** Computed on the server (itemState), so viewers never see who has it on hold. */
  state: ItemState;
  /**
   * The earliest moment `state` changes without any action, among the times this viewer may know, or null: the pickup window
   * closing, and the hold lapsing for the hold's two parties only (it follows the pickup time they agreed).
   */
  stateUntil: number | null;
  /** Follow-on B2: why the seller closed it ("Close item"), when they gave a reason. The seller only; closing is never a sale. */
  closeReason?: CloseReason;
  /** The seller only. */
  history?: HistoryEntry[];
}

export type GoodsStatus = "pending" | "waiting" | "accepted" | "completed" | "declined" | "cancelled" | "released" | "expired";

/** A request for an item: sent to its buyer and to the item's seller only. */
export interface GoodsRequest {
  id: string;
  itemId: string;
  buyerId: string;
  price: number;
  isOffer?: boolean;
  msg: string;
  status: GoodsStatus;
  createdAt: number;
  consent: Consent;
  history: HistoryEntry[];
  acceptedAt?: number;
  holdUntil?: number;
  pickupAt?: string;
  restoredAt?: number;
  completedAt?: number;
  reason?: string;
  problem?: ProblemReport;
}

/** A person as a view shows them. Every live person has demo: true, which turns off the preview's simulate branches. */
export interface ViewPerson {
  /** "First L." on public surfaces; the full name for yourself and for counterparties. */
  name: string;
  first: string;
  color: string;
  demo: true;
  /** Email: yourself, and a counterparty in the reveal states (C-CONTRACT §2). */
  contact?: string;
  // No payment details: yourself, View.viewer.payMethods; a counterparty, only the exchange's own copy (TicketRequest.pay).
}

/** One step of a `seq` action, as reported back to the actor. */
export interface SeqStep {
  type: string;
  ok: boolean;
  error?: string;
  toast?: string;
  id?: string;
}

/**
 * §9x item 1 (SELL6-N1): a public request that was open for everyone to see and has since ended: closed by its owner, fulfilled, or
 * past its deadline. Only that it ended and what it was for, so its link says "This request is closed" instead of "not found":
 * never who asked, how many, their budget or note, when it ended or why. A private alert never has one (nobody but its owner
 * could ever see it), and neither does a request that ended more than 14 days ago (project.ts OTHERS_FINAL_DAYS).
 */
export interface ClosedRequest {
  id: string;
  /** The event it was for; null for an item, or when the event was removed. */
  eventId: string | null;
}

/** Everything one viewer may see of a world, in the prototype's state shape (v: 11) plus the live envelope. */
export interface View {
  protocol: number;
  mode: "live";
  worldId: WorldId;
  version: number;
  /** The server's clock when the view was built (ms); the browser's clock skew comes from it. */
  serverNow: number;
  /**
   * When something in this view changes without any action (ms), as far as this viewer may know, or null. The client refreshes
   * just after, sending it back with the version: the refresh then brings the whole view.
   */
  nextRefreshAt: number | null;
  /** Every unread notification the viewer has in this world. It can exceed the 100 sent, so the bell's count stays right. */
  unreadCount: number;
  /** The owner only. `payMethods` (follow-on B1): their 0-2 methods, the first preferred, a handle saved before B1 as one "other". */
  viewer: { id: string; name: string; email: string | null; payMethods: PayMethod[] };
  v: 11;
  events: ViewEvent[];
  people: Record<string, ViewPerson>;
  holdings: Holding[];
  listings: ViewListing[];
  requests: TicketRequest[];
  interests: Interest[];
  /** §9x item 1: the public requests that ended and aren't in `interests` any more (ClosedRequest), so a link to one says it's closed. */
  closedRequests: ClosedRequest[];
  responses: Share[];
  goods: ViewItem[];
  goodsReqs: GoodsRequest[];
  notifications: ViewNotification[];
  strikes: Record<string, never>;
  policies: Record<string, never>;
  alertPrefs: Record<string, never>;
  seen: Record<string, never>;
  feedSeen: Record<string, never>;
  suggestions: never[];
  feedbackGiven: false;
  clockOffset: 0;
  tick: 0;
}

// ── Outcomes ─────────────────────────────────────────────────────────────────────────────

/**
 * What an action returns. "refused" is the rules saying no against current data (with a fresh view, so a stale
 * screen corrects itself); "invalid" is a payload the server can't accept; "busy" is a lock or query timeout;
 * "internal" is an exception or a newly broken invariant, rolled back; "full" would grow the shared document past
 * its size limit; "unavailable" means the database can't be used (see SetupErrorKind).
 */
export type ActOutcome =
  | { ok: true; replay: boolean; toast: string | null; resultId: string | null; steps?: SeqStep[]; view: View }
  | { ok: false; code: "refused"; error: string; replay: boolean; steps?: SeqStep[]; view: View }
  | { ok: false; code: "invalid" | "busy" | "internal" | "full"; error: string; view?: View }
  | { ok: false; code: "unavailable"; reason: SetupErrorKind; error: string };

/** What a refresh returns: nothing new since `version`, or a new view. */
export type RefreshOutcome = { unchanged: true; version: number } | { unchanged: false; view: View };

// ── The guest view: what a signed-out visitor sees (C-CONTRACT.md §7) ───────────────────
//
// Built on the server from its own allowlists (project.ts's projectGuest), never from a View with fields taken out, and
// never for a made-up user: it has no viewer and no people. It holds only published facts of the market: events, the
// listings and items anyone signed in could take right now with what's left, and live public requests without who asked.
// Nobody's name, id, email or payment handle; no request, goods request, share, holding, alert, notification or history;
// nothing typed with a listing, item or request beyond an item's or a requested item's title; only published times.

/** A ticket type: its name and face value (never who entered them). */
export interface GuestTier {
  id: string;
  label: string;
  /** null: no face value given (forms round 2). */
  price: number | null;
}

/**
 * An event's published facts. Never who added it, nor the venue, official link or notes they typed, which can hold an address
 * or a contact. (The browser's normalizeEvent fills the rest, and reads "A classmate" for the person who added it.)
 */
export interface GuestEvent {
  id: string;
  kind: "event" | "train" | "trek";
  title: string;
  /** Who runs it: the club or organizer, as named when it was added. */
  club: string;
  cat: string;
  /** New York wall time, "YYYY-MM-DDTHH:MM". */
  start: string;
  end?: string;
  /** Trains: when the tickets stop being valid. */
  openUntil?: string;
  attend: "all" | "members";
  tiers: GuestTier[];
  perPerson: number;
  /** The transfer cutoff (New York wall time), or null. */
  deadline: string | null;
  namesChecked?: true;
  paperTicket?: true;
  /** The server refuses actions on it ("This kind of event isn't available in the pilot."). */
  unsupported?: true;
}

/**
 * A listing anyone signed in could take from right now: public (not a reply held for one request), not withdrawn, on an event
 * open to transfers, with at least one left. Never the seller, how many are held or sold, or anything typed with it.
 */
export interface GuestListing {
  id: string;
  eventId: string;
  tier: string | null;
  ask: number;
  /** The seller takes offers ("or best offer"). */
  obo: boolean;
  /** How many anyone could take now: the same number every signed-in viewer's numbers.available gives. Always at least 1. */
  available: number;
  membersOnly?: true;
  /** §9q item 5: the club a members-only ticket is for, named by its seller when the event names none (shown before anyone asks). */
  memberClub?: string;
  /** The seller flagged a transfer restriction (buyer's risk). */
  restricted?: true;
  /** §9v item 4 (SELL5-M2): a club its seller named for an event that names none (a club's name, as public as memberClub). */
  club?: string;
  /** §9v item 5 (SELL5-M2): the organizer must change the name on the ticket (the seller's choice; the event's own rule is the event's). */
  namesChecked?: true;
  /**
   * §9x item 1 (SELL6-N1): its seller's own restriction, in their words: one short line (3 to 80 characters) they published as a
   * term of the listing, so a visitor reads every eligibility and transfer restriction before signing in. Never the seller's
   * note, which stays out of a guest view.
   */
  restriction?: string;
  /**
   * §9v item 5 (SELL5-M2), since §9x only instead of `restriction`: its seller noted a restriction whose words look like contact
   * or payment details (an address, a link, a phone number, a payment app), which a guest view never carries. The visitor reads
   * that one was noted, and its words once signed in.
   */
  restrictionNoted?: true;
  /** A train ticket's departure (New York wall time); the listing closes when the train leaves. */
  departsAt?: string;
  createdAt: number;
}

/** An item on sale right now (not sold, withdrawn, on hold or past its pickup window). Never the seller, pickup area or note. */
export interface GuestItem {
  id: string;
  title: string;
  /** §9q item 6: only where its seller stated them. */
  cat?: string;
  cond?: string;
  price: number;
  obo: boolean;
  /** "YYYY-MM-DD": the item's last day, open through the end of it in New York. A pickup-by date its seller chose, unless noPickupBy. */
  until: string;
  /** §9q item 6: `until` is only when the listing expires. */
  noPickupBy?: true;
  /** §9s item 6: the item's photo (its version and size in pixels), as public as the item: every item here is available now. */
  pic?: PhotoRef;
  createdAt: number;
}

/** A live public request, anonymized: what is wanted, how many and by when. Never who asked, their note or budget; never an alert. */
export interface GuestWanted {
  id: string;
  /** The event, or null for an item (goods). */
  eventId: string | null;
  goods?: { title: string; cat: string };
  qty: number;
  /** "YYYY-MM-DD" (23:59 that day in New York), or null. */
  expires: string | null;
  createdAt: number;
}

/** Everything a signed-out visitor may see of a world (C-CONTRACT §7). */
export interface GuestView {
  protocol: number;
  mode: "live";
  /** Always true: a signed-out visitor's view, with no viewer and nothing personal. */
  guest: true;
  viewer: null;
  worldId: WorldId;
  version: number;
  /** The server's clock when the view was built (ms). */
  serverNow: number;
  /**
   * The earliest published time at which something here stops being open with no one acting (a listing's train leaving or its
   * event's transfer window closing, an item's pickup window ending, a request's deadline), or null. Never anyone's hold.
   */
  nextRefreshAt: number | null;
  events: GuestEvent[];
  listings: GuestListing[];
  goods: GuestItem[];
  wanted: GuestWanted[];
  /** §9x item 1: the public requests that aren't open any more (ClosedRequest), so a link to one says it's closed. */
  closedWanted: ClosedRequest[];
}

/** A guest's refresh: nothing new since `version`, or a new guest view. */
export type GuestRefreshOutcome = { unchanged: true; version: number } | { unchanged: false; view: GuestView };
