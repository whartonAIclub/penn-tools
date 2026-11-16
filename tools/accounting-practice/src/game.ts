// The game's rules, kept apart from its screens so they can be tested on
// their own: which questions may be played, how a session is drawn, and how
// it's scored.

import { QUESTIONS_PER_SESSION } from "./questions/validate.js";
import type { Choice, Question, Topic } from "./questions/types.js";

/**
 * Which questions the game may show:
 * - "live": the deployed site. Only questions a team member has verified.
 * - "preview": a team member's own computer. Pending questions too, so the
 *   team can try the game before reviewing them.
 */
export type GameMode = "live" | "preview";

/** The questions a topic may show in this mode. */
export function playableQuestions(topic: Topic, mode: GameMode): Question[] {
  return topic.questions.filter((question) => mode === "preview" || question.review.status === "verified");
}

/**
 * The topics a student can pick, each with only its playable questions. A
 * topic is left out until it has enough playable questions for a session.
 */
export function playableTopics(topics: readonly Topic[], mode: GameMode): Topic[] {
  return topics
    .map((topic) => ({ ...topic, questions: playableQuestions(topic, mode) }))
    .filter((topic) => topic.questions.length >= QUESTIONS_PER_SESSION);
}

/** A copy in random order. `random` returns a number in [0, 1), like Math.random; tests pass their own. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
  }
  return shuffled;
}

/** Draws a session: QUESTIONS_PER_SESSION questions in random order. */
export function startSession(questions: readonly Question[], random: () => number = Math.random): Question[] {
  return shuffle(questions, random).slice(0, QUESTIONS_PER_SESSION);
}

// ── Customizable sessions ─────────────────────────────────────────────────────

/** The topic choice that draws from every topic. */
export const MIX = "mix";

/**
 * How feedback is shown:
 * - "practice": right or wrong and the explanation after each question.
 * - "exam": nothing until every question is submitted, then the score and a full review.
 */
export type FeedbackMode = "practice" | "exam";

export const DEFAULT_QUESTION_COUNT = 10;
const MIX_COUNTS: readonly number[] = [5, 10, 15, 20];
const TOPIC_COUNTS: readonly number[] = [5, 10];
/** The longest session, also the cap on a "retry missed questions" session. */
export const MAX_QUESTION_COUNT = 20;

/** The session lengths a student can pick for a topic, or for the Random Mix. */
export function allowedCounts(topicId: string): readonly number[] {
  return topicId === MIX ? MIX_COUNTS : TOPIC_COUNTS;
}

/**
 * Draws up to `count` different questions. For one topic, a random selection.
 * For the Random Mix, round by round across the topics in random order, so
 * every topic gets the same number of questions (give or take one) until a
 * topic runs out. Returns fewer than `count` only when not enough exist.
 */
export function drawQuestions(
  topics: readonly Topic[],
  topicId: string,
  count: number,
  random: () => number = Math.random,
): Question[] {
  if (topicId !== MIX) {
    const topic = topics.find((t) => t.id === topicId);
    return topic ? shuffle(topic.questions, random).slice(0, count) : [];
  }
  const pools = shuffle(topics, random).map((topic) => shuffle(topic.questions, random));
  const picked: Question[] = [];
  const seen = new Set<string>();
  while (picked.length < count && pools.some((pool) => pool.length > 0)) {
    for (const pool of pools) {
      if (picked.length >= count) break;
      const next = pool.shift();
      if (next && !seen.has(next.id)) {
        seen.add(next.id);
        picked.push(next);
      }
    }
  }
  return shuffle(picked, random);
}

/** "Past final (Fall 2024)" or "Original practice", for the small label on each question. */
export function originLabel(question: Question): string {
  if (question.origin !== "historical") return "Original practice";
  const exam = question.source?.match(/(Fall|Spring) \d{4}/)?.[0];
  return exam ? `Past final (${exam})` : "Past final";
}

export function correctChoice(question: Question): Choice {
  const choice = question.choices.find((c) => c.correct);
  // validate.ts guarantees exactly one correct choice per question.
  if (!choice) throw new Error(`${question.id} has no correct choice`);
  return choice;
}

export function isCorrect(question: Question, label: string): boolean {
  return correctChoice(question).label === label;
}

/** One question of a finished session, as the results screen shows it. */
export interface QuestionResult {
  readonly question: Question;
  /** The label of the student's choice, or null if they didn't answer it. */
  readonly chosen: string | null;
  readonly correct: boolean;
}

export interface ConceptToReview {
  readonly concept: string;
  readonly courseSession: string;
}

export interface SessionResult {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly QuestionResult[];
  /** Concepts of the missed questions, each once, in the order they were missed. */
  readonly conceptsToReview: readonly ConceptToReview[];
}

/** Scores a session. `answers` maps each question id to the chosen label. */
export function scoreSession(
  questions: readonly Question[],
  answers: Readonly<Record<string, string>>,
): SessionResult {
  const results = questions.map((question): QuestionResult => {
    const chosen = answers[question.id] ?? null;
    return { question, chosen, correct: chosen !== null && isCorrect(question, chosen) };
  });

  const conceptsToReview: ConceptToReview[] = [];
  for (const { question, correct } of results) {
    if (!correct && !conceptsToReview.some((c) => c.concept === question.concept)) {
      conceptsToReview.push({ concept: question.concept, courseSession: question.courseSession });
    }
  }

  return {
    score: results.filter((r) => r.correct).length,
    total: results.length,
    questions: results,
    conceptsToReview,
  };
}

/** A dollar amount without a sign, e.g. 3000 → "$3,000". */
export function formatDollars(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-US")}`;
}

/** An effect for display: 3000 → "↑ $3,000", -3000 → "↓ $3,000", 0 → "No effect". */
export function formatEffect(amount: number): string {
  if (amount === 0) return "No effect";
  return `${amount > 0 ? "↑" : "↓"} ${formatDollars(amount)}`;
}

/** The same effect in words, for screen readers: "decreases by $3,000". */
export function describeEffect(amount: number): string {
  if (amount === 0) return "no effect";
  return `${amount > 0 ? "increases" : "decreases"} by ${formatDollars(amount)}`;
}
