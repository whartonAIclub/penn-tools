import { describe, it, expect } from "vitest";
import { cohortClashes, makeMatches, matchQuality, meetFormat } from "../matching.js";
import { SAMPLE_SIGNUPS } from "../samples.js";
import type { GroupingResult, Signup } from "../../types.js";

let nextId = 1;
/** A made-up sign-up with a meeting format, who answered the first two questions. */
function person(cohort: string, format: string, friday: string, freeDay: string): Signup {
  const id = String(nextId++);
  return {
    id,
    name: `Student ${id}`,
    email: `student${id}@wharton.upenn.edu`,
    cohort,
    answers: { "meet-format": format, "friday-midnight": friday, "free-day": freeDay },
  };
}

const ids = (people: readonly Signup[]) => people.map((p) => p.id).sort();
const pairsOf = (result: GroupingResult) => result.groups.filter((g) => g.members.length === 2).map((g) => ids(g.members));
const groupsOf = (result: GroupingResult) => result.groups.filter((g) => g.members.length > 2).map((g) => ids(g.members));

/** Checks the rules every result must follow. */
function expectValid(result: GroupingResult, signups: Signup[]) {
  for (const { members } of result.groups) {
    if (members.length === 2) {
      // A pair: never the same cohort.
      expect(members[0]!.cohort).not.toBe(members[1]!.cohort);
    } else {
      expect(members.length).toBeGreaterThanOrEqual(3);
      expect(members.length).toBeLessThanOrEqual(4);
      // At most one clash, and never three from one cohort.
      expect(cohortClashes(members)).toBeLessThanOrEqual(1);
      for (const m of members) expect(members.filter((o) => o.cohort === m.cohort).length).toBeLessThanOrEqual(2);
      // One-on-one people are never put in a group.
      expect(members.every((m) => meetFormat(m) !== "one-on-one")).toBe(true);
    }
  }
  // Everyone is placed exactly once, in a pair, a group or the waitlist.
  const placed = [...result.groups.flatMap((g) => g.members), ...result.waitlist].map((p) => p.id);
  expect(placed.sort()).toEqual(ids(signups));
}

describe("matchQuality", () => {
  it("is the average number of answers each two people have in common", () => {
    const a = person("A", "either", "out-dancing", "hike");
    const b = person("B", "either", "out-dancing", "hike");
    const c = person("C", "either", "out-dancing", "museum");
    expect(matchQuality([a, b])).toBe(2);
    // a–b share 2, a–c share 1, b–c share 1.
    expect(matchQuality([a, b, c])).toBeCloseTo(4 / 3);
  });
});

describe("cohortClashes", () => {
  it("counts cohorts with more than one person", () => {
    const at = (c: string) => person(c, "either", "hike", "hike");
    expect(cohortClashes([at("A"), at("B"), at("C")])).toBe(0);
    expect(cohortClashes([at("A"), at("A"), at("B")])).toBe(1);
  });
});

describe("meetFormat", () => {
  it("treats a missing answer as wanting a small group", () => {
    expect(meetFormat({ ...person("A", "one-on-one", "hike", "hike"), answers: {} })).toBe("small-group");
  });
});

describe("makeMatches", () => {
  it("pairs one-on-one people with their best match, and groups small-group people", () => {
    const o1 = person("A", "one-on-one", "out-dancing", "food-crawl");
    const o2 = person("B", "one-on-one", "morning-person", "movie-day");
    const o3 = person("C", "one-on-one", "out-dancing", "food-crawl");
    const o4 = person("D", "one-on-one", "morning-person", "movie-day");
    const g = ["E", "F", "G"].map((c) => person(c, "small-group", "board-games", "museum"));
    const signups = [o1, o2, o3, o4, ...g];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(pairsOf(result)).toEqual([ids([o1, o3]), ids([o2, o4])]);
    expect(groupsOf(result)).toEqual([ids(g)]);
    expect(result.waitlist).toEqual([]);
  });

  it("gives an odd one-on-one person the best-matching either person", () => {
    const solo = person("A", "one-on-one", "out-dancing", "food-crawl");
    const alike = person("B", "either", "out-dancing", "food-crawl");
    const unlike = person("C", "either", "morning-person", "movie-day");
    const g = ["D", "E", "F"].map((c) => person(c, "small-group", "morning-person", "movie-day"));
    const signups = [solo, unlike, alike, ...g];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(pairsOf(result)).toEqual([ids([solo, alike])]);
    expect(groupsOf(result)).toEqual([ids([...g, unlike])]);
  });

  it("never pairs two people from the same cohort", () => {
    const signups = [person("A", "one-on-one", "hike", "hike"), person("A", "one-on-one", "hike", "hike")];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(result.groups).toEqual([]);
    expect(result.waitlist).toHaveLength(2);
  });

  it("uses either people to complete a small group before anything else", () => {
    const g = ["A", "B"].map((c) => person(c, "small-group", "board-games", "museum"));
    const e1 = person("C", "either", "board-games", "museum");
    const e2 = person("D", "either", "out-dancing", "food-crawl");
    const signups = [...g, e1, e2];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(groupsOf(result)).toEqual([ids([...g, e1, e2])]);
    expect(result.waitlist).toEqual([]);
  });

  it("pairs either people with each other when that's a better match than a group", () => {
    const g = ["A", "B", "C"].map((c) => person(c, "small-group", "morning-person", "movie-day"));
    const e = ["D", "E"].map((c) => person(c, "either", "out-dancing", "food-crawl"));
    const signups = [...g, ...e];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(pairsOf(result)).toEqual([ids(e)]);
    expect(groupsOf(result)).toEqual([ids(g)]);
  });

  it("puts an either person in a group when that's the better match", () => {
    const g = ["A", "B", "C"].map((c) => person(c, "small-group", "out-dancing", "food-crawl"));
    const e1 = person("D", "either", "out-dancing", "food-crawl");
    const e2 = person("E", "either", "morning-person", "movie-day");
    const e3 = person("F", "either", "morning-person", "movie-day");
    const signups = [...g, e1, e2, e3];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(groupsOf(result)).toEqual([ids([...g, e1])]);
    expect(pairsOf(result)).toEqual([ids([e2, e3])]);
  });

  it("would rather pair someone weakly than leave them out", () => {
    // The either person fits the group best, but taking that spot would leave
    // the other either person alone: they're paired instead.
    const g = ["A", "B", "C"].map((c) => person(c, "small-group", "out-dancing", "food-crawl"));
    const e1 = person("D", "either", "out-dancing", "food-crawl");
    const e2 = person("E", "either", "morning-person", "movie-day");
    const signups = [...g, e1, e2];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(result.waitlist).toEqual([]);
    expect(pairsOf(result)).toEqual([ids([e1, e2])]);
    expect(groupsOf(result)).toEqual([ids(g)]);
  });

  it("allows one cohort clash in a group only as a last resort", () => {
    const g = ["A", "B", "C"].map((c) => person(c, "small-group", "hike", "hike"));
    const extra = person("A", "small-group", "hike", "hike");
    const signups = [...g, extra];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(result.waitlist).toEqual([]);
    expect(result.groups).toHaveLength(1);
    expect(cohortClashes(result.groups[0]!.members)).toBe(1);
  });

  it("never puts three people from one cohort in a group", () => {
    const signups = [
      ...["B", "C", "D"].map((c) => person(c, "small-group", "hike", "hike")),
      ...["A", "A", "A"].map((c) => person(c, "small-group", "hike", "hike")),
    ];

    const result = makeMatches(signups);

    expectValid(result, signups);
  });

  it("doesn't put one-on-one people in a group, even if they'd be left out", () => {
    const solo = person("A", "one-on-one", "hike", "hike");
    const g = ["B", "C", "D"].map((c) => person(c, "small-group", "hike", "hike"));
    const signups = [solo, ...g];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(result.waitlist).toEqual([solo]);
  });

  it("makes groups, not only pairs, when everyone answered either", () => {
    const alike = ["A", "B", "C", "D"].map((c) => person(c, "either", "out-dancing", "food-crawl"));
    const signups = [...alike];

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(groupsOf(result)).toEqual([ids(alike)]);
  });

  it("matches everyone in a realistic mix", () => {
    const formats = ["one-on-one", "small-group", "either"];
    const signups = SAMPLE_SIGNUPS.map((s, i) => ({ ...s, answers: { ...s.answers, "meet-format": formats[i % 3]! } }));

    const result = makeMatches(signups);

    expectValid(result, signups);
    expect(result.waitlist).toEqual([]);
  });
});
