import { describe, it, expect } from "vitest";
import { addDays, isDate } from "../debrief.js";

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addDays("2026-02-20", 10)).toBe("2026-03-02");
  });
});

describe("isDate", () => {
  it("accepts real YYYY-MM-DD dates only", () => {
    expect(isDate("2026-11-16")).toBe(true);
    expect(isDate("2026-13-40")).toBe(false);
    expect(isDate("11/16/2026")).toBe(false);
    expect(isDate("")).toBe(false);
  });
});
