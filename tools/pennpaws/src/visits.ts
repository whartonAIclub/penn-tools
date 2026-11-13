// After matching: how the sitter gets in, each visit checked in with a photo,
// and the owner paying for each visit when it's done.
//
// The owner writes the entry guide once; codes and hiding places stay hidden
// from the sitter until both have approved the agreement, like phone numbers.
// A visit starts when the sitter taps "I'm here" with a photo of the pet, so
// the owner sees with their own eyes that the pet is fine, and ends when they
// tap "Done". Money still moves outside PennPaws: the owner taps a Venmo or
// PayPal link already filled in with the sitter's handle and the amount, then
// "I paid", which also keeps the booking's payment record (jobs.ts) in step.

import type { Sql } from "postgres";
import { z } from "@penntools/core/ai";
import { canSeeContacts, type RequestStatus } from "./booking.js";
import { notify, type NotificationChannel } from "./notifications.js";
import { parsePay } from "./pay.js";
import type { Checked } from "./request.js";
import { PennPawsError, UUID_RE } from "./requests.js";
import { LIMITS, type Option } from "./survey.js";

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [T[number]["value"], ...T[number]["value"][]];
const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ── Getting in ───────────────────────────────────────────────────────────────

export const KEY_METHODS = [
  { value: "meet", label: "We meet and I hand over a key", hint: "Before you leave" },
  { value: "doorman", label: "Front desk or doorman", hint: "Leave a key with your building" },
  { value: "lockbox", label: "Lockbox or door code", hint: "Give the code below" },
  { value: "hidden", label: "Hidden key", hint: "Say where it is below" },
  { value: "smart_lock", label: "Smart lock", hint: "You let them in from your phone" },
  { value: "other", label: "Something else", hint: "Explain below" },
] as const satisfies readonly Option[];
export type KeyMethod = (typeof KEY_METHODS)[number]["value"];

const short = z.string().trim().max(LIMITS.shortText).nullable();
export const EntryGuide = z.object({
  building: short,
  unit: short,
  keyMethod: z.enum(values(KEY_METHODS)),
  keyDetails: z.string().trim().max(300).nullable(),
  quirks: z.string().trim().max(300).nullable(),
});
export type EntryGuide = z.infer<typeof EntryGuide>;

export function checkEntryGuide(input: unknown): Checked<EntryGuide> {
  const result = EntryGuide.safeParse(input);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Check how to get in." };
  const g = result.data;
  const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const guide = { building: blank(g.building), unit: blank(g.unit), keyMethod: g.keyMethod, keyDetails: blank(g.keyDetails), quirks: blank(g.quirks) };
  const needsDetails = guide.keyMethod === "lockbox" || guide.keyMethod === "hidden" || guide.keyMethod === "other";
  if (needsDetails && !guide.keyDetails) {
    return { ok: false, error: guide.keyMethod === "lockbox" ? "Add the code, or where the lockbox is." : guide.keyMethod === "hidden" ? "Say where the key is." : "Explain how they get in." };
  }
  return { ok: true, value: guide };
}

// ── Paying the sitter ────────────────────────────────────────────────────────

export const PayHandles = z.object({
  venmo: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || /^[A-Za-z0-9_-]{5,30}$/.test(v), "A Venmo username is 5 to 30 letters, numbers, dashes or underscores.")
    .nullable(),
  paypal: z
    .string()
    .trim()
    .transform((v) => v.replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, ""))
    .refine((v) => v === "" || /^[A-Za-z0-9]{1,20}$/.test(v), "A PayPal.Me name is up to 20 letters or numbers.")
    .nullable(),
});
export type PayHandles = { venmo: string | null; paypal: string | null };

export function checkPayHandles(input: unknown): Checked<PayHandles> {
  const result = PayHandles.safeParse(input);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Check your payment usernames." };
  const handles = { venmo: result.data.venmo || null, paypal: result.data.paypal || null };
  if (!handles.venmo && !handles.paypal) return { ok: false, error: "Add a Venmo or PayPal username so owners can pay you." };
  return { ok: true, value: handles };
}

/** A link that opens Venmo or PayPal with the sitter and amount filled in. The owner still confirms there. */
export function payLink(method: "venmo" | "paypal", handle: string, amount: number, note: string): string {
  const dollars = amount.toFixed(2).replace(/\.00$/, "");
  if (method === "venmo") {
    return `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${dollars}&note=${encodeURIComponent(note)}`;
  }
  return `https://paypal.me/${encodeURIComponent(handle)}/${dollars}USD`;
}

export const VISIT_PAY_METHODS = [
  { value: "venmo", label: "Venmo" },
  { value: "paypal", label: "PayPal" },
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const satisfies readonly Option[];
export type VisitPayMethod = (typeof VISIT_PAY_METHODS)[number]["value"];

export const VisitPayment = z.object({
  amount: z.number().finite().positive("Enter what you paid.").max(9_999, "That amount looks too large."),
  method: z.enum(values(VISIT_PAY_METHODS)),
});
export type VisitPayment = z.infer<typeof VisitPayment>;

export function checkVisitPayment(input: unknown): Checked<VisitPayment> {
  const result = VisitPayment.safeParse(input);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Check the amount." };
  return { ok: true, value: { ...result.data, amount: Math.round(result.data.amount * 100) / 100 } };
}

// ── Check-ins ────────────────────────────────────────────────────────────────

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const CheckInInput = z.object({
  photo: z.string().nullable(),
  note: z.string().trim().max(LIMITS.message).nullable(),
});

/** A photo (required on arrival) and an optional note. */
export function checkCheckIn(input: unknown, photoRequired: boolean): Checked<{ photo: string | null; note: string | null }> {
  const result = CheckInInput.safeParse(input);
  if (!result.success) return { ok: false, error: "Check your photo and note." };
  const { photo, note } = result.data;
  if (photoRequired && !photo) return { ok: false, error: "Add a photo of your pet friend so the owner can see they're OK." };
  if (photo && (!PHOTO_RE.test(photo) || photo.length > LIMITS.photo)) return { ok: false, error: "That photo couldn't be used. Try another one." };
  return { ok: true, value: { photo, note: note || null } };
}

export interface Visit {
  id: string;
  arrivedAt: string;
  arrivedPhoto: string;
  arrivedNote: string | null;
  leftAt: string | null;
  leftPhoto: string | null;
  leftNote: string | null;
  paid: { amount: number; method: VisitPayMethod; at: string } | null;
}

/** Everything after matching, as the viewer may see it. */
export interface AfterMatchView {
  role: "owner" | "sitter";
  status: RequestStatus;
  petName: string;
  otherFirstName: string;
  /** Null when there's no guide yet, or the sitter can't see it before both approve. */
  guide: EntryGuide | null;
  /** True when the owner has written a guide the sitter can't see yet. */
  guideLocked: boolean;
  /** The sitter's own handles for the sitter; for the owner once booked. */
  handles: PayHandles | null;
  visits: Visit[];
  /** The agreed rate per visit or night, to fill in the payment. */
  rate: number | null;
}

interface PartyRow {
  owner_id: string;
  owner_name: string;
  sitter_id: string;
  sitter_name: string;
  pet_name: string;
  status: RequestStatus;
  pay: string;
}

async function party(sql: Sql, userId: string, requestId: string) {
  if (!UUID_RE.test(requestId)) return null;
  const [row] = await sql<PartyRow[]>`
    SELECT r.owner_id, r.owner_name, o.sitter_id, o.sitter_name, r.pet_name, r.status, r.pay
    FROM requests r JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
    WHERE r.id = ${requestId}
  `;
  if (!row) return null;
  const role = row.owner_id === userId ? ("owner" as const) : row.sitter_id === userId ? ("sitter" as const) : null;
  return role ? { ...row, role } : null;
}

interface VisitRow {
  id: string;
  arrived_at: Date;
  arrived_photo: string;
  arrived_note: string | null;
  left_at: Date | null;
  left_photo: string | null;
  left_note: string | null;
  amount: string | null;
  paid_method: VisitPayMethod | null;
  paid_at: Date | null;
}

const toVisit = (v: VisitRow): Visit => ({
  id: v.id,
  arrivedAt: v.arrived_at.toISOString(),
  arrivedPhoto: v.arrived_photo,
  arrivedNote: v.arrived_note,
  leftAt: v.left_at?.toISOString() ?? null,
  leftPhoto: v.left_photo,
  leftNote: v.left_note,
  paid: v.amount && v.paid_method && v.paid_at ? { amount: Number(v.amount), method: v.paid_method, at: v.paid_at.toISOString() } : null,
});

export async function getAfterMatch(sql: Sql, viewerId: string, requestId: string): Promise<AfterMatchView | null> {
  const p = await party(sql, viewerId, requestId);
  if (!p) return null;
  const booked = canSeeContacts(p.status);
  const [g] = await sql<{ building: string | null; unit: string | null; key_method: KeyMethod; key_details: string | null; quirks: string | null }[]>`
    SELECT building, unit, key_method, key_details, quirks FROM entry_guides WHERE request_id = ${requestId}
  `;
  const guide = g ? { building: g.building, unit: g.unit, keyMethod: g.key_method, keyDetails: g.key_details, quirks: g.quirks } : null;
  const showGuide = p.role === "owner" || booked;
  const [h] = await sql<{ venmo: string | null; paypal: string | null }[]>`SELECT venmo, paypal FROM pay_handles WHERE user_id = ${p.sitter_id}`;
  const showHandles = p.role === "sitter" || booked;
  const visits = await sql<VisitRow[]>`
    SELECT id, arrived_at, arrived_photo, arrived_note, left_at, left_photo, left_note, amount, paid_method, paid_at
    FROM visits WHERE request_id = ${requestId} ORDER BY arrived_at DESC
  `;
  return {
    role: p.role,
    status: p.status,
    petName: p.pet_name,
    otherFirstName: firstWord(p.role === "owner" ? p.sitter_name : p.owner_name),
    guide: showGuide ? guide : null,
    guideLocked: !showGuide && guide !== null,
    handles: showHandles && h ? { venmo: h.venmo, paypal: h.paypal } : null,
    visits: visits.map(toVisit),
    rate: parsePay(p.pay)?.dollars ?? null,
  };
}

/** The owner writes or updates how to get in, while the booking is being set up or running. */
export async function saveEntryGuide(sql: Sql, ownerId: string, requestId: string, guide: EntryGuide, channels: readonly NotificationChannel[] = []): Promise<void> {
  const p = await party(sql, ownerId, requestId);
  if (!p || p.role !== "owner" || (p.status !== "matched" && p.status !== "agreed")) throw new PennPawsError("You can add how to get in once you've picked a sitter.");
  await sql`
    INSERT INTO entry_guides (request_id, building, unit, key_method, key_details, quirks)
    VALUES (${requestId}, ${guide.building}, ${guide.unit}, ${guide.keyMethod}, ${guide.keyDetails}, ${guide.quirks})
    ON CONFLICT (request_id) DO UPDATE SET
      building = EXCLUDED.building, unit = EXCLUDED.unit, key_method = EXCLUDED.key_method,
      key_details = EXCLUDED.key_details, quirks = EXCLUDED.quirks, updated_at = NOW()
  `;
  const when = p.status === "agreed" ? "" : " You'll see it once you both approve the agreement.";
  await notify(sql, p.sitter_id, `${firstWord(p.owner_name)} added how to get in for ${p.pet_name}.${when}`, requestId, channels);
}

/** A sitter's Venmo and PayPal usernames, kept for every booking. */
export async function savePayHandles(sql: Sql, userId: string, handles: PayHandles): Promise<void> {
  await sql`
    INSERT INTO pay_handles (user_id, venmo, paypal) VALUES (${userId}, ${handles.venmo}, ${handles.paypal})
    ON CONFLICT (user_id) DO UPDATE SET venmo = EXCLUDED.venmo, paypal = EXCLUDED.paypal, updated_at = NOW()
  `;
}

/** The sitter arrives: a photo of the pet, and the owner is told straight away. */
export async function checkIn(
  sql: Sql,
  sitterId: string,
  requestId: string,
  input: { photo: string | null; note: string | null },
  channels: readonly NotificationChannel[] = [],
): Promise<string> {
  const p = await party(sql, sitterId, requestId);
  if (!p || p.role !== "sitter" || p.status !== "agreed") throw new PennPawsError("You can check in once you're booked.");
  if (!input.photo) throw new PennPawsError("Add a photo of your pet friend so the owner can see they're OK.");
  const [open] = await sql<{ id: string }[]>`SELECT id FROM visits WHERE request_id = ${requestId} AND left_at IS NULL`;
  if (open) throw new PennPawsError("You're already checked in. Tap Done when you leave.");
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO visits (request_id, sitter_id, arrived_photo, arrived_note)
    VALUES (${requestId}, ${sitterId}, ${input.photo}, ${input.note})
    RETURNING id
  `;
  await notify(sql, p.owner_id, `${firstWord(p.sitter_name)} arrived and is with ${p.pet_name}. See the photo.`, requestId, channels);
  return row!.id;
}

/** The sitter leaves: an optional last photo and note, and the owner can pay for the visit. */
export async function checkOut(
  sql: Sql,
  sitterId: string,
  requestId: string,
  input: { photo: string | null; note: string | null },
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  const p = await party(sql, sitterId, requestId);
  if (!p || p.role !== "sitter") throw new PennPawsError("That booking isn't yours.");
  const done = await sql`
    UPDATE visits SET left_at = NOW(), left_photo = ${input.photo}, left_note = ${input.note}
    WHERE request_id = ${requestId} AND sitter_id = ${sitterId} AND left_at IS NULL
    RETURNING id
  `;
  if (done.length === 0) throw new PennPawsError("Check in first.");
  await notify(sql, p.owner_id, `${firstWord(p.sitter_name)} finished the visit with ${p.pet_name}. You can pay for it now.`, requestId, channels);
}

/**
 * The owner says they paid for a finished visit. The booking's payment
 * record becomes the total paid so far, so "paid" in the booking list stays
 * true to what happened.
 */
export async function markVisitPaid(
  sql: Sql,
  ownerId: string,
  requestId: string,
  visitId: string,
  payment: VisitPayment,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  if (!UUID_RE.test(visitId)) throw new PennPawsError("That visit doesn't exist.");
  const p = await party(sql, ownerId, requestId);
  if (!p || p.role !== "owner") throw new PennPawsError("That booking isn't yours.");
  await sql.begin(async (transaction) => {
    // postgres.js types drop the call signature from TransactionSql, though it has one.
    const tx = transaction as unknown as Sql;
    const paid = await tx`
      UPDATE visits SET amount = ${payment.amount}, paid_method = ${payment.method}, paid_at = NOW()
      WHERE id = ${visitId} AND request_id = ${requestId} AND left_at IS NOT NULL AND paid_at IS NULL
      RETURNING id
    `;
    if (paid.length === 0) throw new PennPawsError("This visit is already paid, or isn't finished yet.");
    const [sum] = await tx<{ total: string }[]>`SELECT COALESCE(SUM(amount), 0) AS total FROM visits WHERE request_id = ${requestId} AND paid_at IS NOT NULL`;
    const total = sum?.total ?? String(payment.amount);
    await tx`
      INSERT INTO payments (request_id, sitter_id, amount, method, paid_on)
      VALUES (${requestId}, ${p.sitter_id}, ${total}, ${payment.method}, CURRENT_DATE)
      ON CONFLICT (request_id) DO UPDATE SET amount = EXCLUDED.amount, method = EXCLUDED.method, paid_on = EXCLUDED.paid_on
    `;
  });
  const dollars = payment.amount.toFixed(2).replace(/\.00$/, "");
  await notify(sql, p.sitter_id, `${firstWord(p.owner_name)} paid $${dollars} for the visit with ${p.pet_name}.`, requestId, channels);
}

// ── Test menu ────────────────────────────────────────────────────────────────

/** A drawn stand-in for a pet photo, so a fake sitter can check in without a real picture. */
const FAKE_PHOTO = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240'><rect width='320' height='240' fill='#f3f0ea'/><rect y='170' width='320' height='70' fill='#e6dccb'/><ellipse cx='160' cy='175' rx='70' ry='40' fill='#d9a35c'/><circle cx='160' cy='115' r='44' fill='#d9a35c'/><path d='M124 90 L130 52 L152 78 Z M196 90 L190 52 L168 78 Z' fill='#d9a35c'/><circle cx='145' cy='112' r='5' fill='#1d1b18'/><circle cx='175' cy='112' r='5' fill='#1d1b18'/><path d='M154 126 Q160 132 166 126' stroke='#1d1b18' stroke-width='3' fill='none' stroke-linecap='round'/><text x='16' y='30' font-family='sans-serif' font-size='14' fill='#6f6a62'>Test photo from your sitter</text></svg>",
)}`;

/**
 * For the local test user only: on each of their agreed bookings with a fake
 * sitter, the sitter finishes an open visit, or starts a new one. Returns what
 * happened, in words.
 */
export async function playFakeVisits(sql: Sql, ownerId: string, fakePrefix: string): Promise<string[]> {
  const rows = await sql<{ id: string; sitter_id: string; sitter_name: string; pet_name: string }[]>`
    SELECT r.id, o.sitter_id, o.sitter_name, r.pet_name
    FROM requests r JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
    WHERE r.owner_id = ${ownerId} AND r.status = 'agreed' AND o.sitter_id LIKE ${`${fakePrefix}%`}
  `;
  const done: string[] = [];
  for (const row of rows) {
    const who = firstWord(row.sitter_name);
    await savePayHandles(sql, row.sitter_id, { venmo: `${who.toLowerCase()}-pennpaws`, paypal: null });
    const [open] = await sql<{ id: string }[]>`SELECT id FROM visits WHERE request_id = ${row.id} AND left_at IS NULL`;
    if (open) {
      await checkOut(sql, row.sitter_id, row.id, { photo: null, note: `All good. ${row.pet_name} ate everything and had a nap.` });
      done.push(`${who} finished the visit with ${row.pet_name}. Pay for it in the request.`);
    } else {
      await checkIn(sql, row.sitter_id, row.id, { photo: FAKE_PHOTO, note: `Hi! I'm here. ${row.pet_name} came to the door to say hello.` });
      done.push(`${who} checked in with ${row.pet_name} and sent a photo.`);
    }
  }
  return done.length ? done : ["No booked requests with a fake sitter yet. Accept an offer and approve the agreement first."];
}
