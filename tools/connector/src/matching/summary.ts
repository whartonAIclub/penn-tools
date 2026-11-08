import { QUESTIONS } from "../questions.js";
import type { Signup } from "../types.js";

export interface SharedAnswer {
  question: string;
  answer: string;
  /** How many people in the group gave this answer. */
  count: number;
}

/** The answers at least two people in the group gave, most common first: what they have in common. */
export function sharedAnswers(members: readonly Signup[]): SharedAnswer[] {
  const shared: SharedAnswer[] = [];
  for (const question of QUESTIONS) {
    for (const option of question.options) {
      const count = members.filter((m) => m.answers[question.id] === option.id).length;
      if (count >= 2) shared.push({ question: question.prompt, answer: option.label, count });
    }
  }
  return shared.sort((a, b) => b.count - a.count);
}
