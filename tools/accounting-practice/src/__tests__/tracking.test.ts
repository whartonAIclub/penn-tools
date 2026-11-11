// Recording rounds and computing metrics against a real Postgres: each run
// creates a throwaway schema from schema.sql and drops it afterwards, as
// AskPenn's storage tests do. Skipped when no database is configured
// (DATABASE_URL, or apps/web/.env.local).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { getMetrics } from "../metrics.js";
import { canViewStats, excludedFromMetrics, TEAM_USER_IDS } from "../team.js";
import { recordAnswer, recordSessionComplete, recordSessionStart } from "../tracking.js";
import { correctChoice } from "../game.js";
import { transactionEffects } from "../questions/transaction-effects.js";
import type { Question } from "../questions/types.js";

const envFile = fileURLToPath(new URL("../../../../apps/web/.env.local", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env["DATABASE_URL"];

const schemaSql = readFileSync(fileURLToPath(new URL("../../schema.sql", import.meta.url)), "utf8");
const schema = `accountingpractice_test_${Date.now()}`;

const questions = transactionEffects.questions;
const ids = questions.map((q) => q.id);
const q = (i: number) => questions[i] as Question;
const right = (question: Question) => correctChoice(question).label;
const wrong = (question: Question) => question.choices.find((c) => !c.correct)!.label;

let admin: Sql;
let sql: Sql;

/** A round where `correctCount` of the five answers are right, completed. */
async function playRound(userId: string | null, correctCount: number): Promise<string> {
  const sessionId = await recordSessionStart(sql, { userId, topicId: transactionEffects.id, questionIds: ids });
  for (const [i, question] of questions.entries()) {
    const chosen = i < correctCount ? right(question) : wrong(question);
    await recordAnswer(sql, { sessionId, userId, question, chosen });
  }
  await recordSessionComplete(sql, { sessionId, userId });
  return sessionId;
}

/** Moves a round into the past, keeping how long it took. */
async function backdate(sessionId: string, daysAgo: number, minutesTaken = 4) {
  await sql`
    UPDATE sessions
    SET started_at = NOW() - make_interval(days => ${daysAgo}),
        completed_at = CASE WHEN completed_at IS NULL THEN NULL
          ELSE NOW() - make_interval(days => ${daysAgo}) + make_interval(mins => ${minutesTaken}) END
    WHERE id = ${sessionId}
  `;
}

describe.skipIf(!databaseUrl)("recording rounds (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: schema } });
    await sql.unsafe(schemaSql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("schema.sql can be applied again to an existing schema", async () => {
    await expect(sql.unsafe(schemaSql)).resolves.toBeDefined();
  });

  it("stores only ids, topics, choices and times: no names or emails", async () => {
    const columns = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = ${schema} ORDER BY table_name, ordinal_position
    `;
    expect(columns.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      "answers.session_id",
      "answers.question_id",
      "answers.chosen",
      "answers.correct",
      "answers.answered_at",
      "sessions.id",
      "sessions.user_id",
      "sessions.topic_id",
      "sessions.question_ids",
      "sessions.started_at",
      "sessions.completed_at",
      "sessions.score",
    ]);
  });

  it("grades answers on the server from the question bank", async () => {
    const sessionId = await recordSessionStart(sql, { userId: "u-grade", topicId: "transaction-effects", questionIds: ids });
    expect(await recordAnswer(sql, { sessionId, userId: "u-grade", question: q(0), chosen: right(q(0)) })).toBe(true);
    expect(await recordAnswer(sql, { sessionId, userId: "u-grade", question: q(1), chosen: wrong(q(1)) })).toBe(true);
    const rows = await sql<{ question_id: string; correct: boolean }[]>`
      SELECT question_id, correct FROM answers WHERE session_id = ${sessionId} ORDER BY question_id
    `;
    expect(rows).toEqual([
      { question_id: "te-01", correct: true },
      { question_id: "te-02", correct: false },
    ]);
  });

  it("rejects answers it shouldn't record", async () => {
    const sessionId = await recordSessionStart(sql, { userId: "u-owner", topicId: "transaction-effects", questionIds: ["te-01", "te-02"] });
    const answer = (overrides: Partial<Parameters<typeof recordAnswer>[1]>) =>
      recordAnswer(sql, { sessionId, userId: "u-owner", question: q(0), chosen: right(q(0)), ...overrides });

    expect(await answer({ question: q(2), chosen: right(q(2)) })).toBe(false); // not in this round
    expect(await answer({ chosen: "E" })).toBe(false); // not a choice
    expect(await answer({ sessionId: "not-a-uuid" })).toBe(false);
    expect(await answer({ sessionId: "00000000-0000-0000-0000-000000000000" })).toBe(false); // no such round
    expect(await answer({ userId: "u-someone-else" })).toBe(false); // someone else's round
    expect(await answer({ userId: null })).toBe(false); // signed out, signed-in round

    expect(await answer({ chosen: wrong(q(0)) })).toBe(true);
    expect(await answer({})).toBe(false); // already answered: the first answer counts
    const [row] = await sql<{ correct: boolean }[]>`SELECT correct FROM answers WHERE session_id = ${sessionId}`;
    expect(row?.correct).toBe(false);
  });

  it("lets a signed-out round continue after the student signs in", async () => {
    const sessionId = await recordSessionStart(sql, { userId: null, topicId: "transaction-effects", questionIds: ids });
    expect(await recordAnswer(sql, { sessionId, userId: null, question: q(0), chosen: right(q(0)) })).toBe(true);
    expect(await recordAnswer(sql, { sessionId, userId: "u-late", question: q(1), chosen: right(q(1)) })).toBe(true);
  });

  it("completes a round only when every question has an answer, scoring it on the server", async () => {
    const sessionId = await recordSessionStart(sql, { userId: "u-done", topicId: "transaction-effects", questionIds: ids });
    for (const question of questions.slice(0, 4)) {
      await recordAnswer(sql, { sessionId, userId: "u-done", question, chosen: right(question) });
    }
    expect(await recordSessionComplete(sql, { sessionId, userId: "u-done" })).toBeNull(); // one missing

    await recordAnswer(sql, { sessionId, userId: "u-done", question: q(4), chosen: wrong(q(4)) });
    expect(await recordSessionComplete(sql, { sessionId, userId: "u-other" })).toBeNull(); // not theirs
    expect(await recordSessionComplete(sql, { sessionId, userId: "u-done" })).toEqual({ score: 4, total: 5 });
    expect(await recordSessionComplete(sql, { sessionId, userId: "u-done" })).toBeNull(); // only once

    // A completed round accepts no more answers.
    expect(await recordAnswer(sql, { sessionId, userId: "u-done", question: q(0), chosen: wrong(q(0)) })).toBe(false);
  });
});

describe.skipIf(!databaseUrl)("metrics (Postgres)", () => {
  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}_m`);
    sql = postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: `${schema}_m` } });
    await sql.unsafe(schemaSql);

    // Alice: two rounds on different days (one 3 days ago), both completed.
    await backdate(await playRound("alice", 5), 3, 2);
    await backdate(await playRound("alice", 3), 0, 6);
    // Bob: one completed round today, and one he abandoned after one answer.
    await backdate(await playRound("bob", 4), 0, 4);
    const abandoned = await recordSessionStart(sql, { userId: "bob", topicId: "transaction-effects", questionIds: ids });
    await recordAnswer(sql, { sessionId: abandoned, userId: "bob", question: q(0), chosen: wrong(q(0)) });
    // A signed-out round today, completed.
    await backdate(await playRound(null, 2), 0, 10);
    // Carol: one completed round 20 days ago, outside the last 7 days.
    await backdate(await playRound("carol", 5), 20, 3);
    // The team's own round, which the live metrics leave out.
    await playRound("team-member", 0);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${schema}_m CASCADE`);
    await admin?.end();
  });

  it("counts every round, signed in or not, apart from the excluded team's", async () => {
    const m = await getMetrics(sql, { window: "all", excludeUserIds: ["team-member"] });
    expect(m.allRounds).toEqual({
      started: 6,
      completed: 5,
      completionRate: 5 / 6,
      questionsAnswered: 26,
      questionsPerRound: 26 / 6,
      medianMinutesPerCompletedRound: 4,
    });
  });

  it("counts signed-in students and who came back on another day", async () => {
    const m = await getMetrics(sql, { window: "all", excludeUserIds: ["team-member"] });
    expect(m.signedIn).toEqual({
      uniqueUsers: 3,
      rounds: 5,
      usersWhoCompleted: 3,
      returningUsers: 1,
      returningRate: 1 / 3,
      completersWhoReturned: 1,
      completersWhoReturnedRate: 1 / 3,
    });
  });

  it("limits the 7-day window to recent rounds", async () => {
    const m = await getMetrics(sql, { window: "7d", excludeUserIds: ["team-member"] });
    expect(m.allRounds.started).toBe(5); // all but Carol's
    expect(m.signedIn.uniqueUsers).toBe(2); // Alice and Bob
    expect(m.signedIn.returningUsers).toBe(1); // Alice, 3 days ago and today
  });

  it("includes the team's rounds when nothing is excluded", async () => {
    const m = await getMetrics(sql, { window: "all", excludeUserIds: [] });
    expect(m.allRounds.started).toBe(7);
    expect(m.signedIn.uniqueUsers).toBe(4);
  });

  it("reports accuracy by topic and by question, hardest question first", async () => {
    const m = await getMetrics(sql, { window: "all", excludeUserIds: ["team-member"] });
    // Correct answers: Alice 5 + 3, Bob 4 + 0, signed out 2, Carol 5 = 19 of 26.
    expect(m.accuracyByTopic).toEqual([
      { topicId: "transaction-effects", questionId: null, answered: 26, correct: 19, accuracy: 19 / 26 },
    ]);
    expect(m.accuracyByQuestion).toHaveLength(5);
    const accuracies = m.accuracyByQuestion.map((row) => row.accuracy ?? 0);
    expect(accuracies).toEqual([...accuracies].sort((a, b) => a - b));
    // te-05 was right only in Alice's and Carol's perfect rounds; te-02 in every completed round.
    expect(m.accuracyByQuestion[0]).toMatchObject({ questionId: "te-05", answered: 5, correct: 2 });
    expect(m.accuracyByQuestion.at(-1)).toMatchObject({ questionId: "te-02", answered: 5, correct: 5 });
    expect(m.accuracyByQuestion.find((row) => row.questionId === "te-01")).toMatchObject({ answered: 6, correct: 5 });
  });

  it("returns empty metrics, not errors, before anyone has played", async () => {
    await sql`TRUNCATE answers, sessions`;
    const m = await getMetrics(sql, { window: "7d", excludeUserIds: [] });
    expect(m.allRounds.completionRate).toBeNull();
    expect(m.allRounds.medianMinutesPerCompletedRound).toBeNull();
    expect(m.signedIn.uniqueUsers).toBe(0);
    expect(m.accuracyByQuestion).toEqual([]);
  });
});

// A connection's first query once sent lists malformed (sql.array before the
// client loaded Postgres's array types), so a round's start failed to save
// whenever the app opened a new connection. Each check here uses a brand-new
// connection whose first query sends a list.
describe.skipIf(!databaseUrl)("on a brand-new connection (Postgres)", () => {
  const freshSchema = `${schema}_fresh`;
  const fresh = () => postgres(databaseUrl!, { max: 1, onnotice: () => {}, connection: { search_path: freshSchema } });

  beforeAll(async () => {
    admin = postgres(databaseUrl!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${freshSchema}`);
    const setup = fresh();
    await setup.unsafe(schemaSql);
    await setup.end();
  });

  afterAll(async () => {
    await admin?.unsafe(`DROP SCHEMA IF EXISTS ${freshSchema} CASCADE`);
    await admin?.end();
  });

  it("saves a round's start as the first query", async () => {
    const db = fresh();
    try {
      const sessionId = await recordSessionStart(db, { userId: "u-fresh", topicId: "transaction-effects", questionIds: ids });
      const [row] = await db<{ question_ids: string[] }[]>`SELECT question_ids FROM sessions WHERE id = ${sessionId}`;
      expect(row?.question_ids).toEqual(ids);
    } finally {
      await db.end();
    }
  });

  it("computes metrics with excluded accounts as the first query", async () => {
    const db = fresh();
    try {
      const m = await getMetrics(db, { window: "all", excludeUserIds: ["u-fresh"] });
      expect(m.signedIn.uniqueUsers).toBe(0);
      expect(m.allRounds.started).toBe(0);
    } finally {
      await db.end();
    }
  });
});

describe("who can see the stats page", () => {
  it("allows only listed team accounts on the live site", () => {
    expect(canViewStats(null, "live")).toBe(false);
    expect(canViewStats("someone", "live")).toBe(false);
    for (const id of TEAM_USER_IDS) expect(canViewStats(id, "live")).toBe(true);
  });

  it("allows any signed-in user in a local preview, but never a signed-out visitor", () => {
    expect(canViewStats("local-user", "preview")).toBe(true);
    expect(canViewStats(null, "preview")).toBe(false);
  });

  it("leaves the team's rounds out of live metrics only", () => {
    expect(excludedFromMetrics("live")).toEqual(TEAM_USER_IDS);
    expect(excludedFromMetrics("preview")).toEqual([]);
  });
});
