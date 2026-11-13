import { formGroups, matchScore } from "./grouping.js";
import type { Group, GroupingResult, Signup } from "../types.js";

/** The question asking how someone would like to meet (questions.ts). */
export const FORMAT_QUESTION_ID = "meet-format";

/** A pair must share at least this many answers, or both wait for the next release. */
export const MIN_PAIR_SCORE = 2;

/**
 * Matches everyone at once: one-on-one pairs for those who asked for them,
 * and small groups (formGroups) for the rest. Pairs come back as groups of 2,
 * alongside the groups of 3–4, so they're saved and shown the same way.
 *
 * - A pair is two people from different cohorts sharing at least
 *   MIN_PAIR_SCORE answers, best matches first.
 * - "Either" people go into groups, except to partner someone who asked for
 *   one-on-one and was left without a partner (e.g. an odd number asked).
 * - Someone who asked for one-on-one and still has no partner is waitlisted,
 *   not put in a group.
 * - Anyone who didn't answer the format question is treated as wanting a group.
 */
export function formMatches(signups: readonly Signup[]): GroupingResult {
  const oneOnOne = signups.filter((s) => s.answers[FORMAT_QUESTION_ID] === "one-on-one");
  const flexible = signups.filter((s) => s.answers[FORMAT_QUESTION_ID] === "either");
  const groupPool = signups.filter((s) => !oneOnOne.includes(s) && !flexible.includes(s));

  const { pairs, unpaired } = pairUp(oneOnOne);

  // Offer each person left without a partner their best "Either" partner.
  const waitlist: Signup[] = [];
  for (const person of unpaired) {
    const partner = bestPartner(person, flexible);
    if (!partner) {
      waitlist.push(person);
      continue;
    }
    flexible.splice(flexible.indexOf(partner), 1);
    pairs.push({ members: [person, partner], score: matchScore(person, partner) });
  }

  const grouped = formGroups([...groupPool, ...flexible]);
  return {
    groups: [...pairs, ...grouped.groups],
    waitlist: [...waitlist, ...grouped.waitlist],
  };
}

/** The candidate who'd make the best partner for person, if any is from another cohort and shares enough. */
function bestPartner(person: Signup, candidates: readonly Signup[]): Signup | undefined {
  let best: Signup | undefined;
  let bestScore = MIN_PAIR_SCORE - 1;
  for (const candidate of candidates) {
    if (candidate.cohort === person.cohort) continue;
    const score = matchScore(person, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Pairs people best match first, from different cohorts and sharing at least MIN_PAIR_SCORE answers. */
function pairUp(pool: readonly Signup[]): { pairs: Group[]; unpaired: Signup[] } {
  const candidates: { a: number; b: number; score: number }[] = [];
  for (let a = 0; a < pool.length; a++) {
    for (let b = a + 1; b < pool.length; b++) {
      if (pool[a]!.cohort === pool[b]!.cohort) continue;
      const score = matchScore(pool[a]!, pool[b]!);
      if (score >= MIN_PAIR_SCORE) candidates.push({ a, b, score });
    }
  }
  // Best matches first; ties go to whoever signed up earlier.
  candidates.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);

  const taken = new Set<number>();
  const pairs: Group[] = [];
  for (const { a, b, score } of candidates) {
    if (taken.has(a) || taken.has(b)) continue;
    taken.add(a);
    taken.add(b);
    pairs.push({ members: [pool[a]!, pool[b]!], score });
  }
  return { pairs, unpaired: pool.filter((_, i) => !taken.has(i)) };
}
