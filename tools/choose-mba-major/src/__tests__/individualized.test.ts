import { describe, it, expect } from "vitest";
import type { Course } from "../courses.js";
import type { Major } from "../majors.js";
import {
  EMPTY_DRAFT,
  INDIVIDUALIZED_MAX_CREDITS,
  candidateCourses,
  checkDraft,
  isReady,
  majorOverlaps,
  planCourses,
  sanitizeDraft,
  toggleCourse,
  totalCredits,
  type IndividualizedDraft,
} from "../individualized.js";

function course(code: string, credits: number | null = 1): Course {
  return { code, department: code.slice(0, 4), title: code, description: "", credits, sections: 1, crossListed: [], terms: ["Spring 2027"], sessions: ["Full"], rating: null, majorsOnly: [] };
}

const courses = [course("HCMG 8410"), course("OIDD 6530", 0.5), course("STAT 7050"), course("FNCE 7050"), course("MGMT 8010", null)];

const finance: Major = {
  id: "finance",
  name: "Finance",
  credits: 6,
  groups: [
    { label: "Core", courses: ["FNCE 6110"], minCredits: 1, required: true, core: true },
    { label: "Electives", departments: [{ department: "FNCE", minNumber: 7000 }], minCredits: 4 },
  ],
  cannotCombineWith: [],
  notes: [],
  source: "",
};

const healthcare: Major = {
  id: "healthcare",
  name: "Health Care Management",
  credits: 4,
  groups: [
    { label: "Core", courses: ["STAT 7050"], minCredits: 1, core: true },
    { label: "Electives", courses: ["HCMG 8410", "OIDD 6530"], minCredits: 3 },
  ],
  cannotCombineWith: [],
  notes: [],
  source: "",
};

function draft(overrides: Partial<IndividualizedDraft> = {}): IndividualizedDraft {
  return { ...EMPTY_DRAFT, ...overrides };
}

describe("sanitizeDraft", () => {
  it("keeps a valid draft", () => {
    const value = { title: "Health Ops", theme: "Care delivery", courses: ["HCMG 8410"], alignments: { "HCMG 8410": "Fits" } };
    expect(sanitizeDraft(value)).toEqual(value);
  });

  it("drops anything malformed, e.g. from old or tampered storage", () => {
    expect(sanitizeDraft(null)).toEqual(EMPTY_DRAFT);
    expect(sanitizeDraft("nope")).toEqual(EMPTY_DRAFT);
    expect(
      sanitizeDraft({ title: 4, theme: null, courses: ["A", 3, "A"], alignments: { A: "ok", B: 7 } }),
    ).toEqual({ title: "", theme: "", courses: ["A"], alignments: { A: "ok" } });
  });

  it("cuts text that's too long", () => {
    expect(sanitizeDraft({ title: "x".repeat(500) }).title.length).toBe(150);
  });
});

describe("toggleCourse", () => {
  it("adds a course at the end, and removes it when toggled again", () => {
    const added = toggleCourse(draft({ courses: ["A"] }), "B");
    expect(added.courses).toEqual(["A", "B"]);
    expect(toggleCourse(added, "A").courses).toEqual(["B"]);
  });
});

describe("candidateCourses", () => {
  it("offers courses rated above 0, favorites first", () => {
    const ratings = { "HCMG 8410": 3, "OIDD 6530": 5, "STAT 7050": 1 } as const;
    expect(candidateCourses(courses, ratings).map((r) => r.course.code)).toEqual(["OIDD 6530", "HCMG 8410", "STAT 7050"]);
  });

  it("also offers courses the student is taking or has taken, even at 0", () => {
    const candidates = candidateCourses(courses, { "OIDD 6530": 5 }, new Set(["FNCE 7050", "OIDD 6530"]));
    expect(candidates.map((r) => [r.course.code, r.rating, r.taken])).toEqual([
      ["OIDD 6530", 5, true],
      ["FNCE 7050", 0, true],
    ]);
  });
});

describe("planCourses and totalCredits", () => {
  it("keeps plan order, skips codes no longer offered, and counts a course with no credits as 1 CU", () => {
    const plan = planCourses(draft({ courses: ["MGMT 8010", "GONE 1000", "OIDD 6530"] }), courses);
    expect(plan.map((c) => c.code)).toEqual(["MGMT 8010", "OIDD 6530"]);
    expect(totalCredits(plan)).toBe(1.5);
  });
});

describe("majorOverlaps", () => {
  it("measures how much of the plan counts toward each major's non-core courses", () => {
    const plan = planCourses(draft({ courses: ["HCMG 8410", "OIDD 6530", "STAT 7050", "FNCE 7050"] }), courses);
    const overlaps = majorOverlaps(plan, [finance, healthcare]);
    // 3.5 CU in all; STAT 7050 is only in Health Care's core, so it doesn't count.
    expect(overlaps.map((o) => [o.major.id, o.credits])).toEqual([
      ["healthcare", 1.5],
      ["finance", 1],
    ]);
    expect(overlaps[0]!.share).toBeCloseTo(1.5 / 3.5);
  });

  it("is empty for an empty plan", () => {
    expect(majorOverlaps([], [finance])).toEqual([]);
  });
});

describe("checkDraft", () => {
  it("lists what an empty draft is missing", () => {
    const requirements = checkDraft(EMPTY_DRAFT, courses);
    expect(requirements.map((r) => [r.id, r.met])).toEqual([
      ["theme", false],
      ["title", false],
      ["courses", false],
      ["alignment", false],
    ]);
    expect(isReady(requirements)).toBe(false);
  });

  it("names the courses still missing an alignment statement, ignoring blank ones", () => {
    const requirements = checkDraft(
      draft({ courses: ["HCMG 8410", "OIDD 6530"], alignments: { "HCMG 8410": "Fits", "OIDD 6530": "   " } }),
      courses,
    );
    expect(requirements.find((r) => r.id === "alignment")).toMatchObject({ met: false, detail: "Write a statement for OIDD 6530." });
  });

  it("is ready when every requirement is met", () => {
    const requirements = checkDraft(
      draft({
        title: "Health Care Operations",
        theme: "Running care delivery well",
        courses: ["HCMG 8410", "OIDD 6530"],
        alignments: { "HCMG 8410": "Fits", "OIDD 6530": "Also fits" },
      }),
      courses,
    );
    expect(requirements.every((r) => r.met)).toBe(true);
    expect(isReady(requirements)).toBe(true);
  });

  it(`fails a plan over ${INDIVIDUALIZED_MAX_CREDITS} CU`, () => {
    const many = Array.from({ length: 22 }, (_, i) => course(`MGMT ${8100 + i}`));
    const requirements = checkDraft(draft({ courses: many.map((c) => c.code) }), many);
    expect(requirements.find((r) => r.id === "courses")).toMatchObject({ met: false, detail: "22 CU is over the 21 CU maximum." });
  });
});
