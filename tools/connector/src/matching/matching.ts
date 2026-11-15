import { formGroups, groupScore, matchScore, MAX_GROUP_SIZE, MIN_GROUP_SIZE, NEVER_MET, type MetBefore } from "./grouping.js";
import { hasPlanner, matchQuality, planning } from "./scoring.js";
import type { Group, GroupingResult, Signup } from "../types.js";

/**
 * How much a pair is worth when choosing who to pair: their match, but a pair
 * where neither will make the plan only as a last resort.
 */
function pairValue(a: Signup, b: Signup): number {
  return matchScore(a, b) - (hasPlanner([a, b]) ? 0 : 1000);
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

/** A MetBefore for the given past matches, each a pair of student IDs who were matched together. */
export function metBeforeFrom(pastPairs: Iterable<readonly [string, string]>): MetBefore {
  const met = new Set<string>();
  for (const [a, b] of pastPairs) met.add(`${a}\n${b}`).add(`${b}\n${a}`);
  return (a, b) => met.has(`${a.id}\n${b.id}`);
}

/** Who may be matched together: the rules every pair and group follows. */
interface Rules {
  /** Two people may be a pair: different cohorts, and not matched before. */
  canPair: (a: Signup, b: Signup) => boolean;
  /**
   * The person may join the group: it has room, nobody in it has been matched
   * with them before, and either nobody shares their cohort or, with
   * `allowClash`, exactly one person does and the group has no clash yet.
   */
  canJoin: (group: readonly Signup[], person: Signup, allowClash: boolean) => boolean;
  metBefore: MetBefore;
}

function rulesFor(metBefore: MetBefore): Rules {
  return {
    metBefore,
    canPair: (a, b) => a.cohort !== b.cohort && !metBefore(a, b),
    canJoin: (group, person, allowClash) => {
      if (group.length >= MAX_GROUP_SIZE || group.some((m) => metBefore(m, person))) return false;
      const same = group.filter((m) => m.cohort === person.cohort).length;
      if (same === 0) return true;
      return allowClash && same === 1 && cohortClashes(group) === 0;
    },
  };
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
 *  6. Any pair or group without a planner gets one from a match with a planner to spare.
 *
 * Nobody is ever matched with someone they've been matched with before
 * (`metBefore`), or paired with someone from their own cohort. A group has
 * nobody from the same cohort, except for the last-resort clash: at most one
 * per group, and never three from one cohort. Every match should have someone
 * who'll make the plan: a pair with no planner is made only as a last resort,
 * and the team page flags any match without one. How well people match is
 * matchScore (scoring.ts).
 *
 * Pairs come first in `groups`, then groups.
 */
export function makeMatches(signups: readonly Signup[], metBefore: MetBefore = NEVER_MET): GroupingResult {
  const rules = rulesFor(metBefore);
  const oneOnOne = signups.filter((s) => meetFormat(s) === "one-on-one");
  const smallGroup = signups.filter((s) => meetFormat(s) === "small-group");
  let either = signups.filter((s) => meetFormat(s) === "either");
  const waitlist: Signup[] = [];

  // 1. One-on-one people pair with each other.
  const { pairs, unpaired } = pairOff(oneOnOne, rules);

  // 2. Unpaired one-on-one people get the best-matching "either" person.
  for (const person of unpaired) {
    const partner = takeBest(either, (other) => pairValue(person, other), (other) => rules.canPair(person, other));
    if (partner) {
      pairs.push([person, partner]);
      either = either.filter((e) => e !== partner);
    } else {
      waitlist.push(person);
    }
  }

  // 3. Group the small-group people, adding "either" people while some of them can't be placed.
  let fillers: Signup[] = [];
  let grouped = formGroups(smallGroup, metBefore);
  while (grouped.waitlist.some((s) => meetFormat(s) === "small-group") && either.length > fillers.length) {
    const left = grouped.waitlist.filter((s) => meetFormat(s) === "small-group");
    const spare = either.filter((e) => !fillers.includes(e));
    const next = takeBest(spare, (e) => left.reduce((total, s) => total + matchScore(s, e), 0));
    fillers = [...fillers, next!];
    grouped = formGroups([...smallGroup, ...fillers], metBefore);
  }
  const groups = grouped.groups.map((g) => g.members);
  // Fillers that still didn't fit go back with the other "either" people.
  either = either.filter((e) => !fillers.includes(e) || grouped.waitlist.includes(e));
  let rest = grouped.waitlist.filter((s) => meetFormat(s) === "small-group");

  // 4. The other "either" people: a pair where that's the better match, otherwise a group
  //    (one that already exists, or one they could make with other "either" people).
  const placed = new Set<Signup>();
  for (const [a, b] of candidatePairs(either, rules)) {
    if (placed.has(a) || placed.has(b)) continue;
    const others = either.filter((e) => e !== a && e !== b && !placed.has(e));
    const groupFit = (p: Signup) => Math.max(bestGroupFit(groups, p, false, rules), newGroupFit(p, others, rules));
    const score = pairValue(a, b);
    if (score > groupFit(a) && score > groupFit(b)) {
      pairs.push([a, b]);
      placed.add(a).add(b);
    }
  }
  rest.push(
    ...either.filter((person) => {
      if (placed.has(person)) return false;
      const home = bestGroupWithRoom(groups, person, false, rules);
      if (home) home.push(person);
      return !home;
    }),
  );

  // 5. Whoever's left: new groups among themselves, then pairs, then a group with one clash.
  const extra = formGroups(rest, metBefore);
  groups.push(...extra.groups.map((g) => g.members));
  rest = extra.waitlist;
  const unplaced: Signup[] = [];
  while (rest.length > 0) {
    const person = rest.shift()!;
    // Small-group people only pair as a last resort, after a group with a clash.
    const partner =
      meetFormat(person) === "either"
        ? (takeBest(rest, (o) => pairValue(person, o), (o) => rules.canPair(person, o) && meetFormat(o) === "either") ??
          takeFromFullGroup(groups, person, rules))
        : undefined;
    if (partner) {
      pairs.push([person, partner]);
      rest = rest.filter((r) => r !== partner);
    } else {
      unplaced.push(person);
    }
  }
  for (const person of unplaced) {
    const home = bestGroupWithRoom(groups, person, true, rules);
    if (home) home.push(person);
    else waitlist.push(person);
  }

  // 6. Every pair and group should have someone who'll make the plan.
  givePairsPlanners(pairs, rules);
  givePlanners(groups, rules);

  return {
    groups: [...pairs, ...groups].map((members): Group => ({ members, score: groupScore(members) })),
    waitlist,
  };
}

/**
 * Gives each pair without a planner one, by swapping partners with a pair
 * that has two: (quiet1, quiet2) and (planner1, planner2) become (quiet1,
 * planner) and (quiet2, other planner), whichever way matches better, as long
 * as both new pairs follow the rules (no shared cohort, no repeats).
 */
function givePairsPlanners(pairs: Signup[][], rules: Rules): void {
  for (const [i, needy] of pairs.entries()) {
    if (hasPlanner(needy)) continue;
    const [u, v] = needy as [Signup, Signup];
    let best: { index: number; swap: [Signup[], Signup[]]; score: number } | undefined;
    for (const [j, donor] of pairs.entries()) {
      if (j === i || !donor.every((m) => planning(m) > 0)) continue;
      const [x, y] = donor as [Signup, Signup];
      for (const [p, q] of [[x, y], [y, x]] as const) {
        if (!rules.canPair(u, p) || !rules.canPair(v, q)) continue;
        const score = matchScore(u, p) + matchScore(v, q);
        if (!best || score > best.score) best = { index: j, swap: [[u, p], [v, q]], score };
      }
    }
    if (best) {
      pairs[i] = best.swap[0];
      pairs[best.index] = best.swap[1];
    }
  }
}

/**
 * Gives each group without a planner one, from a group with a planner to
 * spare: by moving them, if the group they leave stays big enough, or else by
 * swapping them for someone in the group without one. Only moves that keep
 * every rule (cohorts, no repeats) are made, choosing the one that leaves
 * both groups best matched. A group that still has no planner (there weren't
 * enough) is left as it is, and the team page flags it.
 */
function givePlanners(groups: Signup[][], rules: Rules): void {
  for (const needy of groups) {
    if (hasPlanner(needy)) continue;
    let best: { apply: () => void; quality: number } | undefined;
    for (const donor of groups) {
      if (donor === needy || donor.filter((m) => planning(m) > 0).length < 2) continue;
      for (const planner of donor.filter((m) => planning(m) > 0)) {
        const donorLeft = donor.filter((m) => m !== planner);
        // Move the planner over.
        if (donorLeft.length >= MIN_GROUP_SIZE && rules.canJoin(needy, planner, false)) {
          const quality = matchQuality([...needy, planner]) + matchQuality(donorLeft);
          if (!best || quality > best.quality) {
            best = { quality, apply: () => { donor.splice(donor.indexOf(planner), 1); needy.push(planner); } };
          }
        }
        // Or swap them for someone in the group without a planner.
        for (const other of needy) {
          const needyLeft = needy.filter((m) => m !== other);
          if (!rules.canJoin(needyLeft, planner, false) || !rules.canJoin(donorLeft, other, false)) continue;
          const quality = matchQuality([...needyLeft, planner]) + matchQuality([...donorLeft, other]);
          if (!best || quality > best.quality) {
            best = {
              quality,
              apply: () => {
                donor.splice(donor.indexOf(planner), 1, other);
                needy.splice(needy.indexOf(other), 1, planner);
              },
            };
          }
        }
      }
    }
    best?.apply();
  }
}

/**
 * Pairs people best match first, then swaps partners where that lets two
 * people who couldn't be paired with each other both be paired. Anyone still
 * left over (e.g. no one from another cohort they haven't met) is returned
 * unpaired.
 */
function pairOff(people: readonly Signup[], rules: Rules): { pairs: Signup[][]; unpaired: Signup[] } {
  const pairs: [Signup, Signup][] = [];
  const paired = new Set<Signup>();
  for (const [a, b] of candidatePairs(people, rules)) {
    if (paired.has(a) || paired.has(b)) continue;
    pairs.push([a, b]);
    paired.add(a).add(b);
  }

  let unpaired = people.filter((p) => !paired.has(p));
  let swapped = true;
  while (swapped && unpaired.length >= 2) {
    swapped = false;
    search: for (let i = 0; i < unpaired.length; i++) {
      for (let j = i + 1; j < unpaired.length; j++) {
        const u = unpaired[i]!;
        const v = unpaired[j]!;
        // Split a pair (x, y) into (u, x) and (v, y), best-matching split first.
        let best: { index: number; pairs: [[Signup, Signup], [Signup, Signup]]; score: number } | undefined;
        pairs.forEach(([x, y], index) => {
          for (const [p, q] of [[x, y], [y, x]] as const) {
            if (!rules.canPair(u, p) || !rules.canPair(v, q)) continue;
            const score = pairValue(u, p) + pairValue(v, q);
            if (!best || score > best.score) best = { index, pairs: [[u, p], [v, q]], score };
          }
        });
        if (best) {
          pairs.splice(best.index, 1, ...best.pairs);
          unpaired = unpaired.filter((p) => p !== u && p !== v);
          swapped = true;
          break search;
        }
      }
    }
  }
  return { pairs, unpaired };
}

/** Every pair of people who may be paired, best match first (earlier sign-ups first on a tie). */
function candidatePairs(people: readonly Signup[], rules: Rules): [Signup, Signup][] {
  const candidates: { a: Signup; b: Signup; score: number }[] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]!;
      const b = people[j]!;
      if (rules.canPair(a, b)) candidates.push({ a, b, score: pairValue(a, b) });
    }
  }
  // A stable sort, so equal scores keep sign-up order.
  return candidates.sort((x, y) => y.score - x.score).map(({ a, b }) => [a, b]);
}

/** How well the person would fit the best group they can join: their average match with its members, or -1 if none. */
function bestGroupFit(groups: readonly Signup[][], person: Signup, allowClash: boolean, rules: Rules): number {
  let best = -1;
  for (const group of groups) {
    if (rules.canJoin(group, person, allowClash)) best = Math.max(best, averageMatch(group, person));
  }
  return best;
}

/**
 * How well the person would fit a new group made with their best matches
 * among `others` (people they may be matched with): their average match with
 * the best two, or -1 if there aren't two.
 */
function newGroupFit(person: Signup, others: readonly Signup[], rules: Rules): number {
  const scores = others
    .filter((o) => rules.canPair(person, o))
    .map((o) => matchScore(person, o))
    .sort((x, y) => y - x);
  return scores.length < MIN_GROUP_SIZE - 1 ? -1 : (scores[0]! + scores[1]!) / 2;
}

function bestGroupWithRoom(
  groups: Signup[][],
  person: Signup,
  allowClash: boolean,
  rules: Rules,
): Signup[] | undefined {
  let best: Signup[] | undefined;
  let bestFit = -1;
  for (const group of groups) {
    if (!rules.canJoin(group, person, allowClash)) continue;
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
function takeFromFullGroup(groups: Signup[][], person: Signup, rules: Rules): Signup | undefined {
  let best: { group: Signup[]; member: Signup; score: number } | undefined;
  for (const group of groups) {
    if (group.length <= MIN_GROUP_SIZE) continue;
    for (const member of group) {
      if (meetFormat(member) !== "either" || !rules.canPair(person, member)) continue;
      const score = pairValue(person, member);
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
