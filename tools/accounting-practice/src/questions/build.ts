// Short helpers for writing questions, so each topic file reads like the
// question itself. They only build plain data; validate.ts checks the result.

import type { Choice, JournalLine, Review } from "./types.js";

const LABELS = ["A", "B", "C", "D"] as const;

/** Every new question starts pending, until a team member reviews it. */
export const PENDING: Review = { status: "pending", reviewer: null, reviewedOn: null, note: null };

/** Pending, with something the reviewer must check before approving. */
export function pendingWithNote(note: string): Review {
  return { ...PENDING, note };
}

/** A stable number from a string (FNV-1a), so a question's answer position never changes between runs. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Moves the correct item to a position picked from its own text, keeping the
 * wrong ones in their written order. Spreads correct answers across A–D, so
 * students can't do well by always guessing one letter. Explanations never
 * mention letters, so moving choices doesn't change their meaning.
 */
function placeCorrect<T>(correct: number, items: readonly T[], key: string): { items: T[]; correct: number } {
  const right = items[correct];
  if (right === undefined) return { items: [...items], correct };
  const target = hash(key) % items.length;
  const rest = items.filter((_, i) => i !== correct);
  rest.splice(target, 0, right);
  return { items: rest, correct: target };
}

/** Four sentence or number choices, labelled A to D; `correct` is the index (0–3) of the right one as written. */
export function textChoices(correct: number, items: readonly (readonly [text: string, explanation: string])[]): Choice[] {
  const placed = placeCorrect(correct, items, items[correct]?.[0] ?? "");
  return placed.items.map(([text, explanation], i) => ({
    label: LABELS[i] ?? "?",
    text,
    effects: null,
    correct: i === placed.correct,
    explanation,
  }));
}

/**
 * Four effects choices, labelled A to D in order. Each gives the effect on
 * [assets, liabilities, equity, operating cash flow] in dollars.
 */
export function effectChoices(
  correct: number,
  items: readonly (readonly [effects: readonly [number, number, number, number], explanation: string])[],
): Choice[] {
  const placed = placeCorrect(correct, items, items[correct]?.[1] ?? "");
  return placed.items.map(([[assets, liabilities, equity, operatingCashFlow], explanation], i) => ({
    label: LABELS[i] ?? "?",
    text: null,
    effects: { assets, liabilities, equity, operatingCashFlow },
    correct: i === placed.correct,
    explanation,
  }));
}

export function dr(account: string, amount: number): JournalLine {
  return { side: "debit", account, amount };
}

export function cr(account: string, amount: number): JournalLine {
  return { side: "credit", account, amount };
}
