// Product metrics for the team's stats page, from the tool's own tables
// (schema.sql). Everything is an aggregate: no per-student rows leave the
// database. Two sources, kept apart:
// - signed-in rounds (sessions, answers): round counts, students, returning
//   students and accuracy, including accuracy by question.
// - signed-out activity (anon_daily_*): approximate daily totals only, since
//   signed-out rounds aren't kept and some aren't counted (see anonymous.ts).
// Days are counted in Philadelphia time, so "came back on another day" matches
// a student's calendar.

import type { Sql } from "postgres";
import { textArray } from "./tracking.js";

export type MetricsWindow = "7d" | "all";

export interface SignedInRoundsMetrics {
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

/**
 * Approximate signed-out activity, from daily totals: windows are whole
 * Philadelphia days, and rounds started while the anonymous cap was reached
 * aren't counted.
 */
export interface SignedOutMetrics {
  readonly roundsStarted: number;
  readonly roundsCompleted: number;
  /** roundsCompleted ÷ roundsStarted. */
  readonly completionRate: number | null;
  readonly questionsAnswered: number;
  readonly correct: number;
  /** correct ÷ questionsAnswered. */
  readonly accuracy: number | null;
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
  /** Signed-in rounds only. */
  readonly signedInRounds: SignedInRoundsMetrics;
  readonly signedIn: SignedInMetrics;
  readonly signedOut: SignedOutMetrics;
  /** Signed-in answers only. */
  readonly accuracyByTopic: readonly AccuracyRow[];
  /** Signed-in answers only. Hardest first, so questions that may be confusing or wrong stand out. */
  readonly accuracyByQuestion: readonly AccuracyRow[];
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/**
 * The metrics for one window. Signed-in rounds by `excludeUserIds` (the team's
 * own accounts) are left out. Signed-out activity can't be attributed to anyone,
 * so it's always counted, separately.
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
    s.user_id IS NOT NULL
    AND NOT (s.user_id = ANY(${textArray(sql, options.excludeUserIds)}))
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

  // Signed-out daily totals: whole Philadelphia days (today and the 6 before for 7d).
  const days =
    options.window === "7d" ? sql`day >= (NOW() AT TIME ZONE 'America/New_York')::date - 6` : sql`TRUE`;
  const [anonRounds] = await sql<{ started: number; completed: number }[]>`
    SELECT COALESCE(SUM(started), 0)::int AS started, COALESCE(SUM(completed), 0)::int AS completed
    FROM anon_daily_rounds WHERE ${days}
  `;
  const [anonAnswers] = await sql<{ answered: number; correct: number }[]>`
    SELECT COALESCE(SUM(answered), 0)::int AS answered, COALESCE(SUM(correct), 0)::int AS correct
    FROM anon_daily_answers WHERE ${days}
  `;
  const anonStarted = anonRounds?.started ?? 0;
  const anonCompleted = anonRounds?.completed ?? 0;
  const anonAnswered = anonAnswers?.answered ?? 0;
  const anonCorrect = anonAnswers?.correct ?? 0;

  const started = rounds?.started ?? 0;
  const completed = rounds?.completed ?? 0;
  const questionsAnswered = answered?.count ?? 0;
  const median = rounds?.median_seconds ?? null;
  const u = users ?? { unique_users: 0, rounds: 0, users_who_completed: 0, returning_users: 0, completers_who_returned: 0 };

  return {
    window: options.window,
    signedOut: {
      roundsStarted: anonStarted,
      roundsCompleted: anonCompleted,
      completionRate: ratio(anonCompleted, anonStarted),
      questionsAnswered: anonAnswered,
      correct: anonCorrect,
      accuracy: ratio(anonCorrect, anonAnswered),
    },
    signedInRounds: {
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
