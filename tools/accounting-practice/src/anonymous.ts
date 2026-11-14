// Signed-out rounds (schema.sql, anon_* tables). They're kept only while in
// progress, at most ANON_ROUND_CAP at once (enforced by the table itself), and
// leave behind only daily totals. Answers are graded here and accepted only for
// the questions the server drew, one per question, as for signed-in rounds.
// A round that can't be stored (cap reached) is simply played untracked.

import type { Sql, TransactionSql } from "postgres";
import { isCorrect } from "./game.js";
import type { Question } from "./questions/types.js";
import { textArray } from "./tracking.js";

/** The most signed-out rounds in progress at once; schema.sql enforces the same number. */
export const ANON_ROUND_CAP = 5000;
/** How long an abandoned signed-out round is kept, in hours. */
export const ANON_ROUND_HOURS = 2;
/** How long daily signed-out totals are kept, in days. */
export const ANON_DAILY_DAYS = 400;
/** Attempts to claim a free slot when concurrent requests take the same one. */
const SLOT_ATTEMPTS = 3;

/** A transaction, as the Sql it is: postgres.js's TransactionSql type drops the call signature. */
const asSql = (tx: TransactionSql): Sql => tx as unknown as Sql;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today in Philadelphia, which is what "per day" means in the totals. */
function today(sql: Sql) {
  return sql`(NOW() AT TIME ZONE 'America/New_York')::date`;
}

function live(sql: Sql) {
  return sql`started_at >= NOW() - make_interval(hours => ${ANON_ROUND_HOURS})`;
}

/** Deletes expired rounds, freeing their slots, and daily totals past retention. */
export async function cleanUpAnonymous(sql: Sql): Promise<void> {
  await sql`DELETE FROM anon_rounds WHERE NOT (${live(sql)})`;
  await sql`DELETE FROM anon_daily_rounds WHERE day < ${today(sql)} - ${ANON_DAILY_DAYS}::int`;
  await sql`DELETE FROM anon_daily_answers WHERE day < ${today(sql)} - ${ANON_DAILY_DAYS}::int`;
}

/**
 * Starts a signed-out round of the questions the server drew, and counts it
 * in today's totals. Returns its id, or null when all ANON_ROUND_CAP slots are
 * taken (the round is then played untracked and not counted).
 */
export async function startAnonRound(
  sql: Sql,
  round: { topicId: string; questionIds: readonly string[] },
): Promise<string | null> {
  await cleanUpAnonymous(sql);
  for (let attempt = 0; attempt < SLOT_ATTEMPTS; attempt++) {
    const id = await sql.begin(async (transaction) => {
      const tx = asSql(transaction);
      // A random free slot, so concurrent requests rarely pick the same one. If
      // they do, the unique slot makes one of them insert nothing; it retries.
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO anon_rounds (slot, topic_id, question_ids)
        SELECT s, ${round.topicId}, ${textArray(tx, round.questionIds)}
        FROM generate_series(1, ${ANON_ROUND_CAP}::int) AS s
        WHERE NOT EXISTS (SELECT 1 FROM anon_rounds r WHERE r.slot = s)
        ORDER BY random()
        LIMIT 1
        ON CONFLICT (slot) DO NOTHING
        RETURNING id
      `;
      if (!row) return null;
      await tx`
        INSERT INTO anon_daily_rounds (day, started) VALUES (${today(tx)}, 1)
        ON CONFLICT (day) DO UPDATE SET started = anon_daily_rounds.started + 1
      `;
      return row.id;
    });
    if (id) return id;
    const [count] = await sql<{ full: boolean }[]>`
      SELECT COUNT(*) >= ${ANON_ROUND_CAP}::int AS full FROM anon_rounds
    `;
    if (count?.full) return null;
  }
  return null;
}

/**
 * Records one answer to a signed-out round, graded from the question bank,
 * and adds it to today's per-question totals. False, recording nothing, when
 * the round doesn't exist or has expired, the question isn't in it or was
 * already answered, or the choice isn't one of the question's.
 */
export async function recordAnonAnswer(
  sql: Sql,
  answer: { roundId: string; question: Question; chosen: string },
): Promise<boolean> {
  const { roundId, question, chosen } = answer;
  if (!UUID_RE.test(roundId)) return false;
  if (!question.choices.some((choice) => choice.label === chosen)) return false;
  const correct = isCorrect(question, chosen) ? 1 : 0;

  return sql.begin(async (transaction) => {
      const tx = asSql(transaction);
    // The row lock makes concurrent answers to the same question see each other.
    const rows = await tx`
      UPDATE anon_rounds
      SET answered = array_append(answered, ${question.id}::text), correct = correct + ${correct}::int
      WHERE id = ${roundId}
        AND ${live(tx)}
        AND ${question.id}::text = ANY(question_ids)
        AND NOT (${question.id}::text = ANY(answered))
      RETURNING id
    `;
    if (rows.length !== 1) return false;
    await tx`
      INSERT INTO anon_daily_answers (day, question_id, answered, correct)
      VALUES (${today(tx)}, ${question.id}, 1, ${correct}::int)
      ON CONFLICT (day, question_id) DO UPDATE SET
        answered = anon_daily_answers.answered + 1,
        correct = anon_daily_answers.correct + EXCLUDED.correct
    `;
    return true;
  });
}

/**
 * Completes a signed-out round once every question has an answer: deletes it,
 * freeing its slot, and counts it in today's totals. Returns the score, or
 * null when the round doesn't exist, has expired or is missing answers.
 */
export async function completeAnonRound(
  sql: Sql,
  roundId: string,
): Promise<{ score: number; total: number } | null> {
  if (!UUID_RE.test(roundId)) return null;
  return sql.begin(async (transaction) => {
      const tx = asSql(transaction);
    const [row] = await tx<{ score: number; total: number }[]>`
      DELETE FROM anon_rounds
      WHERE id = ${roundId}
        AND ${live(tx)}
        AND cardinality(answered) = cardinality(question_ids)
      RETURNING correct::int AS score, cardinality(question_ids)::int AS total
    `;
    if (!row) return null;
    await tx`
      INSERT INTO anon_daily_rounds (day, completed) VALUES (${today(tx)}, 1)
      ON CONFLICT (day) DO UPDATE SET completed = anon_daily_rounds.completed + 1
    `;
    return { score: row.score, total: row.total };
  });
}
