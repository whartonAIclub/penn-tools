"use server";

// Saving practice rounds. The browser calls these in the background; saving
// never blocks the game, and a failure only means the round isn't recorded.
// Inputs come from the browser, so each is checked here, and answers are
// graded against the server's own question bank. Signed-in rounds are kept
// (tracking.ts); signed-out rounds only while in progress, capped, leaving
// daily totals (anonymous.ts). A round id may be either kind.

import { toolSql } from "@penntools/platform/db";
import {
  MAX_QUESTION_COUNT,
  MIX,
  TOPICS,
  allowedCounts,
  completeAnonRound,
  drawQuestions,
  playableTopics,
  recordAnonAnswer,
  recordAnswer,
  recordSessionComplete,
  recordSessionStart,
  shuffle,
  startAnonRound,
} from "@penntools/tool-accounting-practice";
import type { Question } from "@penntools/tool-accounting-practice";
import { getCurrentUser } from "@/lib/auth";
import { MODE } from "./mode";

/** The tool's database role and schema (see schema.sql). */
const DB_ROLE = "accountingpractice";
/** Longer than any id this tool uses; anything longer is rejected unread. */
const MAX_ID_LENGTH = 100;

export interface RoundStart {
  /** The questions the server drew for this round, in order. */
  questionIds: string[];
  /** The saved round's id, or null if it couldn't be saved. */
  sessionId: string | null;
  signedIn: boolean;
}

/**
 * Logs a failed save for debugging: which step and the database's error code
 * and message only, never answers, user ids or anything the student did.
 */
function logFailure(step: string, error: unknown) {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.error(
    `[accounting-practice] couldn't save ${step}:`,
    typeof code === "string" ? code : "",
    typeof message === "string" ? message : "unknown error",
  );
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/** The signed-in user's id, or null when signed out or when it can't be checked. */
async function currentUserId(): Promise<string | null> {
  try {
    return (await getCurrentUser())?.id ?? null;
  } catch (error) {
    logFailure("(checking sign-in)", error);
    return null;
  }
}

/** A question this site may show, from the server's own question bank. */
function playableQuestion(questionId: string): Question | null {
  for (const topic of playableTopics(TOPICS, MODE)) {
    const question = topic.questions.find((q) => q.id === questionId);
    if (question) return question;
  }
  return null;
}

/** Runs a save, returning its result, or `fallback` (logged) if the database fails. */
async function save<T>(step: string, fallback: T, run: (sql: NonNullable<ReturnType<typeof toolSql>>) => Promise<T>): Promise<T> {
  const sql = toolSql(DB_ROLE);
  if (!sql) {
    logFailure(step, { message: "database not configured (DATABASE_URL is not set)" });
    return fallback;
  }
  try {
    return await run(sql);
  } catch (error) {
    logFailure(step, error);
    return fallback;
  }
}

/**
 * Draws a round's questions and records its start. `request` is
 * { topicId, count } for a new session (topicId is a topic or "mix"), or
 * { topicId, retryIds } to retry specific questions. Returns null for a request
 * this site doesn't allow; otherwise always returns the questions, so the game
 * can go ahead even when saving fails.
 */
export async function startRound(request: unknown): Promise<RoundStart | null> {
  if (typeof request !== "object" || request === null) return null;
  const { topicId, count, retryIds } = request as { topicId?: unknown; count?: unknown; retryIds?: unknown };
  if (!isId(topicId)) return null;
  const topics = playableTopics(TOPICS, MODE);
  if (topicId !== MIX && !topics.some((t) => t.id === topicId)) return null;

  let questionIds: string[];
  if (retryIds !== undefined) {
    // Retry: only questions this site may show, each once, at most a full session.
    if (!Array.isArray(retryIds) || retryIds.length === 0 || retryIds.length > MAX_QUESTION_COUNT) return null;
    const unique = [...new Set(retryIds)];
    if (unique.length !== retryIds.length || !unique.every((id) => isId(id) && playableQuestion(id) !== null)) return null;
    questionIds = shuffle(unique as string[]);
  } else {
    if (typeof count !== "number" || !allowedCounts(topicId).includes(count)) return null;
    questionIds = drawQuestions(topics, topicId, count).map((q) => q.id);
    if (questionIds.length === 0) return null;
  }

  const userId = await currentUserId();
  // Signed out: a temporary round, or null (played untracked) once the cap is reached.
  const sessionId = await save("a round start", null, (sql) =>
    userId === null
      ? startAnonRound(sql, { topicId, questionIds })
      : recordSessionStart(sql, { userId, topicId, questionIds }),
  );
  return { questionIds, sessionId, signedIn: userId !== null };
}

/** Records one answer, graded on the server. True only if it was saved. */
export async function submitAnswer(sessionId: unknown, questionId: unknown, chosen: unknown): Promise<boolean> {
  if (!isId(sessionId) || !isId(questionId) || typeof chosen !== "string" || chosen.length !== 1) return false;
  const question = playableQuestion(questionId);
  if (!question) return false;

  const userId = await currentUserId();
  return save("an answer", false, async (sql) => {
    if (await recordAnonAnswer(sql, { roundId: sessionId, question, chosen })) return true;
    return userId !== null && recordAnswer(sql, { sessionId, userId, question, chosen });
  });
}

/** Marks a round complete once all its answers are saved. True only if it was. */
export async function finishRound(sessionId: unknown): Promise<boolean> {
  if (!isId(sessionId)) return false;
  const userId = await currentUserId();
  const result = await save("a round's completion", null, async (sql) => {
    const anonymous = await completeAnonRound(sql, sessionId);
    if (anonymous !== null) return anonymous;
    return userId === null ? null : recordSessionComplete(sql, { sessionId, userId });
  });
  return result !== null;
}
