// The sitter's side of a booking: their jobs grouped for My tasks, what
// they've been paid, and the ratings owners leave them. Money moves outside
// PennPaws (Venmo, PayPal and the like), so a payment is only a record the
// sitter keeps for themselves.
//
// Ratings reach the sitter anonymously: listMyReviews returns no owner, pet,
// booking or exact date, only the month, and the notification about a new
// rating doesn't link to the booking. That lets owners be honest.

import type { Sql } from "postgres";
import { z } from "@penntools/core/ai";
import type { OfferStatus, RequestStatus } from "./booking.js";
import { notify, type NotificationChannel } from "./notifications.js";
import type { Checked } from "./request.js";
import { PennPawsError, UUID_RE, type RequestCard } from "./requests.js";
import { LIMITS, type Option } from "./survey.js";

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [T[number]["value"], ...T[number]["value"][]];

export const PAYMENT_METHODS = [
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const satisfies readonly Option[];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export interface Payment {
  amount: number;
  method: PaymentMethod;
  /** YYYY-MM-DD. */
  paidOn: string;
}

/** A request the sitter offered on, with where things stand for them. */
export interface SitterJob {
  request: RequestCard;
  offer: OfferStatus;
  /** True when the agreement is waiting for this sitter's approval. */
  needsMyApproval: boolean;
  /** ISO timestamp, once either person marked the booking done. */
  completedAt: string | null;
  payment: Payment | null;
}

/** An owner's rating as the sitter sees it: no owner, pet or booking. */
export interface Review {
  rating: number;
  feedback: string | null;
  /** YYYY-MM, the month it was written. */
  month: string;
}

// ── Grouping and totals (no database) ────────────────────────────────────────

export interface JobGroups {
  /** Picked by the owner; the agreement is being approved. */
  agreements: SitterJob[];
  /** Booked, not yet done. */
  upcoming: SitterJob[];
  /** Offered, waiting for the owner to choose. */
  offered: SitterJob[];
  completed: SitterJob[];
  /** Not picked, or the owner cancelled. */
  closed: SitterJob[];
}

export function groupJobs(jobs: readonly SitterJob[]): JobGroups {
  const groups: JobGroups = { agreements: [], upcoming: [], offered: [], completed: [], closed: [] };
  for (const job of jobs) {
    const status = job.request.status;
    if (job.offer === "pending" && status === "open") groups.offered.push(job);
    else if (job.offer === "accepted" && status === "matched") groups.agreements.push(job);
    else if (job.offer === "accepted" && status === "agreed") groups.upcoming.push(job);
    else if (job.offer === "accepted" && status === "completed") groups.completed.push(job);
    else groups.closed.push(job);
  }
  groups.completed.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return groups;
}

export interface Earnings {
  total: number;
  thisMonth: number;
  /** Done jobs with no payment recorded yet. */
  unpaid: number;
}

const cents = (amount: number) => Math.round(amount * 100) / 100;

/** Totals of the payments the sitter recorded. `today` is YYYY-MM-DD. */
export function earnings(jobs: readonly SitterJob[], today: string): Earnings {
  const month = today.slice(0, 7);
  let total = 0;
  let thisMonth = 0;
  let unpaid = 0;
  for (const job of jobs) {
    if (job.offer !== "accepted") continue;
    if (job.payment) {
      total += job.payment.amount;
      if (job.payment.paidOn.startsWith(month)) thisMonth += job.payment.amount;
    } else if (job.request.status === "completed") {
      unpaid += 1;
    }
  }
  return { total: cents(total), thisMonth: cents(thisMonth), unpaid };
}

/** The first amount in an owner's pay answer ("$20 a visit" gives 20), to start the amount a sitter records. */
export function payHint(pay: string): number | null {
  const match = /\$\s*(\d{1,5}(?:\.\d{1,2})?)/.exec(pay) ?? /(\d{1,5}(?:\.\d{1,2})?)/.exec(pay);
  return match ? Number(match[1]) : null;
}

/** The average rating to one decimal, or null with no ratings yet. */
export function ratingSummary(reviews: readonly Review[]): { average: number | null; count: number } {
  if (reviews.length === 0) return { average: null, count: 0 };
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return { average: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
}

// ── Checking browser input ───────────────────────────────────────────────────

export const PaymentInput = z.object({
  amount: z.number().finite().positive("Enter what you were paid.").max(99_999, "That amount looks too large."),
  method: z.enum(values(PAYMENT_METHODS)),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker."),
});

export const ReviewInput = z.object({
  rating: z.number().int().min(1, "Pick a rating from 1 to 5 stars.").max(5, "Pick a rating from 1 to 5 stars."),
  feedback: z.string().trim().max(LIMITS.message).nullable(),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

function check<T>(schema: z.ZodType<T>, input: unknown): Checked<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Check your answers and try again." };
}

export function checkPayment(input: unknown): Checked<Payment> {
  const checked = check(PaymentInput, input);
  return checked.ok ? { ok: true, value: { ...checked.value, amount: cents(checked.value.amount) } } : checked;
}

export function checkReview(input: unknown): Checked<ReviewInput> {
  const checked = check(ReviewInput, input);
  return checked.ok ? { ok: true, value: { ...checked.value, feedback: checked.value.feedback || null } } : checked;
}

// ── Storage ──────────────────────────────────────────────────────────────────

/** Records (or corrects) what the sitter was paid for a booking. Only the booked sitter may. */
export async function recordPayment(sql: Sql, sitterId: string, requestId: string, payment: Payment): Promise<void> {
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That booking doesn't exist.");
  const [row] = await sql<{ status: RequestStatus }[]>`
    SELECT r.status FROM requests r
    JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
    WHERE r.id = ${requestId} AND o.sitter_id = ${sitterId}
  `;
  if (!row || (row.status !== "agreed" && row.status !== "completed")) {
    throw new PennPawsError("You can record a payment once you're booked.");
  }
  await sql`
    INSERT INTO payments (request_id, sitter_id, amount, method, paid_on)
    VALUES (${requestId}, ${sitterId}, ${payment.amount}, ${payment.method}, ${payment.paidOn})
    ON CONFLICT (request_id) DO UPDATE SET amount = EXCLUDED.amount, method = EXCLUDED.method, paid_on = EXCLUDED.paid_on
  `;
}

/** Removes a payment the sitter recorded by mistake. */
export async function clearPayment(sql: Sql, sitterId: string, requestId: string): Promise<void> {
  if (!UUID_RE.test(requestId)) return;
  await sql`DELETE FROM payments WHERE request_id = ${requestId} AND sitter_id = ${sitterId}`;
}

/** The owner rates a finished booking, once. The sitter is told without any link to the booking. */
export async function leaveReview(
  sql: Sql,
  ownerId: string,
  requestId: string,
  review: ReviewInput,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That booking doesn't exist.");
  const [row] = await sql<{ sitter_id: string; status: RequestStatus }[]>`
    SELECT o.sitter_id, r.status FROM requests r
    JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
    WHERE r.id = ${requestId} AND r.owner_id = ${ownerId}
  `;
  if (!row || row.status !== "completed") throw new PennPawsError("You can rate a booking once it's marked done.");
  const inserted = await sql`
    INSERT INTO reviews (request_id, owner_id, sitter_id, rating, feedback)
    VALUES (${requestId}, ${ownerId}, ${row.sitter_id}, ${review.rating}, ${review.feedback})
    ON CONFLICT (request_id) DO NOTHING
    RETURNING request_id
  `;
  if (inserted.length === 0) throw new PennPawsError("You already rated this booking.");
  await notify(sql, row.sitter_id, "You have a new rating. See it in Completed.", null, channels);
}

/** The ratings a sitter has received, newest first, without who or which booking. */
export async function listMyReviews(sql: Sql, sitterId: string): Promise<Review[]> {
  const rows = await sql<{ rating: number; feedback: string | null; month: string }[]>`
    SELECT rating, feedback, to_char(created_at, 'YYYY-MM') AS month FROM reviews
    WHERE sitter_id = ${sitterId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return rows.map((row) => ({ rating: Number(row.rating), feedback: row.feedback, month: row.month }));
}
