import { answerIds } from "../questions.js";
import { PERSONALITY_QUESTIONS } from "./scoring.js";
import type { Signup } from "../types.js";

export interface SharedAnswer {
  question: string;
  answer: string;
  /** How many people in the group gave this answer. */
  count: number;
}

/**
 * The answers at least two people in the group gave, most common first: what
 * they have in common. For "pick" questions, each option two or more picked;
 * for "rank" questions, the value two or more put first. The meeting format
 * and follow-through aren't something in common.
 */
export function sharedAnswers(members: readonly Signup[]): SharedAnswer[] {
  const shared: SharedAnswer[] = [];
  for (const question of PERSONALITY_QUESTIONS) {
    for (const option of question.options) {
      const count = members.filter((m) => {
        const ids = answerIds(m.answers[question.id]);
        return question.kind === "rank" ? ids[0] === option.id : ids.includes(option.id);
      }).length;
      if (count >= 2) {
        const answer = question.kind === "rank" ? `${option.label} (#1)` : option.label;
        shared.push({ question: question.prompt, answer, count });
      }
    }
  }
  return shared.sort((a, b) => b.count - a.count);
}
