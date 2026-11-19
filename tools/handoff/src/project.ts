// Handoff's projection (C-DESIGN.md §3.1, §3.5, §3.6; C-CONTRACT.md §2): what one viewer may see of a live world.
//
// Privacy rests here. A world is one document holding everyone's records, and this is the only code that turns it into what
// a browser receives. Every object in a view is built new, field by field, from an allowlist for the viewer's role: everyone,
// the owner, or the other party (some fields only from a given step). Nothing is copied whole and trimmed afterwards, so a
// field added to a stored record later stays on the server until someone adds it to an allowlist here.
//
// - Never sent to anyone but their owner: private alerts (not even a count), holdings, payment handles and methods, emails.
// - Ticket requests, goods requests and shares go to their two parties only. Other people see only the counts and states
//   those records imply (numbers, state), computed here with every request, plus when those change without any action
//   (numbersUntil, stateUntil), so the browser knows when to refresh. Those times are only ones the viewer may know: public
//   ones (a train's departure, an item's pickup-by date) and the deadlines of requests the viewer is a party to. Another
//   person's hold never sets them: its end would show when it was made, whether it came from an accepted offer, and a day
//   after which time two people agreed to meet (review P1, P1b).
// - Names: "First L." on public surfaces; the full name for yourself and for anyone a request, goods request, held reply or
//   share links you with. A counterparty's email only from the reservation to the transfer (tickets), or once both of you
//   agreed to share it (goods). A seller's payment handle only to a buyer whose reservation stands. Payment methods (follow-on B1):
//   which kinds a seller takes to everyone signed in (payKinds), never a guest; where to pay only in an exchange's own snapshot (pay),
//   to its two parties, from the reservation on (PAY_REVEAL).
// - The closure rule: every event and person a record in the view refers to is in the view too, so every id resolves. A
//   record whose event (or listing, or item) isn't in the document at all is dropped, and its id is logged.
// - Size: other people's finished records leave after 14 days; events 30 days after they close unless a record in the view
//   refers to them; one's own finished records are capped at the newest 200 per collection.
//
// Runs inside withEngine (store.ts's buildView): the engine has installed this document's events and the people (public
// names, no emails) at the view's time, and project installs the document again first, so it never depends on what ran last.
//
// The guest view (projectGuest; C-CONTRACT §7) is what a signed-out visitor gets: a second projection with its own, smaller
// allowlists, and no viewer. It reads no profile row (the store runs it with none installed), so it can't name anyone; it
// sends only published facts: events, the listings and items anyone signed in could take right now with what's left, and live
// public requests without who asked, their note or budget. Both projections compute counts and states with the same code
// (Records), so a guest's "2 available" is exactly every signed-in viewer's.

import {
  CLOCK,
  EV,
  GFINAL,
  HANDOFF_PROTOCOL,
  access,
  applyWorld,
  atMs,
  baseSt,
  closesAt,
  colorFor,
  cutoffMs,
  eventInPublicUse,
  gState,
  goodsRespondBy,
  isLive,
  isOpenReq,
  itemState,
  listingNumbers,
  liveRequest,
  picOk,
  publicName,
  rState,
  requestDeadlines,
  reservedFor,
  reserves,
  restrictionText,
} from "../engine/index.js";
import type {
  EngineEvent,
  GoodsEval,
  GoodsRequest as StoredGoodsRequest,
  Holding as StoredHolding,
  HistoryEntry as StoredHistoryEntry,
  Interest as StoredInterest,
  Item as StoredItem,
  Listing as StoredListing,
  ListingNumbers,
  LiveWorld,
  Problem as StoredProblem,
  RequestEval,
  Share as StoredShare,
  StoredEvent,
  TicketRequest as StoredRequest,
} from "../engine/index.js";
import type { GuestContext, ProjectContext, WorldDoc } from "./engine-port.js";
import type { PhotoRef } from "./photo.js";
import type {
  CloseReason,
  ClosedRequest,
  GoodsRequest,
  GuestEvent,
  GuestItem,
  GuestListing,
  GuestView,
  GuestWanted,
  HistoryEntry,
  Holding,
  Interest,
  ItemState,
  NotificationLink,
  PayKind,
  PayMethod,
  PersonRow,
  ProblemReport,
  QuickStatus,
  Share,
  TicketRequest,
  View,
  ViewEvent,
  ViewItem,
  ViewListing,
  ViewNotification,
  ViewPerson,
} from "./types.js";

/** The names and colors a view uses (C-DESIGN §2.3 lists them here; the engine owns them, so its text uses the same ones). */
export { colorFor, publicName } from "../engine/index.js";

// ── Bounds ───────────────────────────────────────────────────────────────────────────────

/** Other people's finished listings, items and public requests stay in a view this long after they end. */
export const OTHERS_FINAL_DAYS = 14;
/** Events stay in a view this long after they close, unless a record in the view refers to them. */
export const EVENT_KEEP_DAYS = 30;
/** One's own finished records: the newest this many per collection. Open ones are always sent. */
export const OWN_FINAL_CAP = 200;
/** The viewer's newest notifications (the store reads at most this many). */
export const VIEW_NOTIFICATIONS = 100;
/** §9x item 1: the public requests a view names as closed (closedRequests, a guest's closedWanted): the newest this many. */
export const CLOSED_REQUESTS_CAP = 200;

const DAY_MS = 86_400_000;
/** What a view calls someone who has no profile row (the engine's name for an unknown id). */
const CLASSMATE = "A classmate";
const QUICK_STATUSES: ReadonlySet<string> = new Set<QuickStatus>([
  "pending", "countered", "proposed", "accepted", "paid", "confirmed", "sent", "completed", "declined", "cancelled", "released", "expired",
  // Follow-on B5 (invite to pay): neither holds stock, and neither is in PAY_REVEAL, so no destination shows before reserve.
  "requested", "invited",
]);
/** Steps after which a buyer sees the seller's payment handle on the listing (C-CONTRACT §2: C:accepted, through completed). */
const PAY_REVEAL: ReadonlySet<string> = new Set(["accepted", "paid", "confirmed", "sent", "completed"]);
/** Steps during which the two parties of a ticket request see each other's email (§3.1: accepted, paid, confirmed or sent). */
const CONTACT_REVEAL: ReadonlySet<string> = new Set(["accepted", "paid", "confirmed", "sent"]);
/** Goods: once both agreed to share contact details, while it's held or after it's picked up. */
const GOODS_CONTACT: ReadonlySet<string> = new Set(["accepted", "completed"]);
/** Paid steps never lapse on their own, so they don't make a listing's counts change with time. */
const PAID_STEPS: ReadonlySet<string> = new Set(["paid", "confirmed", "sent"]);
const ITEM_KEYS: ReadonlySet<string> = new Set<ItemState["key"]>(["sold", "withdrawn", "closed", "reserved", "sellerPaused", "available"]);

// ── project ──────────────────────────────────────────────────────────────────────────────

/**
 * The viewer's view of a live world (C-CONTRACT §2), built from allowlists. Call it inside withEngine at ctx.now; ctx.people
 * holds every profile row with its email (only this function decides who sees an email), ctx.notifications the viewer's newest
 * notifications. Throws if the viewer has no profile row (the store always writes one first) or outside withEngine.
 */
export function project(doc: WorldDoc, viewerId: string, ctx: ProjectContext): View {
  const dropped: string[] = [];
  const w = readWorld(doc, dropped);
  applyWorld(w.doc);
  if (CLOCK !== ctx.now || !Number.isFinite(ctx.now)) throw new Error("Handoff: project runs inside withEngine, at the view's time.");
  const me = ctx.people.get(viewerId);
  if (!me) throw new Error("Handoff: the viewer has no profile row.");
  const view = new Projection(w, viewerId, me, ctx, dropped).build();
  if (dropped.length > 0) {
    console.warn(`[handoff] view in world ${ctx.worldId} at version ${ctx.version} left out ${dropped.length} record(s) whose event, listing, item or request isn't in the document: ${dropped.slice(0, 20).join(", ")}${dropped.length > 20 ? ", …" : ""}`);
  }
  return view;
}

/**
 * The user ids a viewer's view names (Projection.personIds), so the store loads only their profiles (review of PR #88). Call it inside
 * withEngine at the view's time, as project.
 */
export function viewPersonIds(doc: WorldDoc, viewerId: string): string[] {
  const dropped: string[] = [];
  const w = readWorld(doc, dropped);
  applyWorld(w.doc);
  const ctx: ProjectContext = { worldId: "live", version: 0, now: CLOCK, people: new Map(), notifications: [], unreadCount: 0 };
  const me: PersonRow = { userId: viewerId, name: CLASSMATE, email: null, payHandle: "", payMethods: [] };
  return new Projection(w, viewerId, me, ctx, dropped).personIds();
}

/**
 * What a signed-out visitor sees of a live world (C-CONTRACT §7), built from the guest allowlists (GuestProjection). Call it
 * inside withEngine at ctx.now. It takes no viewer and reads no profile row: the store runs it with none installed, and nothing
 * it sends comes from one. Throws outside withEngine.
 */
export function projectGuest(doc: WorldDoc, ctx: GuestContext): GuestView {
  const dropped: string[] = [];
  const w = readWorld(doc, dropped);
  applyWorld(w.doc);
  if (CLOCK !== ctx.now || !Number.isFinite(ctx.now)) throw new Error("Handoff: projectGuest runs inside withEngine, at the view's time.");
  const view = new GuestProjection(w, ctx, dropped).build();
  if (dropped.length > 0) {
    console.warn(`[handoff] guest view in world ${ctx.worldId} at version ${ctx.version} left out ${dropped.length} record(s) whose event, listing, item or request isn't in the document: ${dropped.slice(0, 20).join(", ")}${dropped.length > 20 ? ", …" : ""}`);
  }
  return view;
}

interface World {
  doc: LiveWorld;
  events: StoredEvent[];
  holdings: StoredHolding[];
  listings: StoredListing[];
  requests: StoredRequest[];
  interests: StoredInterest[];
  responses: StoredShare[];
  goods: StoredItem[];
  goodsReqs: StoredGoodsRequest[];
}

/** The document's collections as lists (a collection that isn't one is treated as empty, and logged). */
function readWorld(doc: WorldDoc, dropped: string[]): World {
  const list = <T>(key: string): T[] => {
    const v = doc[key];
    if (Array.isArray(v)) return v as T[];
    if (v !== undefined) dropped.push(`not-a-list:${key}`);
    return [];
  };
  return {
    doc: doc as unknown as LiveWorld, // the engine's own type for the document it wrote (engine-port.ts keeps it opaque)
    events: list<StoredEvent>("events"),
    holdings: list<StoredHolding>("holdings"),
    listings: list<StoredListing>("listings"),
    requests: list<StoredRequest>("requests"),
    interests: list<StoredInterest>("interests"),
    responses: list<StoredShare>("responses"),
    goods: list<StoredItem>("goods"),
    goodsReqs: list<StoredGoodsRequest>("goodsReqs"),
  };
}

/**
 * The records a view can use, for both projections: those whose event, listing, item and request are all in the document (a
 * record that refers to something missing is dropped, and its id logged), with each request's and goods request's state and each
 * listing's counts computed with every request on it, at the view's time. A guest's counts come from this same code as a
 * signed-in viewer's, so the two can't differ.
 */
class Records {
  protected readonly holdings: StoredHolding[];
  protected readonly listings: StoredListing[];
  protected readonly requests: StoredRequest[];
  protected readonly interests: StoredInterest[];
  protected readonly shares: StoredShare[];
  protected readonly goods: StoredItem[];
  protected readonly goodsReqs: StoredGoodsRequest[];
  protected readonly listingById = new Map<string, StoredListing>();
  protected readonly itemById = new Map<string, StoredItem>();
  protected readonly interestById = new Map<string, StoredInterest>();
  protected readonly holdingById = new Map<string, StoredHolding>();
  protected readonly requestsByListing = new Map<string, StoredRequest[]>();
  protected readonly goodsReqsByItem = new Map<string, StoredGoodsRequest[]>();
  private readonly requestEval = new Map<string, RequestEval>();
  private readonly goodsEval = new Map<string, GoodsEval>();
  private readonly numbersMemo = new Map<string, ListingNumbers>();

  constructor(
    protected readonly w: World,
    protected readonly now: number,
    protected readonly dropped: string[],
  ) {
    const storedEvents = new Set(w.events.map((e) => e.id));
    const hasEvent = (id: unknown): boolean => typeof id === "string" && storedEvents.has(id) && EV[id] !== undefined;
    const keep = (ok: boolean, id: unknown): boolean => {
      if (!ok) this.dropped.push(String(id));
      return ok;
    };
    this.holdings = w.holdings.filter((h) => keep(hasEvent(h.eventId), h.id));
    this.listings = w.listings.filter((l) => keep(hasEvent(l.eventId), l.id));
    for (const l of this.listings) this.listingById.set(l.id, l);
    for (const h of this.holdings) this.holdingById.set(h.id, h);
    // Live requests are all quick-flow ones (C-DESIGN §1.2 item 5); anything else isn't a record a view can show.
    this.requests = w.requests.filter((r) => keep(hasEvent(r.eventId) && this.listingById.has(r.listingId) && r.flow === "quick" && QUICK_STATUSES.has(r.status), r.id));
    this.interests = w.interests.filter((i) => keep(i.eventId == null ? !!i.goods : hasEvent(i.eventId), i.id));
    for (const i of this.interests) this.interestById.set(i.id, i);
    this.goods = w.goods.slice();
    for (const it of this.goods) this.itemById.set(it.id, it);
    this.goodsReqs = w.goodsReqs.filter((g) => keep(this.itemById.has(g.itemId), g.id));
    this.shares = w.responses.filter((x) => keep(this.interestById.has(x.isoId) && (x.listingId ? this.listingById.has(x.listingId) : x.itemId ? this.itemById.has(x.itemId) : false), x.id));
    for (const r of this.requests) {
      push(this.requestsByListing, r.listingId, r);
      this.requestEval.set(r.id, rState(r));
    }
    for (const g of this.goodsReqs) {
      push(this.goodsReqsByItem, g.itemId, g);
      this.goodsEval.set(g.id, gState(g, this.item(g.itemId)));
    }
  }

  // ── Lookups (the constructor checked every reference) ─────────────────────────────────

  protected listing(id: string): StoredListing {
    return must(this.listingById.get(id), id);
  }
  protected item(id: string): StoredItem {
    return must(this.itemById.get(id), id);
  }
  protected interest(id: string): StoredInterest {
    return must(this.interestById.get(id), id);
  }
  protected event(id: string): EngineEvent {
    return must(EV[id], id);
  }
  protected rEval(r: StoredRequest): RequestEval {
    return must(this.requestEval.get(r.id), r.id);
  }
  protected gEval(g: StoredGoodsRequest): GoodsEval {
    return must(this.goodsEval.get(g.id), g.id);
  }
  // ── When a public request ended, for both projections ─────────────────────────────────

  /** Within the 14 days other people's finished records stay (null: not ended). */
  protected recent(endedAt: number | null): boolean {
    return endedAt === null || this.now - endedAt <= OTHERS_FINAL_DAYS * DAY_MS;
  }

  /** When a public request or alert ended: closed, or (a request) past its deadline. */
  protected isoEndedAt(i: StoredInterest): number | null {
    if (i.status !== "open") return i.closedAt ?? i.updatedAt ?? i.createdAt;
    if (i.expires) {
      const t = atMs(i.expires);
      if (Number.isFinite(t) && t <= this.now) return t;
    }
    return null;
  }

  /**
   * §9x item 1 (SELL6-N1): the public requests that were open for everyone to see and aren't in this view any more (`shown`: the
   * ids it carries whole), so a link to one says "This request is closed" instead of "not found". Each is only its id and the
   * event it was for (both were public while it was open; null for an item, or when its event was removed): never who asked,
   * how many, their budget or note, when it ended or why (closed by its owner, fulfilled, or past its deadline all read the
   * same). Never a private alert, which nobody but its owner could ever see. Those that ended in the last OTHERS_FINAL_DAYS,
   * the newest CLOSED_REQUESTS_CAP; one that is still open but can't be answered now (its event no longer takes requests: only a
   * guest's view leaves those out) counts as ended now.
   */
  protected closedRequests(shown: ReadonlySet<string>): ClosedRequest[] {
    const out: { c: ClosedRequest; at: number }[] = [];
    for (const i of this.interests) {
      if (i.kind !== "iso" || shown.has(i.id)) continue;
      const at = this.isoEndedAt(i) ?? this.now;
      if (this.now - at > OTHERS_FINAL_DAYS * DAY_MS) continue;
      const ev = typeof i.eventId === "string" ? EV[i.eventId] : undefined;
      out.push({ c: { id: i.id, eventId: ev && !ev.removedAt ? ev.id : null }, at });
    }
    return out.sort((a, b) => b.at - a.at || (a.c.id < b.c.id ? -1 : 1)).slice(0, CLOSED_REQUESTS_CAP).map((x) => x.c);
  }

  /** The listing's counts with every request on it (listingNumbers reads only these). */
  protected numbers(l: StoredListing): ListingNumbers {
    let n = this.numbersMemo.get(l.id);
    if (!n) {
      n = listingNumbers({ requests: this.requestsByListing.get(l.id) ?? [] }, l);
      this.numbersMemo.set(l.id, n);
    }
    return n;
  }
}

/** A signed-in viewer's view (C-CONTRACT §2). */
class Projection extends Records {
  constructor(
    w: World,
    private readonly viewerId: string,
    private readonly me: PersonRow,
    private readonly ctx: ProjectContext,
    dropped: string[],
  ) {
    super(w, ctx.now, dropped);
  }

  /**
   * The user ids this viewer's view names: the viewer, and everyone a record in it refers to (sellers, buyers, requesters, who added
   * an event, who reported a problem). Review of PR #88: the store loads only these people's profiles, never every profile, and the view
   * names no one else. Computed from the same selection as build.
   */
  personIds(): string[] {
    const s = this.select();
    const ids = new Set<string>([this.viewerId]);
    for (const e of s.events) {
      const by = EV[e.id]?.addedBy; // what eventView sends as addedBy, which people() names
      if (by) ids.add(by);
    }
    for (const l of s.listings) ids.add(l.sellerId);
    for (const r of s.requests) {
      ids.add(r.buyerId);
      if (r.problem) ids.add(r.problem.by);
    }
    for (const i of s.interests) ids.add(i.userId);
    for (const x of s.shares) ids.add(x.sellerId);
    for (const it of s.goods) ids.add(it.sellerId);
    for (const g of s.goodsReqs) {
      ids.add(g.buyerId);
      if (g.problem) ids.add(g.problem.by);
    }
    return [...ids];
  }

  build(): View {
    const me = this.viewerId;
    const { requests, goodsReqs, shares, listings, goods, interests, holdings, closed, events } = this.select();

    const viewListings = listings.map((l) => this.listingView(l));
    const viewItems = goods.map((it) => this.itemView(it));
    const viewRequests = requests.map((r) => requestView(r, this.rEval(r)));
    const viewGoodsReqs = goodsReqs.map((g) => goodsRequestView(g));
    const viewEvents = events.map((e) => this.eventView(e));
    const viewInterests = interests.map((i) => interestView(i, i.userId === me));
    const people = this.people({ events: viewEvents, listings, requests, interests, shares, goods, goodsReqs });

    return {
      protocol: HANDOFF_PROTOCOL,
      mode: "live",
      worldId: this.ctx.worldId,
      version: this.ctx.version,
      serverNow: this.now,
      nextRefreshAt: this.nextRefreshAt(viewListings, viewItems, requests, goodsReqs),
      unreadCount: this.ctx.unreadCount,
      // payMethods: the viewer's own methods (follow-on B1; a handle saved before B1 as one "other"), never anyone else's.
      viewer: { id: me, name: this.me.name, email: this.me.email, payMethods: payMethodsView(this.me.payMethods) },
      v: 11,
      events: viewEvents,
      people,
      holdings: holdings.map(holdingView),
      listings: viewListings,
      requests: viewRequests,
      interests: viewInterests,
      closedRequests: closed,
      responses: shares.map(shareView),
      goods: viewItems,
      goodsReqs: viewGoodsReqs,
      notifications: this.ctx.notifications.filter((n) => n.userId === me).slice(0, VIEW_NOTIFICATIONS).map(notificationView),
      strikes: {},
      policies: {},
      alertPrefs: {},
      seen: {},
      feedSeen: {},
      suggestions: [],
      feedbackGiven: false,
      clockOffset: 0,
      tick: 0,
    };
  }

  /** Which stored records this viewer's view holds (C-CONTRACT §3.1), before any is put into its view's words. */
  private select() {
    const me = this.viewerId;

    // Ticket requests, goods requests and shares: their two parties only (§3.1). Open ones always; finished ones the newest 200.
    const requests = this.keep(this.requests.filter((r) => r.buyerId === me || this.listing(r.listingId).sellerId === me), (r) => !this.requestFinal(r));
    const goodsReqs = this.keep(this.goodsReqs.filter((g) => g.buyerId === me || this.item(g.itemId).sellerId === me), (g) => !this.goodsFinal(g));
    const shares = this.keep(this.shares.filter((x) => x.sellerId === me || this.interest(x.isoId).userId === me), (x) => !this.shareFinal(x));

    // Listings: your own; other people's public ones while open and for 14 days after they end; and every listing a request
    // or share in the view refers to (a held reply reaches its requester only this way).
    const listingIds = new Set(this.keep(this.listings.filter((l) => l.sellerId === me), (l) => !this.listingFinalForOwner(l)).map((l) => l.id));
    for (const l of this.listings) if (l.sellerId !== me && !l.isoReplyFor && this.recent(this.listingEndedAt(l))) listingIds.add(l.id);
    for (const r of requests) listingIds.add(r.listingId);
    for (const x of shares) if (x.listingId) listingIds.add(x.listingId);
    const listings = this.listings.filter((l) => listingIds.has(l.id));

    // Items: the same pattern.
    const itemIds = new Set(this.keep(this.goods.filter((it) => it.sellerId === me), (it) => !this.itemFinalForOwner(it)).map((it) => it.id));
    for (const it of this.goods) if (it.sellerId !== me && this.recent(this.itemEndedAt(it))) itemIds.add(it.id);
    for (const g of goodsReqs) itemIds.add(g.itemId);
    for (const x of shares) if (x.itemId) itemIds.add(x.itemId);
    const goods = this.goods.filter((it) => itemIds.has(it.id));

    // Public requests: your own (and your alerts); other people's while live, or for 14 days after they end when your own
    // share or held reply refers to them. Other people's alerts: never.
    const mine = new Set<string>();
    for (const x of shares) if (x.sellerId === me) mine.add(x.isoId);
    for (const l of listings) if (l.sellerId === me && l.isoReplyFor) mine.add(l.isoReplyFor);
    const ownInterests = new Set(this.keep(this.interests.filter((i) => i.userId === me), (i) => i.status === "open").map((i) => i.id));
    const interests = this.interests.filter((i) => ownInterests.has(i.id)
      || (i.userId !== me && i.kind === "iso" && (isLive(i) || (mine.has(i.id) && this.recent(this.isoEndedAt(i))))));

    // Holdings: your own only; those still holding something, and those your listings in the view were made from.
    const listed = new Set(listings.filter((l) => l.sellerId === me).map((l) => l.holdingId));
    const holdings = this.keep(this.holdings.filter((h) => h.userId === me), (h) => h.qty > 0 || listed.has(h.id), (_h, k) => k);

    // §9x item 1: the public requests that ended and aren't above any more, by id and event only (closedRequests).
    const closed = this.closedRequests(new Set(interests.map((i) => i.id)));

    // Events: every one a record in the view refers to (the closure rule), and the rest until 30 days after they close.
    const referenced = new Set<string>();
    for (const x of [...holdings, ...listings, ...requests]) referenced.add(x.eventId);
    for (const i of interests) if (i.eventId) referenced.add(i.eventId);
    for (const c of closed) if (c.eventId) referenced.add(c.eventId);
    const keepUntil = (e: EngineEvent): boolean => this.now <= closesAt(e) + EVENT_KEEP_DAYS * DAY_MS;
    const events = this.w.events.filter((e) => {
      const ev = EV[e.id];
      return ev !== undefined && (referenced.has(e.id) || (!ev.removedAt && keepUntil(ev)));
    });
    return { requests, goodsReqs, shares, listings, goods, interests, holdings, closed, events };
  }

  // ── When records end, and which are finished ─────────────────────────────────────────

  /** When a listing stopped being open: withdrawn, its train left, the event's transfer window closed, or all of it went. */
  private listingEndedAt(l: StoredListing): number | null {
    const ends: number[] = [];
    const ev = this.event(l.eventId);
    if (typeof l.withdrawnAt === "number") ends.push(l.withdrawnAt);
    if (l.departsAt) {
      const d = atMs(l.departsAt);
      if (Number.isFinite(d) && d <= this.now) ends.push(d);
    }
    const close = Math.min(cutoffMs(ev), closesAt(ev));
    if (Number.isFinite(close) && close <= this.now) ends.push(close);
    if (l.listed > 0 && this.numbers(l).completed >= l.listed) {
      const done = (this.requestsByListing.get(l.id) ?? []).filter((r) => r.status === "completed").map((r) => r.completedAt ?? r.createdAt);
      ends.push(done.length > 0 ? Math.max(...done) : l.createdAt);
    }
    return ends.length > 0 ? Math.min(...ends) : null;
  }

  /** When an item stopped being open: sold, withdrawn, or its pickup window ended. */
  private itemEndedAt(it: StoredItem): number | null {
    if (typeof it.soldAt === "number") return it.soldAt;
    if (typeof it.withdrawnAt === "number") return it.withdrawnAt;
    const until = atMs(it.until);
    return Number.isFinite(until) && until <= this.now ? until : null;
  }

  private requestFinal(r: StoredRequest): boolean {
    return !isOpenReq(this.rEval(r)) && !openProblem(r.problem);
  }
  private goodsFinal(g: StoredGoodsRequest): boolean {
    return GFINAL.includes(this.gEval(g).st) && !openProblem(g.problem);
  }
  /** When a finished exchange ended (it completed, or its last step's time), or null while it's open or disputed. */
  private requestEndedAt(r: StoredRequest): number | null {
    if (!this.requestFinal(r)) return null;
    const last = Array.isArray(r.history) && r.history.length > 0 ? r.history[r.history.length - 1]!.at : r.createdAt;
    return typeof r.completedAt === "number" ? r.completedAt : last;
  }
  /** The same for a goods request. */
  private goodsEndedAt(g: StoredGoodsRequest): number | null {
    if (!this.goodsFinal(g)) return null;
    const last = Array.isArray(g.history) && g.history.length > 0 ? g.history[g.history.length - 1]!.at : g.createdAt;
    return typeof g.completedAt === "number" ? g.completedAt : last;
  }
  /** Finished for its seller: ended, and nothing on it is still in progress or disputed. */
  private listingFinalForOwner(l: StoredListing): boolean {
    return this.listingEndedAt(l) !== null && (this.requestsByListing.get(l.id) ?? []).every((r) => this.requestFinal(r));
  }
  private itemFinalForOwner(it: StoredItem): boolean {
    return this.itemEndedAt(it) !== null && (this.goodsReqsByItem.get(it.id) ?? []).every((g) => this.goodsFinal(g));
  }
  /** A share is finished once withdrawn, or once the request, listing or item it points at has ended. */
  private shareFinal(x: StoredShare): boolean {
    if (x.status !== "open" || this.isoEndedAt(this.interest(x.isoId)) !== null) return true;
    return x.listingId ? this.listingEndedAt(this.listing(x.listingId)) !== null : x.itemId ? this.itemEndedAt(this.item(x.itemId)) !== null : true;
  }

  /** The records always sent, plus the newest OWN_FINAL_CAP of the rest; in the document's order. */
  private keep<T extends { id: string; createdAt?: number }>(xs: readonly T[], always: (x: T) => boolean, at: (x: T, k: number) => number = (x) => x.createdAt ?? 0): T[] {
    const kept = new Set<string>();
    const rest: { x: T; at: number }[] = [];
    xs.forEach((x, k) => {
      if (always(x)) kept.add(x.id);
      else rest.push({ x, at: at(x, k) });
    });
    rest.sort((a, b) => b.at - a.at || (a.x.id < b.x.id ? -1 : a.x.id > b.x.id ? 1 : 0));
    for (const { x } of rest.slice(0, OWN_FINAL_CAP)) kept.add(x.id);
    return xs.filter((x) => kept.has(x.id));
  }

  // ── Records as the viewer sees them ──────────────────────────────────────────────────

  private eventView(stored: StoredEvent): ViewEvent {
    const ev = this.event(stored.id);
    const own = stored.createdBy === this.viewerId && !ev.removedAt;
    return {
      id: ev.id,
      kind: ev.kind === "train" || ev.kind === "trek" ? ev.kind : "event",
      title: ev.title,
      club: ev.club,
      cat: ev.cat,
      start: ev.start,
      ...(typeof ev.end === "string" ? { end: ev.end } : {}),
      ...(typeof ev.openUntil === "string" ? { openUntil: ev.openUntil } : {}),
      ...(typeof ev.rangePrefix === "string" ? { rangePrefix: ev.rangePrefix } : {}),
      venue: ev.venue,
      attend: ev.attend === "members" ? "members" : "all",
      tiers: (ev.tiers ?? []).map((t) => ({ id: t.id, label: t.label, price: t.price, src: t.src })),
      perPerson: ev.perPerson ?? 4,
      deadline: ev.deadline,
      ...(ev.namesChecked ? { namesChecked: true } : {}),
      ...(Array.isArray(ev.methods) ? { methods: ev.methods.filter((m) => typeof m === "string") } : {}),
      ...(ev.noOrganizer ? { noOrganizer: true } : {}),
      ...(ev.paperTicket ? { paperTicket: true } : {}),
      ...(ev.tag ? { tag: { label: ev.tag.label, tone: ev.tag.tone, icon: ev.tag.icon, line: ev.tag.line, ...(ev.tag.restricted ? { restricted: true } : {}) } } : {}),
      ...(typeof ev.officialUrl === "string" ? { officialUrl: ev.officialUrl } : {}),
      ...(typeof ev.notes === "string" ? { notes: ev.notes } : {}),
      policy: ev.policy,
      basePolicy: ev.basePolicy,
      policyChanged: !!ev.policyChanged,
      soldOut: !!ev.soldOut,
      policyNote: ev.policyNote ?? "",
      blurb: ev.blurb,
      path: ev.path,
      payment: ev.payment,
      sources: [],
      statusNote: ev.statusNote ?? "",
      sourcesNote: ev.sourcesNote ?? "",
      interestSeed: 0,
      cap: null,
      userAdded: true,
      createdAt: typeof ev.createdAt === "number" ? ev.createdAt : 0,
      addedBy: ev.addedBy ?? "",
      ...(typeof ev.removedAt === "number" ? { removedAt: ev.removedAt } : {}),
      ...(ev.unsupported ? { unsupported: true } : {}),
      // removeEvent's own rule, on the whole document: no listing or public request refers to it. Private alerts and holdings
      // never change it (review P2).
      ...(own ? { canRemove: !eventInPublicUse(this.w.doc, ev.id) } : {}),
    };
  }

  /**
   * Public fields for everyone, with the kinds of payment the seller takes (payKinds; follow-on B1); the seller adds the listing's
   * own handle, history, holding and record. A buyer whose reservation on it stands (accepted through completed) and was made before
   * B1, so it has no copy of its own (`pay`), also gets the listing's own handle (a legacy listing): their exchange is paid through it.
   * A held reply says which request it answers, to its two parties (the only people it reaches).
   */
  private listingView(l: StoredListing): ViewListing {
    const owner = l.sellerId === this.viewerId;
    const reqs = this.requestsByListing.get(l.id) ?? [];
    const reveal = !owner && reqs.some((r) => r.buyerId === this.viewerId && PAY_REVEAL.has(baseSt(this.rEval(r))) && payMethodsView(r.pay).length === 0);
    const holding = this.holdingById.get(l.holdingId);
    const payKinds = this.payKinds(l);
    const base: ViewListing = {
      id: l.id,
      eventId: l.eventId,
      sellerId: l.sellerId,
      listed: l.listed,
      ask: l.ask,
      paid: typeof l.paid === "number" ? l.paid : null,
      tier: l.tier ?? null,
      ...(typeof l.method === "string" ? { method: l.method } : {}),
      ...(l.namesChecked ? { namesChecked: true } : {}),
      ...(l.membersOnly ? { membersOnly: true } : {}),
      ...(l.membersOnly && typeof l.memberClub === "string" && l.memberClub ? { memberClub: l.memberClub } : {}),
      ...(l.restricted ? { restricted: true } : {}),
      // §9v items 4 and 5 (SELL5-M2): the club its seller named for an event that names none, and their own short restriction: as public
      // as the rest of the listing's terms, so every buyer reads them before asking to buy.
      ...(typeof l.club === "string" && l.club ? { club: l.club } : {}),
      ...(typeof l.restriction === "string" && l.restriction ? { restriction: l.restriction } : {}),
      obo: !!l.obo,
      ...(typeof l.minOffer === "number" ? { minOffer: l.minOffer } : {}),
      ...(typeof l.departsAt === "string" ? { departsAt: l.departsAt } : {}),
      note: typeof l.note === "string" ? l.note : "",
      createdAt: l.createdAt,
      ...(typeof l.withdrawnAt === "number" ? { withdrawnAt: l.withdrawnAt } : {}),
      // Paused by its seller: everyone may know it isn't on sale right now (numbers.available is 0 meanwhile), as with withdrawnAt.
      ...(typeof l.pausedAt === "number" ? { pausedAt: l.pausedAt } : {}),
      numbers: { ...this.numbers(l) },
      numbersUntil: this.numbersUntil(l),
      // "Seller says they have it · not verified" (selfReported): the claim is the seller's whatever the holding's state.
      source: holding ? holding.source : "self-reported",
      ...(typeof l.isoReplyFor === "string" ? { isoReplyFor: l.isoReplyFor } : {}),
      ...(payKinds.length > 0 ? { payKinds } : {}),
    };
    if (owner) {
      return {
        ...base,
        ...(typeof l.payHandle === "string" ? { payHandle: l.payHandle } : {}),
        ...closeReasonView(l), // why its seller closed it (follow-on B2): theirs only
        history: historyView(l.history),
        holdingId: l.holdingId,
        ...(l.record ? { record: { listedAt: l.record.listedAt, eventStart: l.record.eventStart, hoursBefore: l.record.hoursBefore, meets24: l.record.meets24, qty: l.record.qty, ask: l.record.ask } } : {}),
      };
    }
    return reveal && typeof l.payHandle === "string" ? { ...base, payHandle: l.payHandle } : base;
  }

  /**
   * Follow-on B1: the kinds of payment a buyer of this listing would use, so anyone signed in can see them before committing: the
   * seller's saved methods' kinds now (what a reservation would copy), or ["other"] for a listing with its own handle, or none. Kinds
   * only: where to pay reaches a buyer only in their own request's `pay`, from the reservation on.
   */
  private payKinds(l: StoredListing): PayKind[] {
    const own = payMethodsView(this.ctx.people.get(l.sellerId)?.payMethods);
    if (own.length > 0) return own.map((m) => m.kind);
    return typeof l.payHandle === "string" && l.payHandle.trim() ? ["other"] : [];
  }

  /**
   * The earliest moment the listing's counts change with no one acting, among the times this viewer may know: the listing's
   * own train leaving (public), and an unpaid hold lapsing on a request the viewer is a party to (the seller is party to every
   * request on it; a buyer only to their own). Another person's hold lapsing reaches everyone else with their next refresh
   * after it (the client refreshes every 60 s), which the world's next_due turns into a whole view.
   */
  private numbersUntil(l: StoredListing): number | null {
    const soon = new Soonest(this.now);
    if (typeof l.withdrawnAt !== "number" && l.departsAt) soon.consider(atMs(l.departsAt));
    const ev = this.event(l.eventId);
    const seller = l.sellerId === this.viewerId;
    for (const r of this.requestsByListing.get(l.id) ?? []) {
      if (!seller && r.buyerId !== this.viewerId) continue; // someone else's request: private, and so is when its hold ends
      const e = this.rEval(r);
      if (!reserves(e) || PAID_STEPS.has(baseSt(e))) continue; // only an unpaid hold (accepted, or a held reply) lapses
      soon.consider(requestDeadlines(r).next);
      if (r.departsAt) soon.consider(atMs(r.departsAt));
      soon.consider(closesAt(ev));
      soon.consider(cutoffMs(ev));
    }
    return soon.value();
  }

  /** Public fields for everyone, with the state the server sees (who holds it stays private); the seller adds the history. */
  private itemView(it: StoredItem): ViewItem {
    const badge = itemState({ goodsReqs: this.goodsReqsByItem.get(it.id) ?? [] }, it);
    const state: ItemState = { key: ITEM_KEYS.has(badge.key) ? (badge.key as ItemState["key"]) : "closed", label: badge.label, tone: badge.tone };
    return {
      id: it.id,
      sellerId: it.sellerId,
      title: it.title,
      // §9q item 6: a category, condition or pickup area only where the seller stated one (no key otherwise: nothing is guessed), and
      // noPickupBy where `until` is only the listing's expiry.
      ...stated(it, "cat"),
      ...stated(it, "cond"),
      price: it.price,
      obo: !!it.obo,
      ...(typeof it.minOffer === "number" ? { minOffer: it.minOffer } : {}),
      ...stated(it, "area"),
      until: it.until,
      ...(it.noPickupBy === true ? { noPickupBy: true as const } : {}),
      note: typeof it.note === "string" ? it.note : "",
      ...picView(it, !ENDED_ITEM.has(state.key)), // §9s item 6: its photo's reference, until the item ends
      createdAt: it.createdAt,
      ...(typeof it.soldAt === "number" ? { soldAt: it.soldAt } : {}),
      ...(typeof it.withdrawnAt === "number" ? { withdrawnAt: it.withdrawnAt } : {}),
      ...(typeof it.pausedAt === "number" ? { pausedAt: it.pausedAt } : {}), // paused by its seller (state "sellerPaused" unless held)
      state,
      stateUntil: this.stateUntil(it),
      ...(it.sellerId === this.viewerId ? { ...closeReasonView(it), history: historyView(it.history) } : {}), // the seller's only
    };
  }

  /**
   * The earliest moment an item's state changes with no one acting, among the times this viewer may know: its pickup window
   * ending (public), and its hold lapsing for the hold's two parties only. The hold ends a day after the pickup time they
   * agreed (or 48 hours after the seller accepted), so to anyone else it would say when and where two people will meet.
   */
  private stateUntil(it: StoredItem): number | null {
    if (typeof it.soldAt === "number" || typeof it.withdrawnAt === "number") return null;
    const soon = new Soonest(this.now);
    soon.consider(atMs(it.until));
    const held = reservedFor({ goodsReqs: this.goodsReqsByItem.get(it.id) ?? [] }, it);
    if (held && (it.sellerId === this.viewerId || held.buyerId === this.viewerId)) soon.consider(held.holdUntil);
    return soon.value();
  }

  /**
   * Everyone a record in the view refers to (the closure rule), and you. Public: "First L.", the first name and a color. You:
   * your full name, email and payment handle. Someone a request, goods request, held reply or share links you with: their full
   * name, and their email while a ticket reservation between you stands (accepted to sent) or once you both agreed to share
   * it for an item. Never anyone's payment handle but yours (a listing carries the handle a buyer may see).
   */
  private people(v: {
    events: readonly ViewEvent[];
    listings: readonly StoredListing[];
    requests: readonly StoredRequest[];
    interests: readonly StoredInterest[];
    shares: readonly StoredShare[];
    goods: readonly StoredItem[];
    goodsReqs: readonly StoredGoodsRequest[];
  }): Record<string, ViewPerson> {
    const me = this.viewerId;
    const ids = new Set<string>([me]);
    for (const e of v.events) if (e.addedBy) ids.add(e.addedBy);
    for (const l of v.listings) ids.add(l.sellerId);
    for (const r of v.requests) {
      ids.add(r.buyerId);
      if (r.problem) ids.add(r.problem.by);
    }
    for (const i of v.interests) ids.add(i.userId);
    for (const x of v.shares) ids.add(x.sellerId);
    for (const it of v.goods) ids.add(it.sellerId);
    for (const g of v.goodsReqs) {
      ids.add(g.buyerId);
      if (g.problem) ids.add(g.problem.by);
    }

    // Links and contact, from every record (not only those in the view): a relationship doesn't depend on the view's bounds. Review of
    // PR #88: a full name comes only from a trade that is open or ended within the last 14 days (`recent`), so it doesn't stay visible
    // for good once the two stopped trading; after that the other person reads as "First L." like anyone else.
    const linked = new Set<string>();
    const contact = new Set<string>();
    for (const r of this.requests) {
      const sellerId = this.listing(r.listingId).sellerId;
      const other = r.buyerId === me ? sellerId : sellerId === me ? r.buyerId : null;
      if (other === null || other === me || !this.recent(this.requestEndedAt(r))) continue;
      linked.add(other);
      if (CONTACT_REVEAL.has(baseSt(this.rEval(r)))) contact.add(other);
    }
    for (const g of this.goodsReqs) {
      const sellerId = this.item(g.itemId).sellerId;
      const other = g.buyerId === me ? sellerId : sellerId === me ? g.buyerId : null;
      if (other === null || other === me || !this.recent(this.goodsEndedAt(g))) continue;
      linked.add(other);
      if (GOODS_CONTACT.has(this.gEval(g).st) && g.consent?.buyer === true && g.consent?.seller === true) contact.add(other);
    }
    for (const x of this.shares) {
      if (this.shareFinal(x)) continue;
      const requesterId = this.interest(x.isoId).userId;
      const other = x.sellerId === me ? requesterId : requesterId === me ? x.sellerId : null;
      if (other !== null && other !== me) linked.add(other);
    }

    const out: Record<string, ViewPerson> = {};
    for (const id of ids) {
      const row = this.ctx.people.get(id);
      const person: ViewPerson = !row
        ? { name: CLASSMATE, first: CLASSMATE, color: colorFor(id), demo: true }
        : id === me
          ? { name: row.name, first: firstName(row.name), color: colorFor(id), demo: true, ...(row.email ? { contact: row.email } : {}) }
          : linked.has(id)
            ? { name: row.name, first: firstName(row.name), color: colorFor(id), demo: true, ...(contact.has(id) && row.email ? { contact: row.email } : {}) }
            : { name: publicName(row.name), first: firstName(row.name), color: colorFor(id), demo: true };
      // A user id is never a prototype key here (ids come from the platform), but define keeps it a plain data property anyway.
      Object.defineProperty(out, id, { value: person, enumerable: true, writable: true, configurable: true });
    }
    return out;
  }

  /**
   * When something in the view changes with no one acting, as far as the viewer may know: a listing's or item's counts or state
   * (numbersUntil, stateUntil: public times, and holds the viewer is a party to), or one of your own deadlines, after which the
   * server stores the expiry and tells you. The client refreshes just after it, sending it back (refreshView then answers with
   * the whole view, though nothing may be stored at that moment).
   */
  private nextRefreshAt(listings: readonly ViewListing[], items: readonly ViewItem[], requests: readonly StoredRequest[], goodsReqs: readonly StoredGoodsRequest[]): number | null {
    const soon = new Soonest(this.now);
    for (const l of listings) soon.consider(l.numbersUntil);
    for (const it of items) soon.consider(it.stateUntil);
    for (const r of requests) {
      const e = this.rEval(r);
      if (!isOpenReq(e)) continue;
      soon.consider(requestDeadlines(r).next); // an offer, reply or hold lapsing; a disputed payment's release time
      if (!PAID_STEPS.has(baseSt(e))) {
        const ev = this.event(r.eventId);
        if (r.departsAt) soon.consider(atMs(r.departsAt));
        soon.consider(closesAt(ev));
        soon.consider(cutoffMs(ev));
      }
    }
    for (const g of goodsReqs) {
      const it = this.item(g.itemId);
      const st = this.gEval(g).st;
      if (GFINAL.includes(st)) continue;
      if (st === "pending") soon.consider(goodsRespondBy(g, it));
      if (st === "accepted") soon.consider(g.holdUntil);
      soon.consider(atMs(it.until));
    }
    return soon.value();
  }
}

/**
 * The guest view (C-CONTRACT §7): what a signed-out visitor may see, from its own allowlists, with no viewer. Only what is open
 * right now, and only its published facts:
 * - listings anyone signed in could take from now (public, not withdrawn or paused, on an event open to transfers, at least one
 *   left), with that number: never the seller, how many are held or sold, or anything typed with it;
 * - items on sale now (not sold, withdrawn, paused, on hold or past their last day): never the seller, pickup area or note;
 * - live public requests: what is wanted, how many and by when; never who asked, their note or budget. Never an alert;
 * - events: title, organizer, category, dates, attendance, ticket types and face values, limits; never who added them, nor
 *   the venue, link or notes they typed.
 * Nobody's id or name appears: the people, requests, goods requests, shares, holdings and notifications aren't read at all.
 */
class GuestProjection extends Records {
  constructor(w: World, private readonly ctx: GuestContext, dropped: string[]) {
    super(w, ctx.now, dropped);
  }

  build(): GuestView {
    const listings: { l: StoredListing; available: number }[] = [];
    for (const l of this.listings) {
      const available = this.takeable(l);
      if (available > 0) listings.push({ l, available });
    }
    const goods = this.goods.filter((it) => itemState({ goodsReqs: this.goodsReqsByItem.get(it.id) ?? [] }, it).key === "available");
    // liveRequest: an open public request before its deadline, on an event that still takes requests (or for an item).
    const wanted = this.interests.filter((i) => i.kind === "iso" && liveRequest(this.w.doc, i) && (i.eventId == null || !this.event(i.eventId).removedAt));
    // §9x item 1: the public requests that aren't open here any more, by id and event only (closedRequests: never a removed event).
    const closed = this.closedRequests(new Set(wanted.map((i) => i.id)));

    // Events: not removed, until 30 days after they close (as every signed-in viewer gets them), and every one a listing or
    // request here refers to.
    const referenced = new Set<string>();
    for (const { l } of listings) referenced.add(l.eventId);
    for (const i of wanted) if (i.eventId) referenced.add(i.eventId);
    for (const c of closed) if (c.eventId) referenced.add(c.eventId);
    const events = this.w.events.filter((e) => {
      const ev = EV[e.id];
      return ev !== undefined && !ev.removedAt && (referenced.has(e.id) || this.now <= closesAt(ev) + EVENT_KEEP_DAYS * DAY_MS);
    });

    return {
      protocol: HANDOFF_PROTOCOL,
      mode: "live",
      guest: true,
      viewer: null,
      worldId: this.ctx.worldId,
      version: this.ctx.version,
      serverNow: this.now,
      nextRefreshAt: this.nextRefreshAt(listings.map((x) => x.l), goods, wanted),
      events: events.map((e) => this.eventView(e)),
      listings: listings.map(({ l, available }) => guestListingView(l, available)),
      goods: goods.map(guestItemView),
      wanted: wanted.map(guestWantedView),
      closedWanted: closed,
    };
  }

  /**
   * How many of a listing anyone signed in could take now: numbers.available (the count every viewer gets, 0 while its seller has
   * it paused), on a public listing that isn't withdrawn, whose event is open to transfers. 0 for a reply held for one request, or
   * while the event's window is closed (it started, its transfer cutoff passed) or it can't be traded in the pilot.
   */
  private takeable(l: StoredListing): number {
    if (typeof l.isoReplyFor === "string" || typeof l.withdrawnAt === "number") return 0;
    const ev = this.event(l.eventId);
    if (ev.removedAt || ev.unsupported || !access(ev).ok) return 0;
    return this.numbers(l).available;
  }

  /** An event's published facts, field by field. The browser's normalizeEvent fills the rest ("A classmate" added it). */
  private eventView(stored: StoredEvent): GuestEvent {
    const ev = this.event(stored.id);
    return {
      id: ev.id,
      kind: ev.kind === "train" || ev.kind === "trek" ? ev.kind : "event",
      title: ev.title,
      club: ev.club,
      cat: ev.cat,
      start: ev.start,
      ...(typeof ev.end === "string" ? { end: ev.end } : {}),
      ...(typeof ev.openUntil === "string" ? { openUntil: ev.openUntil } : {}),
      attend: ev.attend === "members" ? "members" : "all",
      tiers: (ev.tiers ?? []).map((t) => ({ id: t.id, label: t.label, price: t.price })),
      perPerson: ev.perPerson ?? 4,
      deadline: ev.deadline,
      ...(ev.namesChecked ? { namesChecked: true } : {}),
      ...(ev.paperTicket ? { paperTicket: true } : {}),
      ...(ev.unsupported ? { unsupported: true } : {}),
    };
  }

  /**
   * The earliest published time at which something here stops being open with no one acting: a listing's train leaving or its
   * event's transfer window closing, an item's pickup window ending, a request's deadline or its event closing. Never a hold's
   * end (a hold lapsing reaches a guest with the next refresh after it, through the world's next_due, as for any stranger).
   */
  private nextRefreshAt(listings: readonly StoredListing[], goods: readonly StoredItem[], wanted: readonly StoredInterest[]): number | null {
    const soon = new Soonest(this.now);
    const closes = (eventId: string): void => {
      const ev = this.event(eventId);
      soon.consider(closesAt(ev));
      soon.consider(cutoffMs(ev));
    };
    for (const l of listings) {
      if (l.departsAt) soon.consider(atMs(l.departsAt));
      closes(l.eventId);
    }
    for (const it of goods) soon.consider(atMs(it.until));
    for (const i of wanted) {
      if (i.expires) soon.consider(atMs(i.expires));
      if (i.eventId) closes(i.eventId);
    }
    return soon.value();
  }
}

// ── The guest view's records (C-CONTRACT §7), each from its own allowlist ───────────────

function guestListingView(l: StoredListing, available: number): GuestListing {
  return {
    id: l.id,
    eventId: l.eventId,
    tier: l.tier ?? null,
    ask: l.ask,
    obo: !!l.obo,
    available,
    ...(l.membersOnly ? { membersOnly: true } : {}),
    ...(l.membersOnly && typeof l.memberClub === "string" && l.memberClub ? { memberClub: l.memberClub } : {}),
    ...(l.restricted ? { restricted: true } : {}),
    // §9v items 4 and 5 (SELL5-M2): the club named on the listing (a club's name, as public as memberClub), and whether the organizer
    // must change the name on it (the seller's choice: a flag, no words).
    // §9x item 1 (SELL6-N1): the seller's own restriction words too, so a visitor reads every published eligibility and transfer
    // restriction before signing in (SELL5-M2 sent only that one was noted). They are one short line the seller published as a
    // term of the listing (3 to 80 characters, checked when it was posted: the engine's restrictionText), read again here through
    // that same check. Words that look like contact or payment details are not sent (guestRestriction: the visitor then reads
    // only that a restriction was noted, as before). The seller's note stays out, as before.
    ...(typeof l.club === "string" && l.club ? { club: l.club } : {}),
    ...(l.namesChecked === true || l.method === "name" ? { namesChecked: true as const } : {}),
    ...guestRestriction(l),
    ...(typeof l.departsAt === "string" ? { departsAt: l.departsAt } : {}),
    createdAt: l.createdAt,
  };
}

/**
 * What a restriction's words must not look like to reach a visitor: somewhere to write, call or pay (an email address or a handle, a
 * link, a phone number, a payment app's name). A restriction says who may use a ticket or how it moves; it is no place for contact
 * or payment details, and a guest view never carries those.
 */
const CONTACT_LIKE = /@|https?:|www\.|\.(?:com|edu|org|net|io|me)\b|\b(?:venmo|zelle|paypal|cash\s?app|whatsapp)\b|\d[\d\s().-]{5,}\d/i;

/**
 * §9x item 1: a listing's restriction in its seller's words, for a visitor: the stored line when it is one the engine accepts
 * (restrictionText). One that looks like contact or payment details (CONTACT_LIKE) is not sent: the visitor reads only that the
 * seller noted a restriction (restrictionNoted, as SELL5-M2 sent for every one), and its words once signed in.
 */
function guestRestriction(l: StoredListing): { restriction?: string; restrictionNoted?: true } {
  if (typeof l.restriction !== "string" || !l.restriction) return {};
  const words = restrictionText(l.restriction);
  return words && !CONTACT_LIKE.test(words) ? { restriction: words } : { restrictionNoted: true };
}

/** §9q item 6: one of an item's optional words (its category, condition or pickup area), only where its seller stated it. */
function stated<K extends "cat" | "cond" | "area">(it: StoredItem, key: K): { [P in K]?: string } {
  const v = it[key];
  return (typeof v === "string" && v !== "" ? { [key]: v } : {}) as { [P in K]?: string };
}

function guestItemView(it: StoredItem): GuestItem {
  return {
    id: it.id, title: it.title, ...stated(it, "cat"), ...stated(it, "cond"), price: it.price, obo: !!it.obo, until: it.until,
    ...(it.noPickupBy === true ? { noPickupBy: true as const } : {}), ...picView(it, true), createdAt: it.createdAt, // every guest item is available now
  };
}

// ── An item's photo (§9s item 6) ─────────────────────────────────────────────────────────

/** An item that has ended keeps no photo: sold, closed by its seller, or past its last day. */
const ENDED_ITEM: ReadonlySet<string> = new Set<ItemState["key"]>(["sold", "withdrawn", "closed"]);

/** The photo's reference as a view carries it (its version and size, copied field by field), only while `shown`. */
function picView(it: StoredItem, shown: boolean): { pic?: PhotoRef } {
  const p: unknown = it.pic;
  return shown && picOk(p) ? { pic: { v: p.v, w: p.w, h: p.h } } : {};
}

/**
 * Whose request for an item's photo is answered (the route in the page folder asks through the store): the reference when this
 * viewer's view shows the item with its photo, else null. A signed-out visitor (viewerId null): only an item that is available now,
 * the guest view's own rule (not on hold, paused, sold, closed or past its last day). A signed-in account: any item that hasn't
 * ended, which every signed-in view carries. Call it inside withEngine at the request's time, as the projections are.
 */
export function itemPhotoFor(doc: WorldDoc, itemId: string, viewerId: string | null): PhotoRef | null {
  const goods = Array.isArray(doc["goods"]) ? (doc["goods"] as StoredItem[]) : [];
  const it = goods.find((x) => !!x && x.id === itemId);
  if (!it) return null;
  applyWorld(doc as unknown as LiveWorld);
  const reqs = Array.isArray(doc["goodsReqs"]) ? (doc["goodsReqs"] as StoredGoodsRequest[]).filter((g) => !!g && g.itemId === itemId) : [];
  const key = itemState({ goodsReqs: reqs }, it).key;
  const shown = viewerId === null ? key === "available" : !ENDED_ITEM.has(key);
  return picView(it, shown).pic ?? null;
}

function guestWantedView(i: StoredInterest): GuestWanted {
  return {
    id: i.id,
    eventId: i.eventId ?? null,
    ...(i.goods ? { goods: { title: i.goods.title, cat: i.goods.cat } } : {}),
    qty: i.qty,
    expires: typeof i.expires === "string" ? i.expires : null,
    createdAt: i.createdAt,
  };
}

// ── Records every party sees whole (built field by field all the same) ──────────────────

/**
 * A request for its two parties. Its payment snapshot (`pay`, follow-on B1) only while it's reserved, paid, confirmed, sent or completed
 * (PAY_REVEAL, by its state now: never at an offer, a counter or a held reply, nor once a reservation ended unpaid); `paidVia` whenever
 * the buyer said which method they used.
 */
function requestView(r: StoredRequest, e: RequestEval): TicketRequest {
  const pay = PAY_REVEAL.has(baseSt(e)) ? payMethodsView(r.pay) : [];
  return {
    id: r.id,
    listingId: r.listingId,
    eventId: r.eventId,
    buyerId: r.buyerId,
    qty: r.qty,
    topUp: r.topUp ?? 0,
    price: r.price,
    ...(r.isOffer ? { isOffer: true } : {}),
    ...(typeof r.departsAt === "string" ? { departsAt: r.departsAt } : {}),
    msg: typeof r.msg === "string" ? r.msg : "",
    status: r.status as QuickStatus, // checked against QUICK_STATUSES when the projection started
    createdAt: r.createdAt,
    flow: "quick",
    consent: consentView(r.consent),
    reports: {
      ...(typeof r.reports?.seller === "number" ? { seller: r.reports.seller } : {}),
      ...(typeof r.reports?.buyer === "number" ? { buyer: r.reports.buyer } : {}),
    },
    history: historyView(r.history),
    ...(typeof r.reason === "string" ? { reason: r.reason } : {}),
    ...(r.problem ? { problem: problemView(r.problem) } : {}),
    ...(typeof r.expiresAt === "number" ? { expiresAt: r.expiresAt } : {}),
    ...(typeof r.acceptedAt === "number" ? { acceptedAt: r.acceptedAt } : {}),
    ...(typeof r.holdUntil === "number" ? { holdUntil: r.holdUntil } : {}),
    ...(r.memberConfirmed ? { memberConfirmed: true } : {}),
    ...(r.isoReply ? { isoReply: true } : {}),
    ...(r.isCounter ? { isCounter: true } : {}),
    ...(typeof r.counterPrice === "number" ? { counterPrice: r.counterPrice } : {}),
    ...(typeof r.counteredAt === "number" ? { counteredAt: r.counteredAt } : {}),
    ...(typeof r.paidAt === "number" ? { paidAt: r.paidAt } : {}),
    ...(typeof r.paymentConfirmedAt === "number" ? { paymentConfirmedAt: r.paymentConfirmedAt } : {}),
    ...(typeof r.deliveredAt === "number" ? { deliveredAt: r.deliveredAt } : {}),
    ...(typeof r.completedAt === "number" ? { completedAt: r.completedAt } : {}),
    ...(typeof r.restoredAt === "number" ? { restoredAt: r.restoredAt } : {}),
    ...(typeof r.payDisputedAt === "number" ? { payDisputedAt: r.payDisputedAt } : {}),
    ...(typeof r.releaseAfter === "number" ? { releaseAfter: r.releaseAfter } : {}),
    ...(pay.length > 0 ? { pay } : {}),
    ...(isPayKind(r.paidVia) ? { paidVia: r.paidVia } : {}),
    ...(r.inviteFlow === true ? { inviteFlow: true as const } : {}),
    ...(typeof r.invitedAt === "number" ? { invitedAt: r.invitedAt } : {}),
    ...(typeof r.fromIso === "string" ? { fromIso: r.fromIso } : {}),
    ...(typeof r.wantedQty === "number" ? { wantedQty: r.wantedQty } : {}),
    ...(typeof r.blockedAt === "number" ? { blockedAt: r.blockedAt } : {}),
  };
}

const PAY_KIND_SET: ReadonlySet<string> = new Set<PayKind>(["venmo", "zelle", "paypal", "other"]);
const isPayKind = (k: unknown): k is PayKind => typeof k === "string" && PAY_KIND_SET.has(k);

/** Payment methods field by field (at most two, each a known kind with a value), or none: a profile's, or an exchange's snapshot. */
function payMethodsView(list: readonly unknown[] | null | undefined): PayMethod[] {
  const out: PayMethod[] = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (out.length === 2) break;
    const o = m as { kind?: unknown; value?: unknown } | null;
    if (o && isPayKind(o.kind) && typeof o.value === "string" && o.value.trim()) out.push({ kind: o.kind, value: o.value });
  }
  return out;
}

function goodsRequestView(g: StoredGoodsRequest): GoodsRequest {
  return {
    id: g.id,
    itemId: g.itemId,
    buyerId: g.buyerId,
    price: g.price,
    ...(g.isOffer ? { isOffer: true } : {}),
    msg: typeof g.msg === "string" ? g.msg : "",
    status: g.status,
    createdAt: g.createdAt,
    consent: consentView(g.consent),
    history: historyView(g.history),
    ...(typeof g.acceptedAt === "number" ? { acceptedAt: g.acceptedAt } : {}),
    ...(typeof g.holdUntil === "number" ? { holdUntil: g.holdUntil } : {}),
    ...(typeof g.pickupAt === "string" ? { pickupAt: g.pickupAt } : {}),
    ...(typeof g.restoredAt === "number" ? { restoredAt: g.restoredAt } : {}),
    ...(typeof g.completedAt === "number" ? { completedAt: g.completedAt } : {}),
    ...(typeof g.reason === "string" ? { reason: g.reason } : {}),
    ...(g.problem ? { problem: problemView(g.problem) } : {}),
  };
}

/** Public fields for everyone; the owner adds when and why it closed, and an alert's settings (alerts reach only their owner). */
function interestView(i: StoredInterest, owner: boolean): Interest {
  const pub: Interest = {
    id: i.id,
    userId: i.userId,
    eventId: i.eventId ?? null,
    kind: i.kind === "alert" ? "alert" : "iso",
    qty: i.qty,
    budget: typeof i.budget === "number" ? i.budget : null,
    note: typeof i.note === "string" ? i.note : "",
    expires: typeof i.expires === "string" ? i.expires : null,
    status: i.status === "closed" ? "closed" : "open",
    createdAt: i.createdAt,
    ...(typeof i.updatedAt === "number" ? { updatedAt: i.updatedAt } : {}),
    ...(i.goods ? { goods: { title: i.goods.title, cat: i.goods.cat } } : {}),
  };
  if (!owner) return pub;
  return {
    ...pub,
    ...(typeof i.closedAt === "number" ? { closedAt: i.closedAt } : {}),
    ...(i.closedReason === "fulfilled" || i.closedReason === "cancelled" ? { closedReason: i.closedReason } : {}),
    ...(i.kind === "alert" ? { max: typeof i.max === "number" ? i.max : null, paused: !!i.paused } : {}),
  };
}

function shareView(x: StoredShare): Share {
  return {
    id: x.id,
    isoId: x.isoId,
    ...(typeof x.listingId === "string" ? { listingId: x.listingId } : {}),
    ...(typeof x.itemId === "string" ? { itemId: x.itemId } : {}),
    sellerId: x.sellerId,
    createdAt: x.createdAt,
    status: x.status === "withdrawn" ? "withdrawn" : "open",
    partial: !!x.partial,
    ...(typeof x.withdrawnAt === "number" ? { withdrawnAt: x.withdrawnAt } : {}),
  };
}

function holdingView(h: StoredHolding): Holding {
  return {
    id: h.id,
    userId: h.userId,
    eventId: h.eventId,
    tier: h.tier ?? null,
    qty: h.qty,
    paid: typeof h.paid === "number" ? h.paid : null,
    ...(typeof h.paidAdj === "number" ? { paidAdj: h.paidAdj } : {}),
    source: h.source,
  };
}

function notificationView(n: ViewNotification): ViewNotification {
  return { id: n.id, userId: n.userId, text: n.text, link: n.link ? linkView(n.link) : null, at: n.at, read: n.read };
}

function linkView(l: NotificationLink): NotificationLink {
  return {
    name: l.name,
    ...(typeof l.id === "string" ? { id: l.id } : {}),
    ...(typeof l.tab === "string" ? { tab: l.tab } : {}),
    ...(typeof l.listing === "string" ? { listing: l.listing } : {}),
  };
}

function historyView(history: readonly StoredHistoryEntry[] | undefined): HistoryEntry[] {
  return (history ?? []).map((x) => ({ at: x.at, text: x.text }));
}

/** Follow-on B2: a closed listing's or item's reason, for its seller's view only: one of the two words, on a closed record, or nothing. */
function closeReasonView(x: { withdrawnAt?: number; closeReason?: unknown }): { closeReason?: CloseReason } {
  return typeof x.withdrawnAt === "number" && (x.closeReason === "soldElsewhere" || x.closeReason === "noLongerSelling") ? { closeReason: x.closeReason } : {};
}

function problemView(p: StoredProblem): ProblemReport {
  return { by: p.by, role: p.role, reason: p.reason, at: p.at, ...(typeof p.resolvedAt === "number" ? { resolvedAt: p.resolvedAt } : {}) };
}

function consentView(c: { buyer?: boolean; seller?: boolean } | undefined): { buyer?: boolean; seller?: boolean } {
  return { ...(typeof c?.buyer === "boolean" ? { buyer: c.buyer } : {}), ...(typeof c?.seller === "boolean" ? { seller: c.seller } : {}) };
}

// ── Small helpers ────────────────────────────────────────────────────────────────────────

/** The earliest of the times considered that is still to come, or null. */
class Soonest {
  private best = Infinity;
  constructor(private readonly now: number) {}
  consider(t: number | null | undefined): void {
    if (typeof t === "number" && Number.isFinite(t) && t > this.now && t < this.best) this.best = t;
  }
  value(): number | null {
    return this.best === Infinity ? null : this.best;
  }
}

function openProblem(p: StoredProblem | undefined): boolean {
  return !!p && p.resolvedAt == null;
}

/** The engine's first name: the first word of the full name ("Classmate" when there is none). */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "Classmate";
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const xs = m.get(k);
  if (xs) xs.push(v);
  else m.set(k, [v]);
}

function must<T>(v: T | undefined, id: string): T {
  if (v === undefined) throw new Error(`Handoff: the projection lost track of ${id}.`);
  return v;
}
