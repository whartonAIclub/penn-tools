// Recruiting Helper's storage, in its own recruitinghelper schema (schema.sql).
// Callers pass the database client (toolSql("recruitinghelper")) and the
// signed-in user's id; every read and write is scoped to that user.

import type { Sql, TransactionSql } from "postgres";

/** A transaction, as the Sql it is: postgres.js's TransactionSql type drops the call signature. */
const asSql = (tx: TransactionSql): Sql => tx as unknown as Sql;
import { normalizeCompany, scoreContactReview, scorePostingReview, withSchools } from "./scoring.js";
import type { OutreachDraft, RecruitingProfile, ScoredContact, ScoredPosting } from "./scoring.js";

/** The most items one user keeps. Once the list is full, saving a new one fails with ListFullError. */
export const MAX_ITEMS = 500;

/** Thrown by saveItem when the user's list already has MAX_ITEMS items. */
export class ListFullError extends Error {
  constructor() {
    super(`Your list is full (${MAX_ITEMS} items). Remove some you no longer need, then try again.`);
  }
}

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

/**
 * What makes a repeat of `item`, which replaces the saved one and keeps its
 * outreach draft and email; null if nothing does. Only clearly the same counts:
 * - a person: the same name at the same company (John Smith at Google isn't
 *   John Smith at McKinsey), with or without their LinkedIn link
 * - a posting: the same link for the same role at the same company, since
 *   several roles can share a link to a general careers page
 */
export function matchKey(item: NewItem): string | null {
  if (item.kind === "posting") {
    return item.link ? `${item.link} ${normalizeCompany(item.company)} ${normalizeCompany(item.title)}` : null;
  }
  const name = item.name ? normalName(item.name) : "";
  return name ? `${name} ${normalizeCompany(item.company)}` : null;
}

/** Whether the user's list is full, so a new item can't be saved; check before spending AI credit on one. */
export async function isListFull(sql: Sql, userId: string): Promise<boolean> {
  const [row] = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM items WHERE user_id = ${userId}`;
  return row!.count >= MAX_ITEMS;
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
  // The editor doesn't edit the outreach style (setOutreachStyle does), so keep it.
  await sql`
    INSERT INTO profiles (user_id, profile) VALUES (${userId}, ${sql.json(value)})
    ON CONFLICT (user_id) DO UPDATE
      SET profile = EXCLUDED.profile
            || CASE WHEN profiles.profile ? 'outreachStyle'
                    THEN jsonb_build_object('outreachStyle', profiles.profile->'outreachStyle') ELSE '{}'::jsonb END,
          updated_at = NOW()
  `;
}

/** Sets (or, with null, clears) how the user wants every outreach email written. False if they have no profile. */
export async function setOutreachStyle(sql: Sql, userId: string, style: string | null): Promise<boolean> {
  const rows = style?.trim()
    ? await sql`
        UPDATE profiles SET profile = profile || jsonb_build_object('outreachStyle', ${style.trim()}::text), updated_at = NOW()
        WHERE user_id = ${userId} RETURNING 1`
    : await sql`
        UPDATE profiles SET profile = profile - 'outreachStyle', updated_at = NOW()
        WHERE user_id = ${userId} RETURNING 1`;
  return rows.length > 0;
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
 * Saves a scored item. A repeat of one the user already has (see matchKey)
 * replaces it, and `replaced` says so. A repeat keeps the earlier link when
 * this one has none, and the person's outreach draft and email address.
 * Throws ListFullError for a new item when the list has MAX_ITEMS already.
 */
export async function saveItem(sql: Sql, userId: string, item: NewItem): Promise<{ item: SavedItem; replaced: boolean }> {
  const key = matchKey(item);
  // Inserts only while the list has room, or when it's a repeat (which ON CONFLICT
  // updates). xmax is 0 for a freshly inserted row and set when ON CONFLICT updated one.
  const [row] = await sql<{ id: string; result: NewItem; updated_at: Date; replaced: boolean }[]>`
    INSERT INTO items (user_id, kind, match_key, score, result)
    SELECT ${userId}, ${item.kind}, ${key}, ${item.score}, ${sql.json(item as never)}
    WHERE (SELECT COUNT(*) FROM items WHERE user_id = ${userId}) < ${MAX_ITEMS}
       OR EXISTS (SELECT 1 FROM items WHERE user_id = ${userId} AND kind = ${item.kind} AND match_key = ${key})
    ON CONFLICT (user_id, kind, match_key) DO UPDATE
      SET score = EXCLUDED.score,
          result = EXCLUDED.result
            || CASE WHEN EXCLUDED.result->'link' = 'null'::jsonb AND items.result->'link' <> 'null'::jsonb
                    THEN jsonb_build_object('link', items.result->'link') ELSE '{}'::jsonb END
            || CASE WHEN items.result ? 'outreach'
                    THEN jsonb_build_object('outreach', items.result->'outreach') ELSE '{}'::jsonb END
            || CASE WHEN items.result ? 'email'
                    THEN jsonb_build_object('email', items.result->'email') ELSE '{}'::jsonb END,
          updated_at = NOW()
    RETURNING id, result, updated_at, (xmax <> 0) AS replaced
  `;
  if (!row) throw new ListFullError();
  return { item: toSaved(row.id, row.result, row.updated_at), replaced: row.replaced };
}

/** The fields scoring sets, which re-scoring updates; everything else on a saved item is left alone. */
const POSTING_SCORE_FIELDS = ["score", "tier", "matchedCompany", "adjustment"] as const;
const CONTACT_SCORE_FIELDS = ["score", "priority", "tier", "matchedCompany", "points", "capped", "matchedSignals"] as const;

function pick<T extends object>(value: T, fields: readonly string[]): Partial<T> {
  return Object.fromEntries(fields.map((f) => [f, (value as Record<string, unknown>)[f]])) as Partial<T>;
}

/**
 * Re-scores all the user's items against their (new) profile, without AI: the
 * company tiers, and which of the signals already seen still count, are plain
 * code. The AI's judgments (role fit, what was on a profile) stay as they were,
 * so a newly added bonus signal counts only once that person is pasted again.
 * Only the scoring fields are written, in one statement, so an outreach draft
 * or email saved meanwhile is kept. Returns the items whose scores changed.
 */
export async function rescoreItems(sql: Sql, userId: string, profile: RecruitingProfile): Promise<number> {
  return sql.begin(async (t) => {
    const tx = asSql(t);
    // Locked until the update, so schools typed in meanwhile aren't scored from a stale copy.
    const rows = await tx<{ id: string; result: NewItem }[]>`
      SELECT id, result FROM items WHERE user_id = ${userId} FOR UPDATE
    `;
    return writeRescores(tx, userId, profile, rows);
  });
}

async function writeRescores(
  sql: Sql,
  userId: string,
  profile: RecruitingProfile,
  rows: { id: string; result: NewItem }[],
): Promise<number> {
  const changes: [string, number, string][] = [];
  for (const { id, result } of rows) {
    const changed =
      result.kind === "posting"
        ? pick(scorePostingReview(result, profile.companies), POSTING_SCORE_FIELDS)
        : pick(
            scoreContactReview({ ...result, schools: result.schools ?? [] }, profile.companies, profile.bonusSignals),
            CONTACT_SCORE_FIELDS,
          );
    const before = pick(result, Object.keys(changed));
    if (JSON.stringify(changed) !== JSON.stringify(before)) changes.push([id, changed.score!, JSON.stringify(changed)]);
  }
  if (changes.length === 0) return 0;
  await sql`
    UPDATE items SET score = v.score::int, result = items.result || v.changed::jsonb
    FROM (VALUES ${sql(changes)}) AS v (id, score, changed)
    WHERE items.id = v.id::uuid AND items.user_id = ${userId}
  `;
  return changes.length;
}

/** One of the user's items, or null if it doesn't exist or isn't theirs. */
export async function getItem(sql: Sql, userId: string, itemId: string): Promise<SavedItem | null> {
  if (!UUID_RE.test(itemId)) return null;
  const [row] = await sql<{ id: string; result: NewItem; updated_at: Date }[]>`
    SELECT id, result, updated_at FROM items WHERE id = ${itemId} AND user_id = ${userId}
  `;
  return row ? toSaved(row.id, row.result, row.updated_at) : null;
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

/**
 * Sets a person's schools (typed in by the student, checked with checkSchools)
 * and re-scores them against the profile. The updated person, or null if they
 * don't exist or aren't the user's.
 */
export async function saveSchools(
  sql: Sql,
  userId: string,
  itemId: string,
  schools: string[],
  profile: RecruitingProfile,
): Promise<SavedContact | null> {
  if (!UUID_RE.test(itemId)) return null;
  // Locked while it's re-scored, and only the fields that change are written,
  // so a draft or email saved at the same time is kept.
  return sql.begin(async (t) => {
    const tx = asSql(t);
    const [row] = await tx<{ result: NewItem }[]>`
      SELECT result FROM items WHERE id = ${itemId} AND user_id = ${userId} AND kind = 'contact' FOR UPDATE
    `;
    if (!row || row.result.kind !== "contact") return null;
    const updated = withSchools(row.result, schools, profile);
    const changed = { ...pick(updated, CONTACT_SCORE_FIELDS), schools: updated.schools, pennAlum: updated.pennAlum };
    const [saved] = await tx<{ result: NewItem; updated_at: Date }[]>`
      UPDATE items SET score = ${updated.score}, result = result || ${tx.json(changed as never)}
      WHERE id = ${itemId} AND user_id = ${userId}
      RETURNING result, updated_at
    `;
    return toSaved(itemId, saved!.result, saved!.updated_at) as SavedContact;
  });
}

/**
 * Sets (or, with null, clears) a person's email address; check it with
 * checkEmail first. False if they don't exist or aren't the user's.
 */
export async function saveEmail(sql: Sql, userId: string, itemId: string, email: string | null): Promise<boolean> {
  if (!UUID_RE.test(itemId)) return false;
  const rows = email
    ? await sql`
        UPDATE items SET result = result || jsonb_build_object('email', ${email}::text)
        WHERE id = ${itemId} AND user_id = ${userId} AND kind = 'contact' RETURNING 1`
    : await sql`
        UPDATE items SET result = result - 'email'
        WHERE id = ${itemId} AND user_id = ${userId} AND kind = 'contact' RETURNING 1`;
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
  if (saved.kind === "posting") {
    // Postings saved before summaries, teams and search phrases were written, or before pay was read.
    const old = saved.summary === undefined ? { summary: null, team: null, teamStated: null, searchKeywords: [] } : {};
    const noPay = saved.salary === undefined ? { salary: null, salaryStated: null } : {};
    return { ...saved, ...old, ...noPay };
  }
  return saved;
}
