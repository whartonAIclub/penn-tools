// Keep in Touch's contact storage, in its own keepintouch schema. Callers pass
// the database client (toolSql("keepintouch")) and the signed-in user's id;
// every read and write is scoped to that user. Inputs have already passed
// checkContactInput / checkInteractionInput.

import type { Sql } from "postgres";
import type { ContactInput, InteractionInput, InteractionKind, MetHow } from "./input.js";

export interface Contact extends ContactInput {
  id: string;
  /** YYYY-MM-DD the contact was added. */
  addedOn: string;
  /** YYYY-MM-DD of the latest time in touch: when they met, or a logged interaction. */
  lastContactedOn: string | null;
}

export interface Interaction extends Pick<InteractionInput, "occurredOn" | "kind" | "summary"> {
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres's type id for text; tags are sent as text[] even when empty. */
const TEXT_TYPE = 25;

interface ContactRow {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  met_how: MetHow | null;
  met_at: string | null;
  met_on: string | null;
  tags: string[];
  notes: string;
  cadence_days: number | null;
  follow_up_on: string | null;
  follow_up_note: string | null;
  added_on: string;
  last_contacted_on: string | null;
}

interface InteractionRow {
  id: string;
  occurred_on: string;
  kind: InteractionKind;
  summary: string;
}

/** The user's contacts, most recently added first. */
export async function listContacts(sql: Sql, userId: string): Promise<Contact[]> {
  return selectContacts(sql, userId, null);
}

/** The contact, or null if it doesn't exist or isn't the user's. */
export async function getContact(sql: Sql, userId: string, contactId: string): Promise<Contact | null> {
  if (!UUID_RE.test(contactId)) return null;
  const [contact] = await selectContacts(sql, userId, contactId);
  return contact ?? null;
}

/** Saves a new contact and returns it. */
export async function createContact(sql: Sql, userId: string, input: ContactInput): Promise<Contact> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO contacts (user_id, name, company, role, met_how, met_at, met_on, tags, notes,
                          cadence_days, follow_up_on, follow_up_note)
    VALUES (${userId}, ${input.name}, ${input.company}, ${input.role}, ${input.metHow}, ${input.metAt},
            ${input.metOn}, ${sql.array(input.tags, TEXT_TYPE)}, ${input.notes}, ${input.cadenceDays},
            ${input.followUpOn}, ${input.followUpNote})
    RETURNING id
  `;
  return (await getContact(sql, userId, row!.id))!;
}

/** Replaces the contact's details; null if it doesn't exist or isn't the user's. */
export async function updateContact(sql: Sql, userId: string, contactId: string, input: ContactInput): Promise<Contact | null> {
  if (!UUID_RE.test(contactId)) return null;
  const [row] = await sql`
    UPDATE contacts SET
      name = ${input.name}, company = ${input.company}, role = ${input.role},
      met_how = ${input.metHow}, met_at = ${input.metAt}, met_on = ${input.metOn},
      tags = ${sql.array(input.tags, TEXT_TYPE)}, notes = ${input.notes},
      cadence_days = ${input.cadenceDays}, follow_up_on = ${input.followUpOn},
      follow_up_note = ${input.followUpNote}, updated_at = NOW()
    WHERE id = ${contactId} AND user_id = ${userId}
    RETURNING id
  `;
  return row ? getContact(sql, userId, contactId) : null;
}

/** Deletes the contact and its interactions; false if it doesn't exist or isn't the user's. */
export async function deleteContact(sql: Sql, userId: string, contactId: string): Promise<boolean> {
  if (!UUID_RE.test(contactId)) return false;
  const rows = await sql`DELETE FROM contacts WHERE id = ${contactId} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

/** The user's tags, most used first; spellings differing only in case count as one. */
export async function listTags(sql: Sql, userId: string, limit = 50): Promise<string[]> {
  // COLLATE "C" picks the same spelling whatever the database's locale.
  const rows = await sql<{ tag: string }[]>`
    SELECT MIN(tag COLLATE "C") AS tag
    FROM contacts, unnest(tags) AS tag
    WHERE user_id = ${userId}
    GROUP BY lower(tag)
    ORDER BY COUNT(*) DESC, 1
    LIMIT ${limit}
  `;
  return rows.map((row) => row.tag);
}

/** The contact's interactions, latest first, or null if it doesn't exist or isn't the user's. */
export async function listInteractions(sql: Sql, userId: string, contactId: string): Promise<Interaction[] | null> {
  if (!UUID_RE.test(contactId)) return null;
  const [owned] = await sql`SELECT 1 FROM contacts WHERE id = ${contactId} AND user_id = ${userId}`;
  if (!owned) return null;
  const rows = await sql<InteractionRow[]>`
    SELECT id::text AS id, occurred_on::text AS occurred_on, kind, summary
    FROM interactions
    WHERE contact_id = ${contactId}
    ORDER BY occurred_on DESC, id DESC
  `;
  return rows.map(toInteraction);
}

/**
 * Records a time in touch with the contact and sets their next follow-up, both
 * or neither. Returns the interaction and the updated contact, or null if the
 * contact doesn't exist or isn't the user's.
 */
export async function logInteraction(
  sql: Sql,
  userId: string,
  contactId: string,
  input: InteractionInput,
): Promise<{ interaction: Interaction; contact: Contact } | null> {
  if (!UUID_RE.test(contactId)) return null;
  // One statement, so it's all or nothing. It only touches the user's own
  // contact: the insert reads its id from the update's result, empty for anyone else's.
  const [row] = await sql<InteractionRow[]>`
    WITH contact AS (
      UPDATE contacts SET follow_up_on = ${input.nextFollowUpOn}, follow_up_note = ${input.nextFollowUpNote},
                          updated_at = NOW()
      WHERE id = ${contactId} AND user_id = ${userId}
      RETURNING id
    )
    INSERT INTO interactions (contact_id, occurred_on, kind, summary)
    SELECT id, ${input.occurredOn}, ${input.kind}, ${input.summary} FROM contact
    RETURNING id::text AS id, occurred_on::text AS occurred_on, kind, summary
  `;
  if (!row) return null;
  const contact = await getContact(sql, userId, contactId);
  return contact && { interaction: toInteraction(row), contact };
}

// Dates are selected as YYYY-MM-DD text rather than Date objects, so no time
// zone can move them to the day before.
async function selectContacts(sql: Sql, userId: string, contactId: string | null): Promise<Contact[]> {
  const rows = await sql<ContactRow[]>`
    SELECT c.id, c.name, c.company, c.role, c.met_how, c.met_at, c.met_on::text AS met_on, c.tags, c.notes,
           c.cadence_days, c.follow_up_on::text AS follow_up_on, c.follow_up_note,
           c.created_at::date::text AS added_on,
           GREATEST(c.met_on, (SELECT MAX(i.occurred_on) FROM interactions i WHERE i.contact_id = c.id))::text
             AS last_contacted_on
    FROM contacts c
    WHERE c.user_id = ${userId} ${contactId === null ? sql`` : sql`AND c.id = ${contactId}`}
    ORDER BY c.created_at DESC
    LIMIT 1000
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    role: row.role,
    metHow: row.met_how,
    metAt: row.met_at,
    metOn: row.met_on,
    tags: row.tags,
    notes: row.notes,
    cadenceDays: row.cadence_days,
    followUpOn: row.follow_up_on,
    followUpNote: row.follow_up_note,
    addedOn: row.added_on,
    lastContactedOn: row.last_contacted_on,
  }));
}

function toInteraction(row: InteractionRow): Interaction {
  return { id: row.id, occurredOn: row.occurred_on, kind: row.kind, summary: row.summary };
}
