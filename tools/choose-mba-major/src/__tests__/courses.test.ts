import { describe, it, expect } from "vitest";
import { buildCatalog, termLabel, type Course, type PennCoursePlanCourse } from "../courses.js";
import { migrateOneToFiveRatings, rankCourses, ratingOf, sanitizeRatings, sanitizeTaken, setRating, toggleTaken } from "../ratings.js";
import { CURRENT_CATALOG } from "../currentCatalog.js";

function raw(id: string, extra: Partial<PennCoursePlanCourse> = {}): PennCoursePlanCourse {
  return { id, title: `${id} title`, description: "About it.", semester: "2027A", num_sections: 1, credits: 1, ...extra };
}

describe("buildCatalog", () => {
  it("keeps Wharton MBA courses (6000–8999) with sections, sorted by code", () => {
    const catalog = buildCatalog(
      [
        raw("MGMT-6910", { title: " Negotiations ", credits: 0.5, num_sections: 3 }),
        raw("FNCE-7310"),
        raw("FNCE-1000"), // undergraduate
        raw("FNCE-9110"), // PhD
        raw("LAW-6100"), // not Wharton
        raw("MKTG-7110", { num_sections: 0 }), // nothing to take
        raw("ACCT-6130", { description: null }),
      ],
      { term: "2027A", updated: "2026-11-03" },
    );

    expect(catalog.term).toBe("2027A");
    expect(catalog.termLabel).toBe("Spring 2027");
    expect(catalog.courses.map((c) => c.code)).toEqual(["ACCT 6130", "FNCE 7310", "MGMT 6910"]);
    expect(catalog.courses[0]!.description).toBe("");
    expect(catalog.courses[2]).toEqual({
      code: "MGMT 6910",
      department: "MGMT",
      title: "Negotiations",
      description: "About it.",
      credits: 0.5,
      sections: 3,
    });
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
});

describe("ratings", () => {
  const course = (code: string): Course => ({
    code,
    department: code.slice(0, 4),
    title: code,
    description: "",
    credits: 1,
    sections: 1,
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
