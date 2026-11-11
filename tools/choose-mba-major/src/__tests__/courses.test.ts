import { describe, it, expect } from "vitest";
import { buildCatalog, courseCodesOf, termLabel, type Course, type CourseMatchCourse } from "../courses.js";
import { migrateOneToFiveRatings, rankCourses, ratingOf, sanitizeRatings, sanitizeTaken, setRating, toggleTaken } from "../ratings.js";
import { CURRENT_CATALOG } from "../currentCatalog.js";

function listed(code: string, extra: Partial<CourseMatchCourse> = {}): CourseMatchCourse {
  return {
    code,
    title: `${code} title`,
    credits: 1,
    sections: 1,
    sessions: ["Full"],
    crossListed: [],
    description: `About ${code}.`,
    rating: null,
    ...extra,
  };
}

describe("buildCatalog", () => {
  const fall = {
    term: "2026C",
    pulled: "2026-11-10",
    courses: [
      listed("FNCE 7050", { title: "Investment Mgmt (old title)", rating: 3.1, sessions: ["Q1"] }),
      listed("ACCT 6110", { rating: 2.9 }),
      listed("LGST 8060", { title: "Negotiations", sections: 3, crossListed: ["MGMT 6910", "OIDD 6910"] }),
      listed("MGMT 6910", { title: "Negotiations", crossListed: ["LGST 8060", "OIDD 6910"] }),
      listed("MKTG 7340", { title: "BW: Creativity", sessions: ["Modular"] }),
    ],
  };
  const spring = {
    term: "2027A",
    pulled: "2026-11-02",
    courses: [
      listed("FNCE 7050", { title: "Investment Management", sections: 2, rating: null }),
      listed("MKTG 7760", { crossListed: ["STAT 7760"], rating: 3.6857, description: "" }),
    ],
  };
  const catalog = buildCatalog([spring, fall], "Wharton Course Match");

  it("combines the semesters in order, newest list date as updated", () => {
    expect(catalog.terms).toEqual([
      { term: "2026C", label: "Fall 2026" },
      { term: "2027A", label: "Spring 2027" },
    ]);
    expect(catalog.termLabel).toBe("Fall 2026 and Spring 2027");
    expect(catalog.updated).toBe("2026-11-10");
    expect(catalog.source).toBe("Wharton Course Match");
  });

  it("makes one course of each course offered in both semesters, using the latest semester's details", () => {
    expect(catalog.courses.find((c) => c.code === "FNCE 7050")).toEqual({
      code: "FNCE 7050",
      department: "FNCE",
      title: "Investment Management",
      description: "About FNCE 7050.",
      credits: 1,
      sections: 3,
      crossListed: [],
      terms: ["Fall 2026", "Spring 2027"],
      sessions: ["Full", "Q1"],
      // Spring has no rating, so fall's is kept.
      rating: 3.1,
    });
  });

  it("joins cross-listed listings into one course, leaves out block week, and sorts by code", () => {
    expect(catalog.courses.map((c) => c.code)).toEqual(["ACCT 6110", "FNCE 7050", "LGST 8060", "MKTG 7760"]);
    const negotiations = catalog.courses.find((c) => c.code === "LGST 8060")!;
    expect(negotiations.crossListed).toEqual(["MGMT 6910", "OIDD 6910"]);
    expect(negotiations.sections).toBe(4);
    expect(courseCodesOf(negotiations)).toEqual(["LGST 8060", "MGMT 6910", "OIDD 6910"]);
  });

  it("rounds ratings to two decimals and keeps an empty description empty", () => {
    const mktg = catalog.courses.find((c) => c.code === "MKTG 7760")!;
    expect(mktg.rating).toBe(3.69);
    expect(mktg.description).toBe("");
    expect(mktg.crossListed).toEqual(["STAT 7760"]);
  });

  it("labels terms", () => {
    expect(termLabel("2027C")).toBe("Fall 2027");
    expect(termLabel("odd")).toBe("odd");
  });
});

describe("CURRENT_CATALOG", () => {
  it("has unique MBA course codes", () => {
    const codes = CURRENT_CATALOG.courses.map((c) => c.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("lists each course once, never also under a cross-listed code", () => {
    const codes = new Set(CURRENT_CATALOG.courses.map((c) => c.code));
    const doubled = CURRENT_CATALOG.courses.flatMap((c) => c.crossListed.filter((code) => codes.has(code)));
    expect(doubled).toEqual([]);
  });

  it("covers a fall and a spring semester from Course Match", () => {
    expect(CURRENT_CATALOG.terms.map((t) => t.term)).toEqual(["2026C", "2027A"]);
    expect(CURRENT_CATALOG.courses.every((c) => c.terms.length > 0)).toBe(true);
  });
});

describe("ratings", () => {
  const course = (code: string): Course => ({
    code,
    department: code.slice(0, 4),
    title: code,
    description: "",
    credits: 1,
    sections: 1,
    crossListed: [],
    terms: ["Spring 2027"],
    sessions: ["Full"],
    rating: null,
  });
  const courses = [course("ACCT 7470"), course("FNCE 7310"), course("MGMT 6910")];

  it("ranks rated courses highest first, ties by code, ignoring unknown codes", () => {
    let ratings = setRating({}, "MGMT 6910", 5);
    ratings = setRating(ratings, "ACCT 7470", 3);
    ratings = setRating(ratings, "FNCE 7310", 5);
    ratings = setRating(ratings, "STAT 9999", 4);
    expect(rankCourses(courses, ratings).map((r) => [r.course.code, r.rating])).toEqual([
      ["FNCE 7310", 5],
      ["MGMT 6910", 5],
      ["ACCT 7470", 3],
    ]);
  });

  it("puts a course back at 0", () => {
    expect(setRating({ "FNCE 7310": 4 }, "FNCE 7310", null)).toEqual({});
    expect(setRating({ "FNCE 7310": 4 }, "FNCE 7310", 0)).toEqual({});
  });

  it("treats a course with no rating as 0, and leaves 0s out of the ranking", () => {
    expect(ratingOf({}, "FNCE 7310")).toBe(0);
    expect(rankCourses(courses, { "FNCE 7310": 0 })).toEqual([]);
  });

  it("drops invalid stored ratings, and 0s, which are the default", () => {
    expect(sanitizeRatings({ a: 3, b: 7, c: "5", d: 1, e: 0 })).toEqual({ a: 3, d: 1 });
    expect(sanitizeRatings("nope")).toEqual({});
  });

  it("moves ratings from the old 1–5 scale to 0–5", () => {
    expect(migrateOneToFiveRatings({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 9 })).toEqual({ b: 1, c: 3, d: 4, e: 5 });
  });

  it("marks and unmarks courses as taking or taken", () => {
    const taken = toggleTaken(new Set(), "FNCE 7310");
    expect([...taken]).toEqual(["FNCE 7310"]);
    expect([...toggleTaken(taken, "FNCE 7310")]).toEqual([]);
    expect([...sanitizeTaken(["FNCE 7310", 4, null])]).toEqual(["FNCE 7310"]);
    expect([...sanitizeTaken("nope")]).toEqual([]);
  });
});
