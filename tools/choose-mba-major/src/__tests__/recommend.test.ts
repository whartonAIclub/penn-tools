import { describe, it, expect } from "vitest";
import type { Course } from "../courses.js";
import type { Major } from "../majors.js";
import type { Ratings } from "../ratings.js";
import { bestPair, fitMajor, recommendMajors } from "../recommend.js";

function course(code: string, credits = 1): Course {
  return { code, department: code.slice(0, 4), title: code, description: "", credits, sections: 1 };
}

const courses = [
  course("REAL 7210"),
  course("REAL 7240"),
  course("REAL 8400"),
  course("REAL 8700", 0.5),
  course("REAL 8910", 0.5),
  course("FNCE 6110"),
  course("FNCE 7050"),
  course("FNCE 7170"),
  course("FNCE 7310"),
  course("FNCE 7500"),
];

const realEstate: Major = {
  id: "real-estate",
  name: "Real Estate",
  credits: 5,
  groups: [
    { label: "Required", courses: ["REAL 7210 / FNCE 7210", "REAL 8210"], minCredits: 2, required: true },
    { label: "Electives", courses: ["REAL 7240", "REAL 8400", "REAL 8700", "REAL 8910"], minCredits: 3 },
  ],
  cannotCombineWith: [],
  notes: [],
  source: "",
};

const finance: Major = {
  id: "finance",
  name: "Finance",
  credits: 6,
  groups: [
    { label: "Core", courses: ["FNCE 6110", "FNCE 6130"], minCredits: 2, required: true, core: true },
    { label: "Electives", departments: [{ department: "FNCE", minNumber: 7000 }], minCredits: 4 },
  ],
  cannotCombineWith: ["quant-finance"],
  notes: [],
  source: "",
};

const capped: Major = {
  id: "capped",
  name: "Capped",
  credits: 2,
  groups: [
    { label: "Main", courses: ["FNCE 7050"], minCredits: 1 },
    { label: "Side", courses: ["FNCE 7170", "FNCE 7310"], minCredits: 0, maxCredits: 1 },
  ],
  cannotCombineWith: ["finance"],
  notes: [],
  source: "",
};

describe("fitMajor", () => {
  it("takes required courses, then favorites, and reports what's missing", () => {
    // REAL 8910 is at 0 (not rated), so it's never chosen.
    const ratings: Ratings = { "REAL 7210": 5, "REAL 7240": 4, "REAL 8700": 5 };
    const fit = fitMajor(realEstate, courses, ratings);

    expect(fit.plan.map((p) => [p.course.code, p.required])).toEqual([
      ["REAL 7210", true],
      ["REAL 8700", false],
      ["REAL 7240", false],
    ]);
    expect(fit.requiredNotOffered).toEqual(["REAL 8210"]);
    expect(fit.gaps).toEqual([
      { label: "Required", credits: 1 },
      { label: "Electives", credits: 1.5 },
    ]);
    // (5×1 + 5×0.5 + 4×1) / (5 × 5)
    expect(fit.score).toBeCloseTo(11.5 / 25);
  });

  it("leaves core courses out of the plan and the total", () => {
    const fit = fitMajor(finance, courses, { "FNCE 6110": 5, "FNCE 7050": 5, "FNCE 7170": 3 });
    expect(fit.targetCredits).toBe(4);
    expect(fit.plan.map((p) => p.course.code)).toEqual(["FNCE 7050", "FNCE 7170"]);
    expect(fit.score).toBeCloseTo(8 / 20);
  });

  it("never goes past a group's cap", () => {
    const fit = fitMajor(capped, courses, { "FNCE 7050": 2, "FNCE 7170": 5, "FNCE 7310": 5 });
    expect(fit.plan.map((p) => p.course.code)).toEqual(["FNCE 7050", "FNCE 7170"]);
  });

  it("doesn't fill a group's unmet minimum with other courses", () => {
    const split: Major = {
      ...capped,
      credits: 3,
      groups: [
        { label: "A", courses: ["FNCE 7050", "FNCE 7170", "FNCE 7310"], minCredits: 1 },
        { label: "B", courses: ["REAL 7240"], minCredits: 2 },
      ],
    };
    const fit = fitMajor(split, courses, { "FNCE 7050": 5, "FNCE 7170": 5, "FNCE 7310": 5, "REAL 7240": 4 });
    expect(fit.plan.map((p) => p.course.code)).toEqual(["FNCE 7050", "REAL 7240"]);
    expect(fit.gaps).toEqual([{ label: "B", credits: 1 }]);
  });

  it("scores a major with nothing rated as 0", () => {
    expect(fitMajor(finance, courses, {}).score).toBe(0);
  });

  it("chooses courses rated 1 (slightly interested)", () => {
    expect(fitMajor(capped, courses, { "FNCE 7050": 1 }).plan.map((p) => p.course.code)).toEqual(["FNCE 7050"]);
  });

  it("puts courses the student is taking or has taken in first, counted as a 5, whatever their rating", () => {
    const fit = fitMajor(finance, courses, { "FNCE 7050": 5, "FNCE 7170": 4, "FNCE 7310": 4 }, {
      taken: new Set(["FNCE 7500", "FNCE 6110"]),
    });
    // FNCE 6110 is core, so it stays out even though it's taken.
    expect(fit.plan.map((p) => [p.course.code, p.taken])).toEqual([
      ["FNCE 7500", true],
      ["FNCE 7050", false],
      ["FNCE 7170", false],
      ["FNCE 7310", false],
    ]);
    // (5 + 5 + 4 + 4) / (5 × 4)
    expect(fit.score).toBeCloseTo(18 / 20);
  });

  it("doesn't place a taken course past a group's cap", () => {
    const fit = fitMajor(capped, courses, {}, { taken: new Set(["FNCE 7170", "FNCE 7310"]) });
    expect(fit.plan.map((p) => p.course.code)).toEqual(["FNCE 7170"]);
  });
});

describe("recommendMajors and bestPair", () => {
  const ratings: Ratings = { "FNCE 7050": 5, "FNCE 7170": 5, "FNCE 7310": 4, "FNCE 7500": 4, "REAL 7210": 3 };

  it("ranks majors by fit", () => {
    expect(recommendMajors(courses, ratings, [realEstate, finance]).map((f) => f.major.id)).toEqual([
      "finance",
      "real-estate",
    ]);
  });

  it("skips majors that can't be combined and limits shared courses", () => {
    const fits = recommendMajors(courses, ratings, [finance, capped, realEstate]);
    const pair = bestPair(fits, courses, ratings)!;
    const ids = [pair.first.major.id, pair.second.major.id].sort();
    expect(ids).not.toEqual(["capped", "finance"]);
    expect(pair.sharedCredits).toBeLessThanOrEqual(2);
  });

  it("lifts a major the student has taken courses toward", () => {
    const realEstateScore = (taken?: Set<string>) =>
      recommendMajors(courses, ratings, [realEstate, finance], taken).find((f) => f.major.id === "real-estate")!.score;
    // REAL 7210 rated 3: 3 / 25. With two taken electives: (3 + 5 + 5) / 25.
    expect(realEstateScore()).toBeCloseTo(3 / 25);
    expect(realEstateScore(new Set(["REAL 7240", "REAL 8400"]))).toBeCloseTo(13 / 25);
  });
});
