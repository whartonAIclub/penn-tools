// The slot engine against the five fixture weeks from section 8.3 of
// docs/outtake.md. Each fixture's comment says what a good plan looks like;
// these tests check exactly that. They fail until the engine is built (steps
// 4 and 5).

import { describe, it, expect } from "vitest";
import { minutesOfDay, weekdayOf, WEEKDAYS, type LocalDateTime } from "../../../time.js";
import { planWeek } from "../index.js";
import type { PlanInput, PlannedSlot, WeekPlan } from "../types.js";
import { centerCityWeek } from "./fixtures/centerCityWeek.js";
import { lightWeek } from "./fixtures/lightWeek.js";
import { noGapsWeek, noGapsWeekCrunch } from "./fixtures/noGapsWeek.js";
import { recruitingWeek, recruitingWeekCrunch } from "./fixtures/recruitingWeek.js";
import { trekWeek } from "./fixtures/trekWeek.js";

/** Waking hours in the default 07:00-22:30 day, over 7 days. */
const WAKING_MINUTES_PER_WEEK = 15.5 * 60 * 7;

const dateOf = (time: LocalDateTime) => time.slice(0, 10);
const timeOf = (time: LocalDateTime) => time.slice(11);
const dayIndex = (time: LocalDateTime) => WEEKDAYS.indexOf(weekdayOf(dateOf(time)));
/** Minutes since the start of the fixture week. */
const at = (time: LocalDateTime) => dayIndex(time) * 1440 + minutesOfDay(timeOf(time));
const duration = (slot: PlannedSlot) => at(slot.end) - at(slot.start);

/** Rules every plan must follow, whatever the week. */
function expectSoundPlan(input: PlanInput, plan: WeekPlan) {
  const wakingStart = minutesOfDay(input.wakingStart);
  const wakingEnd = minutesOfDay(input.wakingEnd);

  expect(plan.slots.length).toBeLessThanOrEqual(plan.targetSessions);
  expect(plan.targetSessions).toBe(input.crunchMode ? 2 : input.weeklyTargetSessions);
  expect(plan.targetMet).toBe(plan.slots.length === plan.targetSessions);
  expect(plan.reason === null).toBe(plan.targetMet);
  expect(plan.busyness).toBeGreaterThanOrEqual(0);
  expect(plan.busyness).toBeLessThanOrEqual(1);
  if (input.crunchMode) expect(plan.isBusy).toBe(true);

  const days = plan.slots.map((slot) => dateOf(slot.start));
  expect(new Set(days).size, "at most one slot a day").toBe(days.length);
  expect([...days].sort(), "slots in time order").toEqual(days);

  for (const slot of plan.slots) {
    const label = `${slot.start} at ${slot.placeId}`;
    const date = dateOf(slot.start);
    expect(dateOf(slot.end), `${label} ends the same day`).toBe(date);
    expect(date >= input.weekStart && dayIndex(slot.start) >= 0, `${label} is in the week`).toBe(true);
    expect(input.awayDays, `${label} is not on an away day`).not.toContain(date);

    if (input.crunchMode) {
      expect(duration(slot), `${label} lasts 20-30 minutes`).toBeGreaterThanOrEqual(20);
      expect(duration(slot), `${label} lasts 20-30 minutes`).toBeLessThanOrEqual(30);
    } else {
      expect(duration(slot), `${label} lasts the session length`).toBe(input.sessionMinutes);
    }

    const start = minutesOfDay(timeOf(slot.start));
    const end = minutesOfDay(timeOf(slot.end));
    expect(start, `${label} starts after waking`).toBeGreaterThanOrEqual(wakingStart);
    expect(end, `${label} ends before bed`).toBeLessThanOrEqual(wakingEnd);

    // Only places the user can use are in the input (no building gym unless they have one).
    const place = input.places.find((p) => p.id === slot.placeId);
    expect(place, `${label} is one of the user's places`).toBeDefined();
    const hours = place!.hours[weekdayOf(date)];
    expect(hours !== null && minutesOfDay(hours.open) <= start && end <= minutesOfDay(hours.close), `${label} is open`).toBe(true);

    // The slot overlaps no busy block, and the time around it leaves room to walk there and back.
    const sameDay = input.busyBlocks.filter((block) => dateOf(block.start) === date);
    for (const block of sameDay) {
      const overlaps = at(block.start) < at(slot.end) && at(slot.start) < at(block.end);
      expect(overlaps, `${label} overlaps the block at ${block.start}`).toBe(false);
    }
    const before = Math.max(wakingStart, ...sameDay.filter((b) => at(b.end) <= at(slot.start)).map((b) => minutesOfDay(timeOf(b.end))));
    const after = Math.min(wakingEnd, ...sameDay.filter((b) => at(b.start) >= at(slot.end)).map((b) => minutesOfDay(timeOf(b.start))));
    expect(start - before + (after - end), `${label} leaves room for ${slot.travelMinutes} minutes' walking`).toBeGreaterThanOrEqual(
      slot.travelMinutes,
    );
  }
}

const noBackToBackDays = (plan: WeekPlan) => {
  const days = plan.slots.map((slot) => dayIndex(slot.start));
  return days.every((day, i) => i === 0 || day - days[i - 1]! > 1);
};

describe("slot engine: light week", () => {
  const plan = () => planWeek(lightWeek);

  it("makes a sound plan", () => expectSoundPlan(lightWeek, plan()));

  it("finds all 3 sessions, so the target is met", () => {
    expect(plan()).toMatchObject({ targetSessions: 3, targetMet: true, reason: null });
    expect(plan().slots).toHaveLength(3);
  });

  it("spreads them out, with no back-to-back days", () => {
    expect(noBackToBackDays(plan())).toBe(true);
  });

  it("puts at least 2 of the 3 in the morning, as preferred", () => {
    expect(plan().slots.filter((slot) => timeOf(slot.start) < "12:00").length).toBeGreaterThanOrEqual(2);
  });

  it("avoids the time dismissed before (Tuesday 07:00-08:00)", () => {
    const tuesday = plan().slots.filter((slot) => weekdayOf(dateOf(slot.start)) === "TUE");
    for (const slot of tuesday) expect(timeOf(slot.start) >= "08:00" || timeOf(slot.end) <= "07:00").toBe(true);
  });

  it("uses campus facilities", () => {
    for (const slot of plan().slots) expect(lightWeek.places.find((p) => p.id === slot.placeId)?.location.area).toBe("CAMPUS");
  });

  it("measures the week as not busy", () => {
    expect(plan().busyness).toBeCloseTo(1070 / WAKING_MINUTES_PER_WEEK, 3);
    expect(plan().isBusy).toBe(false);
  });
});

describe("slot engine: recruiting-heavy week", () => {
  const plan = () => planWeek(recruitingWeek);

  it("makes a sound plan", () => expectSoundPlan(recruitingWeek, plan()));

  it("still finds all 3 sessions in the early mornings and weekend gaps", () => {
    expect(plan()).toMatchObject({ targetSessions: 3, targetMet: true, reason: null });
  });

  it("puts none on Monday-Thursday evenings", () => {
    for (const slot of plan().slots) {
      const weekday = weekdayOf(dateOf(slot.start));
      if (["MON", "TUE", "WED", "THU"].includes(weekday)) expect(timeOf(slot.start) < "17:00").toBe(true);
    }
  });

  it("leaves at least 30 minutes before the next commitment, so nobody arrives sweaty", () => {
    for (const slot of plan().slots) {
      const next = recruitingWeek.busyBlocks
        .filter((block) => dateOf(block.start) === dateOf(slot.start) && at(block.start) >= at(slot.end))
        .map((block) => at(block.start));
      if (next.length > 0) expect(Math.min(...next) - at(slot.end), `after ${slot.start}`).toBeGreaterThanOrEqual(30);
    }
  });

  it("measures the week as busy", () => {
    expect(plan().busyness).toBeCloseTo(3470 / WAKING_MINUTES_PER_WEEK, 3);
    expect(plan().isBusy).toBe(true);
  });

  describe("in crunch mode", () => {
    const crunch = () => planWeek(recruitingWeekCrunch);

    it("makes a sound plan", () => expectSoundPlan(recruitingWeekCrunch, crunch()));

    it("plans 2 short sessions", () => {
      expect(crunch()).toMatchObject({ targetSessions: 2, targetMet: true, reason: null, isBusy: true });
    });

    it("keeps them close to where the user already is", () => {
      for (const slot of crunch().slots) expect(slot.travelMinutes, slot.start).toBeLessThanOrEqual(10);
    });
  });
});

describe("slot engine: trek week", () => {
  const plan = () => planWeek(trekWeek);

  it("makes a sound plan, with nothing on the away days", () => expectSoundPlan(trekWeek, plan()));

  it("fits all 3 sessions into the days left, without back-to-back days: Monday, Wednesday and Sunday", () => {
    expect(plan()).toMatchObject({ targetSessions: 3, targetMet: true, reason: null });
    expect(plan().slots.map((slot) => weekdayOf(dateOf(slot.start)))).toEqual(["MON", "WED", "SUN"]);
  });
});

describe("slot engine: Center City user", () => {
  const plan = () => planWeek(centerCityWeek);

  it("makes a sound plan", () => expectSoundPlan(centerCityWeek, plan()));

  it("finds all 3 sessions", () => {
    expect(plan()).toMatchObject({ targetSessions: 3, targetMet: true, reason: null });
  });

  it("never makes a special trip across the river: each slot is 10 minutes' walk or less", () => {
    for (const slot of plan().slots) expect(slot.travelMinutes, `${slot.start} at ${slot.placeId}`).toBeLessThanOrEqual(10);
  });
});

describe("slot engine: no viable gaps", () => {
  it("returns an empty plan with a reason, without crashing", () => {
    const plan = planWeek(noGapsWeek);
    expectSoundPlan(noGapsWeek, plan);
    expect(plan.slots).toEqual([]);
    expect(plan.targetMet).toBe(false);
    expect(plan.reason).toEqual(expect.any(String));
    expect(plan.reason!.length).toBeGreaterThan(0);
  });

  it("finds nothing in crunch mode either", () => {
    const plan = planWeek(noGapsWeekCrunch);
    expectSoundPlan(noGapsWeekCrunch, plan);
    expect(plan.slots).toEqual([]);
    expect(plan.reason).toEqual(expect.any(String));
  });

  it("measures the week as busy", () => {
    const plan = planWeek(noGapsWeek);
    expect(plan.busyness).toBeGreaterThanOrEqual(0.9);
    expect(plan.isBusy).toBe(true);
  });
});

describe("slot engine: purity", () => {
  it("doesn't change its input, and gives the same plan every time", () => {
    const input = structuredClone(lightWeek);
    const first = planWeek(input);
    expect(input).toEqual(lightWeek);
    expect(planWeek(input)).toEqual(first);
  });
});
