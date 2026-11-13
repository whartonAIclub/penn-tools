import { describe, it, expect } from "vitest";
import { formMatches } from "../matches.js";
import type { GroupingResult, Signup } from "../../types.js";

let nextId = 1;
/** A made-up sign-up: their cohort, how they'd like to meet, and four fun answers. */
function person(cohort: string, format: string | null, fun: [string, string, string, string]): Signup {
  const id = String(nextId++);
  const [friday, freeDay, party, friend] = fun;
  return {
    id,
    name: `Student ${id}`,
    email: `student${id}@wharton.upenn.edu`,
    cohort,
    answers: {
      ...(format && { "meet-format": format }),
      "friday-midnight": friday,
      "free-day": freeDay,
      "party-style": party,
      "friend-value": friend,
    },
  };
}

const nightOwl: [string, string, string, string] = ["out-dancing", "food-crawl", "dance-floor", "makes-me-laugh"];
const deepTalker: [string, string, string, string] = ["rooftop-talk", "museum", "kitchen-chat", "honest"];
/** Shares exactly one answer (food crawl) with nightOwl, and none with deepTalker. */
const oneInCommon: [string, string, string, string] = ["board-games", "food-crawl", "hosting", "pushes-me"];

const pairsOf = (result: GroupingResult) => result.groups.filter((g) => g.members.length === 2);
const groupsOf = (result: GroupingResult) => result.groups.filter((g) => g.members.length > 2);
const ids = (people: readonly Signup[]) => people.map((p) => p.id).sort();

describe("formMatches", () => {
  it("pairs people who asked for one-on-one, best matches first", () => {
    const a = person("A", "one-on-one", nightOwl);
    const b = person("B", "one-on-one", deepTalker);
    const c = person("C", "one-on-one", nightOwl);
    const d = person("D", "one-on-one", deepTalker);

    const result = formMatches([a, b, c, d]);

    expect(pairsOf(result).map((p) => ids(p.members)).sort()).toEqual([ids([a, c]), ids([b, d])].sort());
    expect(result.waitlist).toEqual([]);
  });

  it("doesn't pair people who share fewer than 2 answers, or share a cohort", () => {
    const a = person("A", "one-on-one", nightOwl);
    const b = person("B", "one-on-one", oneInCommon);
    const c = person("C", "one-on-one", deepTalker);
    const sameCohortTwin = person("C", "one-on-one", deepTalker);

    const result = formMatches([a, b, c, sameCohortTwin]);

    expect(result.groups).toEqual([]);
    expect(ids(result.waitlist)).toEqual(ids([a, b, c, sameCohortTwin]));
  });

  it("waitlists the odd one out rather than putting them in a group", () => {
    const pair = [person("A", "one-on-one", nightOwl), person("B", "one-on-one", nightOwl)];
    const odd = person("C", "one-on-one", deepTalker);
    const groupers = ["D", "E", "F"].map((c) => person(c, "small-group", deepTalker));

    const result = formMatches([...pair, odd, ...groupers]);

    expect(pairsOf(result).map((p) => ids(p.members))).toEqual([ids(pair)]);
    expect(groupsOf(result).map((g) => ids(g.members))).toEqual([ids(groupers)]);
    expect(result.waitlist).toEqual([odd]);
  });

  it("uses the best-matching 'Either' person to even out the pairs, and puts other 'Either' people in groups", () => {
    const pair = [person("A", "one-on-one", nightOwl), person("B", "one-on-one", nightOwl)];
    const odd = person("C", "one-on-one", deepTalker);
    const goodPartner = person("D", "either", deepTalker);
    const otherEither = person("E", "either", nightOwl);
    const groupers = [person("F", "small-group", nightOwl), person("G", "small-group", nightOwl)];

    const result = formMatches([...pair, odd, otherEither, goodPartner, ...groupers]);

    expect(pairsOf(result).map((p) => ids(p.members)).sort()).toEqual([ids(pair), ids([odd, goodPartner])].sort());
    expect(groupsOf(result).map((g) => ids(g.members))).toEqual([ids([otherEither, ...groupers])]);
    expect(result.waitlist).toEqual([]);
  });

  it("puts an 'Either' person without a good partner in a group instead", () => {
    const odd = person("A", "one-on-one", nightOwl);
    const either = person("B", "either", deepTalker);
    const groupers = ["C", "D"].map((c) => person(c, "small-group", deepTalker));

    const result = formMatches([odd, either, ...groupers]);

    expect(pairsOf(result)).toEqual([]);
    expect(groupsOf(result).map((g) => ids(g.members))).toEqual([ids([either, ...groupers])]);
    expect(result.waitlist).toEqual([odd]);
  });

  it("treats people who didn't answer how they'd like to meet as wanting a group", () => {
    const people = ["A", "B", "C"].map((c) => person(c, null, nightOwl));

    const result = formMatches(people);

    expect(groupsOf(result).map((g) => ids(g.members))).toEqual([ids(people)]);
  });
});
