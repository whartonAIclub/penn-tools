// planWeek and measureBusyness on small hand-built weeks; the fixture weeks
// are in engine.test.ts.

import { describe, it, expect } from "vitest";
import { atCorner } from "../../../location.js";
import type { OpeningHours } from "../../../places.js";
import { measureBusyness } from "../busyness.js";
import { ENGINE_CONFIG } from "../config.js";
import { bestSlotPerDay, explainSlot, planWeek, spreadPoints } from "../plan.js";
import { centerCityWeek } from "./fixtures/centerCityWeek.js";
import { lightWeek } from "./fixtures/lightWeek.js";
import { recruitingWeek, recruitingWeekCrunch } from "./fixtures/recruitingWeek.js";
import { trekWeek } from "./fixtures/trekWeek.js";
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
  spreadOut: true,
  places: [{ id: "gym", location: atCorner({ street: 37, crossStreet: "Walnut" }), hours: open }],
  crunchMode: false,
  dismissed: [],
  planFrom: null,
  keptSlots: [],
  ...changes,
});

const block = (date: string, start: string, end: string): EngineBlock => ({ start: `${date}T${start}`, end: `${date}T${end}`, location: home });
const starts = (slots: PlannedSlot[]) => slots.map((slot) => slot.start);
const days = (slots: PlannedSlot[]) => slots.map((slot) => slot.start.slice(0, 10));
const plan = ENGINE_CONFIG.plan;

describe("planWeek", () => {
  it("spreads sessions evenly across the week, on the quarter hour", () => {
    // Free all week: Mon / Thu / Sun is the most even split of three.
    const result = planWeek(week());
    expect(starts(result.slots)).toEqual(["2026-11-16T07:45", "2026-11-19T07:45", "2026-11-22T07:45"]);
    expect(result.slots[0]).toMatchObject({ end: "2026-11-16T08:30", placeId: "gym", travelMinutes: 10 });
    expect(result).toMatchObject({ targetSessions: 3, targetMet: true, reason: null, busyness: 0, isBusy: false });
  });

  it("takes the earliest days for users who don't mind days in a row", () => {
    expect(days(planWeek(week({ spreadOut: false })).slots)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("starts nothing within 30 minutes of waking", () => {
    // Waking at 07:00: free from 07:30, then a 5-minute walk, so 07:45 on the quarter hour.
    expect(planWeek(week()).slots[0]!.start).toBe("2026-11-16T07:45");
    const noBuffer = { ...ENGINE_CONFIG, plan: { ...plan, wakeBufferMinutes: 0 } };
    expect(planWeek(week(), noBuffer).slots[0]!.start).toBe("2026-11-16T07:15");
  });

  it("leaves 10 minutes after a commitment before walking to a session", () => {
    // Monday only, busy until 09:20: free at 09:30, at the gym by 09:35, starting 09:45.
    const monday = week({ weeklyTargetSessions: 1, awayDays: DATES.slice(1), busyBlocks: [block(DATES[0]!, "07:00", "09:20")] });
    expect(planWeek(monday).slots[0]!.start).toBe("2026-11-16T09:45");
    const noBuffer = { ...ENGINE_CONFIG, plan: { ...plan, afterBlockMinutes: 0 } };
    expect(planWeek(monday, noBuffer).slots[0]!.start).toBe("2026-11-16T09:30");
  });

  it("ends sessions before bed when a bed buffer is set", () => {
    // Free only from 21:00: 21:10 + 5 minutes' walk fits a 45-minute session by 22:30, but not by 21:30.
    const evenings = week({ busyBlocks: DATES.map((date) => block(date, "07:00", "21:00")) });
    expect(planWeek(evenings).slots).toHaveLength(3);
    expect(planWeek(evenings, { ...ENGINE_CONFIG, plan: { ...plan, bedBufferMinutes: 60 } }).slots).toEqual([]);
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
      const result = planWeek(week({ crunchMode: true }));
      expect(result).toMatchObject({ targetSessions: 2, targetMet: true, isBusy: true });
      expect(days(result.slots)).toEqual(["2026-11-16", "2026-11-19"]);
      expect(result.slots.map((slot) => [slot.start.slice(11), slot.end.slice(11)])).toEqual([
        ["07:45", "08:15"],
        ["07:45", "08:15"],
      ]);
    });

    it("drops to 20 minutes where 30 doesn't fit", () => {
      // Free 07:30-08:05 each day after the wake buffer; the gym is 5 minutes away each way.
      const busyBlocks = DATES.map((date) => block(date, "08:05", "22:30"));
      const result = planWeek(week({ crunchMode: true, busyBlocks }));
      expect(result.slots.map((slot) => [slot.start.slice(11), slot.end.slice(11)])).toEqual([
        ["07:35", "07:55"],
        ["07:35", "07:55"],
      ]);
    });

    it("keeps sessions no longer than the user's usual one", () => {
      const result = planWeek(week({ crunchMode: true, sessionMinutes: 25 }));
      expect(result.slots[0]).toMatchObject({ start: "2026-11-16T07:45", end: "2026-11-16T08:10" });
    });
  });

  describe("regenerating mid-week", () => {
    const completed: PlannedSlot = { start: "2026-11-16T07:15", end: "2026-11-16T08:00", placeId: "gym", travelMinutes: 10, score: -0.5 };

    it("plans nothing before planFrom", () => {
      const result = planWeek(week({ planFrom: "2026-11-18T12:00" }));
      for (const slot of result.slots) expect(slot.start >= "2026-11-18T12:00").toBe(true);
      expect(result.targetMet).toBe(true);
    });

    it("keeps completed slots, counts them toward the target, and spaces new ones from them", () => {
      const result = planWeek(week({ keptSlots: [completed] }));
      expect(result.slots[0]).toEqual(completed);
      expect(starts(result.slots)).toEqual(["2026-11-16T07:15", "2026-11-19T07:45", "2026-11-22T07:45"]);
    });

    it("keeps them when crunch mode is turned on, and only fills the rest of the week", () => {
      const result = planWeek(week({ crunchMode: true, keptSlots: [completed], planFrom: "2026-11-18T12:00" }));
      expect(result.slots).toHaveLength(2);
      expect(result.slots[0]).toEqual(completed);
      expect(result.slots[1]!.start >= "2026-11-18T12:00").toBe(true);
      expect(result.targetMet).toBe(true);
    });
  });

  it("uses the settings it's given", () => {
    // With no points for spacing, the earliest days win even for users who want sessions spread out.
    const result = planWeek(week(), { ...ENGINE_CONFIG, scoring: { ...ENGINE_CONFIG.scoring, backToBack: 0, spreadPerDay: 0 } });
    expect(days(result.slots)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });
});

describe("spreadPoints", () => {
  it("penalizes days in a row and rewards days apart, up to 3, for users who want sessions spread out", () => {
    expect(spreadPoints([0, 3, 6], true)).toBeCloseTo(0.6);
    expect(spreadPoints([0, 2, 4], true)).toBeCloseTo(0.4);
    expect(spreadPoints([0, 6], true)).toBeCloseTo(0.3);
    expect(spreadPoints([0, 1], true)).toBeCloseTo(-2 + 0.1);
    expect(spreadPoints([4], true)).toBe(0);
  });

  it("is 0 for users who don't mind days in a row", () => {
    expect(spreadPoints([0, 1, 2], false)).toBe(0);
  });
});

describe("bestSlotPerDay and explainSlot", () => {
  it("offers one candidate per day with room, which the plan picks from", () => {
    const candidates = bestSlotPerDay(week({ awayDays: [DATES[6]!] }));
    expect(candidates.map((slot) => slot.start.slice(0, 10))).toEqual(DATES.slice(0, 6));
    const plan = planWeek(week({ awayDays: [DATES[6]!] }));
    for (const slot of plan.slots) expect(candidates).toContainEqual(slot);
  });

  it("explains each slot's score part by part, adding up to the score the plan used", () => {
    for (const fixture of [lightWeek, recruitingWeek, recruitingWeekCrunch, centerCityWeek, trekWeek]) {
      for (const slot of bestSlotPerDay(fixture)) {
        const parts = explainSlot(slot, fixture);
        expect(parts, slot.start).not.toBeNull();
        expect(parts!.total, slot.start).toBeCloseTo(slot.score, 9);
        expect(parts!.preferredTime + parts!.travel + parts!.buffer + parts!.dismissed).toBeCloseTo(parts!.total, 9);
      }
    }
  });

  it("can't explain a slot outside the week's gaps", () => {
    const outside: PlannedSlot = { start: "2026-11-30T09:00", end: "2026-11-30T09:45", placeId: "gym", travelMinutes: 10, score: 0 };
    expect(explainSlot(outside, week())).toBeNull();
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
