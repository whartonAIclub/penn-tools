// Schedule storage, in the pennfitness schema's shared tables (schedule_blocks,
// away_days): the busy blocks and away days both halves plan around. Callers
// pass the database client (toolSql("pennfitness")) and the signed-in user's
// id; every read and write is scoped to that user.
//
// Times go in and out as New York local text ("2026-11-16T08:30"), never as
// JavaScript Dates, so the computer's time zone can't shift them. That's why
// parameters are cast `::text::timestamp`, not `::timestamp`: given a
// timestamp parameter, the postgres driver runs the string through
// `new Date()` in the computer's zone and sends it as UTC, moving 08:30 to
// 13:30 in New York (caught by the storage tests).

import type { Sql } from "postgres";
import type { Attributes } from "../attributes.js";
import { ZONES, type Zone } from "../location.js";
import { BLOCK_SOURCES, type AwayDay, type BlockSource, type BusyBlock } from "../schedule.js";
import { isLocalDate, isLocalDateTime, type LocalDate, type LocalDateTime } from "../time.js";

const MAX_LABEL_LENGTH = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown when asked to save a block or away day that isn't valid; a bug in the caller, or input not checked first. */
export class InvalidScheduleError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "InvalidScheduleError";
  }
}

/** What's wrong with a block before it's stored; empty when it's fine. */
export function checkBusyBlock(block: BusyBlock): string[] {
  const problems: string[] = [];
  if (!isLocalDateTime(block.start) || !isLocalDateTime(block.end)) problems.push("Start and end must be dates and times.");
  else if (block.end <= block.start) problems.push("A block has to end after it starts.");
  if (block.label !== null && (typeof block.label !== "string" || block.label.length > MAX_LABEL_LENGTH)) {
    problems.push(`Labels are at most ${MAX_LABEL_LENGTH} characters.`);
  }
  if (!(BLOCK_SOURCES as readonly string[]).includes(block.source)) problems.push(`Unknown source: ${String(block.source)}.`);
  if (block.confidence !== null && !(block.confidence >= 0 && block.confidence <= 1)) problems.push("Confidence is from 0 to 1.");
  if (block.zone !== null && !(ZONES as readonly string[]).includes(block.zone)) problems.push(`Unknown zone: ${String(block.zone)}.`);
  return problems;
}

interface BlockRow {
  id: string;
  start: LocalDateTime;
  end: LocalDateTime;
  label: string | null;
  source: BlockSource;
  recurring_weekly: boolean;
  confidence: number | null;
  confirmed: boolean;
  zone: Zone | null;
  attributes: Attributes;
}

const toBlock = (row: BlockRow): BusyBlock => ({
  id: row.id,
  start: row.start,
  end: row.end,
  label: row.label,
  source: row.source,
  recurringWeekly: row.recurring_weekly,
  confidence: row.confidence,
  confirmed: row.confirmed,
  zone: row.zone,
  attributes: row.attributes,
});

function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function blockColumns(sql: Sql) {
  return sql`
    id::text AS id,
    to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') AS start,
    to_char(ends_at, 'YYYY-MM-DD"T"HH24:MI') AS "end",
    label, source, recurring_weekly, confidence, confirmed, zone, attributes
  `;
}

/**
 * The blocks a week's timeline needs (see outtake/ingest/timeline.ts): those
 * in the week starting `weekStart`, and every weekly one that started before
 * it. In time order.
 */
export async function listBlocksForWeek(sql: Sql, userId: string, weekStart: LocalDate): Promise<BusyBlock[]> {
  if (!isLocalDate(weekStart)) throw new InvalidScheduleError(["The week must start on a date."]);
  const weekEnd = addDays(weekStart, 7);
  const rows = await sql<BlockRow[]>`
    SELECT ${blockColumns(sql)} FROM schedule_blocks
    WHERE user_id = ${userId}
      AND starts_at < ${weekEnd}::text::timestamp
      AND (ends_at > ${weekStart}::text::timestamp OR recurring_weekly)
    ORDER BY starts_at, ends_at, id
  `;
  return rows.map(toBlock);
}

/**
 * postgres's transaction client has the same query call as Sql, but its
 * TypeScript type loses the call signature; this restores it.
 */
const asSql = (tx: unknown) => tx as Sql;

/** Inserts blocks with the client given (inside the caller's transaction). */
async function insertBlocks(q: Sql, userId: string, blocks: readonly BusyBlock[]): Promise<BusyBlock[]> {
  const problems = blocks.flatMap(checkBusyBlock);
  if (problems.length > 0) throw new InvalidScheduleError([...new Set(problems)]);
  const added: BusyBlock[] = [];
  for (const block of blocks) {
    const [row] = await q<BlockRow[]>`
      INSERT INTO schedule_blocks (user_id, starts_at, ends_at, label, source, recurring_weekly, confidence, confirmed, zone, attributes)
      VALUES (
        ${userId}, ${block.start}::text::timestamp, ${block.end}::text::timestamp, ${block.label}, ${block.source},
        ${block.recurringWeekly}, ${block.confidence}, ${block.confirmed}, ${block.zone},
        ${q.json(block.attributes as Parameters<Sql["json"]>[0])}
      )
      RETURNING ${blockColumns(q)}
    `;
    added.push(toBlock(row!));
  }
  return added;
}

/** Stores new blocks for the user and returns them with their ids (any ids they came with are ignored); all or none. */
export async function addBlocks(sql: Sql, userId: string, blocks: readonly BusyBlock[]): Promise<BusyBlock[]> {
  return sql.begin((tx) => insertBlocks(asSql(tx), userId, blocks));
}

/**
 * Re-importing from a source (an .ics file, a screenshot) for a week: replaces
 * that source's unconfirmed blocks starting in the week with `blocks`, so
 * importing twice doesn't double them. Confirmed blocks stay; the timeline
 * shows a re-imported copy of one once.
 */
export async function replaceImportedBlocks(
  sql: Sql,
  userId: string,
  source: BlockSource,
  weekStart: LocalDate,
  blocks: readonly BusyBlock[],
): Promise<BusyBlock[]> {
  if (!isLocalDate(weekStart)) throw new InvalidScheduleError(["The week must start on a date."]);
  if (blocks.some((block) => block.source !== source)) throw new InvalidScheduleError([`Every block must come from ${source}.`]);
  const weekEnd = addDays(weekStart, 7);
  return sql.begin(async (tx) => {
    const q = asSql(tx);
    await q`
      DELETE FROM schedule_blocks
      WHERE user_id = ${userId} AND source = ${source} AND NOT confirmed
        AND starts_at >= ${weekStart}::text::timestamp AND starts_at < ${weekEnd}::text::timestamp
    `;
    return insertBlocks(q, userId, blocks);
  });
}

/** One of the user's blocks, as stored; null if they have no such block. */
export async function getBlock(sql: Sql, userId: string, id: string): Promise<BusyBlock | null> {
  if (!UUID.test(id)) return null;
  const [row] = await sql<BlockRow[]>`SELECT ${blockColumns(sql)} FROM schedule_blocks WHERE user_id = ${userId} AND id = ${id}::uuid`;
  return row ? toBlock(row) : null;
}

export interface BlockChanges {
  start?: LocalDateTime;
  end?: LocalDateTime;
  label?: string | null;
  zone?: Zone | null;
}

/** Edits one of the user's blocks (the review screen's corrections); null if they have no such block. */
export async function updateBlock(sql: Sql, userId: string, id: string, changes: BlockChanges): Promise<BusyBlock | null> {
  if (!UUID.test(id)) return null;
  const [current] = await sql<BlockRow[]>`SELECT ${blockColumns(sql)} FROM schedule_blocks WHERE user_id = ${userId} AND id = ${id}::uuid`;
  if (!current) return null;
  const next: BusyBlock = { ...toBlock(current), ...changes };
  const problems = checkBusyBlock(next);
  if (problems.length > 0) throw new InvalidScheduleError(problems);
  const [row] = await sql<BlockRow[]>`
    UPDATE schedule_blocks
    SET starts_at = ${next.start}::text::timestamp, ends_at = ${next.end}::text::timestamp, label = ${next.label}, zone = ${next.zone}
    WHERE user_id = ${userId} AND id = ${id}::uuid
    RETURNING ${blockColumns(sql)}
  `;
  return row ? toBlock(row) : null;
}

/** Deletes one of the user's blocks; false if they have no such block. */
export async function deleteBlock(sql: Sql, userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const result = await sql`DELETE FROM schedule_blocks WHERE user_id = ${userId} AND id = ${id}::uuid`;
  return result.count > 0;
}

/** Marks the user's blocks with these ids confirmed, so they're planned around; returns how many were. */
export async function confirmBlocks(sql: Sql, userId: string, ids: readonly string[]): Promise<number> {
  const valid = ids.filter((id) => UUID.test(id));
  if (valid.length === 0) return 0;
  const result = await sql`
    UPDATE schedule_blocks SET confirmed = TRUE
    WHERE user_id = ${userId} AND id = ANY(${valid as string[]}::uuid[]) AND NOT confirmed
  `;
  return result.count;
}

/** The user's away days in the week starting `weekStart`, in order. */
export async function listAwayDays(sql: Sql, userId: string, weekStart: LocalDate): Promise<AwayDay[]> {
  if (!isLocalDate(weekStart)) throw new InvalidScheduleError(["The week must start on a date."]);
  const rows = await sql<{ date: LocalDate; attributes: Attributes }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS date, attributes FROM away_days
    WHERE user_id = ${userId} AND day >= ${weekStart}::text::date AND day < ${addDays(weekStart, 7)}::text::date
    ORDER BY day
  `;
  return rows.map((row) => ({ date: row.date, attributes: row.attributes }));
}

/** Marks a day away, or not; doing either twice changes nothing. */
export async function setAwayDay(sql: Sql, userId: string, date: LocalDate, away: boolean): Promise<void> {
  if (!isLocalDate(date)) throw new InvalidScheduleError(["Pick a date."]);
  if (away) {
    await sql`INSERT INTO away_days (user_id, day) VALUES (${userId}, ${date}::text::date) ON CONFLICT (user_id, day) DO NOTHING`;
  } else {
    await sql`DELETE FROM away_days WHERE user_id = ${userId} AND day = ${date}::text::date`;
  }
}
