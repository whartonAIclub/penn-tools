import { describe, it, expect } from "vitest";
import { MAJORS, courseCodes, groupIncludes, majorIncludes } from "../majors.js";

const byId = new Map(MAJORS.map((m) => [m.id, m]));

describe("MAJORS", () => {
  it("has unique ids", () => {
    expect(byId.size).toBe(MAJORS.length);
  });

  it("writes every course code as DEPT 1234", () => {
    for (const major of MAJORS) {
      for (const group of major.groups) {
        for (const entry of group.courses ?? []) {
          for (const code of courseCodes(entry)) expect(code, `${major.id}: ${entry}`).toMatch(/^[A-Z]{3,4} \d{4}$/);
        }
      }
    }
  });

  it("asks for no more from its groups than the major's total", () => {
    for (const major of MAJORS) {
      const minimum = major.groups.reduce((sum, g) => sum + g.minCredits, 0);
      expect(minimum, major.id).toBeLessThanOrEqual(major.credits);
    }
  });

  it("records combination limits on both majors", () => {
    for (const major of MAJORS) {
      for (const other of major.cannotCombineWith) {
        expect(byId.get(other)?.cannotCombineWith, `${major.id} / ${other}`).toContain(major.id);
      }
    }
  });
});

describe("groupIncludes", () => {
  const finance = byId.get("finance")!;
  const management = byId.get("management")!;

  it("matches listed courses by any cross-listed code", () => {
    const realEstate = byId.get("real-estate")!;
    expect(majorIncludes(realEstate, "FNCE 7210")).toBe(true);
    expect(majorIncludes(realEstate, "REAL 7210")).toBe(true);
  });

  it("matches department-wide groups, honoring minimum numbers and exclusions", () => {
    const electives = finance.groups[1]!;
    expect(groupIncludes(electives, "FNCE 7310")).toBe(true);
    expect(groupIncludes(electives, "FNCE 6110")).toBe(false);
    expect(majorIncludes(management, "MGMT 7210")).toBe(true);
    expect(majorIncludes(management, "MGMT 6110")).toBe(false);
  });
});
