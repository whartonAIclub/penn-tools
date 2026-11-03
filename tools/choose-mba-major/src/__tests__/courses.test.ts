import { describe, it, expect } from "vitest";
import { buildCatalog, termLabel, type Course, type PennCoursePlanCourse } from "../courses.js";
import { rankCourses, sanitizeRatings, setRating } from "../ratings.js";
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

  it("clears a rating", () => {
    expect(setRating({ "FNCE 7310": 4 }, "FNCE 7310", null)).toEqual({});
  });

  it("drops invalid stored ratings", () => {
    expect(sanitizeRatings({ a: 3, b: 7, c: "5", d: 1 })).toEqual({ a: 3, d: 1 });
    expect(sanitizeRatings("nope")).toEqual({});
  });
});
