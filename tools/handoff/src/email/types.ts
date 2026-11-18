// Handoff's email updates (follow-on Batch 4; FOLLOWON-PLAN §2.4): the types every email file shares.
//
// One small sender interface (EmailSender) and nothing like a general messaging framework. An email is one opted-in person's copy of
// one in-app notification of an emailed kind: a job in email_jobs, written in the notification's own transaction, then sent by the
// dispatcher outside any transaction. Jobs hold ids and fixed codes only; an email's words come from structured facts the committed
// document gives at send time (relevance.ts), never from the notification's stored text, which can quote what people typed.

import type { Sql } from "postgres";
import type { NotificationLink, WorldId } from "../types.js";

// ── The sender ───────────────────────────────────────────────────────────────────────────

/** How the person signed in to PennTools when they turned email on: Google, or the local development sign-in. */
export type SignInKind = "google" | "dev";

/** "capture" keeps what would be sent in Handoff's own table (development, test worlds); "provider" is a real email service (live). */
export type SenderKind = "capture" | "provider";

export interface EmailMessage {
  /** One recipient: the opted-in PennTools sign-in address. */
  to: string;
  /** At most 120 characters, plain text, one line. */
  subject: string;
  /** At most 2,000 characters; the one action URL on its own line. */
  text: string;
  /** Optional, from the same facts, every value escaped. */
  html?: string;
  /** "handoff:<worldId>:<notificationId>": the same on every retry, so a provider that supports it sends one email. */
  idempotencyKey: string;
  /** The action link (also in `text`). The capture keeps it in its own column; a provider may ignore it. */
  actionUrl?: string;
}

/** Why a send failed. Never an address or a provider's message. */
export type SendErrorCode = "timeout" | "rate_limited" | "server_error" | "network" | "rejected" | "auth" | "config";

/**
 * A send's answer. `duplicate`: nothing was sent this time, because the sender had already accepted an email with this idempotency key
 * (an earlier attempt whose answer was lost, retried with other wording). The job is recorded sent, with the note "already_accepted".
 */
export type SendResult = { ok: true; providerId: string | null; duplicate?: true } | { ok: false; retryable: boolean; code: SendErrorCode };

export interface EmailSender {
  readonly kind: SenderKind;
  /** Whether this sender may send to this recipient at all. The capture: always; a provider: providerAllows (gates.ts). */
  allows(r: { address: string; signIn: SignInKind }): boolean;
  /** Configured and healthy, so a dispatcher run may record a working heartbeat. */
  ready(): Promise<boolean>;
  /** Sends one email. Never called inside a database transaction. */
  send(m: EmailMessage): Promise<SendResult>;
}

// ── Kinds, jobs and relevance ────────────────────────────────────────────────────────────

/** "exchange": a personal update that needs the recipient's response. "match": a listing or item that may fit their request or alert. */
export type EmailCategory = "exchange" | "match";

/** The emailed notification kinds (kinds.ts). Every other notification stays in the app only. */
export type EmailKind =
  | "offer.received"
  | "offer.accepted"
  | "counter.received"
  | "reply.held"
  | "payment.reported"
  | "transfer.sent"
  | "payment.missing"
  | "item.requested"
  | "item.accepted"
  | "match.listing"
  | "match.item"
  | "share.listing"
  | "share.item"
  | "buy.requested"
  | "buy.invited"
  | "payment.late";

/** A claimed job, as the relevance check reads it. */
export interface JobRef {
  notificationId: string;
  /** The notification's recipient. */
  userId: string;
  kind: EmailKind;
  /** The record the notification is about: a request r…, goods request gr…, interest iso-… or share rsp-…. */
  ref: string;
  /** The notification's link (public ids and fixed words only), or null. Match kinds name their listing or item here. */
  link: NotificationLink | null;
}

/** Why a job isn't worth sending any more (recorded as "not_relevant:<why>"). */
export type SkipWhy = "answered" | "closed" | "expired" | "paused" | "no_longer_matches" | "missing";

/**
 * What an email may say, from the committed document at send time. Never a payment destination, an email address, a pickup area or
 * time, a budget, a lowest offer, a note or message, a problem's reason, or an amount in an exchange email.
 */
export interface EmailFacts {
  /** The event's title, or the item's. */
  title: string;
  /** The other person's first name, or null when the email names nobody. */
  who: string | null;
  unit: "ticket" | "spot" | "item";
  /** match.listing: how many are available now. */
  qty: number | null;
  /** A deadline, in the engine's words (fmtMs, New York time), or null. */
  due: string | null;
  /** Match emails only: the public asking price ("$35"). */
  price: string | null;
  /** Match emails only: the seller takes offers. */
  obo: boolean;
  /** match.listing: which of the owner's interests it may fit. */
  via: "alert" | "request" | null;
  /**
   * share.listing only: what the requester does on the listing's page now, as the share's in-app note says it. "ask": ask to buy it
   * (invite to pay); "reserve": reserve it or make an offer (the earlier flow); "request": send a request (the organizer's steps).
   */
  how?: "ask" | "reserve" | "request";
  /**
   * §9x item 1 (SELL6-N1), a ticket exchange email only: the exchange is agreed at $0, so nothing is paid and its words ask nobody to
   * pay. A yes/no fact, never an amount; left out for a priced ticket.
   */
  free?: true;
  /** The link's public ids (checked again against live.ts ID when the link is built). */
  eventId: string | null;
  listingId: string | null;
  itemId: string | null;
}

export type Relevance = { ok: true; facts: EmailFacts } | { ok: false; why: SkipWhy };

// ── The view's envelope ──────────────────────────────────────────────────────────────────

/** What the owner's view says about email updates (View.email, owner only; the guest view never has it). */
export interface ViewEmail {
  /** A dispatcher with this world's sender worked in the last 10 minutes: only then can email be turned on. */
  available: boolean;
  mode: SenderKind | null;
  /** The session's current sign-in address (people.email), which turning email on would use. */
  address: string | null;
  /** Exchanges that need you: on, for the current address. */
  exchange: boolean;
  /** Matches for your requests and alerts: on, for the current address. */
  matches: boolean;
  /** Email was on for an address the account no longer has: it stays off until turned on again. */
  reconfirm: boolean;
  /**
   * A category is on, but no dispatcher has worked in the last 10 minutes, though this world's sender has worked before: nothing is
   * being emailed now, and the page keeps the way to turn email off. Never true while email is available, with nothing on, or where no
   * sender has ever worked (live before a provider is connected).
   */
  paused: boolean;
}

// ── The dispatcher ───────────────────────────────────────────────────────────────────────

/** What the dispatcher needs from the store (wired after C1 from store.ts exports; tests supply their own). */
export interface DispatchDeps {
  /** Sweeps the world's expiry when its next_due has passed, through the store's write path. True when it swept. */
  sweepDue(sql: Sql, worldId: WorldId, now?: number): Promise<boolean>;
  /** Each job's relevance on the committed document (emailRelevance inside the engine), keyed by notification id. */
  checkJobs(sql: Sql, worldId: WorldId, jobs: readonly JobRef[], now?: number): Promise<ReadonlyMap<string, Relevance>>;
}

export interface DispatchOptions {
  sender: EmailSender;
  /** The site's origin for links ("https://…" in production). */
  siteUrl: string;
  /** "test": the capture, for test-… worlds; "live": a provider, for the live world. */
  worlds: "test" | "live";
  /** Jobs claimed per run: 1 to 100 (default 25). */
  limit?: number;
  /** A new job waits this long, so someone in the app reads it there first (default 2 minutes; 0 with the capture only). */
  graceMs?: number;
  /** Tests only: the time to run at (ms). */
  now?: number;
}

export interface DispatchCounts {
  swept: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  dead: number;
  expired: number;
  pruned: number;
}
