import { describe, it, expect } from "vitest";
import { buildCatalog, termLabel, type PennCoursePlanCourse } from "../courses.js";
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
