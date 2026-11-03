// Recruiting Helper's storage, in its own recruitinghelper schema (schema.sql).
// Callers pass the database client (toolSql("recruitinghelper")) and the
// signed-in user's id; every read and write is scoped to that user.

import type { Sql } from "postgres";
import type { RecruitingProfile, ScoredContact, ScoredPosting } from "./scoring.js";

/** The most items one user keeps; the lowest-ranked beyond this aren't listed. */
export const MAX_ITEMS = 500;

export type SavedPosting = ScoredPosting & { id: string; addedAt: string; link: string | null };
export type SavedContact = ScoredContact & { id: string; addedAt: string };
export type SavedItem = SavedPosting | SavedContact;

/** What scoring produced, before it's saved: a posting carries its link, if any. */
export type NewItem = (ScoredPosting & { link: string | null }) | ScoredContact;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lowercase letters only, so "José O'Neil" and "jose oneil" are the same person. */
function normalName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** What makes a repeat of `item`: a posting's link or a person's name; null if neither. */
export function matchKey(item: NewItem): string | null {
  if (item.kind === "posting") return item.link;
  return item.name ? normalName(item.name) || null : null;
}

export async function getProfile(sql: Sql, userId: string): Promise<RecruitingProfile | null> {
  const [row] = await sql<{ profile: RecruitingProfile }[]>`
    SELECT profile FROM profiles WHERE user_id = ${userId}
  `;
  return row?.profile ?? null;
}

/** Saves the profile, replacing any earlier one. Check it with checkProfile first. */
export async function saveProfile(sql: Sql, userId: string, profile: RecruitingProfile): Promise<void> {
  const value = {
    background: profile.background,
    targetRoles: profile.targetRoles,
    companies: profile.companies.map(({ name, tier }) => ({ name, tier })),
    bonusSignals: profile.bonusSignals,
  };
  await sql`
    INSERT INTO profiles (user_id, profile) VALUES (${userId}, ${sql.json(value)})
    ON CONFLICT (user_id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = NOW()
  `;
}

/** The user's items, best score first, most recently scored first within a score. */
export async function listItems(sql: Sql, userId: string): Promise<SavedItem[]> {
  const rows = await sql<{ id: string; result: NewItem; updated_at: Date }[]>`
    SELECT id, result, updated_at FROM items
    WHERE user_id = ${userId}
    ORDER BY score DESC, updated_at DESC
    LIMIT ${MAX_ITEMS}
  `;
  return rows.map((row) => toSaved(row.id, row.result, row.updated_at));
}

/**
 * Saves a scored item. A repeat of one the user already has (same posting link,
 * same person) replaces it, and `replaced` says so.
 */
export async function saveItem(sql: Sql, userId: string, item: NewItem): Promise<{ item: SavedItem; replaced: boolean }> {
  // xmax is 0 for a freshly inserted row and set when ON CONFLICT updated one.
  const [row] = await sql<{ id: string; updated_at: Date; replaced: boolean }[]>`
    INSERT INTO items (user_id, kind, match_key, score, result)
    VALUES (${userId}, ${item.kind}, ${matchKey(item)}, ${item.score}, ${sql.json(item as never)})
    ON CONFLICT (user_id, kind, match_key) DO UPDATE
      SET score = EXCLUDED.score, result = EXCLUDED.result, updated_at = NOW()
    RETURNING id, updated_at, (xmax <> 0) AS replaced
  `;
  return { item: toSaved(row!.id, item, row!.updated_at), replaced: row!.replaced };
}

/** Deletes one of the user's items; false if it doesn't exist or isn't theirs. */
export async function removeItem(sql: Sql, userId: string, itemId: string): Promise<boolean> {
  if (!UUID_RE.test(itemId)) return false;
  const rows = await sql`DELETE FROM items WHERE id = ${itemId} AND user_id = ${userId} RETURNING 1`;
  return rows.length > 0;
}

function toSaved(id: string, result: NewItem, updatedAt: Date): SavedItem {
  return { ...result, id, addedAt: updatedAt.toISOString() } as SavedItem;
}
