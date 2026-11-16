import { describe, expect, it } from "vitest";
import { industryCounts, isIndustry, PEOPLE, searchByIndustry, type Person } from "../index.js";

const person = (id: string, name: string, classYear: number, program: string, industries: string[]): Person => ({
  id, name, classYear, program, isAlumni: classYear <= 2026, currentEmployer: "X", currentTitle: "Y", industries,
});

// Made-up people for the search rules; PEOPLE (the generated data) is checked separately below.
const FIXTURE: Person[] = [
  person("a", "Alex Sample", 2025, "FT MBA", ["Consulting", "Financial Services: Private Equity/Buyouts/Other"]),
  person("b", "Bailey Example", 2024, "WEMBA", ["Consulting"]),
  person("c", "Casey Placeholder", 2025, "FT MBA", ["Health Care: Digital Health"]),
];

describe("searchByIndustry", () => {
  it("returns people who worked in the industry, newest class first", () => {
    expect(searchByIndustry(FIXTURE, "Consulting").map((p) => p.name)).toEqual(["Alex Sample", "Bailey Example"]);
  });

  it("filters by program and class year", () => {
    expect(searchByIndustry(FIXTURE, "Consulting", { program: "WEMBA" }).map((p) => p.name)).toEqual(["Bailey Example"]);
    expect(searchByIndustry(FIXTURE, "Consulting", { classYear: 2025 }).map((p) => p.name)).toEqual(["Alex Sample"]);
  });

  it("returns nothing for an industry nobody worked in", () => {
    expect(searchByIndustry(FIXTURE, "Real Estate")).toEqual([]);
  });
});

describe("industryCounts", () => {
  it("counts each person once per industry", () => {
    expect(industryCounts(FIXTURE)).toEqual({
      Consulting: 2,
      "Financial Services: Private Equity/Buyouts/Other": 1,
      "Health Care: Digital Health": 1,
    });
  });
});

describe("PEOPLE (generated data)", () => {
  it("has people whose industries are all in the industry list", () => {
    expect(PEOPLE.length).toBeGreaterThan(0);
    for (const p of PEOPLE) {
      expect(p.industries.length).toBeGreaterThan(0);
      for (const i of p.industries) expect(isIndustry(i), `${p.name}: ${i}`).toBe(true);
    }
  });

  it("has unique ids", () => {
    expect(new Set(PEOPLE.map((p) => p.id)).size).toBe(PEOPLE.length);
  });
});
