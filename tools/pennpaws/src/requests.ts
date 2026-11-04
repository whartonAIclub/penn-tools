// PennPaws storage: requests, offers and agreements in the pennpaws schema.
// Callers pass the database client (toolSql("pennpaws")) and the signed-in
// user. Every status change is checked against booking.ts and guarded in SQL,
// so two people acting at once can't both win.

import type { Sql } from "postgres";
import { assertActive } from "./members.js";
import { AgreementTerms, type AgreementTerms as Terms } from "./agreement.js";
import { allowedFrom, bothApproved, canSeeContacts, nextStatus, type OfferStatus, type RequestStatus, type Role } from "./booking.js";
import type { PaymentMethod, SitterJob } from "./jobs.js";
import { checkAsks, type AskCheck } from "./match.js";
import { EXPERIENCE, SERVICES, checkProfile, petNotes } from "./profile.js";
import { notify, type NotificationChannel } from "./notifications.js";
import type { Handoff } from "./handoff.js";
import { hideContacts, type RequestDraft } from "./request.js";
import { LIMITS, listLabels } from "./survey.js";

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
  /** Whether the sitter recorded being paid. The owner sees that it happened, never what the sitter earns. */
  paid: boolean;
  /** Whether the owner has rated this booking. */
  rated: boolean;
}

/**
 * What a finished booking is still waiting for, newest step last, or an empty
 * list when it's done with (R46). A booking that is marked done but unpaid or
 * unrated stays in My requests, so it can't quietly disappear.
 */
export function stillToDo(card: Pick<RequestCard, "status" | "paid" | "rated">): string[] {
  if (card.status !== "completed") return [];
  const left: string[] = [];
  if (!card.paid) left.push("Waiting for your sitter to record the payment");
  if (!card.rated) left.push("Rate your sitter");
  return left;
}

/** A booking the owner is finished with: done, paid and rated. */
export function isFinished(card: Pick<RequestCard, "status" | "paid" | "rated">): boolean {
  return card.status === "completed" && stillToDo(card).length === 0;
}

export interface OfferView {
  id: string;
  sitterFirstName: string;
  message: string;
  status: OfferStatus;
  /** Whether the sitter has what the request asks for, for the owner; null without a sitter profile. */
  match: AskCheck | null;
  /** Who the sitter is, for the owner choosing between offers; null without a sitter profile. */
  sitter: SitterCard | null;
}

/** What an owner sees about a sitter who offered: their own words, what they've done, and how past owners rated them. */
export interface SitterCard {
  bio: string;
  area: string;
  services: string;
  experience: string | null;
  rating: { average: number | null; count: number };
  jobsDone: number;
}

export interface AgreementView {
  terms: Terms;
  version: number;
  ownerApproved: boolean;
  sitterApproved: boolean;
  /** The latest change someone asked for: who, in their words, and which terms moved. */
  lastChange: { byFirstName: string; text: string; fields: (keyof Terms)[] } | null;
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
  /** How to reach each other, only once the booking is agreed, and only for the two of them. */
  contacts: { owner: Contact; sitter: Contact } | null;
  /** The viewer's phone from their last booking, to save typing it again. */
  savedPhone: string | null;
  /** Temperament and bite history from the owner's profile, for the owner and sitters who have offered only. */
  petNotes: string | null;
  /** Whether the owner has rated this booking. Always false for the sitter, who sees ratings only anonymously. */
  reviewed: boolean;
}

export interface Contact {
  email: string | null;
  phone: string | null;
  address: string | null;
}

export class PennPawsError extends Error {}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Dog walks, drop-in visits and overnight stays": option labels joined into one sentence. */
function sentenceCase(list: string): string {
  return list.replace(/(, | and )([A-Z])(?=[a-z])/g, (_, joiner: string, letter: string) => joiner + letter.toLowerCase());
}

function hideTermContacts(terms: Terms): Terms {
  const hide = (text: string | null) => (text === null ? null : hideContacts(text));
  return { ...terms, notes: hide(terms.notes), care: hideContacts(terms.care), keys: hideContacts(terms.keys), ifUrgent: hideContacts(terms.ifUrgent), vet: hide(terms.vet) };
}

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
  care_type: RequestDraft["careType"];
  must_haves: RequestDraft["mustHaves"];
  sitter_gender: RequestDraft["sitterGender"];
  languages: RequestDraft["languages"];
  original_text: string | null;
  original_language: string | null;
  status: RequestStatus;
  created_at: Date;
  completed_at: Date | null;
  offer_count: string;
  paid: boolean;
  rated: boolean;
}

function selectRequests(sql: Sql) {
  return sql`
    SELECT r.id, r.owner_id, r.owner_name, r.owner_email, r.pet_name, r.pet_kind, r.pet_kind_other,
           r.pet_details, r.photo, r.weekly,
           to_char(r.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(r.ends_on, 'YYYY-MM-DD') AS ends_on,
           r.frequency, r.frequency_other, r.tasks, r.tasks_other, r.access, r.access_other,
           r.pay, r.area, r.vet, r.notes, r.status, r.created_at, r.completed_at,
           r.care_type, r.must_haves, r.sitter_gender, r.languages, r.original_text, r.original_language,
           (SELECT COUNT(*) FROM offers o WHERE o.request_id = r.id AND o.status = 'pending') AS offer_count,
           -- For R46: a booking is finished only once it is done, paid and rated.
           EXISTS (SELECT 1 FROM payments p WHERE p.request_id = r.id) AS paid,
           EXISTS (SELECT 1 FROM reviews v WHERE v.request_id = r.id) AS rated
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
      // Owners sometimes type a phone number or handle into the notes; others see it blanked until both approve.
      notes: row.notes && row.owner_id !== viewerId ? hideContacts(row.notes) : row.notes,
      careType: row.care_type,
      mustHaves: row.must_haves,
      sitterGender: row.sitter_gender,
      languages: row.languages,
      original: row.original_text && row.owner_id !== viewerId ? hideContacts(row.original_text) : row.original_text,
      originalLanguage: row.original_language,
    },
    ownerFirstName: firstName(row.owner_name),
    status: row.status,
    mine: row.owner_id === viewerId,
    offerCount: Number(row.offer_count),
    paid: row.paid,
    rated: row.rated,
    createdAt: row.created_at.toISOString(),
  };
}

/** Open requests that haven't ended, soonest first. Weekly requests come after dated ones. */
export async function listOpenRequests(sql: Sql, viewerId: string): Promise<RequestCard[]> {
  const rows = await sql<RequestRow[]>`
    ${selectRequests(sql)}
    WHERE r.status = 'open' AND (r.weekly OR r.ends_on >= CURRENT_DATE)
      AND (r.owner_id = ${viewerId} OR (r.hidden_at IS NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = r.owner_id AND m.paused_at IS NOT NULL)))
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

  const isOwner = row.owner_id === viewerId;
  const card = toCard(row, viewerId);
  // The owner sees how each sitter who offered fits the request.
  const matches = new Map<string, AskCheck>();
  const sitters = new Map<string, SitterCard>();
  if (isOwner && offers.length > 0) {
    const ids = offers.map((o) => o.sitter_id);
    const members = await sql<{ user_id: string; profile: unknown; average: number | null; ratings: number; done: number }[]>`
      SELECT m.user_id, m.profile,
             (SELECT ROUND(AVG(v.rating), 1)::float FROM reviews v WHERE v.sitter_id = m.user_id) AS average,
             (SELECT COUNT(*)::int FROM reviews v WHERE v.sitter_id = m.user_id) AS ratings,
             (SELECT COUNT(*)::int FROM offers o JOIN requests q ON q.id = o.request_id
               WHERE o.sitter_id = m.user_id AND o.status = 'accepted' AND q.status = 'completed') AS done
      FROM members m WHERE m.user_id IN ${sql(ids)}
    `;
    for (const member of members) {
      const checked = checkProfile(member.profile);
      if (!checked.ok || checked.value.role !== "sitter") continue;
      const profile = checked.value;
      matches.set(member.user_id, checkAsks(card.draft, profile));
      sitters.set(member.user_id, {
        bio: profile.bio,
        area: profile.location.area,
        services: sentenceCase(listLabels(SERVICES, profile.services)),
        experience: profile.experience.length ? sentenceCase(listLabels(EXPERIENCE, profile.experience)) : null,
        rating: { average: member.average, count: member.ratings },
        jobsDone: member.done,
      });
    }
  }
  const toView = (o: (typeof offers)[number]): OfferView => ({
    id: o.id,
    sitterFirstName: firstName(o.sitter_name),
    message: o.message,
    status: o.status,
    match: matches.get(o.sitter_id) ?? null,
    sitter: sitters.get(o.sitter_id) ?? null,
  });
  // A taken-back offer no longer makes the viewer part of the request.
  const mine = offers.find((o) => o.sitter_id === viewerId && o.status !== "withdrawn") ?? null;
  const accepted = offers.find((o) => o.status === "accepted") ?? null;
  const role: Role | null = isOwner ? "owner" : mine ? "sitter" : null;
  const party = isOwner || (mine !== null && mine.status === "accepted");

  let agreement: AgreementView | null = null;
  if (party) {
    const [a] = await sql<
      { terms: unknown; version: number; owner_approved_at: Date | null; sitter_approved_at: Date | null; last_change: string | null; changed_by: string | null; changed_fields: string[] }[]
    >`
      SELECT terms, version, owner_approved_at, sitter_approved_at, last_change, changed_by, changed_fields FROM agreements WHERE request_id = ${requestId}
    `;
    if (a) {
      const terms = AgreementTerms.parse(a.terms);
      // The AI can copy a phone number from the notes into the terms; the sitter sees it only once booked.
      const shown = isOwner || canSeeContacts(row.status) ? terms : hideTermContacts(terms);
      agreement = {
        terms: shown,
        version: a.version,
        ownerApproved: a.owner_approved_at !== null,
        sitterApproved: a.sitter_approved_at !== null,
        lastChange:
          a.last_change && a.changed_by
            ? { byFirstName: firstName(a.changed_by), text: a.last_change, fields: a.changed_fields.filter((f): f is keyof Terms => f in AgreementTerms.shape) }
            : null,
      };
    }
  }

  const reviewed = isOwner && row.status === "completed" && (await sql`SELECT 1 FROM reviews WHERE request_id = ${requestId}`).length > 0;

  let contacts: RequestView["contacts"] = null;
  if (party && accepted && canSeeContacts(row.status)) {
    const shared = await sql<{ user_id: string; phone: string; address: string | null }[]>`
      SELECT user_id, phone, address FROM handoffs WHERE request_id = ${requestId}
    `;
    const of = (userId: string, email: string | null): Contact => {
      const h = shared.find((x) => x.user_id === userId);
      return { email, phone: h?.phone ?? null, address: h?.address ?? null };
    };
    contacts = { owner: of(row.owner_id, row.owner_email), sitter: of(accepted.sitter_id, accepted.sitter_email) };
  }
  let privateNotes: string | null = null;
  if (role) {
    const [owner] = await sql<{ profile: unknown }[]>`SELECT profile FROM members WHERE user_id = ${row.owner_id}`;
    const checked = owner ? checkProfile(owner.profile) : null;
    if (checked?.ok && checked.value.role === "owner") privateNotes = petNotes(checked.value);
  }
  const [last] = party ? await sql<{ phone: string }[]>`SELECT phone FROM handoffs WHERE user_id = ${viewerId} ORDER BY created_at DESC LIMIT 1` : [];

  return {
    ...card,
    role,
    offers: isOwner ? offers.map(toView) : [],
    myOffer: mine ? toView(mine) : null,
    agreement,
    sitterFirstName: party && accepted ? firstName(accepted.sitter_name) : null,
    contacts,
    savedPhone: last?.phone ?? null,
    petNotes: privateNotes,
    reviewed,
  };
}

// ── Owner actions ─────────────────────────────────────────────────────────────

/** Posts the request (already checked with checkDraft) and returns its id. */
export async function createRequest(sql: Sql, owner: Person, draft: RequestDraft): Promise<string> {
  await assertActive(sql, owner.id);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO requests (
      owner_id, owner_name, owner_email, pet_name, pet_kind, pet_kind_other, pet_details, photo,
      weekly, starts_on, ends_on, frequency, frequency_other, tasks, tasks_other,
      access, access_other, pay, area, vet, notes,
      care_type, must_haves, sitter_gender, languages, original_text, original_language
    ) VALUES (
      ${owner.id}, ${owner.name}, ${owner.email}, ${draft.petName}, ${draft.petKind}, ${draft.petKindOther},
      ${draft.petDetails}, ${draft.photo}, ${draft.weekly}, ${draft.weekly ? null : draft.startsOn},
      ${draft.weekly ? null : draft.endsOn}, ${draft.frequency}, ${draft.frequencyOther}, ${sql.array(draft.tasks)},
      ${draft.tasksOther}, ${draft.access}, ${draft.accessOther}, ${draft.pay}, ${draft.area}, ${draft.vet}, ${draft.notes},
      ${draft.careType}, ${sql.array(draft.mustHaves)}, ${draft.sitterGender}, ${sql.array(draft.languages)},
      ${draft.original}, ${draft.originalLanguage}
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
export async function cancelRequest(
  sql: Sql,
  ownerId: string,
  requestId: string,
  reason: string | null = null,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That request doesn't exist.");
  const why = reason?.trim().slice(0, LIMITS.message) || null;
  const [row] = await sql<{ pet_name: string }[]>`
    UPDATE requests SET status = 'cancelled', cancel_reason = ${why}, updated_at = NOW()
    WHERE id = ${requestId} AND owner_id = ${ownerId} AND status = ANY(${sql.array([...allowedFrom("cancel")])})
    RETURNING pet_name
  `;
  if (!row) throw new PennPawsError("This request can't be cancelled now.");
  const sitters = await sql<{ sitter_id: string }[]>`
    SELECT sitter_id FROM offers WHERE request_id = ${requestId} AND status IN ('pending', 'accepted')
  `;
  for (const { sitter_id } of sitters) {
    await notify(sql, sitter_id, `The request for ${row.pet_name} was cancelled.${why ? ` The owner said: "${why}"` : ""}`, requestId, channels);
  }
}

/**
 * Takes back the sitter's offer. A pending offer just goes; if the owner had
 * already picked them, the agreement and shared details are removed and the
 * request opens again for other sitters. The owner is told, with the reason.
 */
export async function withdrawOffer(
  sql: Sql,
  sitter: Person,
  requestId: string,
  reason: string | null = null,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  if (!UUID_RE.test(requestId)) throw new PennPawsError("That request doesn't exist.");
  const why = reason?.trim().slice(0, LIMITS.message) || null;
  const result = await sql.begin(async (transaction) => {
    // postgres.js types drop the call signature from TransactionSql, though it has one.
    const tx = transaction as unknown as Sql;
    const [offer] = await tx<{ status: OfferStatus; owner_id: string; pet_name: string; request_status: RequestStatus }[]>`
      SELECT o.status, r.owner_id, r.pet_name, r.status AS request_status
      FROM offers o JOIN requests r ON r.id = o.request_id
      WHERE o.request_id = ${requestId} AND o.sitter_id = ${sitter.id}
      FOR UPDATE
    `;
    if (!offer || (offer.status !== "pending" && offer.status !== "accepted")) throw new PennPawsError("There's no offer of yours to take back.");
    const picked = offer.status === "accepted";
    if (picked && !nextStatus(offer.request_status, "sitter_withdraw", "sitter")) throw new PennPawsError("This booking is finished, so it can't be taken back.");
    await tx`UPDATE offers SET status = 'withdrawn', withdraw_reason = ${why} WHERE request_id = ${requestId} AND sitter_id = ${sitter.id}`;
    if (picked) {
      await tx`DELETE FROM agreements WHERE request_id = ${requestId}`;
      await tx`DELETE FROM handoffs WHERE request_id = ${requestId}`;
      await tx`UPDATE requests SET status = 'open', updated_at = NOW() WHERE id = ${requestId}`;
    }
    return { ...offer, picked };
  });
  const who = firstName(sitter.name);
  const said = why ? ` They said: "${why}"` : "";
  await notify(
    sql,
    result.owner_id,
    result.picked
      ? `${who} can't look after ${result.pet_name} anymore.${said} Your request is open again for other sitters.`
      : `${who} took back their offer for ${result.pet_name}.${said}`,
    requestId,
    channels,
  );
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
  await assertActive(sql, sitter.id);
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
    ON CONFLICT (request_id, sitter_id) DO UPDATE
      SET message = EXCLUDED.message, status = 'pending', withdraw_reason = NULL, match_score = NULL, created_at = NOW()
      -- A sitter who took back their offer may offer again; anything else is a repeat.
      WHERE offers.status = 'withdrawn'
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
  handoff: Handoff,
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
    await tx`
      INSERT INTO handoffs (request_id, user_id, phone, address) VALUES (${requestId}, ${userId}, ${handoff.phone}, ${handoff.address})
      ON CONFLICT (request_id, user_id) DO UPDATE SET phone = EXCLUDED.phone, address = EXCLUDED.address
    `;
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
    ? `You're booked. ${party.me} approved the agreement for ${party.pet}, and you can now see each other's phone number and email.`
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
  change: string | null = null,
  channels: readonly NotificationChannel[] = [],
): Promise<void> {
  const party = await partyOf(sql, userId, requestId);
  if (!party || party.status !== "matched") throw new PennPawsError("This agreement can't be changed now.");
  const checked = AgreementTerms.parse(terms);
  const [before] = await sql<{ terms: unknown }[]>`SELECT terms FROM agreements WHERE request_id = ${requestId}`;
  const old = before ? AgreementTerms.safeParse(before.terms) : null;
  const fields = (Object.keys(checked) as (keyof Terms)[]).filter((k) => !old?.success || old.data[k] !== checked[k]);
  await sql`
    UPDATE agreements SET terms = ${sql.json(checked)}, version = version + 1,
      owner_approved_at = NULL, sitter_approved_at = NULL, updated_at = NOW(),
      last_change = ${change?.trim().slice(0, LIMITS.message) || null}, changed_by = ${party.me}, changed_fields = ${sql.array(fields)}
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
