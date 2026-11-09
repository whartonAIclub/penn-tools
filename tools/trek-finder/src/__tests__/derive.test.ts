import { describe, it, expect } from "vitest";
import { currentPriceStage, todayInNewYork, tripStatus } from "../derive.js";
import type { Deadline, PriceStage, Trip } from "../trips.js";
import { SAMPLE_TRIPS } from "../samples.js";

function stage(position: number, validFrom: string | null, validUntil: string | null, amountUsd: number | null = position * 100): PriceStage {
  return { position, label: `Stage ${position}`, amountUsd, certainty: "estimate", validFrom, validUntil, note: null };
}

function deadline(kind: Deadline["kind"], dueDate: string): Deadline {
  return { position: 1, kind, label: kind, dueDate, dueTime: null };
}

function trip(startDate: string, deadlines: Deadline[]): Trip {
  const [base] = SAMPLE_TRIPS;
  if (!base) throw new Error("no sample trips");
  return { ...base, startDate, endDate: startDate, deadlines };
}

describe("todayInNewYork", () => {
  it("uses New York's date, not the computer's", () => {
    // 3:30am in London is still the evening before in New York, in winter and summer time.
    expect(todayInNewYork(new Date("2026-11-10T03:30:00Z"))).toBe("2026-11-09");
    expect(todayInNewYork(new Date("2027-07-01T03:30:00Z"))).toBe("2027-06-30");
    expect(todayInNewYork(new Date("2026-11-10T05:30:00Z"))).toBe("2026-11-10");
  });

  it("returns YYYY-MM-DD", () => {
    expect(todayInNewYork()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("currentPriceStage", () => {
  const position = (stages: PriceStage[], today: string) => currentPriceStage(stages, today)?.position ?? null;

  it("picks the date tier that includes today, counting both end dates", () => {
    const tiers = [stage(1, null, "2026-11-30"), stage(2, "2026-12-01", null)];
    expect(position(tiers, "2026-11-09")).toBe(1);
    expect(position(tiers, "2026-11-30")).toBe(1);
    expect(position(tiers, "2026-12-01")).toBe(2);
    expect(position(tiers, "2027-03-01")).toBe(2);
  });

  it("picks the latest undated stage, so an estimate gives way to a confirmed price", () => {
    expect(position([stage(1, null, null), stage(2, null, null)], "2026-11-09")).toBe(2);
    expect(position([stage(1, null, null)], "2026-11-09")).toBe(1);
  });

  it("mixes undated and dated stages: the dated one wins once it starts", () => {
    const mixed = [stage(1, null, null), stage(2, "2026-12-01", null)];
    expect(position(mixed, "2026-11-30")).toBe(1);
    expect(position(mixed, "2026-12-01")).toBe(2);
  });

  it("returns null in a gap between tiers, before the first and after the last", () => {
    const gappy = [stage(1, "2026-11-01", "2026-11-30"), stage(2, "2026-12-05", "2027-02-01")];
    expect(position(gappy, "2026-12-02")).toBe(null);
    expect(position(gappy, "2026-10-31")).toBe(null);
    expect(position(gappy, "2027-02-02")).toBe(null);
  });

  it("returns null with no stages, and keeps a stage whose price is TBD", () => {
    expect(currentPriceStage([], "2026-11-09")).toBe(null);
    expect(currentPriceStage([stage(1, null, null, null)], "2026-11-09")?.amountUsd).toBe(null);
  });

  it("picks the right sample prices on Nov 9, 2026", () => {
    const cost = (id: string) => {
      const t = SAMPLE_TRIPS.find((s) => s.id === id);
      return t ? currentPriceStage(t.priceStages, "2026-11-09")?.amountUsd : undefined;
    };
    expect(cost("sample-japan")).toBe(3300);
    expect(cost("sample-india-gip")).toBe(4500);
    expect(cost("sample-morocco")).toBe(2600);
    expect(cost("sample-kenya")).toBe(null);
  });
});

describe("tripStatus", () => {
  it("counts a preliminary deadline as passed only from the day after", () => {
    const t = trip("2027-03-06", [deadline("preliminary", "2026-11-15")]);
    expect(tripStatus(t, "2026-11-14")).toBe("open");
    expect(tripStatus(t, "2026-11-15")).toBe("open");
    expect(tripStatus(t, "2026-11-16")).toBe("prelim_passed");
  });

  it("treats a trip as past from its start date", () => {
    const t = trip("2027-03-06", [deadline("preliminary", "2026-11-15")]);
    expect(tripStatus(t, "2027-03-05")).toBe("prelim_passed");
    expect(tripStatus(t, "2027-03-06")).toBe("past");
    expect(tripStatus(t, "2027-03-07")).toBe("past");
  });

  it("ignores other kinds of deadline", () => {
    const t = trip("2027-03-06", [deadline("application", "2026-11-01"), deadline("deposit", "2026-11-02")]);
    expect(tripStatus(t, "2026-11-09")).toBe("open");
  });

  it("is open with no deadlines at all", () => {
    expect(tripStatus(trip("2027-03-06", []), "2026-11-09")).toBe("open");
  });
});
