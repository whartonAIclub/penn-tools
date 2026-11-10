import { describe, it, expect } from "vitest";
import {
  REGIONS,
  TIMINGS,
  TRIP_TYPES,
  formatDateRange,
  tripDays,
  type Trip,
} from "../trips.js";
import { SAMPLE_TRIPS } from "../samples.js";

describe("formatDateRange", () => {
  it("shortens ranges in the same month or year", () => {
    expect(formatDateRange("2027-03-06", "2027-03-14")).toBe("Mar 6 – 14, 2027");
    expect(formatDateRange("2027-05-28", "2027-06-02")).toBe("May 28 – Jun 2, 2027");
    expect(formatDateRange("2026-12-27", "2027-01-04")).toBe("Dec 27, 2026 – Jan 4, 2027");
    expect(formatDateRange("2027-03-06", "2027-03-06")).toBe("Mar 6, 2027");
  });
});

describe("tripDays", () => {
  it("counts both the first and last day, across months and years", () => {
    expect(tripDays("2027-03-06", "2027-03-14")).toBe(9);
    expect(tripDays("2027-03-06", "2027-03-06")).toBe(1);
    expect(tripDays("2027-05-28", "2027-06-02")).toBe(6);
    expect(tripDays("2026-12-27", "2027-01-04")).toBe(9);
  });

  it("isn't thrown off by daylight saving changes", () => {
    expect(tripDays("2027-03-13", "2027-03-15")).toBe(3);
  });
});

describe("SAMPLE_TRIPS", () => {
  it("has unique ids and end dates on or after start dates", () => {
    expect(new Set(SAMPLE_TRIPS.map((t) => t.id)).size).toBe(SAMPLE_TRIPS.length);
    for (const t of SAMPLE_TRIPS) expect(t.endDate >= t.startDate).toBe(true);
  });

  it("uses only known types, regions and timings, and covers every type", () => {
    for (const t of SAMPLE_TRIPS) {
      expect(TRIP_TYPES).toContain(t.tripType);
      expect(REGIONS).toContain(t.region);
      expect(TIMINGS).toContain(t.timing);
    }
    expect(new Set(SAMPLE_TRIPS.map((t) => t.tripType))).toEqual(new Set(TRIP_TYPES));
  });

  it("numbers each trip's stages, deadlines and links from 1, with at most one preliminary deadline", () => {
    for (const t of SAMPLE_TRIPS) {
      for (const list of [t.priceStages, t.deadlines, t.links]) {
        expect(list.map((item) => item.position)).toEqual(list.map((_, i) => i + 1));
      }
      expect(t.deadlines.filter((d) => d.kind === "preliminary").length).toBeLessThanOrEqual(1);
      expect(t.priceStages.length).toBeGreaterThan(0);
    }
  });

  it("covers the cases the cards must handle", () => {
    const has = (test: (t: Trip) => boolean) => SAMPLE_TRIPS.some(test);
    const dated = (t: Trip) => t.priceStages.some((s) => s.validFrom !== null || s.validUntil !== null);
    const prelim = (t: Trip) => t.deadlines.find((d) => d.kind === "preliminary");

    // Date-based price tiers.
    expect(has((t) => t.priceStages.length > 1 && t.priceStages.every((s) => s.validFrom !== null || s.validUntil !== null))).toBe(true);
    // An undated estimate followed by a confirmed price.
    expect(
      has(
        (t) =>
          !dated(t) &&
          t.priceStages[0]?.certainty === "estimate" &&
          t.priceStages.at(-1)?.certainty === "confirmed",
      ),
    ).toBe(true);
    // A price still to be decided.
    expect(has((t) => t.priceStages.some((s) => s.amountUsd === null))).toBe(true);
    // Preliminary deadlines before and after the samples were written (Nov 9, 2026).
    expect(has((t) => (prelim(t)?.dueDate ?? "9999") < "2026-11-09")).toBe(true);
    expect(has((t) => (prelim(t)?.dueDate ?? "") > "2026-11-09")).toBe(true);
    expect(has((t) => prelim(t) === undefined)).toBe(true);
    // Optional details present on some trips and missing on others.
    expect(has((t) => t.destinationBlurb !== null) && has((t) => t.destinationBlurb === null)).toBe(true);
    expect(has((t) => t.priceIncludes !== null) && has((t) => t.priceIncludes === null)).toBe(true);
    expect(has((t) => t.academicCredit && t.creditNote !== null)).toBe(true);
  });
});
