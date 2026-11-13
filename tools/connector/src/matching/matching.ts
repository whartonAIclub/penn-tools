import { QUESTIONS } from "../questions.js";
import { formGroups, groupScore, matchScore, MAX_GROUP_SIZE, MIN_GROUP_SIZE } from "./grouping.js";
import type { Group, GroupingResult, Signup } from "../types.js";

/** How many questions count towards match quality (all but the meeting format). */
export const SCORED_QUESTIONS = QUESTIONS.filter((q) => q.scored !== false).length;

/**
 * Below this match quality, a match is flagged as weak. A placeholder until
 * the team defines match quality.
 */
export const WEAK_MATCH_QUALITY = 2;

/**
 * How good a match is, from 0 to SCORED_QUESTIONS: how many answers each two
 * people in it have in common, on average. A placeholder until the team
 * defines match quality.
 */
export function matchQuality(members: readonly Signup[]): number {
  const pairs = (members.length * (members.length - 1)) / 2;
  return pairs === 0 ? 0 : groupScore(members) / pairs;
}

/** How each student answered "How would you like to meet people?" (the "meet-format" question). */
export type MeetFormat = "one-on-one" | "small-group" | "either";

/** A student's meeting format. Anyone who didn't answer (e.g. signed up before it was asked) wants a small group. */
export function meetFormat(person: Signup): MeetFormat {
  const answer = person.answers["meet-format"];
  return answer === "one-on-one" || answer === "either" ? answer : "small-group";
}

/** How many cohorts have more than one person in the group (0 for every pair, and almost every group). */
export function cohortClashes(members: readonly Signup[]): number {
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.cohort, (counts.get(m.cohort) ?? 0) + 1);
  return [...counts.values()].filter((n) => n > 1).length;
}

/**
 * Matches everyone into one-on-one pairs and small groups (3–4). The aim is
 * that everyone is matched; match quality decides where flexible people go.
 *
 *  1. One-on-one people are paired with each other, best matches first.
 *  2. Any still unpaired get the best-matching "either" person.
 *  3. Small-group people are grouped; if some can't be, "either" people fill
 *     the gaps.
 *  4. The other "either" people are paired with each other where that's a
 *     better match than joining a group (on a tie, they join the group), and
 *     join groups otherwise.
 *  5. Anyone left is placed if at all possible: in new groups, in pairs (even
 *     weak ones), and only then, as a last resort, in a group with one cohort
 *     clash. Whoever still can't be placed is waitlisted, as is any one-on-one
 *     person without a partner (they asked not to be in a group).
 *
 * Nobody is ever paired with someone from their own cohort. A group has
 * nobody from the same cohort, except for the last-resort clash: at most one
 * per group, and never three from one cohort.
 *
 * Pairs come first in `groups`, then groups.
 */
export function makeMatches(signups: readonly Signup[]): GroupingResult {
  const oneOnOne = signups.filter((s) => meetFormat(s) === "one-on-one");
  const smallGroup = signups.filter((s) => meetFormat(s) === "small-group");
  let either = signups.filter((s) => meetFormat(s) === "either");
  const waitlist: Signup[] = [];

  // 1. One-on-one people pair with each other.
  const { pairs, unpaired } = pairOff(oneOnOne);

  // 2. Unpaired one-on-one people get the best-matching "either" person.
  for (const person of unpaired) {
    const partner = takeBest(either, (other) => matchScore(person, other), (other) => other.cohort !== person.cohort);
    if (partner) {
      pairs.push([person, partner]);
      either = either.filter((e) => e !== partner);
    } else {
      waitlist.push(person);
    }
  }

  // 3. Group the small-group people, adding "either" people while some of them can't be placed.
  let fillers: Signup[] = [];
  let grouped = formGroups(smallGroup);
  while (grouped.waitlist.some((s) => meetFormat(s) === "small-group") && either.length > fillers.length) {
    const left = grouped.waitlist.filter((s) => meetFormat(s) === "small-group");
    const spare = either.filter((e) => !fillers.includes(e));
    const next = takeBest(spare, (e) => left.reduce((total, s) => total + matchScore(s, e), 0));
    fillers = [...fillers, next!];
    grouped = formGroups([...smallGroup, ...fillers]);
  }
  const groups = grouped.groups.map((g) => g.members);
  // Fillers that still didn't fit go back with the other "either" people.
  either = either.filter((e) => !fillers.includes(e) || grouped.waitlist.includes(e));
  let rest = grouped.waitlist.filter((s) => meetFormat(s) === "small-group");

  // 4. The other "either" people: a pair where that's the better match, otherwise a group
  //    (one that already exists, or one they could make with other "either" people).
  const placed = new Set<Signup>();
  for (const [a, b] of candidatePairs(either)) {
    if (placed.has(a) || placed.has(b)) continue;
    const others = either.filter((e) => e !== a && e !== b && !placed.has(e));
    const groupFit = (p: Signup) => Math.max(bestGroupFit(groups, p, false), newGroupFit(p, others));
    const score = matchScore(a, b);
    if (score > groupFit(a) && score > groupFit(b)) {
      pairs.push([a, b]);
      placed.add(a).add(b);
    }
  }
  rest.push(
    ...either.filter((person) => {
      if (placed.has(person)) return false;
      const home = bestGroupWithRoom(groups, person, false);
      if (home) home.push(person);
      return !home;
    }),
  );

  // 5. Whoever's left: new groups among themselves, then pairs, then a group with one clash.
  const extra = formGroups(rest);
  groups.push(...extra.groups.map((g) => g.members));
  rest = extra.waitlist;
  const unplaced: Signup[] = [];
  while (rest.length > 0) {
    const person = rest.shift()!;
    // Small-group people only pair as a last resort, after a group with a clash.
    const partner =
      meetFormat(person) === "either"
        ? (takeBest(rest, (o) => matchScore(person, o), (o) => o.cohort !== person.cohort && meetFormat(o) === "either") ??
          takeFromFullGroup(groups, person))
        : undefined;
    if (partner) {
      pairs.push([person, partner]);
      rest = rest.filter((r) => r !== partner);
    } else {
      unplaced.push(person);
    }
  }
  for (const person of unplaced) {
    const home = bestGroupWithRoom(groups, person, true);
    if (home) home.push(person);
    else waitlist.push(person);
  }

  return {
    groups: [...pairs, ...groups].map((members): Group => ({ members, score: groupScore(members) })),
    waitlist,
  };
}

/** Pairs people best match first; anyone who can't be paired (e.g. no one from another cohort) is left over. */
function pairOff(people: readonly Signup[]): { pairs: Signup[][]; unpaired: Signup[] } {
  const pairs: Signup[][] = [];
  const paired = new Set<Signup>();
  for (const [a, b] of candidatePairs(people)) {
    if (paired.has(a) || paired.has(b)) continue;
    pairs.push([a, b]);
    paired.add(a).add(b);
  }
  return { pairs, unpaired: people.filter((p) => !paired.has(p)) };
}

/** Every pair of people from different cohorts, best match first (earlier sign-ups first on a tie). */
function candidatePairs(people: readonly Signup[]): [Signup, Signup][] {
  const candidates: { a: Signup; b: Signup; score: number }[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]!;
      const b = people[j]!;
      if (a.cohort !== b.cohort) candidates.push({ a, b, score: matchScore(a, b) });
    }
  }
  // A stable sort, so equal scores keep sign-up order.
  return candidates.sort((x, y) => y.score - x.score).map(({ a, b }) => [a, b]);
}

/**
 * Whether the person can join the group: it has room, and either nobody
 * shares their cohort or, with `allowClash`, exactly one person does and the
 * group has no clash yet.
 */
function canJoin(group: readonly Signup[], person: Signup, allowClash: boolean): boolean {
  if (group.length >= MAX_GROUP_SIZE) return false;
  const same = group.filter((m) => m.cohort === person.cohort).length;
  if (same === 0) return true;
  return allowClash && same === 1 && cohortClashes(group) === 0;
}

/** How well the person would fit the best group they can join: their average match with its members, or -1 if none. */
function bestGroupFit(groups: readonly Signup[][], person: Signup, allowClash: boolean): number {
  let best = -1;
  for (const group of groups) {
    if (canJoin(group, person, allowClash)) best = Math.max(best, averageMatch(group, person));
  }
  return best;
}

/**
 * How well the person would fit a new group made with their best matches
 * among `others` (from other cohorts): their average match with the best two,
 * or -1 if there aren't two.
 */
function newGroupFit(person: Signup, others: readonly Signup[]): number {
  const scores = others
    .filter((o) => o.cohort !== person.cohort)
    .map((o) => matchScore(person, o))
    .sort((x, y) => y - x);
  return scores.length < MIN_GROUP_SIZE - 1 ? -1 : (scores[0]! + scores[1]!) / 2;
}

function bestGroupWithRoom(groups: Signup[][], person: Signup, allowClash: boolean): Signup[] | undefined {
  let best: Signup[] | undefined;
  let bestFit = -1;
  for (const group of groups) {
    if (!canJoin(group, person, allowClash)) continue;
    const fit = averageMatch(group, person);
    if (fit > bestFit) {
      best = group;
      bestFit = fit;
    }
  }
  return best;
}

/**
 * Takes an "either" person out of a full group (which stays big enough without
 * them) to pair with someone who'd otherwise be left out, best match first.
 */
function takeFromFullGroup(groups: Signup[][], person: Signup): Signup | undefined {
  let best: { group: Signup[]; member: Signup; score: number } | undefined;
  for (const group of groups) {
    if (group.length <= MIN_GROUP_SIZE) continue;
    for (const member of group) {
      if (meetFormat(member) !== "either" || member.cohort === person.cohort) continue;
      const score = matchScore(person, member);
      if (!best || score > best.score) best = { group, member, score };
    }
  }
  if (!best) return undefined;
  best.group.splice(best.group.indexOf(best.member), 1);
  return best.member;
}

function averageMatch(group: readonly Signup[], person: Signup): number {
  return group.reduce((total, member) => total + matchScore(member, person), 0) / group.length;
}

/** The candidate with the highest score (the earliest on a tie) that passes `allowed`, if any. */
function takeBest(
  candidates: readonly Signup[],
  score: (candidate: Signup) => number,
  allowed: (candidate: Signup) => boolean = () => true,
): Signup | undefined {
  let best: Signup | undefined;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!allowed(candidate)) continue;
    const s = score(candidate);
    if (s > bestScore) {
      best = candidate;
      bestScore = s;
    }
  }
  return best;
}
