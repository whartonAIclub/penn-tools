import { describe, it, expect, beforeEach } from "vitest";
import { upsertRecords, getHistory, getAllCourseIds, getSectionsForCourse, clearTerm, clearAll } from "../store.js";
import type { ClearingPriceRecord } from "../types.js";

function rec(courseId: string, section: string, term: string, price: number): ClearingPriceRecord {
  return {
    courseId,
    section,
    title: "Test Course",
    instructor: "Staff",
    creditUnits: 1,
    days: ["Mon"],
    quarter: "Q1",
    startTime: "09:00",
    endTime: "10:30",
    clearingPrice: price,
    term,
  };
}

beforeEach(() => clearAll());

describe("upsertRecords + getHistory", () => {
  it("stores and retrieves a record", () => {
    upsertRecords([rec("FNCE611", "001", "Spring2024", 400)]);
    const history = getHistory("FNCE611", "001");
    expect(history).toHaveLength(1);
    expect(history[0]!.clearingPrice).toBe(400);
  });

  it("returns empty array for unknown course", () => {
    expect(getHistory("UNKNOWN999", "001")).toEqual([]);
  });

  it("accumulates records across multiple terms", () => {
    upsertRecords([
      rec("FNCE611", "001", "Fall2022", 300),
      rec("FNCE611", "001", "Spring2023", 350),
      rec("FNCE611", "001", "Fall2023", 400),
    ]);
    expect(getHistory("FNCE611", "001")).toHaveLength(3);
  });

  it("replaces a record when the same term is upserted again", () => {
    upsertRecords([rec("FNCE611", "001", "Spring2024", 400)]);
    upsertRecords([rec("FNCE611", "001", "Spring2024", 500)]);
    const history = getHistory("FNCE611", "001");
    expect(history).toHaveLength(1);
    expect(history[0]!.clearingPrice).toBe(500);
  });

  it("keeps records sorted oldest to newest", () => {
    // Insert out of order
    upsertRecords([
      rec("FNCE611", "001", "Fall2023", 400),
      rec("FNCE611", "001", "Fall2022", 300),
      rec("FNCE611", "001", "Spring2023", 350),
    ]);
    const terms = getHistory("FNCE611", "001").map(r => r.term);
    expect(terms).toEqual(["Fall2022", "Spring2023", "Fall2023"]);
  });

  it("keeps sections isolated from each other", () => {
    upsertRecords([
      rec("FNCE611", "001", "Spring2024", 400),
      rec("FNCE611", "002", "Spring2024", 300),
    ]);
    expect(getHistory("FNCE611", "001")[0]!.clearingPrice).toBe(400);
    expect(getHistory("FNCE611", "002")[0]!.clearingPrice).toBe(300);
  });
});

describe("getSectionsForCourse", () => {
  it("returns all sections for a course", () => {
    upsertRecords([
      rec("FNCE611", "001", "Spring2024", 400),
      rec("FNCE611", "002", "Spring2024", 380),
      rec("FNCE611", "003", "Spring2024", 360),
    ]);
    const sections = getSectionsForCourse("FNCE611");
    expect(sections).toHaveLength(3);
    expect(sections).toContain("001");
    expect(sections).toContain("002");
    expect(sections).toContain("003");
  });

  it("returns empty array for unknown course", () => {
    expect(getSectionsForCourse("UNKNOWN999")).toEqual([]);
  });

  it("does not return sections from other courses", () => {
    upsertRecords([
      rec("FNCE611", "001", "Spring2024", 400),
      rec("MGMT611", "001", "Spring2024", 300),
    ]);
    expect(getSectionsForCourse("FNCE611")).toEqual(["001"]);
    expect(getSectionsForCourse("MGMT611")).toEqual(["001"]);
  });
});

describe("getAllCourseIds", () => {
  it("returns all unique course IDs sorted", () => {
    upsertRecords([
      rec("MKTG611", "001", "Spring2024", 300),
      rec("FNCE611", "001", "Spring2024", 400),
      rec("MGMT611", "001", "Spring2024", 250),
    ]);
    expect(getAllCourseIds()).toEqual(["FNCE611", "MGMT611", "MKTG611"]);
  });

  it("returns empty array when store is empty", () => {
    expect(getAllCourseIds()).toEqual([]);
  });
});

describe("clearTerm", () => {
  it("removes records for the given term only", () => {
    upsertRecords([
      rec("FNCE611", "001", "Fall2023", 380),
      rec("FNCE611", "001", "Spring2024", 400),
    ]);
    clearTerm("Fall2023");
    const history = getHistory("FNCE611", "001");
    expect(history).toHaveLength(1);
    expect(history[0]!.term).toBe("Spring2024");
  });

  it("removes the course key entirely when the only term is cleared", () => {
    upsertRecords([rec("FNCE611", "001", "Spring2024", 400)]);
    clearTerm("Spring2024");
    expect(getHistory("FNCE611", "001")).toHaveLength(0);
    expect(getAllCourseIds()).not.toContain("FNCE611");
  });
});

describe("term sort order", () => {
  it("sorts Fall before next Spring, Spring before same year Fall", () => {
    upsertRecords([
      rec("FNCE611", "001", "Spring2024", 400),
      rec("FNCE611", "001", "Fall2022",   300),
      rec("FNCE611", "001", "Fall2023",   380),
      rec("FNCE611", "001", "Spring2023", 350),
    ]);
    const terms = getHistory("FNCE611", "001").map(r => r.term);
    expect(terms).toEqual(["Fall2022", "Spring2023", "Fall2023", "Spring2024"]);
  });
});
