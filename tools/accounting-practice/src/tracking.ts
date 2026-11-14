// Recording signed-in practice rounds in the tool's own database (schema.sql).
// Callers pass the database client (toolSql("accountingpractice")), the user's
// id, and questions from the server's own question bank. Answers are graded
// here, never trusted from the browser, and accepted only for the questions the
// server drew for that round. Signed-out rounds are in anonymous.ts.

import type { Sql } from "postgres";
import { isCorrect } from "./game.js";
import type { Question } from "./questions/types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A list of strings as a SQL text[] value. Sent as JSON text rather than with
 * sql.array, which sends a malformed array on a connection's first query,
 * before the client has loaded Postgres's array types.
 */
export function textArray(sql: Sql, values: readonly string[]) {
  // ::text first, so the client sends the JSON as-is instead of encoding it again.
  return sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(values)}::text::jsonb))`;
}

/** Rows a caller may touch: the round's own user's, or a signed-out round. */
function ownedBy(sql: Sql, userId: string | null) {
  return userId === null ? sql`user_id IS NULL` : sql`(user_id IS NULL OR user_id = ${userId})`;
}

/** Starts a signed-in round of the given questions (drawn by the server) and returns its id. */
export async function recordSessionStart(
  sql: Sql,
  round: { userId: string; topicId: string; questionIds: readonly string[] },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO sessions (user_id, topic_id, question_ids)
    VALUES (${round.userId}, ${round.topicId}, ${textArray(sql, round.questionIds)})
    RETURNING id
  `;
  return row!.id;
}

/**
 * Records and grades one answer. Returns false, without saving anything, when
 * the round doesn't exist, isn't the caller's, is already complete, didn't
 * include this question, already has an answer to it, or the choice isn't one
 * of the question's.
 */
export async function recordAnswer(
  sql: Sql,
  answer: { sessionId: string; userId: string | null; question: Question; chosen: string },
): Promise<boolean> {
  const { sessionId, userId, question, chosen } = answer;
  if (!UUID_RE.test(sessionId)) return false;
  if (!question.choices.some((choice) => choice.label === chosen)) return false;

  const rows = await sql`
    INSERT INTO answers (session_id, question_id, chosen, correct)
    SELECT id, ${question.id}, ${chosen}, ${isCorrect(question, chosen)}
    FROM sessions
    WHERE id = ${sessionId}
      AND ${ownedBy(sql, userId)}
      AND completed_at IS NULL
      AND ${question.id} = ANY(question_ids)
    ON CONFLICT (session_id, question_id) DO NOTHING
    RETURNING session_id
  `;
  return rows.length === 1;
}

/**
 * Marks a round complete once every one of its questions has an answer, and
 * stores the score computed from those answers. Returns the score, or null when
 * the round doesn't exist, isn't the caller's, is already complete, or is
 * missing answers (for example when saving an answer failed).
 */
export async function recordSessionComplete(
  sql: Sql,
  round: { sessionId: string; userId: string | null },
): Promise<{ score: number; total: number } | null> {
  if (!UUID_RE.test(round.sessionId)) return null;

  const [row] = await sql<{ score: number; total: number }[]>`
    UPDATE sessions s
    SET completed_at = NOW(), score = tally.score
    FROM (
      SELECT COUNT(*) FILTER (WHERE correct)::int AS score, COUNT(*)::int AS answered
      FROM answers WHERE session_id = ${round.sessionId}
    ) tally
    WHERE s.id = ${round.sessionId}
      AND ${ownedBy(sql, round.userId)}
      AND s.completed_at IS NULL
      AND tally.answered = cardinality(s.question_ids)
    RETURNING s.score::int AS score, cardinality(s.question_ids)::int AS total
  `;
  return row ? { score: row.score, total: row.total } : null;
}
