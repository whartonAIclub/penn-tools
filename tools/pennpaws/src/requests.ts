// PennPaws storage: requests, offers and agreements in the pennpaws schema.
// Callers pass the database client (toolSql("pennpaws")) and the signed-in
// user. Every status change is checked against booking.ts and guarded in SQL,
// so two people acting at once can't both win.

import type { Sql } from "postgres";
import { AgreementTerms, type AgreementTerms as Terms } from "./agreement.js";
import { allowedFrom, bothApproved, canSeeContacts, type OfferStatus, type RequestStatus, type Role } from "./booking.js";
import type { PaymentMethod, SitterJob } from "./jobs.js";
import { notify, type NotificationChannel } from "./notifications.js";
import type { RequestDraft } from "./request.js";
import { LIMITS } from "./survey.js";

/** The signed-in user, as the platform's getCurrentUser() returns them. */
export interface Person {
  id: string;
  name: string;
  email: string | null;
}

export interface RequestCard {
  id: string;
  draft: RequestDraft;
  ownerFirstName: string;
  status: RequestStatus;
  mine: boolean;
  offerCount: number;
  createdAt: string;
}

export interface OfferView {
  id: string;
  sitterFirstName: string;
  message: string;
  status: OfferStatus;
}

export interface AgreementView {
  terms: Terms;
  version: number;
  ownerApproved: boolean;
  sitterApproved: boolean;
}

export interface RequestView extends RequestCard {
  /** The viewer's part in this request, or null for a sitter who hasn't offered. */
  role: Role | null;
  /** Every offer, for the owner only. */
  offers: OfferView[];
  /** The viewer's own offer, for a sitter. */
  myOffer: OfferView | null;
  agreement: AgreementView | null;
  sitterFirstName: string | null;
  /** Both people's emails, only once the booking is agreed. */
  contacts: { owner: string | null; sitter: string | null } | null;
  /** Whether the owner has rated this booking. Always false for the sitter, who sees ratings only anonymously. */
  reviewed: boolean;
}

export class PennPawsError extends Error {}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "A Penn student";
}

// ── Reading ───────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_email: string | null;
  pet_name: string;
  pet_kind: RequestDraft["petKind"];
  pet_kind_other: string | null;
  pet_details: string | null;
  photo: string | null;
  weekly: boolean;
  starts_on: string | null;
  ends_on: string | null;
  frequency: RequestDraft["frequency"];
  frequency_other: string | null;
  tasks: RequestDraft["tasks"];
  tasks_other: string | null;
  access: RequestDraft["access"];
  access_other: string | null;
  pay: string;
  area: string | null;
  vet: string | null;
  notes: string | null;
  status: RequestStatus;
  created_at: Date;
  completed_at: Date | null;
  offer_count: string;
}

function selectRequests(sql: Sql) {
  return sql`
    SELECT r.id, r.owner_id, r.owner_name, r.owner_email, r.pet_name, r.pet_kind, r.pet_kind_other,
           r.pet_details, r.photo, r.weekly,
           to_char(r.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(r.ends_on, 'YYYY-MM-DD') AS ends_on,
           r.frequency, r.frequency_other, r.tasks, r.tasks_other, r.access, r.access_other,
           r.pay, r.area, r.vet, r.notes, r.status, r.created_at, r.completed_at,
           (SELECT COUNT(*) FROM offers o WHERE o.request_id = r.id AND o.status = 'pending') AS offer_count
    FROM requests r
  `;
}

function toCard(row: RequestRow, viewerId: string): RequestCard {
  return {
    id: row.id,
    draft: {
      petName: row.pet_name,
      petKind: row.pet_kind,
      petKindOther: row.pet_kind_other,
      petDetails: row.pet_details,
      photo: row.photo,
      weekly: row.weekly,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      frequency: row.frequency,
      frequencyOther: row.frequency_other,
      tasks: row.tasks,
      tasksOther: row.tasks_other,
      access: row.access,
      accessOther: row.access_other,
      pay: row.pay,
      area: row.area,
      vet: row.vet,
      notes: row.notes,
    },
    ownerFirstName: firstName(row.owner_name),
    status: row.status,
    mine: row.owner_id === viewerId,
    offerCount: Number(row.offer_count),
    createdAt: row.created_at.toISOString(),
  };
}

/** Open requests that haven't ended, soonest first. Weekly requests come after dated ones. */
export async function listOpenRequests(sql: Sql, viewerId: string): Promise<RequestCard[]> {
  const rows = await sql<RequestRow[]>`
    ${selectRequests(sql)}
    WHERE r.status = 'open' AND (r.weekly OR r.ends_on >= CURRENT_DATE)
    ORDER BY r.weekly, r.starts_on, r.created_at DESC
    LIMIT 100
  `;
  return rows.map((row) => toCard(row, viewerId));
}

/** Requests the user posted or offered to help with, newest first. */
export async function listMyRequests(sql: Sql, userId: string): Promise<RequestCard[]> {
  const rows = await sql<RequestRow[]>`
    ${selectRequests(sql)}
    WHERE r.owner_id = ${userId}
       OR EXISTS (SELECT 1 FROM offers o WHERE o.request_id = r.id AND o.sitter_id = ${userId} AND o.status <> 'withdrawn')
    ORDER BY r.created_at DESC
    LIMIT 100
  `;
  return rows.map((row) => toCard(row, userId));
}

/** Every request the sitter offered on, with their offer, whether it's their turn to approve, and what they've been paid. */
export async function listSitterJobs(sql: Sql, sitterId: string): Promise<SitterJob[]> {
  const rows = await sql<
    (RequestRow & { offer_status: OfferStatus; sitter_approved: boolean; amount: string | null; method: PaymentMethod | null; paid_on: string | null })[]
  >`
    SELECT q.*, o.status AS offer_status, a.sitter_approved_at IS NOT NULL AS sitter_approved,
           p.amount, p.method, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on
    FROM (${selectRequests(sql)}) q
    JOIN offers o ON o.request_id = q.id AND o.sitter_id = ${sitterId} AND o.status <> 'withdrawn'
    LEFT JOIN agreements a ON a.request_id = q.id AND a.offer_id = o.id
    LEFT JOIN payments p ON p.request_id = q.id AND p.sitter_id = o.sitter_id
    ORDER BY q.weekly, q.starts_on, q.created_at DESC
    LIMIT 200
  `;
  return rows.map((row) => ({
    request: toCard(row, sitterId),
    offer: row.offer_status,
    needsMyApproval: row.offer_status === "accepted" && row.status === "matched" && !row.sitter_approved,
    completedAt: row.completed_at?.toISOString() ?? null,
    payment: row.amount && row.method && row.paid_on ? { amount: Number(row.amount), method: row.method, paidOn: row.paid_on } : null,
  }));
}

/** One request as the viewer may see it, or null if it doesn't exist. */
export async function getRequestView(sql: Sql, viewerId: string, requestId: string): Promise<RequestView | null> {
  if (!UUID_RE.test(requestId)) return null;
  const [row] = await sql<RequestRow[]>`${selectRequests(sql)} WHERE r.id = ${requestId}`;
  if (!row) return null;

  const offers = await sql<
    { id: string; sitter_id: string; sitter_name: string; sitter_email: string | null; message: string; status: OfferStatus }[]
  >`SELECT id, sitter_id, sitter_name, sitter_email, message, status FROM offers WHERE request_id = ${requestId} ORDER BY created_at`;
  const toView = (o: (typeof offers)[number]): OfferView => ({
    id: o.id,
    sitterFirstName: firstName(o.sitter_name),
    message: o.message,
    status: o.status,
  });

  const isOwner = row.owner_id === viewerId;
  const mine = offers.find((o) => o.sitter_id === viewerId) ?? null;
  const accepted = offers.find((o) => o.status === "accepted") ?? null;
  const role: Role | null = isOwner ? "owner" : mine ? "sitter" : null;
  const party = isOwner || (mine !== null && mine.status === "accepted");

  let agreement: AgreementView | null = null;
  if (party) {
    const [a] = await sql<{ terms: unknown; version: number; owner_approved_at: Date | null; sitter_approved_at: Date | null }[]>`
      SELECT terms, version, owner_approved_at, sitter_approved_at FROM agreements WHERE request_id = ${requestId}
    `;
    if (a) {
      agreement = {
        terms: AgreementTerms.parse(a.terms),
        version: a.version,
        ownerApproved: a.owner_approved_at !== null,
        sitterApproved: a.sitter_approved_at !== null,
      };
    }
  }

  const reviewed = isOwner && row.status === "completed" && (await sql`SELECT 1 FROM reviews WHERE request_id = ${requestId}`).length > 0;

  return {
    ...toCard(row, viewerId),
    role,
    offers: isOwner ? offers.map(toView) : [],
    myOffer: mine ? toView(mine) : null,
    agreement,
    sitterFirstName: party && accepted ? firstName(accepted.sitter_name) : null,
    contacts: party && accepted && canSeeContacts(row.status) ? { owner: row.owner_email, sitter: accepted.sitter_email } : null,
    reviewed,
  };
}

// ── Owner actions ─────────────────────────────────────────────────────────────

/** Posts the request (already checked with checkDraft) and returns its id. */
export async function createRequest(sql: Sql, owner: Person, draft: RequestDraft): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO requests (
      owner_id, owner_name, owner_email, pet_name, pet_kind, pet_kind_other, pet_details, photo,
      weekly, starts_on, ends_on, frequency, frequency_other, tasks, tasks_other,
      access, access_other, pay, area, vet, notes
    ) VALUES (
      ${owner.id}, ${owner.name}, ${owner.email}, ${draft.petName}, ${draft.petKind}, ${draft.petKindOther},
      ${draft.petDetails}, ${draft.photo}, ${draft.weekly}, ${draft.weekly ? null : draft.startsOn},
      ${draft.weekly ? null : draft.endsOn}, ${draft.frequency}, ${draft.frequencyOther}, ${sql.array(draft.tasks)},
      ${draft.tasksOther}, ${draft.access}, ${draft.accessOther}, ${draft.pay}, ${draft.area}, ${draft.vet}, ${draft.notes}
    ) RETURNING id
  `;
  return row!.id;
}

/**
 * Accepts one offer: the request becomes matched, other offers are declined,
 * and the agreement is drafted by `makeTerms` (the template, or AI). Returns
 * the request id.
 */
export async function acceptOffer(
  sql: Sql,
  ownerId: string,
  offerId: string,
  makeTerms: (draft: RequestDraft, ownerFirstName: string, sitterMessage: string) => Promise<Terms>,
  channels: readonly NotificationChannel[] = [],
): Promise<string> {
  if (!UUID_RE.test(offerId)) throw new PennPawsError("That offer doesn't exist.");
  const [offer] = await sql<{ request_id: string; sitter_id: string; message: string }[]>`
    SELECT o.request_id, o.sitter_id, o.message FROM offers o
    JOIN requests r ON r.id = o.request_id
    WHERE o.id = ${offerId} AND r.owner_id = ${ownerId} AND o.status = 'pending'
  `;
  if (!offer) throw new PennPawsError("That offer is no longer available.");
  const view = await getRequestView(sql, ownerId, offer.request_id);
  if (!view || view.status !== "open") throw new PennPawsError("This request already has a sitter.");

  // Drafting may call the AI, so it happens before the transaction.
  const terms = AgreementTerms.parse(await makeTerms(view.draft, view.ownerFirstName, offer.message));

  const declined = await sql.begin(async (transaction) => {
    // postgres.js types drop the call signature from TransactionSql, though it has one.
    const tx = transaction as unknown as Sql;
    const moved = await tx`
      UPDATE requests SET status = 'matched', updated_at = NOW()
      WHERE id = ${offer.request_id} AND status = ANY(${tx.array([...allowedFrom("accept_offer")])})
      RETURNING id
    `;
    if (moved.length === 0) throw new PennPawsError("This request already has a sitter.");
    await tx`UPDATE offers SET status = 'accepted' WHERE id = ${offerId}`;
    const others = await tx<{ sitter_id: string }[]>`
      UPDATE offers SET status = 'declined'
      WHERE request_id = ${offer.request_id} AND id <> ${offerId} AND status = 'pending'
      RETURNING sitter_id
    `;
    await tx`
      INSERT INTO agreements (request_id, offer_id, terms) VALUES (${offer.request_id}, ${offerId}, ${tx.json(terms)})
    `;
    return others.map((o) => o.sitter_id);
  });

  const pet = view.draft.petName;
  await notify(sql, offer.sitter_id, `${view.ownerFirstName} picked you to look after ${pet}. Review the care agreement.`, offer.request_id, channels);
  for (const sitterId of declined) {
    await notify(sql, sitterId, `${pet} found a sitter. Thanks for offering.`, offer.request_id, channels);
  }
  return offer.request_id;
}

/** Cancels an open or matched request and tells every sitter who offered. */
export async function cancelRequest(sql: Sql, ownerId: string, requestId: string, channels: readonly NotificationChannel[] = []): Promise<void> {
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That request doesn't exist.");
  const [row] = await sql<{ pet_name: string }[]>`
    UPDATE requests SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${requestId} AND owner_id = ${ownerId} AND status = ANY(${sql.array([...allowedFrom("cancel")])})
    RETURNING pet_name
  `;
  if (!row) throw new PennPawsError("This request can't be cancelled now.");
  const sitters = await sql<{ sitter_id: string }[]>`
    SELECT sitter_id FROM offers WHERE request_id = ${requestId} AND status IN ('pending', 'accepted')
  `;
  for (const { sitter_id } of sitters) {
    await notify(sql, sitter_id, `The request for ${row.pet_name} was cancelled.`, requestId, channels);
  }
}

// ── Sitter actions ────────────────────────────────────────────────────────────

/** Offers to help with an open request, and tells the owner. */
export async function offerHelp(
  sql: Sql,
  sitter: Person,
  requestId: string,
  message: string,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  const text = message.trim().slice(0, LIMITS.message);
  if (!text) throw new PennPawsError("Say a line about yourself so the owner can decide.");
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That request doesn't exist.");
  const [request] = await sql<{ owner_id: string; pet_name: string; status: RequestStatus }[]>`
    SELECT owner_id, pet_name, status FROM requests WHERE id = ${requestId}
  `;
  if (!request) throw new PennPawsError("That request doesn't exist.");
  if (request.owner_id === sitter.id) throw new PennPawsError("This is your own request.");
  if (request.status !== "open") throw new PennPawsError("This request already has a sitter.");

  const inserted = await sql`
    INSERT INTO offers (request_id, sitter_id, sitter_name, sitter_email, message)
    VALUES (${requestId}, ${sitter.id}, ${sitter.name}, ${sitter.email}, ${text})
    ON CONFLICT (request_id, sitter_id) DO NOTHING
    RETURNING id
  `;
  if (inserted.length === 0) throw new PennPawsError("You already offered to help with this one.");
  await notify(sql, request.owner_id, `${firstName(sitter.name)} offered to look after ${request.pet_name}.`, requestId, channels);
}

// ── Both people ───────────────────────────────────────────────────────────────

async function partyOf(sql: Sql, userId: string, requestId: string) {
  if (!UUID_RE.test(requestId)) return null;
  const [row] = await sql<{ owner_id: string; owner_name: string; sitter_id: string; sitter_name: string; pet_name: string; status: RequestStatus }[]>`
    SELECT r.owner_id, r.owner_name, o.sitter_id, o.sitter_name, r.pet_name, r.status
    FROM requests r JOIN offers o ON o.request_id = r.id AND o.status = 'accepted'
    WHERE r.id = ${requestId}
  `;
  if (!row) return null;
  const role: Role | null = row.owner_id === userId ? "owner" : row.sitter_id === userId ? "sitter" : null;
  if (!role) return null;
  const other = role === "owner" ? { id: row.sitter_id, name: firstName(row.sitter_name) } : { id: row.owner_id, name: firstName(row.owner_name) };
  const me = role === "owner" ? firstName(row.owner_name) : firstName(row.sitter_name);
  return { role, other, me, pet: row.pet_name, status: row.status };
}

/**
 * Approves the agreement version the user read. When both have approved, the
 * request becomes agreed and contacts are shared.
 */
export async function approveAgreement(
  sql: Sql,
  userId: string,
  requestId: string,
  version: number,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  const party = await partyOf(sql, userId, requestId);
  if (!party || party.status !== "matched") throw new PennPawsError("This agreement can't be approved now.");

  const agreed = await sql.begin(async (transaction) => {
    // postgres.js types drop the call signature from TransactionSql, though it has one.
    const tx = transaction as unknown as Sql;
    const [a] = await tx<{ owner_approved_at: Date | null; sitter_approved_at: Date | null }[]>`
      UPDATE agreements SET
        owner_approved_at  = CASE WHEN ${party.role} = 'owner'  THEN NOW() ELSE owner_approved_at END,
        sitter_approved_at = CASE WHEN ${party.role} = 'sitter' THEN NOW() ELSE sitter_approved_at END
      WHERE request_id = ${requestId} AND version = ${version}
      RETURNING owner_approved_at, sitter_approved_at
    `;
    if (!a) throw new PennPawsError("The agreement changed. Read the new version, then approve.");
    const both = bothApproved({
      ownerApprovedAt: a.owner_approved_at?.toISOString() ?? null,
      sitterApprovedAt: a.sitter_approved_at?.toISOString() ?? null,
    });
    if (both) {
      await tx`
        UPDATE requests SET status = 'agreed', updated_at = NOW()
        WHERE id = ${requestId} AND status = ANY(${tx.array([...allowedFrom("both_approved")])})
      `;
    }
    return both;
  });

  const message = agreed
    ? `You're booked. ${party.me} approved the agreement for ${party.pet}, and you can now see each other's email.`
    : `${party.me} approved the agreement for ${party.pet}. It's your turn to review it.`;
  await notify(sql, party.other.id, message, requestId, channels);
}

/** Marks a booked request done, by either person, and tells the other. */
export async function completeBooking(sql: Sql, userId: string, requestId: string, channels: readonly NotificationChannel[] = []): Promise<void> {
  const party = await partyOf(sql, userId, requestId);
  if (!party || party.status !== "agreed") throw new PennPawsError("This booking can't be marked done now.");
  const moved = await sql`
    UPDATE requests SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE id = ${requestId} AND status = ANY(${sql.array([...allowedFrom("complete")])})
    RETURNING id
  `;
  if (moved.length === 0) throw new PennPawsError("This booking can't be marked done now.");
  const message =
    party.role === "sitter"
      ? `${party.me} marked looking after ${party.pet} as done. How did it go? Leave a rating.`
      : `${party.me} marked the booking for ${party.pet} as done. Thanks for looking after ${party.pet}.`;
  await notify(sql, party.other.id, message, requestId, channels);
}

/** Replaces the agreement with `terms`, clears both approvals and tells the other person. */
export async function changeAgreement(
  sql: Sql,
  userId: string,
  requestId: string,
  terms: Terms,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  const party = await partyOf(sql, userId, requestId);
  if (!party || party.status !== "matched") throw new PennPawsError("This agreement can't be changed now.");
  const checked = AgreementTerms.parse(terms);
  await sql`
    UPDATE agreements SET terms = ${sql.json(checked)}, version = version + 1,
      owner_approved_at = NULL, sitter_approved_at = NULL, updated_at = NOW()
    WHERE request_id = ${requestId}
  `;
  await notify(sql, party.other.id, `${party.me} asked for a change to the agreement for ${party.pet}. Take a look.`, requestId, channels);
}

/** The current terms, for the person asking to change them. */
export async function getTerms(sql: Sql, userId: string, requestId: string): Promise<{ terms: Terms; me: string } | null> {
  const party = await partyOf(sql, userId, requestId);
  if (!party) return null;
  const [a] = await sql<{ terms: unknown }[]>`SELECT terms FROM agreements WHERE request_id = ${requestId}`;
  return a ? { terms: AgreementTerms.parse(a.terms), me: party.me } : null;
}
