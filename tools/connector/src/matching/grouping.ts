import { compatibility } from "./scoring.js";
import type { Group, GroupingResult, Signup } from "../types.js";

// Groups of 3, with some of 4 so leftovers aren't waitlisted.
export const MIN_GROUP_SIZE = 3;
export const MAX_GROUP_SIZE = 4;

/** Whether two students have been matched before, in any release. Nobody is ever matched with the same person twice. */
export type MetBefore = (a: Signup, b: Signup) => boolean;

export const NEVER_MET: MetBefore = () => false;

/** How well two people match on the personality questions, from 0 to 90 (see scoring.ts). */
export function matchScore(a: Signup, b: Signup): number {
  return compatibility(a, b);
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
 * Splits sign-ups into groups of 3–4 where nobody shares a cohort or has been
 * matched with anyone else in the group before, keeping people who answered
 * alike together. Anyone who can't be placed goes on the waitlist for the
 * next round.
 *
 * Builds one group at a time, always adding the person who matches the group
 * best, then places leftovers in the groups with room. This isn't guaranteed
 * to find the best possible grouping, but it's close and fast.
 */
export function formGroups(signups: readonly Signup[], metBefore: MetBefore = NEVER_MET): GroupingResult {
  const fits = (group: readonly Signup[], person: Signup) => fitsGroup(group, person, metBefore);
  const pool = [...signups];
  const groups: Signup[][] = [];
  const groupCount = Math.floor(pool.length / MIN_GROUP_SIZE);

  for (let g = 0; g < groupCount; g++) {
    // Start with someone from the cohort with the most people left: a cohort
    // can have at most one person per group, so big cohorts must be spread out
    // first or they won't fit.
    const group = [takeFromLargestCohort(pool)];
    while (group.length < MIN_GROUP_SIZE) {
      const next = takeBestFit(pool, group, fits);
      if (!next) break;
      group.push(next);
    }
    if (group.length < MIN_GROUP_SIZE) {
      // Not enough people left who fit together to fill a group.
      pool.push(...group);
      break;
    }
    groups.push(group);
  }

  // Place leftovers with the fewest groups they could join first, so an easy
  // fit doesn't take the only spot someone else could have had.
  const waitlist: Signup[] = [];
  while (pool.length > 0) {
    const options = pool.map((person) => groups.filter((g) => g.length < MAX_GROUP_SIZE && fits(g, person)).length);
    const placeable = options.map((n, i) => [n, i] as const).filter(([n]) => n > 0);
    if (placeable.length === 0) {
      waitlist.push(...pool);
      break;
    }
    const [, index] = placeable.reduce((best, next) => (next[0] < best[0] ? next : best));
    const [person] = pool.splice(index, 1);
    bestGroupWithRoom(groups, person!, fits)!.push(person!);
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

type Fits = (group: readonly Signup[], person: Signup) => boolean;

/** Removes and returns the person who fits the group and matches it best, if any. */
function takeBestFit(pool: Signup[], group: readonly Signup[], fits: Fits): Signup | undefined {
  let bestIndex = -1;
  let bestScore = -1;
  pool.forEach((person, i) => {
    if (!fits(group, person)) return;
    const score = scoreWith(group, person);
    if (score > bestScore) {
      bestIndex = i;
      bestScore = score;
    }
  });
  return bestIndex === -1 ? undefined : pool.splice(bestIndex, 1)[0];
}

function bestGroupWithRoom(groups: Signup[][], person: Signup, fits: Fits): Signup[] | undefined {
  let best: Signup[] | undefined;
  let bestScore = -1;
  for (const group of groups) {
    if (group.length >= MAX_GROUP_SIZE || !fits(group, person)) continue;
    const score = scoreWith(group, person);
    if (score > bestScore) {
      best = group;
      bestScore = score;
    }
  }
  return best;
}

/** Whether the person can join the group: nobody in it shares their cohort or has been matched with them before. */
function fitsGroup(group: readonly Signup[], person: Signup, metBefore: MetBefore): boolean {
  return group.every((member) => member.cohort !== person.cohort && !metBefore(member, person));
}

function scoreWith(group: readonly Signup[], person: Signup): number {
  return group.reduce((total, member) => total + matchScore(member, person), 0);
}
