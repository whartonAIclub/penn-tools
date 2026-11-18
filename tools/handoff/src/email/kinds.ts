// The emailed notification kinds (FOLLOWON-PLAN §2.4): each one's category, how long its email stays worth sending, the record its
// `ref` names and where its link leads. A notification gets an email job only when the engine tagged it with one of these kinds
// (noteTo's meta, after C1) and its recipient turned that category on. Everything else stays in the app: lapses, releases, pause
// notes, declines, a request's pings to sellers (no general new-post broadcast) and anything quoting typed text.
//
// Batch 5 added its three kinds the same way: one row here, one relevance branch and one template each.

import { ID } from "../live.js";
import type { EmailCategory, EmailKind } from "./types.js";

const HOUR_MS = 3_600_000;
/** Exchange emails expire after 24 hours, match emails after 12 (FOLLOWON-PLAN §4.1 default 10). */
export const EXCHANGE_TTL_MS = 24 * HOUR_MS;
export const MATCH_TTL_MS = 12 * HOUR_MS;

/**
 * Where an email's one link leads, all forms the page already opens (_lib/routes.js initialView):
 * - activityListing: My activity at that listing's card (#activity?listing=l…), for the seller;
 * - eventListing: the event's page at that listing (#ev-…?listing=l…), for the buyer or requester;
 * - activityItem: My activity at that item's card (#activity?item=g…), for the seller;
 * - item: the item's page (#item-g…).
 */
export type LinkRule = "activityListing" | "eventListing" | "activityItem" | "item";

export interface KindRule {
  category: EmailCategory;
  ttlMs: number;
  /** The record `ref` names, by its live id pattern (live.ts ID). */
  ref: "request" | "goodsReq" | "iso" | "share";
  link: LinkRule;
}

const exchange = (ref: KindRule["ref"], link: LinkRule): KindRule => ({ category: "exchange", ttlMs: EXCHANGE_TTL_MS, ref, link });
const match = (ref: KindRule["ref"], link: LinkRule): KindRule => ({ category: "match", ttlMs: MATCH_TTL_MS, ref, link });

/** Every emailed kind. Exchange kinds need the recipient's response; match kinds are a listing or item that may fit what they asked for. */
export const EMAIL_KINDS: Readonly<Record<EmailKind, Readonly<KindRule>>> = Object.freeze({
  "offer.received": exchange("request", "activityListing"), // to the seller: answer the offer
  "offer.accepted": exchange("request", "eventListing"), // to the buyer: the hold is running, pay
  "counter.received": exchange("request", "eventListing"), // to the buyer: answer the counter-offer
  "reply.held": exchange("request", "eventListing"), // to the requester: answer the held reply
  "payment.reported": exchange("request", "activityListing"), // to the seller: confirm the payment
  "transfer.sent": exchange("request", "eventListing"), // to the buyer: confirm you got it
  "payment.missing": exchange("request", "eventListing"), // to the buyer: check your payment, or cancel
  "item.requested": exchange("goodsReq", "activityItem"), // to the seller: accept or decline
  "item.accepted": exchange("goodsReq", "item"), // to the buyer: agree a pickup time
  "match.listing": match("iso", "eventListing"), // to a request's or alert's owner
  "match.item": match("iso", "item"), // to a goods request's owner
  "share.listing": match("share", "eventListing"), // to the requester a seller shared a listing with
  "share.item": match("share", "item"), // to the requester a seller shared an item with
  // Invite to pay (follow-on B5): nothing is held by a request or an invitation, and neither email says it is.
  "buy.requested": exchange("request", "activityListing"), // to the seller: invite them to pay, or decline
  "buy.invited": exchange("request", "eventListing"), // to the buyer: reserve it, then pay
  "payment.late": exchange("request", "activityListing"), // to the seller: the buyer says they paid after the reservation ended
});

export const EMAIL_KIND_LIST: readonly EmailKind[] = Object.freeze(Object.keys(EMAIL_KINDS) as EmailKind[]);

export function isEmailKind(kind: unknown): kind is EmailKind {
  return typeof kind === "string" && Object.prototype.hasOwnProperty.call(EMAIL_KINDS, kind);
}

/** The schema's notification id pattern (notifications.id CHECK). */
const NOTE_ID = /^[0-9a-z-]{1,48}$/;
/** A link field's value: public ids and fixed words only ("activity", "todo", "ev-…", "l…"). */
const LINK_VALUE = /^[0-9a-z-]{1,48}$/;
const LINK_FIELDS = ["name", "id", "tab", "listing"] as const;
const USER_ID_MAX = 64;

/** A notification as the store has it after insertNotifications, with the engine's tag (kind and ref) when it has one. */
export interface TaggedNote {
  id: string;
  userId: string;
  kind?: unknown;
  ref?: unknown;
  link?: unknown;
}

/** One row of the email_jobs insert (dispatch.ts insertEmailJobs), as JSON for jsonb_to_recordset. */
export interface EmailJobRow {
  id: string;
  user_id: string;
  kind: EmailKind;
  category: EmailCategory;
  ref: string;
  link: Record<string, string>;
  ttl_s: number;
}

/**
 * The notes that get an email job, as rows for insertEmailJobs: an emailed kind, a ref in its kind's id pattern, a valid id and user,
 * and the link's public fields only. A note without a tag, or with a tag that doesn't fit, gets none (it stays in the app).
 */
export function emailJobRows(notes: readonly TaggedNote[]): EmailJobRow[] {
  const rows: EmailJobRow[] = [];
  for (const n of notes) {
    if (!isEmailKind(n.kind)) continue;
    const rule = EMAIL_KINDS[n.kind];
    if (typeof n.ref !== "string" || !ID[rule.ref].test(n.ref)) continue;
    if (typeof n.id !== "string" || !NOTE_ID.test(n.id)) continue;
    if (typeof n.userId !== "string" || n.userId.length === 0 || Array.from(n.userId).length > USER_ID_MAX) continue;
    rows.push({ id: n.id, user_id: n.userId, kind: n.kind, category: rule.category, ref: n.ref, link: cleanLink(n.link), ttl_s: rule.ttlMs / 1000 });
  }
  return rows;
}

/** A notification link's public fields (name, id, tab, listing), each a public id or fixed word; anything else is dropped. */
export function cleanLink(link: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof link !== "object" || link === null || Array.isArray(link)) return out;
  const l = link as Record<string, unknown>;
  for (const f of LINK_FIELDS) {
    const v = l[f];
    if (typeof v === "string" && LINK_VALUE.test(v)) out[f] = v;
  }
  return out;
}
