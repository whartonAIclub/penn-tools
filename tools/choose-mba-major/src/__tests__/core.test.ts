import { describe, it, expect } from "vitest";
import type { Course } from "../courses.js";
import { coreRequirementOf, isFixedCore, reservedForCore, WHARTON_CORE } from "../core.js";
import { candidateCourses } from "../individualized.js";
import { MAJORS, type Major } from "../majors.js";
import { fitMajor } from "../recommend.js";

function course(code: string, credits = 0.5, crossListed: string[] = []): Course {
  return {
    code,
    department: code.slice(0, 4),
    title: code,
    description: "",
    credits,
    sections: 1,
    crossListed,
    terms: ["Spring 2027"],
    sessions: ["Full"],
    rating: null,
    majorsOnly: [],
  };
}

const byId = (id: string) => MAJORS.find((m) => m.id === id)!;

describe("WHARTON_CORE", () => {
  it("has the 13 requirements Course Match lists, each course in one requirement", () => {
    expect(WHARTON_CORE).toHaveLength(13);
    const codes = WHARTON_CORE.flatMap((r) => r.courses);
    expect(new Set(codes).size).toBe(codes.length);
    expect(WHARTON_CORE.filter((r) => r.kind === "flex").map((r) => r.id)).toEqual(["oid"]);
  });

  it("finds a course's requirement under a cross-listed code", () => {
    expect(coreRequirementOf(course("MGMT 6900", 0.5, ["OIDD 6900"]))?.id).toBe("oid");
    expect(coreRequirementOf(course("FNCE 7050"))).toBeNull();
    expect(isFixedCore(course("BEPP 6110"))).toBe(true);
    expect(isFixedCore(course("OIDD 6110"))).toBe(false);
  });
});

describe("reservedForCore", () => {
  const entrepreneurship = byId("entrepreneurship");
  const oidCourses = [course("OIDD 6110"), course("OIDD 6140"), course("OIDD 6150"), course("OIDD 6620")];
  const courses = [course("FNCE 6110", 1), course("BEPP 6120"), ...oidCourses];

  it("sets aside every fixed-core course, and every OID flex course until taken courses meet the requirement", () => {
    expect([...reservedForCore(entrepreneurship, courses, new Set())].sort()).toEqual(
      ["BEPP 6120", "FNCE 6110", "OIDD 6110", "OIDD 6140", "OIDD 6150", "OIDD 6620"].sort(),
    );
  });

  it("once taken courses meet the OID requirement, sets aside those that don't help the major first", () => {
    // OIDD 6140 counts toward Entrepreneurship; OIDD 6110 and 6150 don't.
    const reserved = reservedForCore(entrepreneurship, courses, new Set(["OIDD 6110", "OIDD 6150", "OIDD 6140"]));
    expect(reserved.has("OIDD 6110")).toBe(true);
    expect(reserved.has("OIDD 6150")).toBe(true);
    expect(reserved.has("OIDD 6140")).toBe(false);
    expect(reserved.has("OIDD 6620")).toBe(false);
  });
});

describe("core courses and major fit", () => {
  it("never counts fixed core toward a major, even through a whole-department list", () => {
    const bepp = byId("bepp");
    const fit = fitMajor(bepp, [course("BEPP 6110"), course("BEPP 6120"), course("BEPP 7720")], {
      "BEPP 6110": 5,
      "BEPP 6120": 5,
      "BEPP 7720": 3,
    });
    expect(fit.plan.map((p) => p.course.code)).toEqual(["BEPP 7720"]);
  });

  it("counts an OID flex-core course toward a major only once other taken courses meet the core", () => {
    const entrepreneurship: Major = byId("entrepreneurship");
    const courses = [course("MGMT 8010"), course("OIDD 6140"), course("OIDD 6110"), course("OIDD 6150")];
    const ratings = { "OIDD 6140": 5 } as const;
    const plan = (taken: string[]) =>
      fitMajor(entrepreneurship, courses, ratings, { taken: new Set(taken) }).plan.map((p) => p.course.code);
    expect(plan([])).not.toContain("OIDD 6140");
    expect(plan(["OIDD 6110", "OIDD 6150"])).toContain("OIDD 6140");
  });

  it("lets a major that counts the flex core use it anyway", () => {
    const oid = byId("oid");
    const fit = fitMajor(oid, [course("OIDD 6110"), course("OIDD 6620")], { "OIDD 6110": 4, "OIDD 6620": 4 });
    expect(fit.plan.map((p) => p.course.code).sort()).toEqual(["OIDD 6110", "OIDD 6620"]);
  });

  it("keeps Business Analytics' required OIDD courses, which its own total includes", () => {
    const fit = fitMajor(byId("business-analytics"), [course("OIDD 6120"), course("OIDD 6150")], { "OIDD 6150": 4 });
    expect(fit.plan.map((p) => p.course.code)).toEqual(["OIDD 6120", "OIDD 6150"]);
  });
});

describe("individualized major", () => {
  it("doesn't offer fixed-core courses for the plan", () => {
    const courses = [course("FNCE 6110", 1), course("MGMT 6100"), course("OIDD 6620"), course("FNCE 7050", 1)];
    const ratings = { "FNCE 6110": 5, "MGMT 6100": 4, "OIDD 6620": 3, "FNCE 7050": 2 } as const;
    expect(candidateCourses(courses, ratings).map((c) => c.course.code)).toEqual(["OIDD 6620", "FNCE 7050"]);
  });
});
