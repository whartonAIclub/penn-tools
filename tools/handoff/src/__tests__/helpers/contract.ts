// C-CONTRACT.md §2 as a check: every key a view may carry, by role (P everyone, O the owner, C the other party, C:step the
// other party from that step on), and the closure rule (every event and person a record refers to is in the view).
// contractViolations(view, viewerId) lists what breaks it; the projection and seam tests run it on every view they build.
// guestContractViolations(view) does the same for the guest view a signed-out visitor gets (C-CONTRACT §7).
import { cleanAddress, sameAddress } from "../../email/gates.js";
import type { GuestView, View } from "../../types.js";

export const VIEW_KEYS = [
  "protocol", "mode", "worldId", "version", "serverNow", "nextRefreshAt", "unreadCount", "viewer", "v", "events", "people",
  "holdings", "listings", "requests", "interests", "responses", "goods", "goodsReqs", "notifications",
  "strikes", "policies", "alertPrefs", "seen", "feedSeen", "suggestions", "feedbackGiven", "clockOffset", "tick",
  "closedRequests", // §9x item 1 (SELL6-N1): the public requests that ended, by id and event only (CLOSED_REQUEST_KEYS)
] as const;
/** §9x item 1: a closed public request as a view names it. Never userId, qty, budget, note, expires, status, closedAt or closedReason. */
export const CLOSED_REQUEST_KEYS = ["id", "eventId"] as const;
/** Keys a view may carry beside VIEW_KEYS: `email` (follow-on B4), the owner's own email updates, which the store attaches to their view. */
export const VIEW_OPTIONAL_KEYS = ["email"] as const;
/** View.email's keys (email/types.ts ViewEmail), each checked by emailViolations. */
export const VIEW_EMAIL_KEYS = ["available", "mode", "address", "exchange", "matches", "reconfirm", "paused"] as const;
/** normalizeEvent's fields (C-DESIGN §7.3), addedBy, and the creator's canRemove. Never createdBy. */
export const EVENT_KEYS = [
  "id", "kind", "title", "club", "cat", "start", "end", "openUntil", "rangePrefix", "venue", "attend", "tiers", "perPerson", "deadline",
  "namesChecked", "methods", "noOrganizer", "paperTicket", "tag", "officialUrl", "notes", "policy", "basePolicy", "policyChanged", "soldOut",
  "policyNote", "blurb", "path", "payment", "sources", "statusNote", "sourcesNote", "interestSeed", "cap", "userAdded", "addedBy", "createdAt",
  "removedAt", "unsupported", "canRemove",
] as const;
export const TIER_KEYS = ["id", "label", "price", "src"] as const;
export const PERSON_PUBLIC = ["name", "first", "color", "demo"] as const;
/** payKinds (follow-on B1): which kinds of payment the seller takes, for every signed-in viewer; never where to pay. */
export const LISTING_PUBLIC = [
  "id", "eventId", "sellerId", "listed", "ask", "paid", "tier", "method", "namesChecked", "membersOnly", "restricted", "obo", "minOffer",
  "departsAt", "note", "createdAt", "withdrawnAt", "pausedAt", "numbers", "numbersUntil", "source", "payKinds",
  "memberClub", // §9q item 5: the club a members-only ticket is for, named by its seller when the event names none (as public as the flag)
  "club", "restriction", // §9v items 4 and 5 (SELL5-M2): a club named on the listing, and the seller's own short restriction (as public as the listing's other terms)
] as const;
/** closeReason (follow-on B2): why the seller closed it, theirs only. */
export const LISTING_OWNER_ONLY = ["payHandle", "history", "holdingId", "record", "isoReplyFor", "closeReason"] as const;
/** A ticket request's keys, for its two parties; `pay` (where to pay, follow-on B1) only from the reservation on (PAY_STEPS). */
export const REQUEST_KEYS = [
  "id", "listingId", "eventId", "buyerId", "qty", "topUp", "price", "isOffer", "departsAt", "msg", "status", "createdAt", "flow", "consent",
  "reports", "history", "reason", "problem", "expiresAt", "acceptedAt", "holdUntil", "memberConfirmed", "isoReply", "isCounter",
  "counterPrice", "counteredAt", "paidAt", "paymentConfirmedAt", "deliveredAt", "completedAt", "restoredAt", "payDisputedAt", "releaseAfter",
  "paidVia",
  // Follow-on B5 (invite to pay), for the same two parties: none of them is where to pay.
  "inviteFlow", "invitedAt", "fromIso", "wantedQty", "blockedAt",
] as const;
/** viewer: payMethods (follow-on B1) is the owner's own (since protocol 2 there's no payHandle beside it). */
export const VIEWER_KEYS = ["id", "name", "email", "payMethods"] as const;
export const ISO_PUBLIC = ["id", "userId", "eventId", "goods", "kind", "qty", "budget", "note", "expires", "status", "createdAt", "updatedAt"] as const;
export const INTEREST_OWNER_ONLY = ["closedAt", "closedReason", "max", "paused"] as const;
export const ITEM_PUBLIC = [
  "id", "sellerId", "title", "cat", "cond", "price", "obo", "minOffer", "area", "until", "note", "createdAt", "soldAt", "withdrawnAt", "pausedAt", "state", "stateUntil",
  "noPickupBy", // §9q item 6: the item's last day is only its listing's expiry (its seller chose no pickup deadline); as public as `until`
  "pic", // §9s item 6: the photo's reference (its version and size in pixels), while the item hasn't ended; never bytes
] as const;
export const NOTIFICATION_KEYS = ["id", "userId", "text", "link", "at", "read"] as const;
/** Where to pay reaches a buyer from the reservation on (C:accepted, through completed): their request's `pay`, or for a request from
 *  before B1 (no `pay`) the listing's own handle. */
export const PAY_STEPS = ["accepted", "paid", "confirmed", "sent", "completed"];

const extra = (o: object, allowed: readonly string[]): string[] => Object.keys(o).filter((k) => !allowed.includes(k));

/** Everything in the view that C-CONTRACT §2 doesn't allow this viewer, and every id that doesn't resolve. */
export function contractViolations(view: View, viewerId: string): string[] {
  const out: string[] = [];
  const bad = (what: string): void => { out.push(what); };
  const keys = Object.keys(view);
  if (VIEW_KEYS.some((k) => !keys.includes(k)) || extra(view, [...VIEW_KEYS, ...VIEW_OPTIONAL_KEYS]).length) bad(`view keys: ${keys.join(",")}`);
  if ("email" in view) out.push(...emailViolations(view.email, view.viewer.email));
  if (view.viewer.id !== viewerId) bad("viewer.id");
  if (extra(view.viewer, VIEWER_KEYS).length) bad(`viewer keys: ${Object.keys(view.viewer).join(",")}`);
  if (view.mode !== "live" || view.v !== 11 || view.feedbackGiven !== false || view.clockOffset !== 0 || view.tick !== 0) bad("envelope constants");
  for (const k of ["strikes", "policies", "alertPrefs", "seen", "feedSeen"] as const) if (Object.keys(view[k]).length) bad(`${k} not empty`);
  if (view.suggestions.length) bad("suggestions not empty");

  const eventIds = new Set(view.events.map((e) => e.id));
  const personIds = new Set(Object.keys(view.people));
  const needEvent = (id: string | null, where: string): void => { if (id !== null && !eventIds.has(id)) bad(`${where}: event ${id} not in the view`); };
  const needPerson = (id: string, where: string): void => { if (!personIds.has(id)) bad(`${where}: person ${id} not in the view`); };

  for (const e of view.events) {
    const x = extra(e, EVENT_KEYS);
    if (x.length) bad(`event ${e.id} keys: ${x.join(",")}`);
    for (const t of e.tiers) if (extra(t, TIER_KEYS).length) bad(`event ${e.id} tier keys`);
    if ("canRemove" in e && e.addedBy !== viewerId) bad(`event ${e.id}: canRemove for someone who didn't add it`);
    if (e.addedBy) needPerson(e.addedBy, `event ${e.id}`);
  }
  for (const [id, p] of Object.entries(view.people)) {
    if (p.demo !== true) bad(`person ${id}: demo isn't true`);
    const allowed = [...PERSON_PUBLIC, "contact"]; // yourself too: your payment methods are viewer.payMethods (protocol 2)
    const x = extra(p, allowed);
    if (x.length) bad(`person ${id} keys: ${x.join(",")}`);
  }
  needPerson(viewerId, "viewer");

  const myRequestsOn = (listingId: string) => view.requests.filter((r) => r.listingId === listingId && r.buyerId === viewerId);
  for (const l of view.listings) {
    needEvent(l.eventId, `listing ${l.id}`);
    needPerson(l.sellerId, `listing ${l.id}`);
    if (l.sellerId === viewerId) {
      const x = extra(l, [...LISTING_PUBLIC, ...LISTING_OWNER_ONLY]);
      if (x.length) bad(`own listing ${l.id} keys: ${x.join(",")}`);
      continue;
    }
    const mine = myRequestsOn(l.id);
    const allowed: string[] = [...LISTING_PUBLIC];
    // payHandle only from the buyer's reservation on, and only for one with no copy of its own (reserved before B1); isoReplyFor only
    // to the requester a held reply answers.
    if (mine.some((r) => PAY_STEPS.includes(r.status) && r.pay === undefined)) allowed.push("payHandle");
    if (l.isoReplyFor !== undefined) {
      if (mine.length === 0) bad(`held reply ${l.id} sent to someone who isn't its requester`);
      allowed.push("isoReplyFor");
    }
    const x = extra(l, allowed);
    if (x.length) bad(`listing ${l.id} keys for a non-owner: ${x.join(",")}`);
  }
  const listingById = new Map(view.listings.map((l) => [l.id, l]));
  for (const r of view.requests) {
    const l = listingById.get(r.listingId);
    if (!l) { bad(`request ${r.id}: its listing isn't in the view`); continue; }
    if (r.buyerId !== viewerId && l.sellerId !== viewerId) bad(`request ${r.id} sent to a non-party`);
    const rx = extra(r, PAY_STEPS.includes(r.status) ? [...REQUEST_KEYS, "pay"] : REQUEST_KEYS);
    if (rx.length) bad(`request ${r.id} keys at ${r.status}: ${rx.join(",")}`);
    needEvent(r.eventId, `request ${r.id}`);
    needPerson(r.buyerId, `request ${r.id}`);
    if (r.problem) needPerson(r.problem.by, `request ${r.id} problem`);
  }
  for (const i of view.interests) {
    needPerson(i.userId, `interest ${i.id}`);
    needEvent(i.eventId, `interest ${i.id}`);
    if (i.kind === "alert" && i.userId !== viewerId) bad(`someone else's alert ${i.id}`);
    if (i.userId !== viewerId) {
      const x = extra(i, ISO_PUBLIC);
      if (x.length) bad(`interest ${i.id} keys for a non-owner: ${x.join(",")}`);
    } else {
      const x = extra(i, [...ISO_PUBLIC, ...INTEREST_OWNER_ONLY]);
      if (x.length) bad(`own interest ${i.id} keys: ${x.join(",")}`);
    }
  }
  // §9x item 1: a closed request is its id and its event only, the event resolves, and it isn't also in the view whole.
  for (const c of view.closedRequests) {
    const x = extra(c, CLOSED_REQUEST_KEYS);
    if (x.length) bad(`closed request ${c.id} keys: ${x.join(",")}`);
    needEvent(c.eventId, `closed request ${c.id}`);
    if (view.interests.some((i) => i.id === c.id)) bad(`closed request ${c.id} is also in interests`);
  }
  const interestById = new Map(view.interests.map((i) => [i.id, i]));
  for (const x of view.responses) {
    const iso = interestById.get(x.isoId);
    if (x.sellerId !== viewerId && iso?.userId !== viewerId) bad(`share ${x.id} sent to a non-party`);
    needPerson(x.sellerId, `share ${x.id}`);
  }
  const itemById = new Map(view.goods.map((it) => [it.id, it]));
  for (const it of view.goods) {
    needPerson(it.sellerId, `item ${it.id}`);
    const x = extra(it, it.sellerId === viewerId ? [...ITEM_PUBLIC, "history", "closeReason"] : ITEM_PUBLIC); // closeReason: the seller's only (B2)
    if (x.length) bad(`item ${it.id} keys: ${x.join(",")}`);
  }
  for (const g of view.goodsReqs) {
    const it = itemById.get(g.itemId);
    if (!it) { bad(`goods request ${g.id}: its item isn't in the view`); continue; }
    if (g.buyerId !== viewerId && it.sellerId !== viewerId) bad(`goods request ${g.id} sent to a non-party`);
    needPerson(g.buyerId, `goods request ${g.id}`);
    if (g.problem) needPerson(g.problem.by, `goods request ${g.id} problem`);
  }
  for (const h of view.holdings) {
    if (h.userId !== viewerId) bad(`someone else's holding ${h.id}`);
    needEvent(h.eventId, `holding ${h.id}`);
  }
  for (const n of view.notifications) {
    if (n.userId !== viewerId) bad(`someone else's notification ${n.id}`);
    const x = extra(n, NOTIFICATION_KEYS);
    if (x.length) bad(`notification ${n.id} keys: ${x.join(",")}`);
  }
  return out;
}

/**
 * What's wrong with a view's email envelope (follow-on B4; email/types.ts ViewEmail, email/prefs.ts readEmailState), given the
 * viewer's own sign-in address: exactly its keys and types; a mode only while email is available; the viewer's own current address
 * (never anyone else's, never one typed elsewhere); neither category on without an address, or while a changed address waits to
 * be turned on again; and paused only while email isn't available and a category is on.
 */
export function emailViolations(email: unknown, viewerEmail: string | null): string[] {
  if (typeof email !== "object" || email === null || Array.isArray(email)) return ["email: not an object"];
  const out: string[] = [];
  const e = email as Record<string, unknown>;
  const keys = Object.keys(e);
  if (keys.length !== VIEW_EMAIL_KEYS.length || VIEW_EMAIL_KEYS.some((k) => !keys.includes(k))) out.push(`email keys: ${keys.join(",")}`);
  for (const k of ["available", "exchange", "matches", "reconfirm", "paused"] as const) if (typeof e[k] !== "boolean") out.push(`email.${k}: not a boolean`);
  if (e["mode"] !== null && e["mode"] !== "capture" && e["mode"] !== "provider") out.push("email.mode: not capture, provider or null");
  else if ((e["mode"] !== null) !== (e["available"] === true)) out.push("email.mode: set exactly while email is available");
  const address = e["address"];
  if (address !== null && typeof address !== "string") out.push("email.address: not a string or null");
  else if (address === null ? cleanAddress(viewerEmail) !== null : !sameAddress(address, viewerEmail)) out.push("email.address: not the viewer's own sign-in address");
  const on = e["exchange"] === true || e["matches"] === true;
  if (on && address === null) out.push("email: a category on without an address");
  if (on && e["reconfirm"] === true) out.push("email: a category on while it waits to be turned on again for a new address");
  if (e["paused"] === true && (e["available"] === true || !on)) out.push("email.paused: only while email isn't available and a category is on");
  return out;
}

// ── The guest view (C-CONTRACT §7) ───────────────────────────────────────────────────────

export const GUEST_VIEW_KEYS = ["protocol", "mode", "guest", "viewer", "worldId", "version", "serverNow", "nextRefreshAt", "events", "listings", "goods", "wanted",
  "closedWanted"] as const; // §9x item 1 (SELL6-N1): the public requests that aren't open any more, by id and event only (CLOSED_REQUEST_KEYS)
/** An event's published facts: never addedBy, createdBy, createdAt, venue, officialUrl, notes, blurb, sourcesNote or a tier's src. */
export const GUEST_EVENT_KEYS = ["id", "kind", "title", "club", "cat", "start", "end", "openUntil", "attend", "tiers", "perPerson", "deadline", "namesChecked", "paperTicket", "unsupported"] as const;
export const GUEST_TIER_KEYS = ["id", "label", "price"] as const;
/** Never sellerId, paid, method, note, minOffer, numbers, numbersUntil, source, withdrawnAt, payHandle, history, holdingId, isoReplyFor. */
export const GUEST_LISTING_KEYS = ["id", "eventId", "tier", "ask", "obo", "available", "membersOnly", "memberClub", "restricted", "departsAt", "createdAt", // memberClub: §9q item 5, the named restriction a visitor reads before signing in to ask
  "club", "namesChecked", "restrictionNoted", // §9v items 4 and 5 (SELL5-M2): a club named on the listing, a name change, and (since §9x only for words that look like contact or payment details) that the seller noted a restriction
  "restriction"] as const; // §9x item 1 (SELL6-N1): the seller's own restriction words, one published line; never the note
/** Never sellerId, area, note, minOffer, photos, state, stateUntil, soldAt, withdrawnAt or history. */
export const GUEST_ITEM_KEYS = ["id", "title", "cat", "cond", "price", "obo", "until", "noPickupBy", "pic", "createdAt"] as const; // noPickupBy: §9q item 6, so a visitor's page never words an expiry as "pickup by"; pic: §9s item 6, the photo's reference (version and size), as public as the item
/** Never userId, budget, note, status, kind, updatedAt or an alert's fields. */
export const GUEST_WANTED_KEYS = ["id", "eventId", "goods", "qty", "expires", "createdAt"] as const;

/** Everything in a guest view that C-CONTRACT §7 doesn't allow, and every event id that doesn't resolve. */
export function guestContractViolations(view: GuestView): string[] {
  const out: string[] = [];
  const bad = (what: string): void => { out.push(what); };
  const keys = Object.keys(view);
  if (keys.length !== GUEST_VIEW_KEYS.length || GUEST_VIEW_KEYS.some((k) => !keys.includes(k))) bad(`guest view keys: ${keys.join(",")}`);
  if ("email" in view) bad("guest view: email (follow-on B4: a signed-in owner's only)");
  if (view.guest !== true || view.viewer !== null || view.mode !== "live") bad("guest envelope");
  const eventIds = new Set(view.events.map((e) => e.id));
  const needEvent = (id: string, where: string): void => { if (!eventIds.has(id)) bad(`${where}: event ${id} not in the guest view`); };
  for (const e of view.events) {
    const x = extra(e, GUEST_EVENT_KEYS);
    if (x.length) bad(`guest event ${e.id} keys: ${x.join(",")}`);
    for (const t of e.tiers) if (extra(t, GUEST_TIER_KEYS).length) bad(`guest event ${e.id} tier keys: ${Object.keys(t).join(",")}`);
  }
  for (const l of view.listings) {
    const x = extra(l, GUEST_LISTING_KEYS);
    if (x.length) bad(`guest listing ${l.id} keys: ${x.join(",")}`);
    if (!Number.isInteger(l.available) || l.available < 1) bad(`guest listing ${l.id}: available ${l.available}`);
    needEvent(l.eventId, `guest listing ${l.id}`);
  }
  for (const it of view.goods) {
    const x = extra(it, GUEST_ITEM_KEYS);
    if (x.length) bad(`guest item ${it.id} keys: ${x.join(",")}`);
  }
  for (const i of view.wanted) {
    const x = extra(i, GUEST_WANTED_KEYS);
    if (x.length) bad(`guest wanted ${i.id} keys: ${x.join(",")}`);
    if (i.goods && extra(i.goods, ["title", "cat"]).length) bad(`guest wanted ${i.id} goods keys`);
    if (i.eventId !== null) needEvent(i.eventId, `guest wanted ${i.id}`);
    else if (!i.goods) bad(`guest wanted ${i.id}: neither an event nor an item`);
  }
  // §9x item 1: a closed request is its id and its event only, the event resolves, and it isn't also among the open ones.
  for (const c of view.closedWanted) {
    const x = extra(c, CLOSED_REQUEST_KEYS);
    if (x.length) bad(`guest closed request ${c.id} keys: ${x.join(",")}`);
    if (c.eventId !== null) needEvent(c.eventId, `guest closed request ${c.id}`);
    if (view.wanted.some((i) => i.id === c.id)) bad(`guest closed request ${c.id} is also in wanted`);
  }
  return out;
}
