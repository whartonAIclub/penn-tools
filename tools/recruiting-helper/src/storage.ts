// Recruiting Helper's storage, in its own recruitinghelper schema (schema.sql).
// Callers pass the database client (toolSql("recruitinghelper")) and the
// signed-in user's id; every read and write is scoped to that user.

import type { Sql } from "postgres";
import { scoreContactReview, scorePostingReview } from "./scoring.js";
import type { OutreachDraft, RecruitingProfile, ScoredContact, ScoredPosting } from "./scoring.js";

/** The most items one user keeps; the lowest-ranked beyond this aren't listed. */
export const MAX_ITEMS = 500;

/** What scoring produced, before it's saved, with the link the student gave: the posting's, or the person's LinkedIn. */
export type NewItem = (ScoredPosting | ScoredContact) & { link: string | null };

export type SavedPosting = ScoredPosting & { id: string; addedAt: string; link: string | null };
export type SavedContact = ScoredContact & { id: string; addedAt: string; link: string | null };
export type SavedItem = SavedPosting | SavedContact;

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
 * same person) replaces it, and `replaced` says so. A repeat keeps the earlier
 * link when this one has none, and the person's outreach draft.
 */
export async function saveItem(sql: Sql, userId: string, item: NewItem): Promise<{ item: SavedItem; replaced: boolean }> {
  // xmax is 0 for a freshly inserted row and set when ON CONFLICT updated one.
  const [row] = await sql<{ id: string; result: NewItem; updated_at: Date; replaced: boolean }[]>`
    INSERT INTO items (user_id, kind, match_key, score, result)
    VALUES (${userId}, ${item.kind}, ${matchKey(item)}, ${item.score}, ${sql.json(item as never)})
    ON CONFLICT (user_id, kind, match_key) DO UPDATE
      SET score = EXCLUDED.score,
          result = EXCLUDED.result
            || CASE WHEN EXCLUDED.result->'link' = 'null'::jsonb AND items.result->'link' <> 'null'::jsonb
                    THEN jsonb_build_object('link', items.result->'link') ELSE '{}'::jsonb END
            || CASE WHEN items.result ? 'outreach'
                    THEN jsonb_build_object('outreach', items.result->'outreach') ELSE '{}'::jsonb END,
          updated_at = NOW()
    RETURNING id, result, updated_at, (xmax <> 0) AS replaced
  `;
  return { item: toSaved(row!.id, row!.result, row!.updated_at), replaced: row!.replaced };
}

/**
 * Re-scores all the user's items against their (new) profile, without AI: the
 * company tiers, and which of the signals already seen still count, are plain
 * code. The AI's judgments (role fit, what was on a profile) stay as they were,
 * so a newly added bonus signal counts only once that person is pasted again.
 * Returns the items whose scores changed.
 */
export async function rescoreItems(sql: Sql, userId: string, profile: RecruitingProfile): Promise<number> {
  const rows = await sql<{ id: string; score: number; result: NewItem }[]>`
    SELECT id, score, result FROM items WHERE user_id = ${userId}
  `;
  let changed = 0;
  for (const { id, score, result } of rows) {
    const rescored: NewItem =
      result.kind === "posting"
        ? { ...result, ...scorePostingReview(result, profile.companies) }
        : {
            ...result,
            ...scoreContactReview({ ...result, schools: result.schools ?? [] }, profile.companies, profile.bonusSignals),
            // Keep what scoring can't recompute: unknown schools stay unknown.
            schools: result.schools ?? null,
            pennAlum: result.pennAlum ?? null,
          };
    if (rescored.score === score && JSON.stringify(rescored) === JSON.stringify(result)) continue;
    await sql`
      UPDATE items SET score = ${rescored.score}, result = ${sql.json(rescored as never)}
      WHERE id = ${id} AND user_id = ${userId}
    `;
    changed++;
  }
  return changed;
}

/** One of the user's people, or null if it doesn't exist, isn't theirs or isn't a person. */
export async function getContact(sql: Sql, userId: string, itemId: string): Promise<SavedContact | null> {
  if (!UUID_RE.test(itemId)) return null;
  const [row] = await sql<{ id: string; result: NewItem; updated_at: Date }[]>`
    SELECT id, result, updated_at FROM items WHERE id = ${itemId} AND user_id = ${userId} AND kind = 'contact'
  `;
  return row ? (toSaved(row.id, row.result, row.updated_at) as SavedContact) : null;
}

/**
 * Saves an outreach draft on one of the user's people. Check it with
 * checkOutreach first. False if the person doesn't exist or isn't theirs.
 * Doesn't change when the item was scored, so the list's order stays put.
 */
export async function saveOutreach(sql: Sql, userId: string, itemId: string, draft: OutreachDraft): Promise<boolean> {
  if (!UUID_RE.test(itemId)) return false;
  const value = { subject: draft.subject, body: draft.body };
  const rows = await sql`
    UPDATE items SET result = jsonb_set(result, '{outreach}', ${sql.json(value)})
    WHERE id = ${itemId} AND user_id = ${userId} AND kind = 'contact'
    RETURNING 1
  `;
  return rows.length > 0;
}

/** Deletes one of the user's items; false if it doesn't exist or isn't theirs. */
export async function removeItem(sql: Sql, userId: string, itemId: string): Promise<boolean> {
  if (!UUID_RE.test(itemId)) return false;
  const rows = await sql`DELETE FROM items WHERE id = ${itemId} AND user_id = ${userId} RETURNING 1`;
  return rows.length > 0;
}

function toSaved(id: string, result: NewItem, updatedAt: Date): SavedItem {
  // People saved before links and schools were kept for them have none of these fields.
  const saved = { link: null, ...(result as Partial<NewItem>), id, addedAt: updatedAt.toISOString() } as SavedItem;
  if (saved.kind === "contact" && saved.schools === undefined) return { ...saved, schools: null, pennAlum: null };
  return saved;
}
