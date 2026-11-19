import { describe, it, expect } from "vitest";
import { NO_ATTRIBUTES } from "../../attributes.js";
import type { BusyBlock } from "../../schedule.js";
import { SHARED_PREFS } from "../../sharedPrefs.js";
import { addDays, mondayOf, newYorkNow } from "../clock.js";
import { FACILITIES } from "../facilities.js";
import { OUTTAKE_PREFS } from "../prefs.js";
import { assembleWeek, type WeekSources } from "../week.js";

const WEEK = "2026-11-16";
const block = (start: string, end: string, changes: Partial<BusyBlock> = {}): BusyBlock => ({
  id: start,
  start,
  end,
  label: "Class",
  source: "ICS",
  recurringWeekly: false,
  confidence: null,
  confirmed: true,
  zone: "CAMPUS",
  attributes: NO_ATTRIBUTES,
  ...changes,
});

const sources = (changes: Partial<WeekSources> = {}): WeekSources => ({
  weekStart: WEEK,
  shared: { ...SHARED_PREFS.defaults, homeCorner: { street: 40, crossStreet: "Locust" } },
  outtake: OUTTAKE_PREFS.defaults,
  blocks: [],
  awayDays: [],
  places: FACILITIES,
  // The Sunday before the week: all of it is ahead.
  now: "2026-11-15T20:00",
  ...changes,
});

describe("clock", () => {
  it("gives New York time for an instant, whatever the computer's zone", () => {
    expect(newYorkNow(new Date("2026-11-18T17:30:00Z"))).toBe("2026-11-18T12:30");
    // In July New York is 4 hours behind UTC, not 5.
    expect(newYorkNow(new Date("2026-07-01T03:00:00Z"))).toBe("2026-06-30T23:00");
  });

  it("finds the Monday of a date's week", () => {
    expect(mondayOf("2026-11-18")).toBe("2026-11-16");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("assembleWeek", () => {
  it("plans a free week and summarizes it, with the next session first", () => {
    const { summary, plan } = assembleWeek(sources());
    expect(summary).toMatchObject({ weekStart: WEEK, commitments: 0, toConfirm: 0, sessions: 3, target: 3, reason: null, isBusy: false });
    expect(summary.nextUp).toMatchObject({ start: plan.slots[0]!.start, placeName: "Pottruck" });
    // Today (Sunday the 15th) isn't in the week.
    expect(summary.todaysGap).toBeNull();
  });

  it("counts commitments still to confirm, and plans only around confirmed ones", () => {
    const unconfirmed = block("2026-11-16T08:00", "2026-11-16T18:00", { confirmed: false });
    const { summary, input } = assembleWeek(sources({ blocks: [unconfirmed, block("2026-11-17T10:15", "2026-11-17T11:35")] }));
    expect(summary).toMatchObject({ commitments: 2, toConfirm: 1 });
    expect(input.busyBlocks).toHaveLength(1);
  });

  it("only plans what's still ahead once the week has started", () => {
    const { plan, summary } = assembleWeek(sources({ now: "2026-11-19T12:00" }));
    for (const slot of plan.slots) expect(slot.start >= "2026-11-19T12:00").toBe(true);
    expect(summary.nextUp!.start >= "2026-11-19T12:00").toBe(true);
  });

  it("points out today's longest free stretch from now", () => {
    const blocks = [block("2026-11-18T08:30", "2026-11-18T09:50"), block("2026-11-18T13:45", "2026-11-18T22:30")];
    // At 10:00 on Wednesday: free until 13:45.
    expect(assembleWeek(sources({ blocks, now: "2026-11-18T10:00" })).summary.todaysGap).toEqual({ start: "10:00", minutes: 225 });
    // Nothing worth showing once the day is full.
    expect(assembleWeek(sources({ blocks, now: "2026-11-18T22:20" })).summary.todaysGap).toBeNull();
  });

  it("repeats weekly classes from earlier weeks, and leaves away days empty", () => {
    const weekly = block("2026-09-02T13:45", "2026-09-02T15:05", { recurringWeekly: true });
    const { timeline, plan } = assembleWeek(
      sources({ blocks: [weekly], awayDays: [{ date: "2026-11-20", attributes: NO_ATTRIBUTES }], shared: { ...SHARED_PREFS.defaults, semesterStart: "2026-08-26", semesterEnd: "2026-12-11" } }),
    );
    expect(timeline.entries[0]!.block.start).toBe("2026-11-18T13:45");
    expect(plan.slots.some((slot) => slot.start.startsWith("2026-11-20"))).toBe(false);
  });

  it("uses the user's check-in adjustments", () => {
    const later = { ...OUTTAKE_PREFS.defaults, adjustments: { ...OUTTAKE_PREFS.defaults.adjustments, wakeBufferMinutes: 90 } };
    // Waking at 07:00, plus 30 + 90 minutes: nothing before 09:00.
    for (const slot of assembleWeek(sources({ outtake: later })).plan.slots) expect(slot.start.slice(11) >= "09:00").toBe(true);
  });

  it("explains a week with no room", () => {
    const busy = [0, 1, 2, 3, 4, 5, 6].map((day) => block(`${addDays(WEEK, day)}T07:00`, `${addDays(WEEK, day)}T22:30`));
    expect(assembleWeek(sources({ blocks: busy })).summary).toMatchObject({ sessions: 0, nextUp: null, isBusy: true, reason: expect.any(String) });
  });
});
