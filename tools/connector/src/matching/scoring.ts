// How well people match, question by question. Every personality question
// gives 0 to 1 (1 = full credit, 0.5 = partial, 0 = none; a ranking can land
// in between), weighted so a match scores 0 to 100:
//
//   Pair:  18 points for each of the 5 personality questions + 10 for having a planner.
//   Group: 60 for what the whole group has in common + 30 for nobody being
//          left out + 10 for having a planner.
//
// Strong is 70+, Good 50–69, Weak under 50.

import { QUESTIONS, answerIds } from "../questions.js";
import type { Question, Signup } from "../types.js";

/** The questions that say who someone would click with: all but the meeting format and follow-through. */
export const PERSONALITY_QUESTIONS: readonly Question[] = QUESTIONS.filter((q) => q.scored !== false);

/** Points for each personality question in a pair's score. */
const PAIR_POINTS = 18;
/** Points for having a planner, in pairs and groups. */
const PLANNER_POINTS = 10;
/** Points in a group's score for what the whole group has in common, and for nobody being left out. */
const GROUP_COMMON_POINTS = 60;
const GROUP_INCLUDED_POINTS = 30;

export const STRONG_MATCH = 70;
export const WEAK_MATCH = 50;

/**
 * Questions whose answers sit on a scale: next to each other on it is partial
 * credit. In order from one end to the other.
 */
const SCALES: Readonly<Record<string, readonly string[]>> = {
  // Social energy, high to low.
  "party-style": ["dance-floor", "host", "my-people", "first-hour"],
  // How fast they open up.
  pace: ["go-deep", "warm-up", "keep-light"],
};

/** Questions where some different answers are close enough for partial credit. */
const CLOSE: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  "hoping-for": [
    // Both about depth.
    ["real-talk", "ride-or-die"],
    // Both about doing things together.
    ["ritual", "explore-philly"],
  ],
};

/** How much someone will make the plan: 1 for eager planners, 0.7 for willing ones, 0 otherwise. */
const PLANNING: Readonly<Record<string, number>> = { "suggest-time": 1, "happy-to-plan": 0.7 };

/** How two people's answers to one question compare, from 0 (nothing alike) to 1 (the same). */
export function credit(question: Question, a: Signup, b: Signup): number {
  const mine = answerIds(a.answers[question.id]);
  const theirs = answerIds(b.answers[question.id]);
  if (mine.length === 0 || theirs.length === 0) return 0;

  switch (question.kind ?? "single") {
    case "pick": {
      // Both picks the same: 1. One in common: 0.5. None: 0.
      const shared = mine.filter((id) => theirs.includes(id)).length;
      return shared / Math.max(mine.length, theirs.length);
    }
    case "rank": {
      // Half for the same #1, half for how close the whole order is
      // (1 minus the total distance each value moved, over the most it could).
      const n = question.options.length;
      const maxDistance = Math.floor((n * n) / 2);
      let distance = 0;
      for (const [i, id] of mine.entries()) {
        const j = theirs.indexOf(id);
        distance += j === -1 ? n : Math.abs(i - j);
      }
      const sameTop = mine[0] === theirs[0] ? 1 : 0;
      return 0.5 * sameTop + 0.5 * Math.max(0, 1 - distance / maxDistance);
    }
    case "single": {
      const [x, y] = [mine[0]!, theirs[0]!];
      if (x === y) return 1;
      const scale = SCALES[question.id];
      if (scale) {
        const i = scale.indexOf(x);
        const j = scale.indexOf(y);
        return i !== -1 && j !== -1 && Math.abs(i - j) === 1 ? 0.5 : 0;
      }
      const close = CLOSE[question.id] ?? [];
      return close.some(([p, q]) => (p === x && q === y) || (p === y && q === x)) ? 0.5 : 0;
    }
  }
}

/** How well two people match on the personality questions, from 0 to 90 (18 per question). Planning isn't included. */
export function compatibility(a: Signup, b: Signup): number {
  return PERSONALITY_QUESTIONS.reduce((total, q) => total + PAIR_POINTS * credit(q, a, b), 0);
}

/** How much this person will make the plan: 1 suggests a time right away, 0.7 is happy to plan, 0 won't. */
export function planning(person: Signup): number {
  return PLANNING[answerIds(person.answers["follow-through"])[0] ?? ""] ?? 0;
}

/** Whether anyone in the match will make the plan. Every match should have someone. */
export function hasPlanner(members: readonly Signup[]): boolean {
  return members.some((m) => planning(m) > 0);
}

/**
 * How much of the whole group agrees on one question, from 0 (everyone
 * different) to 1 (everyone the same): the biggest set of people who gave the
 * same answer (for "pick", picked the same option; for "rank", put the same
 * value first), as a share of the group beyond the first person.
 */
export function agreement(question: Question, members: readonly Signup[]): number {
  if (members.length < 2) return 0;
  const counts = new Map<string, number>();
  for (const m of members) {
    const ids = answerIds(m.answers[question.id]);
    const counted = question.kind === "rank" ? ids.slice(0, 1) : ids;
    for (const id of new Set(counted)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const biggest = Math.max(0, ...counts.values());
  return biggest <= 1 ? 0 : (biggest - 1) / (members.length - 1);
}

/** How good a match is, from 0 to 100 (see the top of this file). */
export function matchQuality(members: readonly Signup[]): number {
  if (members.length < 2) return 0;
  const planner = PLANNER_POINTS * Math.max(0, ...members.map(planning));
  if (members.length === 2) return compatibility(members[0]!, members[1]!) + planner;

  const common =
    PERSONALITY_QUESTIONS.reduce((total, q) => total + agreement(q, members), 0) / PERSONALITY_QUESTIONS.length;
  // Everyone's best connection in the group; the group is only as included as its least-connected member.
  const leastConnected = Math.min(
    ...members.map((m) => Math.max(...members.filter((o) => o !== m).map((o) => compatibility(m, o)))),
  );
  return GROUP_COMMON_POINTS * common + GROUP_INCLUDED_POINTS * (leastConnected / (PAIR_POINTS * PERSONALITY_QUESTIONS.length)) + planner;
}

export type QualityLabel = "Strong" | "Good" | "Weak";

export function qualityLabel(quality: number): QualityLabel {
  return quality >= STRONG_MATCH ? "Strong" : quality >= WEAK_MATCH ? "Good" : "Weak";
}

export interface Thread {
  questionId: string;
  question: string;
  answer: string;
}

/**
 * What everyone in the match has in common: answers the whole match gave (for
 * "pick", options everyone picked; for "rank", the same value first). Shared
 * activities come first, since they make a ready-made first plan.
 */
export function commonThreads(members: readonly Signup[]): Thread[] {
  if (members.length < 2) return [];
  const threads: Thread[] = [];
  for (const question of PERSONALITY_QUESTIONS) {
    for (const option of question.options) {
      const everyone = members.every((m) => {
        const ids = answerIds(m.answers[question.id]);
        return question.kind === "rank" ? ids[0] === option.id : ids.includes(option.id);
      });
      if (everyone) threads.push({ questionId: question.id, question: question.prompt, answer: option.label });
    }
  }
  return threads.sort((x, y) => Number(y.questionId === "free-day") - Number(x.questionId === "free-day"));
}
