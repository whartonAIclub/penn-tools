import { QUESTIONS } from "../questions.js";
import type { Group, GroupingResult, Signup } from "../types.js";

export const MIN_GROUP_SIZE = 4;
export const MAX_GROUP_SIZE = 5;

/** How many questions two people answered the same way. */
export function matchScore(a: Signup, b: Signup): number {
  let score = 0;
  for (const question of QUESTIONS) {
    const answer = a.answers[question.id];
    if (answer !== undefined && answer === b.answers[question.id]) score++;
  }
  return score;
}

/** Matching answers, totalled over every pair in the group. */
export function groupScore(members: readonly Signup[]): number {
  let score = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      score += matchScore(members[i]!, members[j]!);
    }
  }
  return score;
}

/**
 * Splits sign-ups into groups of 4–5 where nobody shares a cohort, keeping
 * people who answered alike together. Anyone who can't be placed goes on the
 * waitlist for the next round.
 *
 * Builds one group at a time, always adding the person who matches the group
 * best, then places leftovers in the groups with room. This isn't guaranteed
 * to find the best possible grouping, but it's close and fast.
 */
export function formGroups(signups: readonly Signup[]): GroupingResult {
  const pool = [...signups];
  const groups: Signup[][] = [];
  const groupCount = Math.floor(pool.length / MIN_GROUP_SIZE);

  for (let g = 0; g < groupCount; g++) {
    // Start with someone from the cohort with the most people left: a cohort
    // can have at most one person per group, so big cohorts must be spread out
    // first or they won't fit.
    const group = [takeFromLargestCohort(pool)];
    while (group.length < MIN_GROUP_SIZE) {
      const next = takeBestFit(pool, group);
      if (!next) break;
      group.push(next);
    }
    if (group.length < MIN_GROUP_SIZE) {
      // Not enough different cohorts left to fill a group.
      pool.push(...group);
      break;
    }
    groups.push(group);
  }

  const waitlist: Signup[] = [];
  for (const person of pool) {
    const home = bestGroupWithRoom(groups, person);
    if (home) home.push(person);
    else waitlist.push(person);
  }

  return {
    groups: groups.map((members): Group => ({ members, score: groupScore(members) })),
    waitlist,
  };
}

function takeFromLargestCohort(pool: Signup[]): Signup {
  const counts = new Map<string, number>();
  for (const person of pool) counts.set(person.cohort, (counts.get(person.cohort) ?? 0) + 1);
  let index = 0;
  for (let i = 1; i < pool.length; i++) {
    if (counts.get(pool[i]!.cohort)! > counts.get(pool[index]!.cohort)!) index = i;
  }
  return pool.splice(index, 1)[0]!;
}

/** Removes and returns the person from another cohort who matches the group best, if any. */
function takeBestFit(pool: Signup[], group: readonly Signup[]): Signup | undefined {
  let bestIndex = -1;
  let bestScore = -1;
  pool.forEach((person, i) => {
    if (!fitsCohorts(group, person)) return;
    const score = scoreWith(group, person);
    if (score > bestScore) {
      bestIndex = i;
      bestScore = score;
    }
  });
  return bestIndex === -1 ? undefined : pool.splice(bestIndex, 1)[0];
}

function bestGroupWithRoom(groups: Signup[][], person: Signup): Signup[] | undefined {
  let best: Signup[] | undefined;
  let bestScore = -1;
  for (const group of groups) {
    if (group.length >= MAX_GROUP_SIZE || !fitsCohorts(group, person)) continue;
    const score = scoreWith(group, person);
    if (score > bestScore) {
      best = group;
      bestScore = score;
    }
  }
  return best;
}

function fitsCohorts(group: readonly Signup[], person: Signup): boolean {
  return group.every((member) => member.cohort !== person.cohort);
}

function scoreWith(group: readonly Signup[], person: Signup): number {
  return group.reduce((total, member) => total + matchScore(member, person), 0);
}
