// planWeek and measureBusyness on small hand-built weeks; the fixture weeks
// are in engine.test.ts.

import { describe, it, expect } from "vitest";
import { atCorner } from "../../../location.js";
import type { OpeningHours } from "../../../places.js";
import { measureBusyness } from "../busyness.js";
import { ENGINE_CONFIG } from "../config.js";
import { planWeek } from "../plan.js";
import type { EngineBlock, WorkoutPlanInput, PlannedSlot } from "../types.js";

const home = atCorner({ street: 38, crossStreet: "Spruce" });
const open: OpeningHours = {
  MON: { open: "00:00", close: "24:00" },
  TUE: { open: "00:00", close: "24:00" },
  WED: { open: "00:00", close: "24:00" },
  THU: { open: "00:00", close: "24:00" },
  FRI: { open: "00:00", close: "24:00" },
  SAT: { open: "00:00", close: "24:00" },
  SUN: { open: "00:00", close: "24:00" },
};
const DATES = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

// An empty week with one gym at 37th & Walnut, 5 minutes' walk from home.
const week = (changes: Partial<WorkoutPlanInput> = {}): WorkoutPlanInput => ({
  weekStart: "2026-11-16",
  busyBlocks: [],
  awayDays: [],
  home,
  wakingStart: "07:00",
  wakingEnd: "22:30",
  weeklyTargetSessions: 3,
  sessionMinutes: 45,
  preferredWindows: [],
  places: [{ id: "gym", location: atCorner({ street: 37, crossStreet: "Walnut" }), hours: open }],
  crunchMode: false,
  dismissed: [],
  planFrom: null,
  keptSlots: [],
  ...changes,
});

const block = (date: string, start: string, end: string): EngineBlock => ({ start: `${date}T${start}`, end: `${date}T${end}`, location: home });
const starts = (slots: PlannedSlot[]) => slots.map((slot) => slot.start);

describe("planWeek", () => {
  it("spreads sessions out, earliest days first when they score the same, on the quarter hour", () => {
    const plan = planWeek(week());
    expect(starts(plan.slots)).toEqual(["2026-11-16T07:15", "2026-11-18T07:15", "2026-11-20T07:15"]);
    expect(plan.slots[0]).toMatchObject({ end: "2026-11-16T08:00", placeId: "gym", travelMinutes: 10 });
    expect(plan).toMatchObject({ targetSessions: 3, targetMet: true, reason: null, busyness: 0, isBusy: false });
  });

  it("uses back-to-back days when those are the only ones free", () => {
    const plan = planWeek(week({ weeklyTargetSessions: 2, awayDays: DATES.slice(2) }));
    expect(starts(plan.slots).map((s) => s.slice(0, 10))).toEqual(["2026-11-16", "2026-11-17"]);
    expect(plan.targetMet).toBe(true);
  });

  it("says why when the target can't be met", () => {
    const plan = planWeek(week({ awayDays: DATES.slice(2) }));
    expect(plan.slots).toHaveLength(2);
    expect(plan).toMatchObject({ targetMet: false, reason: "Only 2 days have a gap long enough for a workout this week." });
    expect(planWeek(week({ awayDays: DATES.slice(1) })).reason).toBe("Only 1 day has a gap long enough for a workout this week.");
    expect(planWeek(week({ awayDays: DATES })).reason).toBe("No gaps long enough for a workout this week.");
  });

  it("keeps sessions off times the user dismissed", () => {
    const plan = planWeek(week({ dismissed: [{ weekday: "MON", start: "07:00", end: "09:00" }] }));
    expect(plan.slots[0]!.start >= "2026-11-16T09:00").toBe(true);
  });

  describe("in crunch mode", () => {
    it("plans 2 sessions of 30 minutes, and counts the week as busy", () => {
      const plan = planWeek(week({ crunchMode: true }));
      expect(plan).toMatchObject({ targetSessions: 2, targetMet: true, isBusy: true });
      expect(plan.slots.map((slot) => [slot.start.slice(11), slot.end.slice(11)])).toEqual([
        ["07:15", "07:45"],
        ["07:15", "07:45"],
      ]);
    });

    it("drops to 20 minutes where 30 doesn't fit", () => {
      // Free only 07:00-07:30 each day; the gym is 5 minutes away each way.
      const busyBlocks = DATES.map((date) => block(date, "07:30", "22:30"));
      const plan = planWeek(week({ crunchMode: true, busyBlocks }));
      expect(plan.slots.map((slot) => [slot.start.slice(11), slot.end.slice(11)])).toEqual([
        ["07:05", "07:25"],
        ["07:05", "07:25"],
      ]);
    });

    it("keeps sessions no longer than the user's usual one", () => {
      const plan = planWeek(week({ crunchMode: true, sessionMinutes: 25 }));
      expect(plan.slots[0]).toMatchObject({ start: "2026-11-16T07:15", end: "2026-11-16T07:40" });
    });
  });

  describe("regenerating mid-week", () => {
    const completed: PlannedSlot = { start: "2026-11-16T07:15", end: "2026-11-16T08:00", placeId: "gym", travelMinutes: 10, score: -0.5 };

    it("plans nothing before planFrom", () => {
      const plan = planWeek(week({ planFrom: "2026-11-18T12:00" }));
      for (const slot of plan.slots) expect(slot.start >= "2026-11-18T12:00").toBe(true);
      expect(plan.targetMet).toBe(true);
    });

    it("keeps completed slots, counts them toward the target, and spaces new ones from them", () => {
      const plan = planWeek(week({ keptSlots: [completed] }));
      expect(plan.slots[0]).toEqual(completed);
      expect(starts(plan.slots)).toEqual(["2026-11-16T07:15", "2026-11-18T07:15", "2026-11-20T07:15"]);
    });

    it("keeps them when crunch mode is turned on, and only fills the rest of the week", () => {
      const plan = planWeek(week({ crunchMode: true, keptSlots: [completed], planFrom: "2026-11-18T12:00" }));
      expect(plan.slots).toHaveLength(2);
      expect(plan.slots[0]).toEqual(completed);
      expect(plan.slots[1]!.start >= "2026-11-18T12:00").toBe(true);
      expect(plan.targetMet).toBe(true);
    });
  });

  it("uses the settings it's given", () => {
    // With no penalty for back-to-back days, the earliest days win.
    const plan = planWeek(week(), { ...ENGINE_CONFIG, scoring: { ...ENGINE_CONFIG.scoring, backToBack: 0 } });
    expect(starts(plan.slots).map((s) => s.slice(0, 10))).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });
});

describe("measureBusyness", () => {
  const waking = 7 * 930;

  it("is 0 for an empty week", () => {
    expect(measureBusyness(week())).toBe(0);
  });

  it("counts busy minutes within waking hours once, however blocks overlap", () => {
    const busyBlocks = [block(DATES[0]!, "06:00", "08:00"), block(DATES[0]!, "07:30", "09:00"), block(DATES[1]!, "22:00", "23:30")];
    expect(measureBusyness(week({ busyBlocks }))).toBeCloseTo((120 + 30) / waking);
  });

  it("is 1 when every waking minute is busy", () => {
    expect(measureBusyness(week({ busyBlocks: DATES.map((date) => block(date, "07:00", "22:30")) }))).toBe(1);
  });

  it("doesn't count an away day with nothing on it as busy", () => {
    expect(measureBusyness(week({ awayDays: [DATES[3]!] }))).toBe(0);
  });
});
