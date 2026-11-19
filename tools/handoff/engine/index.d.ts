// Hand-written types for engine/index.js, which is plain JavaScript with no build step.
// Every runtime export is declared here, and src/__tests__/engine-exports.test.ts checks both directions: each
// declared name exists at runtime with the declared kind (function, number, string or object), and each runtime
// export is declared.
//
// The record types list the fields the engine reads and writes (C-domain-map.md §1.2). A field missing here may
// still exist at runtime; TypeScript code can't read it until it is added. Constants and catalogs are readonly:
// TypeScript code never changes them (the engine itself sets CLOCK and fills the catalog in applyWorld and withEngine).

export type { NyParts } from "./time.js";

// ---------------------------------------------------------------------------------------------------------------
// Basic types
// ---------------------------------------------------------------------------------------------------------------
/** Milliseconds since the epoch: stamps, deadlines and CLOCK. */
export type Ms = number;
/** A naive "YYYY-MM-DDTHH:MM" New York wall time, or a "YYYY-MM-DD" date that means 23:59 that day in New York. */
export type WallTime = string;
export type Tone = "good" | "warn" | "bad" | "muted" | "accent" | "";
export type PolicyKey = "permitted" | "approval" | "official" | "unknown";
export type Method = "file" | "app" | "name" | "inperson";
/** "transferred" is the live source; "seeded" and "transferred (simulated)" exist only in the preview. */
export type HoldingSource = "seeded" | "self-reported" | "transferred (simulated)" | "transferred";
export type RequestStatus =
  | "pending" | "waiting" | "countered" | "proposed" | "accepted" | "paid" | "confirmed" | "sent"
  | "approval" | "registration" | "completed" | "declined" | "cancelled" | "released" | "expired"
  /** Follow-on B5 (invite to pay): a request to buy, and the seller's invitation. Neither holds stock. */
  | "requested" | "invited";
export type GoodsStatus = "pending" | "waiting" | "accepted" | "completed" | "declined" | "cancelled" | "released" | "expired";
/** Follow-on B2: why a seller closed a listing or an item (withdraw, withdrawItem), when they said: optional, and theirs only. */
export type CloseReason = "soldElsewhere" | "noLongerSelling";
/** A state badge: listingState, itemState and eventSummary's state. */
export interface Badge { key: string; label: string; tone: Tone }
export interface StatusLabel { label: string; tone: Tone }

// ---------------------------------------------------------------------------------------------------------------
// Catalog: people and events
// ---------------------------------------------------------------------------------------------------------------
/**
 * A person in PEOPLE. The preview's sample people have every field. A live person has name, first, color, demo (always true)
 * and pay; in the browser, contact and pay only where the viewer's view carries them. On the server, name is the public name.
 */
export interface Person {
  name: string;
  first: string;
  color: string;
  /** Email: the preview's sample data, or a live view's counterparty in the reveal states. */
  contact?: string;
  /** Payment handle. */
  pay?: string;
  /** Live, on the server (follow-on B1): the profile's payment methods, which listings use and each reservation copies (snapPay). */
  payMethods?: readonly PayMethod[];
  status?: string;
  memberships?: readonly string[];
  /** Has an inbox (noteTo delivers only to people with demo set). Every live person has it. */
  demo?: boolean;
  tag?: string;
  role?: string;
  phone?: string;
  school?: string;
}
/**
 * A profile row, as withEngine takes it (src/types.ts's PersonRow). The engine never reads email. payMethods: as the store read them
 * (saved ones, or a legacy handle as one "other"); a row without them gets its payHandle read that way (readPayMethods).
 */
export interface EnginePersonRow { userId: string; name: string; payHandle?: string; payMethods?: readonly PayMethod[]; email?: string | null }
/** Follow-on B1: how a seller is paid outside Handoff. "other" is a handle saved before B1, read word for word and never saved again. */
export type PayKind = "venmo" | "zelle" | "paypal" | "other";
/** A payment method, normalized: Venmo "ann-lee", Zelle "ann@upenn.edu" or "+12155550142", PayPal as typed, "other" as saved. */
export interface PayMethod { kind: PayKind; value: string }
/** price: the face value; null on an event's or a train's one implicit ticket type added without one (forms round 2: no price cap). */
export interface Tier { id: string; label: string; price: number | null; src: string; memberOnly?: boolean; addOn?: boolean }
export interface PriceStep { label: string; amount: number; due: WallTime }
export interface TripPrice {
  currency: string;
  total: number;
  fee: number;
  feeNote?: string;
  note: string;
  schedule: PriceStep[];
  includes: string[];
  excludes: string[];
}
export interface TransferTag { label: string; tone: Tone; icon: string; line: string; restricted?: boolean }
export interface Source { text: string; url: string }
/** An event as every page reads it: the preview's catalog entries, or normalizeEvent's output for a live event. */
export interface EngineEvent {
  id: string;
  /** Live events: what was added. */
  kind?: EventKind;
  title: string;
  club: string;
  cat: string;
  start: WallTime;
  end?: WallTime;
  openUntil?: WallTime;
  rangePrefix?: string;
  venue: string;
  attend: "all" | "members";
  tiers?: Tier[];
  tierRule?: "members" | "topup";
  namesChecked?: boolean;
  methods?: Method[];
  perPerson?: number;
  /** Set by applyWorld from the state's policy overrides; basePolicy is the catalog's. */
  policy: PolicyKey;
  basePolicy: PolicyKey;
  policyChanged?: boolean;
  soldOut: boolean;
  notOnSale?: boolean;
  nonTransferable?: boolean;
  premium?: boolean;
  price?: TripPrice;
  eligibility?: string;
  organizerRequired?: boolean;
  noOrganizer?: boolean;
  paperTicket?: boolean;
  nonWharton?: boolean;
  tag?: TransferTag;
  policyNote?: string;
  blurb: string;
  path: string;
  payment: string;
  officialUrl?: string;
  sources?: Source[];
  ticketRules?: string[];
  statusNote?: string;
  sourcesNote?: string;
  deadline: WallTime | null;
  noShowRule?: boolean;
  interestSeed: number;
  /** null for live events. */
  cap: number | null;
  // Live events only (normalizeEvent):
  userAdded?: true;
  /** The id of the person who added it ("Added by <First L.>"). */
  addedBy?: string;
  createdAt?: Ms;
  /** Set by removeEvent: EV still has it, EVENTS doesn't. */
  removedAt?: Ms;
  /** What the person who added it wrote; blurb shows it as "From <First L.>: …". */
  notes?: string;
  /** The stored record has fields only the preview's trips and treks use, so the reducer refuses actions on it. */
  unsupported?: true;
}
export type EventKind = "event" | "train" | "trek";
/** A live event as the document stores it (createEvent's record, C-DESIGN §7.3). normalizeEvent turns it into an EngineEvent. */
export interface StoredEvent {
  id: string;
  kind: EventKind;
  title: string;
  /** Absent: an ordinary event added without its organizer (simplification batch); normalizeEvent reads it as "". */
  club?: string;
  /** Absent: an ordinary event added without a category (simplification batch: unspecified, never guessed); normalizeEvent reads it as "". */
  cat?: string;
  /** A date and time; or (forms round 2) an ordinary event's date alone, "YYYY-MM-DD", which ends at 11:59 PM that day. A train without
   *  openUntil (forms round 2) is one departure, and this is when it leaves. */
  start: WallTime;
  end?: WallTime;
  /** Trains with a validity window (older): when the tickets stop being valid. */
  openUntil?: WallTime;
  venue?: string;
  attend: "all" | "members";
  /** Ids "t1" to "t3", in order. Forms round 2: an event or a train added without ticket types has one, { id: "t1", label: "Ticket" },
   *  whose price is its face value, or null when none was given. */
  tiers: { id: string; label: string; price: number | null }[];
  perPerson: number;
  deadline: WallTime | null;
  namesChecked?: true;
  methods?: Method[];
  paperTicket?: true;
  noOrganizer?: true;
  rangePrefix?: string;
  officialUrl?: string;
  notes?: string;
  policy: "unknown";
  createdBy: string;
  createdAt: Ms;
  removedAt?: Ms;
}
export interface PolicyInfo { label: string; short: string; tone: Tone; icon: string; select: string; desc: string }
export interface ClubMenuEntry { k: string; label: string; short?: string; orgs?: string[] }

// ---------------------------------------------------------------------------------------------------------------
// State records (the v11 document)
// ---------------------------------------------------------------------------------------------------------------
export interface HistoryEntry { at: Ms; text: string }
export interface Problem { by: string; role: "buyer" | "seller"; reason: string; at: Ms; resolvedAt?: Ms; review?: "upheld" | "dismissed" }
export interface Holding {
  id: string;
  userId: string;
  eventId: string;
  /** null for trips */
  tier: string | null;
  qty: number;
  /** Unit price; null for trips. */
  paid: number | null;
  paidAdj?: number;
  source: HoldingSource;
}
export interface TicketFile { name: string; size: number; hash: string }
/** Written once when a no-show-rule event's ticket is listed. */
export interface NoShowRecord { listedAt: Ms; eventStart: Ms; hoursBefore: number; meets24: boolean; qty: number; ask: number }
export interface Listing {
  id: string;
  eventId: string;
  sellerId: string;
  holdingId: string;
  listed: number;
  ask: number;
  /** The holding's price; for trips, what the seller had paid when listing. null (forms round 2): a ticket listed without it. */
  paid: number | null;
  tier: string | null;
  viaOrganizer?: boolean;
  method?: Method;
  payHandle?: string;
  file?: TicketFile | null;
  namesChecked?: boolean;
  membersOnly?: boolean;
  /** §9q item 5: the club a members-only ticket is for, named by its seller when the event names none. */
  memberClub?: string;
  restricted?: boolean;
  /** §9v item 4 (SELL5-M2): a club its seller named for an event that names none; never written to the event. */
  club?: string;
  /** §9v item 5 (SELL5-M2): the seller's own short restriction (one line, 3 to 80 characters). */
  restriction?: string;
  obo?: boolean;
  minOffer?: number | null;
  departsAt?: WallTime;
  note: string;
  createdAt: Ms;
  history: HistoryEntry[];
  record?: NoShowRecord;
  /** A held reply: a listing for one requester (the interest id). */
  isoReplyFor?: string;
  /** §9v item 2 (SELL5-M3): the public request this listing was posted for ("I have this", answerRequest); open to everyone like any
      listing. Stored only: no view shows it. */
  forIso?: string;
  /** When its seller closed it ("Close listing", the withdraw action; or, for a held reply, when it closed). Never reopened. */
  withdrawnAt?: Ms;
  /** Live (follow-on B2): the reason its seller gave for closing it, if any; set only with withdrawnAt. The seller's view only. */
  closeReason?: CloseReason;
  /** Live: when its seller paused it (pauseListing); absent once resumed. Nothing new until then (listingNumbers' available is 0). */
  pausedAt?: Ms;
  /** A live view only: the server's counts, which listingNumbers returns in the browser (C-DESIGN §3.5). Never stored. */
  numbers?: ListingNumbers;
  /** A live view only: the seller's holding's source, which selfReported reads. Never stored. */
  source?: HoldingSource;
}
export interface TicketRequest {
  id: string;
  listingId: string;
  eventId: string;
  buyerId: string;
  qty: number;
  topUp: number;
  price: number;
  isOffer?: boolean;
  departsAt?: WallTime;
  msg: string;
  status: RequestStatus;
  createdAt: Ms;
  consent: { buyer?: boolean; seller?: boolean };
  /** When each side said it was done (stamps). */
  reports: { buyer?: Ms; seller?: Ms };
  history: HistoryEntry[];
  reason?: string;
  problem?: Problem;
  /** "quick" for the student-ticket flow; the legacy trip flows set "peer", "approval" or "direct" at acceptance. */
  flow?: "quick" | "peer" | "approval" | "direct";
  expiresAt?: Ms;
  acceptedAt?: Ms;
  holdUntil?: Ms;
  memberConfirmed?: boolean;
  isoReply?: boolean;
  isCounter?: boolean;
  counterPrice?: number;
  counteredAt?: Ms;
  paidAt?: Ms;
  paymentConfirmedAt?: Ms;
  deliveredAt?: Ms;
  completedAt?: Ms;
  restoredAt?: Ms;
  /** paymentMissing (C-DESIGN §8.3): when the seller said the money hasn't arrived, and when they may release it. */
  payDisputedAt?: Ms;
  releaseAfter?: Ms;
  /** Live (follow-on B1): where to pay, copied once as it was reserved (the seller's methods, or a legacy listing's handle as "other"). */
  pay?: PayMethod[];
  /** Live (follow-on B1): the method the buyer says they paid with (markPaid's via), one of pay's kinds. */
  paidVia?: PayKind;
  /**
   * Live (follow-on B5): this record follows invite to pay (requested, invited, then reserve's accepted and today's steps). Set when
   * it's made and never changed; a record without it keeps the rules it was made under.
   */
  inviteFlow?: true;
  /** B5: when the seller invited the buyer to pay (invite, inviteRequester). */
  invitedAt?: Ms;
  /** B5: the public request (interest id) an inviteRequester invitation answers. */
  fromIso?: string;
  /** B5: how many the buyer asked for, when the invitation confirms fewer. */
  wantedQty?: number;
  /** B5: since when fewer are available than the invitation asks for (another buyer holds them). Cleared when they come back. */
  blockedAt?: Ms;
  consentAuto?: boolean;
  acceptSimulated?: boolean;
  counterSimulated?: boolean;
  respondSimulated?: boolean;
  paidSimulated?: boolean;
  confirmSimulated?: boolean;
  sendSimulated?: boolean;
  receiptSimulated?: boolean;
}
export interface UnlistedEvent { title: string; club: string; when: string; flexible: boolean; details: string; sourceUrl: string | null }
/** A public request (kind "iso") or a private alert (kind "alert"). Older saved previews may hold another kind, which the UI treats as an alert. */
export interface Interest {
  id: string;
  userId: string;
  eventId: string | null;
  kind: "iso" | "alert";
  qty: number;
  /** Public; null means no budget given. Alerts keep it null. */
  budget: number | null;
  note: string;
  expires: WallTime | null;
  status: "open" | "closed";
  createdAt: Ms;
  updatedAt?: Ms;
  closedAt?: Ms;
  closedReason?: string;
  goods?: { title: string; cat: string };
  missing?: UnlistedEvent;
  review?: "reviewing" | "onboarding" | "duplicate" | "unsupported";
  /** An alert's private maximum; null means any price. */
  max?: number | null;
  paused?: boolean;
}
/** An "I have this" share: a listing or item a seller pointed at a request. It holds nothing. */
export interface Share {
  id: string;
  isoId: string;
  listingId?: string;
  itemId?: string;
  sellerId: string;
  createdAt: Ms;
  status: "open" | "withdrawn";
  partial: boolean;
  withdrawnAt?: Ms;
}
export interface Item {
  id: string;
  sellerId: string;
  title: string;
  /** One of GOODS_CATS. Live (§9q item 6): absent when its seller stated none; never guessed, and not "Other". */
  cat?: string;
  /** One of CONDITIONS. Live: absent when its seller stated none; never a default. */
  cond?: string;
  price: number;
  obo: boolean;
  minOffer?: number | null;
  /** An approximate pickup area. Live: absent when its seller stated none. */
  area?: string;
  /** The item's last day ("YYYY-MM-DD"): open through the end of it. A pickup-by date its seller chose, unless noPickupBy. */
  until: WallTime;
  /** Live (§9q item 6): its seller chose no pickup deadline, so `until` is only when the listing expires (14 days on by default). */
  noPickupBy?: true;
  note: string;
  photos?: string[];
  photo?: string;
  /** Live (§9s item 6): the item's one photo, kept by the server in its own table; only this reference is here. */
  pic?: PicRef;
  createdAt: Ms;
  history: HistoryEntry[];
  soldAt?: Ms;
  /** When its seller closed it ("Close item", the withdrawItem action). Never reopened. */
  withdrawnAt?: Ms;
  /** Live (follow-on B2): the reason its seller gave for closing it, if any; set only with withdrawnAt. The seller's view only. */
  closeReason?: CloseReason;
  /** Live: when its seller paused it (pauseItem); absent once resumed. Nobody can request it or have a request accepted until then. */
  pausedAt?: Ms;
  /** A live view only: the server's itemState, which itemState returns in the browser (C-DESIGN §3.5). Never stored. */
  state?: Badge;
}
export interface GoodsRequest {
  id: string;
  itemId: string;
  buyerId: string;
  price: number;
  isOffer?: boolean;
  msg: string;
  status: GoodsStatus;
  createdAt: Ms;
  consent: { buyer?: boolean; seller?: boolean };
  history: HistoryEntry[];
  acceptedAt?: Ms;
  holdUntil?: Ms;
  pickupAt?: WallTime;
  restoredAt?: Ms;
  consentAuto?: boolean;
  acceptSimulated?: boolean;
  completedAt?: Ms;
  receiptSimulated?: boolean;
  reason?: string;
  problem?: Problem;
}
export interface NoteLink { name: string; id?: string; tab?: string; listing?: string }
/**
 * Follow-on B4: noteTo's tag for a note that may also go by email to someone who turned that on (FOLLOWON-PLAN §2.4): its kind, such
 * as "offer.received", and the id of the record it's about (a request r…, goods request gr…, interest iso-… or share rsp-…). Only those
 * call sites pass one; every other note stays in the app.
 */
export interface NoteMeta { kind: string; ref: string }
export interface EngineNotification {
  id: string;
  userId: string;
  /** A finished English sentence. */
  text: string;
  link: NoteLink;
  at: Ms;
  read: boolean;
  via?: ("email" | "text")[];
  /** Follow-on B4: NoteMeta's kind, on a tagged note only (always with ref). The store's drain checks it again. */
  kind?: string;
  /** Follow-on B4: NoteMeta's ref, on a tagged note only (always with kind). */
  ref?: string;
}
export interface Suggestion {
  id: string;
  userId: string;
  title: string;
  club: string;
  when: string;
  flexible: boolean;
  sourceUrl: string | null;
  side: "offer";
  review: string;
  createdAt: Ms;
}
/** The whole state (seed() returns one; reduce returns the next). */
export interface WorldState {
  v: 11;
  clockOffset: number;
  tick: number;
  policies: Record<string, PolicyKey>;
  seen: Record<string, boolean>;
  feedbackGiven: boolean;
  suggestions: Suggestion[];
  strikes: Record<string, number>;
  alertPrefs: Record<string, { email?: boolean; text?: boolean }>;
  responses: Share[];
  feedSeen: Record<string, Ms>;
  holdings: Holding[];
  listings: Listing[];
  requests: TicketRequest[];
  interests: Interest[];
  goods: Item[];
  goodsReqs: GoodsRequest[];
  notifications: EngineNotification[];
}
/**
 * A live world's document (C-DESIGN §2.6): the state above plus its own events, with mode "live". notifications is empty at
 * rest (the store drains it into its table); strikes, policies and alertPrefs stay empty; tick and clockOffset are unused.
 */
export interface LiveWorld extends WorldState {
  mode: "live";
  format: 1;
  /** The last stamp written (stampOf): stamps stay unique and ordered across actions. */
  lastStamp: Ms;
  events: StoredEvent[];
  /**
   * Follow-on B5 (FOLLOWON-PLAN §2.7): when invite to pay took over in this world, stamped once by the first live step after the
   * switch; 0 or absent before. A quick request made after it must carry inviteFlow (invariant legacy-new).
   */
  inviteSince?: Ms;
}
/** What applyWorld takes: a preview state, a live document, or a live view (which also carries the people it refers to). */
export interface WorldLike {
  mode?: string;
  clockOffset?: number;
  policies?: Readonly<Record<string, PolicyKey>>;
  events?: readonly object[];
  people?: Readonly<Record<string, object>>;
}
/** What withEngine runs with (C-DESIGN §2.2). */
export interface EngineContext {
  doc: { mode: "live"; events?: readonly object[] };
  people: Iterable<EnginePersonRow>;
  /** The time to run at, in ms: the database's clock after the lock, or a test's. */
  now: Ms;
}

// ---------------------------------------------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------------------------------------------
/** One action. Each type's fields are checked by the reducer (and, for live use, by parseAction in src/live.ts). */
export interface Action { type: string; [field: string]: unknown }
/** One step of a seq action, as reported back. Post ticket (postTicket) reports its parts the same way: "createEvent" (only when it made
    the event, with the event's id) and "list" (the listing's id, which is also result.id); a refusal says which part it was about.
    Post request (postRequest, 9m item 3) does too: "createEvent", then "saveInterest" (the request's id, which is also result.id). */
export interface SeqStep { type: string; ok: boolean; error?: string; toast?: string; id?: string }
export interface ReduceOk<S extends WorldState = WorldState> { state: S; toast?: string; result?: { id: string }; steps?: SeqStep[]; error?: never }
export interface ReduceRefused<S extends WorldState = WorldState> { state: S; error: string; steps?: SeqStep[]; toast?: never; result?: never }
export type ReduceResult<S extends WorldState = WorldState> = ReduceOk<S> | ReduceRefused<S>;

// ---------------------------------------------------------------------------------------------------------------
// Results of the rule helpers
// ---------------------------------------------------------------------------------------------------------------
export type Access =
  | { ok: true; kind: PolicyKey }
  | { ok: false; kind: "official" | "closed" | "notonsale"; short: string; why: string };
export type Allowed = { ok: true } | { ok: false; reason: string };
export type Eligibility =
  | { ok: true; topUp: number; needsMember?: true; approval?: true; reason?: string }
  | { ok: false; reason: string };
/** A request's effective state after deadlines and policy (rState). "paused" keeps the stored step in from. */
export interface RequestEval { st: RequestStatus | "paused"; reason?: string; from?: RequestStatus; afterCutoff?: boolean }
export interface GoodsEval { st: GoodsStatus; reason?: string }
export interface Deadlines { next: Ms | null; who: "seller" | "buyer" | "organizer" | null; cutoff: Ms | null }
export interface ListingNumbers { reserved: number; completed: number; available: number }
export interface MatchNeed { userId: string; eventId: string | null; qty: number; max: number | null; word: string; by?: WallTime | null; you?: boolean }
export interface MatchResult { ok: boolean; partial: boolean; topUp: number; reasons: string[] }
export interface ItemMatchResult { ok: boolean; partial: false; reasons: string[] }
export interface MatchRecipient { interest: Interest; partial: boolean; topUp: number }
export interface Demand { requests: number; people: number; units: number }
export interface SummaryRow { l: Listing; n: ListingNumbers; el: Eligibility }
export interface EventSummary {
  a: Access;
  spots: number;
  otherSpots: number;
  mySpots: number;
  best: SummaryRow | null;
  blockedListed: number;
  state: Badge;
  myOpen: TicketRequest | null;
  cheapest: Listing | null;
  topUp: number;
  ownMain: Listing | null;
  ownUnit: string;
  ownAvail: number;
  ownReserved: number;
  ownDone: number;
  reservedOthers: number;
  /** Live: tickets the viewer's own paused listings keep off sale (pausedUnits), and other sellers'. */
  ownPaused: number;
  pausedOthers: number;
}
/** priceLines' text without markup: each part is the list of text pieces the JSX renders in order. */
export interface PriceParts { main: { pre: string[]; bold: string[]; post: string[] }; sub: string }
export interface FeedItem {
  key: string;
  type: "match" | "listing" | "item" | "request";
  at: Ms;
  cat: string;
  title: string;
  price: number | null;
  text: string;
  unread: boolean;
  eventId?: string;
  listingId?: string;
  itemId?: string;
  isoId?: string;
  via?: "alert" | "request";
  goodsCat?: string;
}
/** Available's and Wanted's shared discovery settings. */
export interface Discovery {
  cat: string;
  q: string;
  goodsCat: string;
  club: string | null;
  featured: boolean;
  /** The preview's availability selector ("all", "available", "waitlist"). The shared market never reads it (9r: availableNow). */
  avail: string;
  /** The preview's event-date filter on Available ("any", "week", "month"). The shared market never reads it (9s: availableNow). */
  when: string;
  /** The preview's needed-by filter on Wanted ("any", "week", "month"). The shared market never reads it (9s: wantedNow). */
  need: string;
  sortA: string;
  sortW: string;
}
export interface ExploreOptions {
  q?: string;
  ids?: readonly string[] | null;
  cat?: string;
  kind?: string;
  club?: string | readonly string[];
  when?: string;
  avail?: string;
}
export interface ExploreRow { ev: EngineEvent; sum: EventSummary; stock: number }
export type AvailableCard =
  | { key: string; ev: EngineEvent; sum: EventSummary; at: Ms; price: number }
  | { key: string; it: Item; at: Ms; price: number };
export interface AvailableResult { cards: AvailableCard[]; lookup: ExploreRow[]; clubOn: boolean; featOn: boolean; evFilters: boolean }
/** What the development preview's Share sheet shares (shareText). The shared market has none (§9v item 3). */
export interface ShareTarget { type: "event" | "listing" | "item" | "iso"; id: string }
export interface ShareResult { text: string; hash: string | null; local: boolean }
export type NeedsAction =
  | { kind: "ticket"; x: TicketRequest; role: "seller" | "buyer"; why: string; at: Ms }
  | { kind: "goods"; x: GoodsRequest; role: "seller" | "buyer"; why: string; at: Ms };

// ---------------------------------------------------------------------------------------------------------------
// Exports, in the module's order
// ---------------------------------------------------------------------------------------------------------------
/** The protocol number in every view and action. A client whose number differs reloads. */
export declare const HANDOFF_PROTOCOL: number;
/** New York wall time (time.js), re-exported. */
export { wallToMs, nyParts, nyIsoDate, NY_TZ } from "./time.js";

// CONFIG
export declare const BRAND: string;
export declare const COMMUNITY: string;
export declare const STORE_KEY: string;
export declare const DEMO_BASE: Ms;
export declare const DEMO_YEAR: number;
export declare const HOUR: number;
export declare const DAY: number;
export declare const onClock: (ms: Ms) => Ms;
export declare const RULES: Readonly<{
  sellerResponseHours: number;
  startOfficialHours: number;
  maxSpotsPerPerson: number;
  goodsHoldHours: number;
  holdMinutes: number;
  offerHoldHours: number;
  offerHours: number;
  offerHoursSoon: number;
  strikesToPause: number;
  /** After paymentMissing, the hours before the seller may release a paid reservation (payDisputeHoursSoon when it's used within a day). */
  payDisputeHours: number;
  payDisputeHoursSoon: number;
}>;
export declare const TAKE_HOLD: string;
export declare const OFFER_HOLD: string;
/** The engine's clock. A live binding: import it by name and read it when needed. NaN on the server between withEngine runs. */
export declare let CLOCK: Ms;
export declare const PEOPLE: Readonly<Record<string, Person>>;
export declare const DEMO_USERS: readonly string[];
export declare const CATS: Readonly<Record<string, string>>;
export declare const POLICY: Readonly<Record<PolicyKey, PolicyInfo>>;
export declare const PAY_DEFAULT: string;
/** The events discovery lists: the preview's catalog, or a live world's events that weren't removed. */
export declare const EVENTS: readonly EngineEvent[];
/** Every event by id (no prototype). In a live world it also holds removed events, so a record's lookup never fails. */
export declare const EV: Readonly<Record<string, EngineEvent>>;
export declare const CLUBS: readonly string[];
/**
 * Installs a state's world and sets CLOCK. A live world (mode "live": a document, or a view) installs normalized copies of its
 * events, its people when it carries them, and the live clock (setLiveClock, or withEngine on the server); it throws without a
 * live clock. Anything else is the preview: the sample catalog, its demo clock and policy overrides. Never writes into st.
 */
export declare function applyWorld(st: WorldLike | null | undefined): void;

// FORMATTING
export declare const uid: () => string;
/** A JSON round trip. */
export declare const clone: <T>(o: T) => T;
export declare function cleanUrl(v: unknown): { value: string | null } | { error: string };
export declare const at: (iso: WallTime) => Date;
export declare const atMs: (iso: WallTime) => Ms;
export declare const mon: (d: Date) => string;
export declare function fmtDay(iso: WallTime, withYear?: boolean): string;
export declare const fmtDate: (iso: WallTime) => string;
export declare const fmtTime: (iso: WallTime) => string;
export declare const fmtWhen: (iso: WallTime) => string;
export declare const fmtMs: (ms: Ms) => string;
/** Forms round 2: a date alone ("YYYY-MM-DD"), an ordinary event added by its date. */
export declare const isDateOnly: (iso: unknown) => boolean;
export declare function fmtRange(ev: Pick<EngineEvent, "start" | "end" | "rangePrefix">): string;
/**
 * Forms round 2 (9j item 2): an event's date for a picker option or a suggestion, with its actual start or departure time when one is
 * known. A date-only event shows its date alone (11:59 PM is when it closes, never a start time); an older train ticket with a validity
 * window shows that window.
 */
export declare const eventWhen: (ev: Pick<EngineEvent, "start" | "end" | "openUntil" | "rangePrefix">) => string;
/** An event picker option's words: "<name> · <when>" (eventWhen). */
export declare const eventOption: (ev: Pick<EngineEvent, "title" | "start" | "end" | "openUntil" | "rangePrefix">) => string;
export declare const money: (n: number) => string;
/**
 * Forms round 2 (9j item 4): whether a Goods item's price reads "Free": exactly 0, in the shared market. The preview's sample items keep
 * "$0". Only an item's price (and a request made at it): a ticket listed at $0 and a $0 budget read "$0".
 */
export declare const isFreePrice: (n: number) => boolean;
/** A Goods item's price in words: "Free" when isFreePrice, else money(n). What's stored stays the number. */
export declare const itemPrice: (n: number) => string;
export declare const isoDate: (ms: Ms) => string;
export declare function ago(ms: Ms): string;
export declare function untilText(ms: Ms): string;
export declare const initials: (n: string) => string;
export declare const plural: (n: number, w: string) => string;
export declare function parseMoney(v: unknown): { value: number } | { error: string };
export declare const isInt: (q: unknown) => boolean;
export declare const SRC: Readonly<Record<HoldingSource, string>>;

// RULES
export declare const isMember: (userId: string, club: string) => boolean;
export declare const tierOf: (ev: EngineEvent, id: string | null | undefined) => Tier | null;
export declare const isAddOn: (ev: EngineEvent, l: { tier: string | null }) => boolean;
export declare const orgLabel: (ev: EngineEvent) => string;
export declare const DIRECT_LABEL: string;
export declare const orgWho: (ev: EngineEvent) => string;
export declare const OrgWho: (ev: EngineEvent) => string;
export declare const spotTiers: (ev: EngineEvent) => Tier[];
/** Forms round 2: a ticket type's face value, or null when none was given. */
export declare const faceOf: (t: Pick<Tier, "price"> | null | undefined) => number | null;
/** Forms round 2: whether any spot ticket type has a face value (trips: always). */
export declare const hasFace: (ev: EngineEvent | null | undefined) => boolean;
/** The top and lowest face value; null when no ticket type has one (forms round 2). */
export declare const faceMax: (ev: EngineEvent) => number | null;
export declare const faceMin: (ev: EngineEvent) => number | null;
/** "the face value", or "the top face value" where ticket types differ (FaceName: capitalized). */
export declare const faceName: (ev: EngineEvent) => string;
export declare const FaceName: (ev: EngineEvent) => string;
/** "$40", "$40–$75", or "" when no face value was given. */
export declare const faceText: (ev: EngineEvent) => string;
export declare const nonMemberFloor: (ev: EngineEvent) => number | null;
/** Trips only (ev.price): what the club has been paid so far. */
export declare const paidToDate: (ev: EngineEvent) => number;
/** Trips only (ev.price). */
export declare function remainingItems(ev: EngineEvent, paid: number): PriceStep[];
/** Trips only (ev.price). */
export declare const remaining: (ev: EngineEvent, paid?: number | null) => number;
/** Trips only (ev.price): the reimbursement plus what's left to pay plus the change fee. */
export declare const commitment: (ev: EngineEvent, reimb: number, paid?: number | null) => number;
export declare const closesAt: (ev: EngineEvent) => Ms;
export declare const cutoffMs: (ev: EngineEvent) => Ms;
/**
 * Forms round 2 (9j): the New York date a request for this event runs to when its buyer names none: the date of the event's cutoff
 * (its transfer deadline when it has one, else when it closes). saveInterest stores it for a live request sent without `expires`.
 */
export declare const requestUntil: (ev: EngineEvent) => string;
/** When a request really stops: the end of its own date (11:59 PM New York), or its event's cutoff when that comes first. Infinity with neither. */
export declare const requestEndMs: (i: Pick<Interest, "expires"> | null | undefined, ev: EngineEvent | null | undefined) => Ms;
/** An instant as "Thu, Nov 19, 11:59 PM" in New York time (with the year when it isn't this one). */
export declare const fmtUntil: (ms: Ms) => string;
export declare const eventStarted: (ev: EngineEvent) => boolean;
export declare const cutoffPassed: (ev: EngineEvent) => boolean;
/** What ended an event's window, in words: short (a label), why, and why an unpaid reservation (unpaid) or an unfinished handoff (undone) ended. */
export declare function endWords(ev: Pick<EngineEvent, "openUntil" | "kind" | "start">): { short: string; why: string; unpaid: string; undone: string };
export declare function access(ev: EngineEvent): Access;
export declare const demandAllowed: (ev: EngineEvent) => boolean;
export declare const demandCap: (ev: EngineEvent) => number;
export declare function canAttend(userId: string, ev: EngineEvent): Allowed;
export declare const membersOnlyListing: (ev: EngineEvent, l: Pick<Listing, "membersOnly" | "tier"> | null | undefined) => boolean;
export declare const hasMemberTiers: (ev: EngineEvent) => boolean;
export declare const mayHoldMemberTier: (userId: string, ev: EngineEvent) => boolean;
export declare const honorAttend: (userId: string, ev: EngineEvent) => Allowed;
export declare function canAcquire(userId: string, ev: EngineEvent, listing: Listing | null | undefined): Eligibility;
export declare function askCap(ev: EngineEvent, holding: Pick<Holding, "tier" | "paid" | "paidAdj">): number;
/**
 * Forms round 2 (9j item 3): what the Sell form's asking price starts from for a ticket being added: its ticket type's face value as
 * typed text ("40", "12.5") where the event gives one, "" where it doesn't or no ticket type is chosen. Never guessed.
 */
export declare const askPrefill: (ev: EngineEvent | null | undefined, tierId: string | null | undefined) => string;
export declare const FINAL: readonly RequestStatus[];
/** Follow-on B2: what each close reason is called ("Sold elsewhere", "No longer selling"). Optional, the seller's only, never a sale. */
export declare const CLOSE_REASONS: Readonly<Record<CloseReason, string>>;
export declare function quickState(r: TicketRequest, ev: EngineEvent): RequestEval;
/** The reason an unpaid hold that ran out is stored with: the given one, unless it is "went back on sale" and the seller closed or paused
 *  the listing (FINAL-1). Pages use it for a lapse their own clock reached before the stored one. */
export declare const lapsedReason: (reason: string | undefined, l: Pick<Listing, "withdrawnAt" | "pausedAt"> | null | undefined) => string | undefined;
export declare function rState(r: TicketRequest): RequestEval;
export declare const RESERVING: readonly RequestStatus[];
export declare const flowFor: (ev: EngineEvent, l: Listing, r: Pick<TicketRequest, "topUp">) => "peer" | "approval" | "direct";
export declare const reserves: (e: RequestEval) => boolean;
export declare const isOpenReq: (e: RequestEval) => boolean;
/** The stored step behind a policy pause. */
export declare const baseSt: (e: RequestEval) => RequestStatus;
export declare function requestDeadlines(r: TicketRequest): Deadlines;
export declare function personLoad(s: WorldState, userId: string, eventId: string, exceptRequestId?: string | null): number;
export declare const personCap: (ev: EngineEvent) => number;
export declare const reqPrice: (r: { price?: number | null }, l: Pick<Listing, "ask">) => number;
/** Quantity (9n): how a count at a price reads: "2 tickets · $25 each"; one reads "1 ticket · $25". `unit` defaults to "ticket". */
export declare const qtyLine: (qty: number, price: number, unit?: string) => string;
/** Quantity (9n): what a request or reservation comes to: its quantity times the agreed price (its own, or the listing's asking price
 *  when it has none yet). What the buyer is shown before reserving, and what reserve asks them to pay. */
export declare const totalOf: (r: { qty: number; price?: number | null }, l: Pick<Listing, "ask">) => number;
/**
 * §9x item 1 (SELL6-N1): a free ticket. freeDeal: the exchange is agreed at $0 each, so its total is zero and nothing is paid: its
 * seller needs no way to be paid to invite the buyer, and reserving it copies no payment details and goes straight to "confirmed"
 * (the seller sends the ticket next), with no paidAt or paymentConfirmedAt. freeSkipped: such a record past its reservation, never
 * marked paid (one reserved at $0 before this, with the old payment steps, has paidAt or is still "accepted").
 */
export declare const freeDeal: (r: Pick<TicketRequest, "flow" | "price"> | null | undefined) => boolean;
export declare const freeSkipped: (r: Pick<TicketRequest, "flow" | "price" | "status" | "paidAt"> | null | undefined) => boolean;
/**
 * Quantity (9n): the most this person may ask for on a listing now, as requestToBuy would accept it: what's available, and what the
 * event's per-person limit still leaves them (what they hold and have reserved count). 0 for the seller, for nobody, and when nothing
 * is left. The page offers a quantity choice only when it's 2 or more. Works on the server's document and on a signed-in view.
 */
export declare function buyerMax(s: WorldState, userId: string | null | undefined, l: Listing): number;
export declare function checkOffer(raw: unknown, ask: number, obo: boolean | undefined, minOffer: number | null | undefined, quick: boolean): { price: number; isOffer: boolean } | { error: string };
export declare function checkMinOffer(raw: unknown, ask: number): { value: number | null } | { error: string };
export declare function alertFields(ev: EngineEvent, a: { qty?: unknown; max?: unknown }, cur: Pick<Interest, "qty" | "max"> | null | undefined): { qty: number; max: number | null } | { error: string };
export declare const departed: (l: Pick<Listing, "departsAt">) => boolean;
/** Why nothing more on a listing can be sold ("The train has left.", "The event has started.", "The listed tickets have expired.",
 *  "The transfer window closed …."), or null while it could still sell. Only time ends a sale, never a policy or a pause (W1 fix, OBS-2). */
export declare const saleEndedWhy: (ev: EngineEvent, l: Pick<Listing, "departsAt"> | null | undefined) => string | null;
export declare const needsTrain: (ev: EngineEvent) => boolean;
export declare const isQuick: (ev: EngineEvent | null | undefined) => boolean;
export declare const METHODS: Readonly<Record<Method, { label: string; verb: string }>>;
/** Follow-on B1: the kinds a person can save, in the order the page offers them (never "other"). */
export declare const PAY_KINDS: readonly ("venmo" | "zelle" | "paypal")[];
/** §9q item 5: the kinds offered to someone adding a method now (PayPal stays a kind for those who saved it). */
export declare const PAY_NEW_KINDS: readonly ("venmo" | "zelle")[];
/** What each kind is called: "Venmo", "Zelle", "PayPal"; a legacy handle is "Payment details" (no provider is guessed). */
export declare const PAY_LABELS: Readonly<Record<PayKind, string>>;
/**
 * Checks the methods a person saves: 0 to 2, of different kinds, each Venmo, Zelle or PayPal (never "other"). Returns them normalized,
 * the first preferred, or the first problem in the words shown beside its field and which method it's about (null: the whole list).
 */
export declare function checkPayMethods(list: unknown): { ok: true; methods: PayMethod[] } | { ok: false; index: 0 | 1 | null; error: string };
/** A method's destination as people read it: "@ann-lee", "ann@upenn.edu", "(215) 555-0142"; PayPal and a legacy handle as typed. */
export declare function formatPayMethod(m: PayMethod | null | undefined): string;
/** A profile's methods: the saved ones that are well formed (at most 2, no kind twice), else a non-empty legacy handle as one "other", else none. */
export declare function readPayMethods(saved: unknown, legacyHandle: string | null | undefined): PayMethod[];
/** The refusal when a seller has nothing to be paid with: "Add how buyers can pay you: Venmo, Zelle or PayPal." (the page asks in it too). */
export declare const NO_PAY_METHODS: string;
export declare const namesCheckedFor: (ev: EngineEvent, answer: unknown) => boolean;
export declare const methodsFor: (ev: EngineEvent, namesChecked: boolean) => Method[];
/** Simplification batch: the refusals for a name change, and for a members-only ticket, on an event that names no organizer. */
export declare const NO_ORG_NAME: string;
export declare const NO_ORG_MEMBERS: string;
/** §9q item 5: a members-only ticket's club, named by its seller for an event that names none: the refusal of a name that isn't one,
 *  the club a members-only listing is for (the event's own, else the listing's), and a typed name as stored (or null). */
export declare const NO_MEMBER_CLUB: string;
export declare const memberClubOf: (ev: EngineEvent | null | undefined, l: Pick<Listing, "memberClub"> | null | undefined) => string;
export declare function memberClubName(raw: unknown): string | null;
/** §9v items 4 and 5 (SELL5-M2): one of a listing's restrictions as buyers read it, in plain words: members only (with the club), an
 *  organizer name change, the seller's own short words, or (a listing posted before) the old seller flag. */
export interface ListingRestriction { kind: "members" | "name" | "own" | "flagged"; text: string }
/** The listing's fields listingRestrictions and listingClubOf read (a stored listing, a view's, a guest's or a form's draft). */
export type RestrictionSource = Partial<Pick<Listing, "membersOnly" | "memberClub" | "tier" | "namesChecked" | "method" | "restricted" | "club" | "restriction">>;
export declare const NAME_CHANGE_RULE: string;
export declare const FLAGGED_RULE: string;
export declare const RESTRICTION_MAX: number;
/** The refusal of a restriction's words that aren't 3 to 80 characters on one line with a letter or digit. */
export declare const NO_RESTRICTION_TEXT: string;
/** The refusal of a club named on a listing that isn't 2 to 80 characters on one line. */
export declare const NO_LISTING_CLUB: string;
/** A seller's restriction words as stored (one line, 3 to 80 characters), or null. */
export declare function restrictionText(raw: unknown): string | null;
/** The event's club, else the one named on the listing (or an older listing's members-only club); "" when none. */
export declare const listingClubOf: (ev: EngineEvent | null | undefined, l: RestrictionSource | null | undefined) => string;
/** Who changes a name, in words: listingClubOf, or "the organizer". */
export declare const orgOf: (ev: EngineEvent | null | undefined, l: RestrictionSource | null | undefined) => string;
/** What a buyer reads before asking to buy or reserving: the listing's restrictions in order; [] when none is reported or known. */
export declare function listingRestrictions(ev: EngineEvent | null | undefined, l: RestrictionSource | null | undefined): ListingRestriction[];
/** §9q item 4: where a buyer hears about a match for their request, said once it's posted. */
export declare const MATCHES_WHERE: string;
/**
 * Sell and Request follow-up (9m item 1): an ordinary event's ticket carries no promised delivery method unless its seller chose one.
 * SEND_AFTER_PAYMENT is the neutral rule in the seller's voice: "Send the ticket to the buyer after payment."
 */
export declare const SEND_AFTER_PAYMENT: string;
/** The listing's recorded transfer method, or null when it promises none (posted without one since the follow-up). */
export declare const methodOf: (l: Pick<Listing, "method"> | null | undefined) => Method | null;
/**
 * The neutral rule for a listing that promises no method, as `who` reads it: the seller ("Send the ticket to the buyer after
 * payment."), the buyer ("The seller sends you the ticket after payment.") or anyone else ("The seller sends the ticket to the buyer
 * after payment."). null when the listing has a recorded method: that method's own words (METHODS) stand, unchanged.
 */
export declare const transferWords: (l: (Pick<Listing, "method"> & Partial<Pick<Listing, "ask">>) | null | undefined, who?: "seller" | "buyer" | null, free?: boolean) => string | null;
/** §9x item 1: the neutral rule for a free ticket, in the seller's voice: "Send the ticket to the buyer once they reserve it."
 *  transferWords says it (and the buyer's and anyone else's form of it) when `free`: by default the listing's price is $0; an exchange's
 *  card passes whether its own agreed price is. */
export declare const SEND_ONCE_RESERVED: string;
/** Text parts joined with " · ", leaving out the empty ones. */
export declare const dotJoin: (...xs: Array<string | null | undefined | false>) => string;
export declare const offerEnd: (ev: EngineEvent, from: Ms, l?: Pick<Listing, "departsAt"> | null) => Ms;
export declare const holdMs: (byBuyer: boolean) => number;
export declare const holdEnd: (ev: EngineEvent, from: Ms, l: Pick<Listing, "departsAt"> | null | undefined, byBuyer: boolean) => Ms;
export declare const holdLen: (r: Pick<TicketRequest, "holdUntil">, from: Ms) => string;
/** How long an offer, counter or held reply stays open (until: its offerEnd), for messages: "6 hours", or "8 minutes" / "2 hours 30 minutes" when a cutoff comes first. */
export declare const openLen: (until: Ms, from: Ms) => string;
export declare const disputeEnd: (ev: EngineEvent) => Ms;
export declare const strikesOf: (s: Pick<WorldState, "strikes">, id: string) => number;
export declare const tradingPaused: (s: Pick<WorldState, "strikes">, id: string) => boolean;
/**
 * A live view's listing carries the server's counts (numbers), which this returns outside withEngine; otherwise it counts every
 * request. It reads only s.requests (the projection passes just the listing's own requests).
 */
export declare function listingNumbers(s: Pick<WorldState, "requests">, l: Listing): ListingNumbers;
export declare const outstanding: (s: WorldState, l: Listing) => number;
export declare const holdingFree: (s: WorldState, h: Holding) => number;
/** Live: its seller paused it, and it's otherwise open (not withdrawn, train not left, event open, not all transferred): resumable. */
export declare const listingPaused: (s: Pick<WorldState, "requests">, l: Listing) => boolean;
/** How many tickets a pause keeps off sale now (neither reserved nor transferred): what resuming would make available. */
export declare const pausedUnits: (s: Pick<WorldState, "requests">, l: Listing) => number;
/** Keys: available, sellerPaused (live: paused, with tickets it keeps off sale), reserved, transferred, closed, withdrawn, paused (a policy change). */
export declare function listingState(s: WorldState, l: Listing): Badge;
export declare const availableListings: (s: WorldState, eventId: string) => Listing[];
export declare const isExpired: (i: Pick<Interest, "expires">) => boolean;
export declare const isLive: (i: Pick<Interest, "status" | "expires">) => boolean;
export declare const isoTitle: (i: Interest) => string;
export declare const isMissingIso: (i: Interest) => boolean;
/** The listing's holding, or an empty object when it no longer exists. */
export declare const holdingOf: (s: WorldState, l: Listing) => Partial<Holding>;
/** Reads a live view listing's source outside withEngine; otherwise the listing's holding. */
export declare const selfReported: (s: WorldState, l: Listing) => boolean;
export declare const withinBudget: (budget: number | null | undefined, x: { ask: number; obo?: boolean | undefined; minOffer?: number | null | undefined }, extra?: number) => boolean;
export declare function isoFits(s: WorldState, i: Interest, l: Listing): { topUp: number; partial: boolean } | null;
export declare const isoMatches: (s: WorldState, i: Interest) => Listing[];
export declare const liveRequest: (s: WorldState, i: Interest) => boolean;
export declare const publicListingsFor: (s: WorldState, ev: EngineEvent) => Listing[];
export declare const stockFor: (s: WorldState, ev: EngineEvent) => number;
export declare const demandFor: (s: WorldState, ev: EngineEvent) => Demand;
export declare function spotMatch(s: WorldState, need: MatchNeed, l: Listing): MatchResult;
export declare const requestMatch: (s: WorldState, i: Interest, l: Listing) => MatchResult;
export declare const alertMatch: (s: WorldState, al: Interest, l: Listing) => MatchResult;
export declare function matchRecipients(s: WorldState, listing: Listing): MatchRecipient[];
export declare const requestersIn: (rec: readonly MatchRecipient[]) => number;
export declare const myAlertFor: (s: WorldState, me: string, eventId: string) => Interest | null;
export declare const myRequestFor: (s: WorldState, me: string, eventId: string) => Interest | null;
export declare const alertText: (al: Pick<Interest, "qty" | "max">, ev: EngineEvent) => string;
export declare const sharesFor: (s: WorldState, i: Pick<Interest, "id">) => Share[];
export declare const PAUSED_MSG: string;

// GOODS
/** Each category's icon name and color. */
export declare const GOODS_CATS: Readonly<Record<string, readonly [icon: string, color: string]>>;
export declare const CONDITIONS: readonly string[];
/** Live (§9q item 6): a listing with no date of its seller's expires this many days on; no item's last day is further off than ITEM_MAX_DAYS. */
export declare const ITEM_EXPIRY_DAYS: number;
export declare const ITEM_MAX_DAYS: number;
/** Whether the item's `until` is a pickup-by date its seller chose (every item stored before §9q item 6; the preview's items). */
export declare const hasPickupBy: (it: Pick<Item, "noPickupBy">) => boolean;
/** What an item's last day is, in words that follow a date: "the item's pickup-by date" or "when the listing expires". */
export declare const itemEndNote: (it: Pick<Item, "noPickupBy">) => string;
export declare const GFINAL: readonly GoodsStatus[];
export declare const pickupOver: (it: Pick<Item, "until">) => boolean;
export declare function gState(g: GoodsRequest, it: Item): GoodsEval;
export declare const PROBLEMS: Readonly<{
  ticket: { buyer: readonly string[]; seller: readonly string[] };
  goods: { buyer: readonly string[]; seller: readonly string[] };
}>;
export declare const goodsHoldEnd: (it: Pick<Item, "until">, acceptedAt: Ms) => Ms;
export declare const itemOf: (s: WorldState, g: GoodsRequest) => Item | undefined;
export declare const goodsRespondBy: (g: GoodsRequest, it: Item) => Ms;
export declare const reservedFor: (s: Pick<WorldState, "goodsReqs">, it: Item) => GoodsRequest | null;
/** Live: its seller paused it, and it's still open (not sold, withdrawn or past its pickup window): resumable. */
export declare const itemPaused: (it: Pick<Item, "pausedAt" | "soldAt" | "withdrawnAt" | "until">) => boolean;
/**
 * Live (follow-on B2): why the seller can't close their item while a buyer holds it (g, the accepted request): "On hold for Bob until
 * Nov 12, 2026, 3:00 PM. You can close it once the hold ends; Pause stops new requests now." withdrawItem refuses in these words.
 */
export declare const closeHeldWhy: (it: Pick<Item, "pausedAt" | "soldAt" | "withdrawnAt" | "until">, g: Pick<GoodsRequest, "buyerId" | "holdUntil">) => string;
/**
 * A live view's item carries the server's state, which this returns outside withEngine; otherwise it reads the goods requests
 * (only s.goodsReqs: the projection passes just the item's own). Keys: sold, withdrawn, closed, reserved, sellerPaused, available.
 */
export declare function itemState(s: Pick<WorldState, "goodsReqs">, it: Item): Badge;
export declare const STOPWORDS: ReadonlySet<string>;
export declare const words: (t: string | null | undefined) => string[];
/** For a goods request (i.goods set). */
export declare const missingWords: (i: Interest, it: Item) => string[];
export declare const hasAllWords: (i: Interest, it: Item) => boolean;
export declare function goodsFits(i: Interest, it: Item): boolean;
export declare const goodsMatches: (s: WorldState, i: Interest) => Item[];
export declare function requestMatchItem(s: WorldState, i: Interest, it: Item): ItemMatchResult;

// Feed, units and summaries
export declare const catOf: (ev: EngineEvent) => "trains" | "treks" | "events";
export declare function feedItems(s: WorldState, me: string): FeedItem[];
export declare const unitOf: (ev: EngineEvent | null | undefined) => "ticket" | "spot";
export declare const UnitOf: (ev: EngineEvent | null | undefined) => "Ticket" | "Spot";
export declare const aUnit: (u: string) => string;
export declare const cap1: (t: string) => string;
export declare const myReqLabel: (r: TicketRequest) => string;
export declare function eventSummary(s: WorldState, ev: EngineEvent, viewer: string | null | undefined): EventSummary;
export declare function priceParts(ev: EngineEvent, sum: EventSummary): PriceParts;
export declare function priceBasis(src: string): string;

// REDUCER
/** The next stamp for a change to state n. Live: the clock, past n.lastStamp (which it advances). Preview: the demo clock plus n.tick. */
export declare const stampOf: (n: WorldState) => Ms;
export declare const alertVia: (s: WorldState, id: string) => ("email" | "text")[];
/** Adds a note for userId (once while an identical one is unread); meta tags it with an emailed kind (follow-on B4), kept only with both fields. */
export declare function noteTo(n: WorldState, userId: string, text: string, link: NoteLink, meta?: NoteMeta | null): void;
export declare const histOf: (n: WorldState, obj: { history?: HistoryEntry[] }, text: string) => void;
export declare function sweepExpiry(n: WorldState): void;
export declare function settleRequests(n: WorldState): void;
/**
 * Applies one action as actor, validated against prev. It works on a copy, so prev is never changed; a refusal returns prev
 * itself. actor null is only for the server's sweep. In a live world (mode "live") only LIVE_TYPES run.
 */
export declare function reduce<S extends WorldState>(prev: S, actor: string | null, a: Action): ReduceResult<S>;
/** reduce without the settling pass that follows a successful step. */
export declare function step<S extends WorldState>(prev: S, actor: string | null, a: Action): ReduceResult<S>;

// View helpers (moved from the UI)
export declare const catLabel: (c: string) => string;
export declare function transferTag(ev: EngineEvent): TransferTag;
export declare const RSTATUS: Readonly<Record<string, StatusLabel>>;
export declare const QSTATUS: Readonly<Record<string, StatusLabel>>;
export declare const rStatus: (r: TicketRequest, e: RequestEval) => StatusLabel | undefined;
export declare const FEATURED: readonly string[];
export declare const CLUB_MENU: readonly ClubMenuEntry[];
export declare const CLUB_BY: Readonly<Record<string, ClubMenuEntry>>;
export declare const clubOf: (k: string | null | undefined) => ClubMenuEntry | null;
export declare const clubOrgs: (k: string | null | undefined) => string[] | null;
export declare const CLUB_CATS: readonly string[];
export declare const DISC0: Readonly<Discovery>;
export declare const evText: (ev: EngineEvent) => string;
export declare const itemText: (it: Item) => string;
export declare function exploreRows(s: WorldState, me: string | null | undefined, o?: ExploreOptions): ExploreRow[];
export declare const rowsOnExplore: (s: WorldState, me: string | null | undefined, o?: ExploreOptions) => string[];
export declare const squash: (t: string) => string;
export declare const ofClub: (k: string | null | undefined, org: string | null | undefined) => boolean;
/**
 * §9x item 5 (SELL6-N3; live): an event's affiliation, as By club and the search read it: its own club, or, for an event that names
 * none, the clubs its sellers named on their listings that are still up (the installed world's listings; none in the preview).
 * Display and filtering only: an affiliation never restricts who can buy.
 */
export declare const eventClubs: (ev: EngineEvent | null | undefined) => string[];
/**
 * Forms round 2 (9j item 2): the events "Add an event" suggests for a name as it's typed: at most `max` (3) upcoming events still open
 * to list and request, the same name first, then names holding every typed word, then names sharing at least half of them. `when` (a date, or a date and
 * time, as typed) refines the order within each group; `kind` (what's being added) settles a tie. [] until the name has three letters
 * or digits. Each event is its own suggestion: seatings and departures of one name are never merged.
 * §9s item 4: `loose` (the search field of Sell a ticket and Request a ticket) lets any typed word be half typed, counts the little
 * words and words under three letters as refinements (and as enough when nothing longer was typed), and puts the better match first;
 * `first` picks out the events that lead among equal matches (Sell: those the seller holds unlisted tickets for).
 */
export declare function suggestEvents(title: string | null | undefined, when?: string | null, o?: { max?: number; kind?: "event" | "train" | "trek" | null; loose?: boolean; first?: ((ev: EngineEvent) => boolean) | null }): EngineEvent[];
/**
 * One-form Sell (9l item 2): the open event a new one would be an exact twin of, or null: the same kind, the same name (whatever its
 * capitals, spacing or punctuation; nothing looser), at the same time (an ordinary event on the same day, or at the same start when
 * both give a time; a train or trek at the same start). Post ticket (the postTicket action) refuses to add a twin, with TWIN_EVENT,
 * TWIN_TRAIN or TWIN_TREK: the seller chooses the event that's there, or says what's different in the name. Nothing is merged for them.
 */
export declare function eventTwin(kind: EventKind | null | undefined, title: string | null | undefined, start: string | null | undefined): EngineEvent | null;
export declare const TWIN_EVENT: string;
export declare const TWIN_TRAIN: string;
export declare const TWIN_TREK: string;
/** The same refusal from Post request (the postRequest action; 9m item 3), in a buyer's words: "…Choose it to post your request there…". */
export declare const TWIN_EVENT_REQUEST: string;
export declare const TWIN_TRAIN_REQUEST: string;
export declare const TWIN_TREK_REQUEST: string;
export declare function availableFor(s: WorldState, me: string | null | undefined, d: Discovery): AvailableResult;
/**
 * 9r: Available in the shared market, which has no All / Available / Nothing listed selector: the cards are what can be taken now
 * (events with stock, goods on sale), and `lookup` holds, for a search or a club, the events with nothing to take whose requests are
 * still open (never one past its cutoff: its day, its departure or its transfer deadline). Every event is its own row. `d.avail` is
 * never read, and since 9s neither is `d.when` (the event-date control is gone too), so `evFilters` is always false. The development
 * preview keeps availableFor.
 */
export declare function availableNow(s: WorldState, me: string | null | undefined, d: Discovery): AvailableResult;
export declare const MAX_PHOTOS: number;
export declare const photosOf: (it: Pick<Item, "photos" | "photo">) => string[];
/** Live (§9s item 6): what an item keeps of its photo: `v`, 16 hex characters of the image's SHA-256, and its size in pixels. */
export interface PicRef {
  v: string;
  w: number;
  h: number;
}
/** True for a well-formed reference (16 lowercase hex characters; a width and height from 1 to 4096). */
export declare const picOk: (p: unknown) => p is PicRef;
/** Every item in a document that has a photo, as its id and the photo's version. */
export declare const photoRefs: (doc: { goods?: unknown } | null | undefined) => { id: string; v: string }[];
export declare const reqText: (i: Interest) => string;
export declare function wantedFor(s: WorldState, d: Discovery): Interest[];
/**
 * 9s: Wanted in the shared market, which has no "Needed by" control: every live public request for the category, search, club and
 * goods category, in Wanted's sort. `d.need` is never read. The development preview keeps wantedFor.
 */
export declare const wantedNow: (s: WorldState, d: Discovery) => Interest[];
export declare function feedFor(s: WorldState, me: string, d: Discovery): { all: FeedItem[]; items: FeedItem[] };
/**
 * The development preview's own Share sheet: the message to copy, with its link. seedIds: the seeded examples' ids (SEED_IDS from the
 * preview module). The shared market has no outward Share (USER-INSTRUCTIONS §9v item 3), so in a live world this throws.
 */
export declare function shareText(t: ShareTarget, s: WorldState, seedIds: ReadonlySet<string>): ShareResult;
export declare function needsAction(s: WorldState, me: string): NeedsAction[];

// LIVE WORLD (C-DESIGN §2.2)
/** The preview's sample people, whatever catalog is installed (seed() names them from here). */
export declare const SAMPLE_PEOPLE: Readonly<Record<string, Person>>;
/** "Langston Chen" is "Langston C."; a one-word name stays as it is; an empty one is "Classmate". */
export declare function publicName(fullName: string | null | undefined): string;
/** A stable avatar color for a user id. */
export declare function colorFor(userId: string): string;
/** The browser's live clock (Date.now() plus the server's skew), or null to clear it. Throws inside withEngine. */
export declare function setLiveClock(fn: (() => Ms) | null): void;
/** A new live world's document (version 0). */
export declare function emptyWorld(): LiveWorld;
/**
 * Runs fn with the engine set up for one live world: its events, the people (public names; emails never read) and the time.
 * fn must be synchronous (a Promise throws); the shared state is cleared when withEngine returns. Not re-entrant.
 */
export declare function withEngine<T>(ctx: EngineContext, fn: () => T): T;
/** A stored live event (or an already normalized one) as every page reads it. Never changes its argument. */
export declare function normalizeEvent(stored: StoredEvent | EngineEvent): EngineEvent;
/**
 * True while a listing (any state), a ticket request or a public request (open or closed) refers to the event: records that
 * were public when made. removeEvent's rule and a view's canRemove; private alerts and holdings never count.
 */
export declare function eventInPublicUse(s: Pick<WorldState, "listings" | "requests" | "interests">, eventId: string): boolean;
/** The action types a live world runs: every client action parseAction accepts, plus the server's "sweep". */
export declare const LIVE_TYPES: readonly string[];
/** The action types a seq step may be. */
export declare const SEQ_STEP_TYPES: readonly string[];
/** Every invariant the live document breaks, as stable keys ("oversold:l…"). Inside withEngine only; installs doc first. */
export declare function invariantViolations(doc: LiveWorld): string[];
/**
 * Follow-on B1: how many of the seller's listings could still take a new buyer and would be paid through the seller's saved methods
 * (no handle of their own). The store keeps a seller's last method while any does. Inside withEngine only; installs doc first.
 */
export declare function payNeededBy(doc: LiveWorld, sellerId: string): number;
/**
 * Follow-on B5: the rule payNeededBy counts by. "listing": an open listing needs the seller's method (until invite to pay is switched
 * on). "exchange": an open invitation, an older open offer or held reply, or a reservation without its own copy needs it.
 */
export declare function payNeededRule(): "listing" | "exchange";
/**
 * Follow-on B5 (invite to pay): whether it's the live flow as built. true since the switch (one save, with HANDOFF_PROTOCOL 3): in a
 * live world the first stored change stamps doc.inviteSince, take, offer and isoReply are refused, and the seller's payment method is
 * asked at the first invitation instead of at posting. Exchanges made before it keep their terms.
 */
export declare const INVITE_FLOW_LIVE: boolean;
/** Tests only: turns invite to pay on or off for the engine; null puts back INVITE_FLOW_LIVE. */
export declare function setInviteSwitch(on: boolean | null): void;
/** Whether invite to pay is the live flow now (INVITE_FLOW_LIVE, or a test's setInviteSwitch). */
export declare function inviteFlowOn(): boolean;
/** Follow-on B5: the problem reason a buyer reports on their own new-flow reservation after it ended (reportProblem). Live only. */
export declare const LATE_PAYMENT: string;
/** The earliest future moment time alone changes what the document should hold, or null. Inside withEngine only; installs doc first. */
export declare function nextDue(doc: LiveWorld): Ms | null;
/** Tests only: called after every reduce with the actor, the action, its result and how deeply it was nested (0: as sent). */
export declare function setActionTap(fn: ((actor: string | null, action: Action, result: ReduceResult, depth: number) => void) | null): void;
