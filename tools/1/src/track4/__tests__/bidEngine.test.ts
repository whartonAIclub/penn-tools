import { describe, it, expect } from "vitest";
import { computeBidGuidance, getBidGuidanceForBundle } from "../bidEngine.js";
import { upsertRecords, clearAll } from "../store.js";
import type { ClearingPriceRecord } from "../types.js";

// Minimal valid record factory
function rec(overrides: Partial<ClearingPriceRecord> & { term: string; clearingPrice: number }): ClearingPriceRecord {
  return {
    courseId: "FNCE611",
    section: "001",
    title: "Corporate Finance",
    instructor: "Staff",
    creditUnits: 1,
    days: ["Mon", "Wed"],
    quarter: "Q1",
    startTime: "10:30",
    endTime: "12:00",
    ...overrides,
  };
}

describe("computeBidGuidance", () => {
  it("returns null for empty history", () => {
    expect(computeBidGuidance("FNCE611", "001", [])).toBeNull();
  });

  it("rising + low volatility → competitive tier", () => {
    // Prices increase steadily, CV < 0.10
    const history = [
      rec({ term: "Fall2022", clearingPrice: 300 }),
      rec({ term: "Spring2023", clearingPrice: 310 }),
      rec({ term: "Fall2023", clearingPrice: 320 }),
      rec({ term: "Spring2024", clearingPrice: 330 }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result).not.toBeNull();
    expect(result!.trend).toBe("rising");
    expect(result!.volatility).toBe("low");
    expect(result!.tier).toBe("competitive");
    expect(result!.thresholds.competitive).toBeGreaterThan(330); // projected above last price
  });

  it("falling + low volatility → reach tier", () => {
    const history = [
      rec({ term: "Fall2022", clearingPrice: 400 }),
      rec({ term: "Spring2023", clearingPrice: 380 }),
      rec({ term: "Fall2023", clearingPrice: 360 }),
      rec({ term: "Spring2024", clearingPrice: 340 }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result!.trend).toBe("falling");
    expect(result!.volatility).toBe("low");
    expect(result!.tier).toBe("reach");
    expect(result!.thresholds.competitive).toBeLessThan(340); // projected below last price
  });

  it("stable + high volatility → safe tier", () => {
    // Prices oscillate wildly with no net trend
    const history = [
      rec({ term: "Fall2022", clearingPrice: 200 }),
      rec({ term: "Spring2023", clearingPrice: 400 }),
      rec({ term: "Fall2023", clearingPrice: 100 }),
      rec({ term: "Spring2024", clearingPrice: 300 }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result!.trend).toBe("stable");
    expect(result!.volatility).toBe("high");
    expect(result!.tier).toBe("safe");
    expect(result!.thresholds.safe).toBeGreaterThan(result!.thresholds.competitive);
  });

  it("single term → stable trend (not enough data)", () => {
    const history = [rec({ term: "Spring2024", clearingPrice: 400 })];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result!.trend).toBe("stable");
  });

  it("thresholds are ordered safe > competitive > reach", () => {
    const history = [
      rec({ term: "Fall2022", clearingPrice: 300 }),
      rec({ term: "Spring2023", clearingPrice: 350 }),
      rec({ term: "Fall2023", clearingPrice: 400 }),
      rec({ term: "Spring2024", clearingPrice: 450 }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result!.thresholds.safe).toBeGreaterThanOrEqual(result!.thresholds.competitive);
    expect(result!.thresholds.competitive).toBeGreaterThanOrEqual(result!.thresholds.reach);
  });

  it("thresholds are never below 0 or above 5000", () => {
    const history = [
      rec({ term: "Fall2022", clearingPrice: 5 }),
      rec({ term: "Spring2023", clearingPrice: 10 }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result!.thresholds.reach).toBeGreaterThanOrEqual(0);
    expect(result!.thresholds.safe).toBeLessThanOrEqual(5000);
  });

  it("historicalPrices are ordered oldest to newest", () => {
    const history = [
      rec({ term: "Fall2022", clearingPrice: 300 }),
      rec({ term: "Spring2023", clearingPrice: 350 }),
      rec({ term: "Fall2023", clearingPrice: 400 }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    const terms = result!.historicalPrices.map(h => h.term);
    expect(terms).toEqual(["Fall2022", "Spring2023", "Fall2023"]);
  });

  it("title comes from the most recent record", () => {
    const history = [
      rec({ term: "Fall2022", clearingPrice: 300, title: "Old Title" }),
      rec({ term: "Spring2024", clearingPrice: 400, title: "New Title" }),
    ];
    const result = computeBidGuidance("FNCE611", "001", history);
    expect(result!.title).toBe("New Title");
  });
});

describe("getBidGuidanceForBundle", () => {
  it("returns guidance for all known courses", () => {
    clearAll();
    upsertRecords([
      rec({ courseId: "FNCE611", section: "001", term: "Spring2024", clearingPrice: 400 }),
      rec({ courseId: "MGMT611", section: "001", term: "Spring2024", clearingPrice: 300 }),
    ]);
    const result = getBidGuidanceForBundle([
      { courseId: "FNCE611", section: "001" },
      { courseId: "MGMT611", section: "001" },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map(g => g.courseId)).toContain("FNCE611");
    expect(result.map(g => g.courseId)).toContain("MGMT611");
    clearAll();
  });

  it("silently skips courses with no history", () => {
    clearAll();
    upsertRecords([
      rec({ courseId: "FNCE611", section: "001", term: "Spring2024", clearingPrice: 400 }),
    ]);
    const result = getBidGuidanceForBundle([
      { courseId: "FNCE611", section: "001" },
      { courseId: "UNKNOWN999", section: "001" }, // no data
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.courseId).toBe("FNCE611");
    clearAll();
  });

  it("returns empty array when no courses have history", () => {
    clearAll();
    const result = getBidGuidanceForBundle([{ courseId: "NONE999", section: "001" }]);
    expect(result).toHaveLength(0);
  });
});
