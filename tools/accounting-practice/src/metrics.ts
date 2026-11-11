// Product metrics for the team's stats page, from the tool's own tables
// (schema.sql). Everything is an aggregate: no per-student rows leave the
// database. Two kinds of numbers, kept apart:
// - all rounds: every round, signed in or not.
// - signed-in students: unique users and returning users, which need an id.
// Days are counted in Philadelphia time, so "came back on another day" matches
// a student's calendar.

import type { Sql } from "postgres";
import { textArray } from "./tracking.js";

export type MetricsWindow = "7d" | "all";

export interface AllRoundsMetrics {
  /** Rounds started. */
  readonly started: number;
  /** Rounds with every question answered. */
  readonly completed: number;
  /** completed ÷ started, or null with no rounds. */
  readonly completionRate: number | null;
  readonly questionsAnswered: number;
  /** questionsAnswered ÷ started, or null with no rounds. */
  readonly questionsPerRound: number | null;
  /** Median minutes from start to finish of completed rounds, or null with none. */
  readonly medianMinutesPerCompletedRound: number | null;
}

export interface SignedInMetrics {
  /** Distinct signed-in students. */
  readonly uniqueUsers: number;
  /** Rounds started by signed-in students. */
  readonly rounds: number;
  /** Signed-in students who completed at least one round. */
  readonly usersWhoCompleted: number;
  /** Signed-in students who practiced on two or more different days. */
  readonly returningUsers: number;
  /** returningUsers ÷ uniqueUsers. */
  readonly returningRate: number | null;
  /** The primary metric: students who completed a round and practiced on another day too. */
  readonly completersWhoReturned: number;
  /** completersWhoReturned ÷ usersWhoCompleted. */
  readonly completersWhoReturnedRate: number | null;
}

export interface AccuracyRow {
  readonly topicId: string;
  /** Null on topic rows; the question's id on question rows. */
  readonly questionId: string | null;
  readonly answered: number;
  readonly correct: number;
  /** correct ÷ answered. */
  readonly accuracy: number | null;
}

export interface Metrics {
  readonly window: MetricsWindow;
  readonly allRounds: AllRoundsMetrics;
  readonly signedIn: SignedInMetrics;
  readonly accuracyByTopic: readonly AccuracyRow[];
  /** Hardest first, so questions that may be confusing or wrong stand out. */
  readonly accuracyByQuestion: readonly AccuracyRow[];
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/**
 * The metrics for one window. Rounds by `excludeUserIds` (the team's own
 * accounts) are left out; signed-out rounds can't be attributed to anyone, so
 * they are always counted.
 */
export async function getMetrics(
  sql: Sql,
  options: {
    window: MetricsWindow;
    excludeUserIds: readonly string[];
    /** A question's own topic, so Random Mix rounds count toward each question's topic. Defaults to the round's topic. */
    topicOf?: (questionId: string) => string | undefined;
  },
): Promise<Metrics> {
  const included = sql`
    (s.user_id IS NULL OR NOT (s.user_id = ANY(${textArray(sql, options.excludeUserIds)})))
    ${options.window === "7d" ? sql`AND s.started_at >= NOW() - INTERVAL '7 days'` : sql``}
  `;

  const [rounds] = await sql<{ started: number; completed: number; median_seconds: number | null }[]>`
    SELECT
      COUNT(*)::int AS started,
      COUNT(*) FILTER (WHERE s.completed_at IS NOT NULL)::int AS completed,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM s.completed_at - s.started_at))
        FILTER (WHERE s.completed_at IS NOT NULL) AS median_seconds
    FROM sessions s
    WHERE ${included}
  `;

  const [answered] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM answers a JOIN sessions s ON s.id = a.session_id
    WHERE ${included}
  `;

  const [users] = await sql<
    {
      unique_users: number;
      rounds: number;
      users_who_completed: number;
      returning_users: number;
      completers_who_returned: number;
    }[]
  >`
    WITH per_user AS (
      SELECT
        s.user_id,
        COUNT(*) AS rounds,
        COUNT(DISTINCT (s.started_at AT TIME ZONE 'America/New_York')::date) AS days,
        bool_or(s.completed_at IS NOT NULL) AS completed_any
      FROM sessions s
      WHERE s.user_id IS NOT NULL AND ${included}
      GROUP BY s.user_id
    )
    SELECT
      COUNT(*)::int AS unique_users,
      COALESCE(SUM(rounds), 0)::int AS rounds,
      COUNT(*) FILTER (WHERE completed_any)::int AS users_who_completed,
      COUNT(*) FILTER (WHERE days >= 2)::int AS returning_users,
      COUNT(*) FILTER (WHERE completed_any AND days >= 2)::int AS completers_who_returned
    FROM per_user
  `;

  const questionRows = await sql<{ topic_id: string; question_id: string; answered: number; correct: number }[]>`
    SELECT MIN(s.topic_id) AS topic_id, a.question_id, COUNT(*)::int AS answered, COUNT(*) FILTER (WHERE a.correct)::int AS correct
    FROM answers a JOIN sessions s ON s.id = a.session_id
    WHERE ${included}
    GROUP BY a.question_id
    ORDER BY COUNT(*) FILTER (WHERE a.correct)::float / COUNT(*), a.question_id
  `;
  const questions = questionRows.map((row) => ({
    ...row,
    topic_id: options.topicOf?.(row.question_id) ?? row.topic_id,
  }));

  // Topic totals from the question rows, so each answer counts toward its question's topic.
  const byTopic = new Map<string, { answered: number; correct: number }>();
  for (const row of questions) {
    const total = byTopic.get(row.topic_id) ?? { answered: 0, correct: 0 };
    total.answered += row.answered;
    total.correct += row.correct;
    byTopic.set(row.topic_id, total);
  }
  const topics = [...byTopic.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic_id, total]) => ({ topic_id, ...total }));

  const started = rounds?.started ?? 0;
  const completed = rounds?.completed ?? 0;
  const questionsAnswered = answered?.count ?? 0;
  const median = rounds?.median_seconds ?? null;
  const u = users ?? { unique_users: 0, rounds: 0, users_who_completed: 0, returning_users: 0, completers_who_returned: 0 };

  return {
    window: options.window,
    allRounds: {
      started,
      completed,
      completionRate: ratio(completed, started),
      questionsAnswered,
      questionsPerRound: ratio(questionsAnswered, started),
      medianMinutesPerCompletedRound: median === null ? null : Number(median) / 60,
    },
    signedIn: {
      uniqueUsers: u.unique_users,
      rounds: u.rounds,
      usersWhoCompleted: u.users_who_completed,
      returningUsers: u.returning_users,
      returningRate: ratio(u.returning_users, u.unique_users),
      completersWhoReturned: u.completers_who_returned,
      completersWhoReturnedRate: ratio(u.completers_who_returned, u.users_who_completed),
    },
    accuracyByTopic: topics.map((row) => ({
      topicId: row.topic_id,
      questionId: null,
      answered: row.answered,
      correct: row.correct,
      accuracy: ratio(row.correct, row.answered),
    })),
    accuracyByQuestion: questions.map((row) => ({
      topicId: row.topic_id,
      questionId: row.question_id,
      answered: row.answered,
      correct: row.correct,
      accuracy: ratio(row.correct, row.answered),
    })),
  };
}
