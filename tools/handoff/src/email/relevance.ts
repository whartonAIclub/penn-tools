// Is an email still worth sending, and what may it say (FOLLOWON-PLAN §2.4, the table's "Still worth sending if" column)? Checked
// on the committed document at send time, inside the engine (withEngine, as the store's port.run sets it up: the world's events, the
// people's public names, the time), reading the engine's own rules only. A job whose record moved on (answered, closed, expired,
// paused, no longer matching, gone) is skipped, so a delayed email never asks for something that's already done; a match email
// stops when the alert is paused, the request is fulfilled, cancelled or expired, or the listing or item is paused, closed or gone.
//
// It also returns the email's facts (types.ts EmailFacts): titles, the other person's first name, a deadline in the engine's words, and
// for matches the public asking price. Never a payment destination, an address, a pickup area or time, a budget, a lowest offer, a
// note, a problem's reason, or an amount in an exchange email.

import * as E from "../../engine/index.js";
import type { EngineEvent, GoodsRequest, Interest, Item, Listing, LiveWorld, TicketRequest } from "../../engine/index.js";
import type { WorldDoc } from "../engine-port.js";
import type { EmailFacts, JobRef, Relevance, SkipWhy } from "./types.js";

const no = (why: SkipWhy): Relevance => ({ ok: false, why });
const yes = (facts: EmailFacts): Relevance => ({ ok: true, facts });

/** A time in the engine's words (fmtMs: "Nov 10, 2026, 6:00 PM", New York time), or null. */
const dueText = (ms: unknown): string | null => (typeof ms === "number" && Number.isFinite(ms) ? E.fmtMs(ms) : null);
/** Someone's first name as the engine knows it (an id without a profile reads "A classmate"), or null. */
function firstOf(userId: string): string | null {
  const p = E.PEOPLE[userId];
  return p && typeof p.first === "string" && p.first ? p.first : null;
}
function eventOf(id: string): EngineEvent | undefined {
  return Object.prototype.hasOwnProperty.call(E.EV, id) ? E.EV[id] : undefined;
}

const CLOSED = new Set(["declined", "cancelled", "released"]);
/** Why a ticket request or goods request no longer waits on the step its email asked for. */
function movedOn(st: string): SkipWhy {
  if (st === "expired") return "expired";
  if (st === "paused") return "paused";
  return CLOSED.has(st) ? "closed" : "answered";
}

// ── Exchanges: a ticket request (r…) or a goods request (gr…), for its seller or buyer ───────────────────────────────

interface TicketParts {
  r: TicketRequest;
  l: Listing;
  ev: EngineEvent;
  st: string;
}

function ticketParts(s: LiveWorld, job: JobRef, role: "seller" | "buyer"): TicketParts | SkipWhy {
  const r = s.requests.find((x) => x.id === job.ref);
  if (!r || r.flow !== "quick") return "missing";
  const l = s.listings.find((x) => x.id === r.listingId);
  const ev = eventOf(r.eventId);
  if (!l || !ev) return "missing";
  if ((role === "seller" ? l.sellerId : r.buyerId) !== job.userId) return "missing";
  return { r, l, ev, st: E.rState(r).st };
}

function ticketFacts(p: TicketParts, other: string, due: unknown): EmailFacts {
  return {
    title: p.ev.title, who: firstOf(other), unit: E.unitOf(p.ev), qty: null, due: dueText(due), price: null, obo: false, via: null,
    eventId: p.ev.id, listingId: p.l.id, itemId: null,
    ...(E.freeDeal(p.r) ? { free: true as const } : {}), // §9x item 1: a free ticket's emails ask nobody to pay (a yes/no fact, never an amount)
  };
}

/** A ticket exchange email, for `role`: worth sending while `still` says so (true), with the deadline it names. */
function ticket(
  s: LiveWorld,
  job: JobRef,
  role: "seller" | "buyer",
  still: (p: TicketParts) => true | SkipWhy,
  due: (p: TicketParts) => unknown,
): Relevance {
  const p = ticketParts(s, job, role);
  if (typeof p === "string") return no(p);
  const ok = still(p);
  if (ok !== true) return no(ok);
  return yes(ticketFacts(p, role === "seller" ? p.r.buyerId : p.l.sellerId, due(p)));
}

/** The request is at `want` (and nothing else stops it), or why not. */
const at = (want: string) => (p: TicketParts): true | SkipWhy => (p.st === want ? true : movedOn(p.st));

interface GoodsParts {
  g: GoodsRequest;
  it: Item;
  st: string;
}

function goodsParts(s: LiveWorld, job: JobRef, role: "seller" | "buyer"): GoodsParts | SkipWhy {
  const g = s.goodsReqs.find((x) => x.id === job.ref);
  if (!g) return "missing";
  const it = s.goods.find((x) => x.id === g.itemId);
  if (!it) return "missing";
  if ((role === "seller" ? it.sellerId : g.buyerId) !== job.userId) return "missing";
  return { g, it, st: E.gState(g, it).st };
}

function goods(s: LiveWorld, job: JobRef, role: "seller" | "buyer", still: (p: GoodsParts) => true | SkipWhy, due: (p: GoodsParts) => unknown): Relevance {
  const p = goodsParts(s, job, role);
  if (typeof p === "string") return no(p);
  const ok = still(p);
  if (ok !== true) return no(ok);
  const other = role === "seller" ? p.g.buyerId : p.it.sellerId;
  return yes({
    title: p.it.title, who: firstOf(other), unit: "item", qty: null, due: dueText(due(p)), price: null, obo: false, via: null,
    eventId: null, listingId: null, itemId: p.it.id,
  });
}

// ── Matches: a listing or item for an interest (iso-…), or a seller's share (rsp-…) ─────────────────────────────────

/** Why an alert or public request no longer takes matches, or null while it does. */
function interestStale(i: Interest): SkipWhy | null {
  if (i.status !== "open") return "closed";
  if (E.isExpired(i)) return "expired";
  if (i.kind === "alert" && i.paused) return "paused";
  return null;
}

/** Why a listing can't be taken from now, or null while it can (the match check then decides). */
function listingStale(s: LiveWorld, l: Listing): SkipWhy | null {
  if (l.withdrawnAt) return "closed";
  if (E.listingPaused(s, l)) return "paused";
  return null;
}

/** Why an item can't be requested now, or null while it can. */
function itemStale(it: Item): SkipWhy | null {
  if (it.soldAt || it.withdrawnAt) return "closed";
  if (E.pickupOver(it)) return "expired";
  if (E.itemPaused(it)) return "paused";
  return null;
}

function listingMatch(s: LiveWorld, i: Interest, l: Listing, who: string | null): Relevance {
  const ev = eventOf(l.eventId);
  if (!ev || l.eventId !== i.eventId) return no("missing");
  const stale = interestStale(i) ?? listingStale(s, l);
  if (stale) return no(stale);
  const m = i.kind === "alert" ? E.alertMatch(s, i, l) : E.requestMatch(s, i, l);
  if (!m.ok) return no("no_longer_matches");
  return yes({
    title: ev.title, who, unit: E.unitOf(ev), qty: E.listingNumbers(s, l).available, due: null, price: E.money(l.ask), obo: !!l.obo,
    via: i.kind === "alert" ? "alert" : "request", eventId: ev.id, listingId: l.id, itemId: null,
  });
}

function itemMatch(s: LiveWorld, i: Interest, it: Item, who: string | null): Relevance {
  if (!i.goods) return no("missing");
  const stale = interestStale(i) ?? itemStale(it);
  if (stale) return no(stale);
  if (!E.requestMatchItem(s, i, it).ok) return no("no_longer_matches");
  return yes({
    title: it.title, who, unit: "item", qty: null, due: null, price: E.itemPrice(it.price), obo: !!it.obo, via: "request", // an explicit $0 reads "Free"
    eventId: null, listingId: null, itemId: it.id,
  });
}

function ownInterest(s: LiveWorld, id: string, userId: string): Interest | undefined {
  const i = s.interests.find((x) => x.id === id);
  return i && i.userId === userId ? i : undefined;
}

function share(s: LiveWorld, job: JobRef, what: "listing" | "item"): Relevance {
  const sh = (s.responses ?? []).find((x) => x.id === job.ref);
  if (!sh) return no("missing");
  const i = ownInterest(s, sh.isoId, job.userId);
  if (!i || i.kind !== "iso") return no("missing");
  if (sh.status !== "open") return no("closed");
  // A request anyone can act on now (as the share required): open, not expired, and its event still taking demand.
  const stale = interestStale(i) ?? (E.liveRequest(s, i) ? null : "closed");
  if (stale) return no(stale);
  const who = firstOf(sh.sellerId);
  if (what === "listing") {
    const l = sh.listingId ? s.listings.find((x) => x.id === sh.listingId) : undefined;
    if (!l) return no("missing");
    const rel = listingMatch(s, i, l, who);
    // What the requester does on its page now, by the rule the share's in-app note follows (the engine's shareListing): with invite
    // to pay on they ask to buy it; under the earlier flow they reserve it or make an offer; an organizer's event takes a request.
    if (rel.ok) rel.facts.how = !E.isQuick(eventOf(l.eventId)) ? "request" : s.mode === "live" && E.inviteFlowOn() ? "ask" : "reserve";
    return rel;
  }
  const it = sh.itemId ? s.goods.find((x) => x.id === sh.itemId) : undefined;
  return it ? itemMatch(s, i, it, who) : no("missing");
}

// ── The check ────────────────────────────────────────────────────────────────────────────

/**
 * Whether the job's email is still worth sending to its recipient, and its facts. Inside withEngine only (the store's port.run on the
 * committed document). Never throws: a record it can't read is "missing".
 */
export function emailRelevance(doc: WorldDoc, job: JobRef): Relevance {
  const s = doc as unknown as LiveWorld;
  try {
    switch (job.kind) {
      case "offer.received":
        return ticket(s, job, "seller", at("pending"), (p) => p.r.expiresAt);
      case "offer.accepted":
        return ticket(s, job, "buyer", at("accepted"), (p) => p.r.holdUntil);
      case "counter.received":
        return ticket(s, job, "buyer", (p) => (p.st !== "countered" ? movedOn(p.st) : E.listingPaused(s, p.l) ? "paused" : true), (p) => p.r.expiresAt);
      case "reply.held":
        return ticket(s, job, "buyer", (p) => (!p.r.isoReply ? "missing" : at("proposed")(p)), (p) => p.r.expiresAt);
      case "payment.reported":
        // The seller already answered: confirmed it, or said it hasn't arrived.
        return ticket(s, job, "seller", (p) => (p.st !== "paid" ? movedOn(p.st) : p.r.payDisputedAt || p.r.paymentConfirmedAt ? "answered" : true), () => null);
      case "transfer.sent":
        return ticket(s, job, "buyer", at("sent"), () => null);
      case "payment.missing":
        return ticket(s, job, "buyer", (p) => (p.st !== "paid" ? movedOn(p.st) : p.r.payDisputedAt && !p.r.paymentConfirmedAt ? true : "answered"), () => null);
      case "item.requested":
        // Not while it's a backup: another buyer holds the item.
        return goods(s, job, "seller", (p) => {
          if (p.st !== "pending") return movedOn(p.st);
          const held = E.reservedFor(s, p.it);
          return held && held.id !== p.g.id ? "answered" : true;
        }, (p) => E.goodsRespondBy(p.g, p.it));
      case "item.accepted":
        return goods(s, job, "buyer", (p) => (p.st !== "accepted" ? movedOn(p.st) : p.g.pickupAt ? "answered" : true), (p) => p.g.holdUntil);
      case "match.listing": {
        const i = ownInterest(s, job.ref, job.userId);
        const lid = job.link?.listing;
        const l = typeof lid === "string" ? s.listings.find((x) => x.id === lid) : undefined;
        return i && l ? listingMatch(s, i, l, null) : no("missing");
      }
      case "match.item": {
        const i = ownInterest(s, job.ref, job.userId);
        const gid = job.link?.id;
        const it = typeof gid === "string" ? s.goods.find((x) => x.id === gid) : undefined;
        return i && it ? itemMatch(s, i, it, null) : no("missing");
      }
      case "share.listing":
        return share(s, job, "listing");
      case "share.item":
        return share(s, job, "item");
      case "buy.requested":
        // Invite to pay (follow-on B5): the seller hasn't answered the request yet.
        return ticket(s, job, "seller", (p) => (p.r.inviteFlow !== true ? "missing" : at("requested")(p)), (p) => p.r.expiresAt);
      case "buy.invited":
        // Still an invitation the buyer can reserve from: not ended, and its listing open and not paused.
        return ticket(s, job, "buyer", (p) => {
          if (p.r.inviteFlow !== true) return "missing";
          if (p.st !== "invited") return movedOn(p.st);
          return listingStale(s, p.l) ?? true;
        }, (p) => p.r.expiresAt);
      case "payment.late":
        // The buyer's late-payment report is still open. It names no amount and no reason beyond the kind itself.
        return ticket(s, job, "seller", (p) => {
          const prob = p.r.problem;
          if (p.r.inviteFlow !== true || !prob || prob.reason !== E.LATE_PAYMENT) return "missing";
          return prob.resolvedAt ? "answered" : true;
        }, () => null);
      default:
        return no("missing");
    }
  } catch (e) {
    console.warn("[handoff] email relevance check failed", { kind: job.kind, error: e instanceof Error ? e.name : typeof e });
    return no("missing");
  }
}
