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

  it("summarizes each day: free and busy time, first commitment, workout, away", () => {
    const blocks = [block("2026-11-16T10:15", "2026-11-16T11:35"), block("2026-11-17T06:00", "2026-11-17T08:00")];
    const { summary } = assembleWeek(sources({ blocks, awayDays: [{ date: "2026-11-21", attributes: NO_ATTRIBUTES }] }));
    expect(summary.days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    const [mon, tue, wed] = summary.days;
    expect(mon).toMatchObject({ busyMinutes: 80, freeMinutes: 930 - 80, firstCommitment: "10:15", away: false, past: false });
    // Busy from before waking: the day starts committed.
    expect(tue).toMatchObject({ busyMinutes: 60, firstCommitment: "07:00" });
    expect(wed).toMatchObject({ busyMinutes: 0, firstCommitment: null });
    expect(summary.days[5]).toMatchObject({ away: true, workout: null });
    expect(summary.days.filter((d) => d.workout).length).toBe(summary.sessions);
  });

  it("marks days before today as past", () => {
    expect(assembleWeek(sources({ now: "2026-11-18T09:00" })).summary.days.map((d) => d.past)).toEqual([true, true, false, false, false, false, false]);
  });

  it("lists every free stretch left today, from now", () => {
    const blocks = [block("2026-11-18T12:00", "2026-11-18T13:00"), block("2026-11-18T13:10", "2026-11-18T18:00")];
    const { summary } = assembleWeek(sources({ blocks, now: "2026-11-18T09:30" }));
    // The 10 minutes between commitments is too short to show.
    expect(summary.todaysGaps).toEqual([
      { date: "2026-11-18", start: "09:30", end: "12:00", minutes: 150 },
      { date: "2026-11-18", start: "18:00", end: "22:30", minutes: 270 },
    ]);
    expect(summary.todaysGap).toEqual({ start: "18:00", minutes: 270 });
  });

  it("lists the nearest places from home, one per name", () => {
    const { summary } = assembleWeek(sources());
    // From 40th & Locust: Pottruck (and Sheerr Pool, inside it) 4 blocks, then 33rd Street.
    expect(summary.nearby.map((n) => n.placeName)).toEqual(["Pottruck", "Sheerr Pool", "Fox Fitness"]);
    expect(summary.nearby[0]!.walkMinutes).toBe(6);
    expect(summary.homeCornerSet).toBe(true);
  });

  describe("tips", () => {
    it("suggests setting home first when there's no corner", () => {
      const { summary } = assembleWeek(sources({ shared: SHARED_PREFS.defaults }));
      expect(summary.homeCornerSet).toBe(false);
      expect(summary.tips[0]).toEqual({ kind: "setHome" });
    });

    it("names the lightest day ahead, the longest free stretch, and free weekday mornings", () => {
      const classes = ["16", "17", "18", "19"].map((d) => block(`2026-11-${d}T08:30`, `2026-11-${d}T17:00`));
      const { summary } = assembleWeek(sources({ blocks: classes, now: "2026-11-16T07:00" }));
      expect(summary.tips).toContainEqual({ kind: "lightestDay", date: "2026-11-20", freeMinutes: 930 });
      // The longest stretch is all of Friday too, so it isn't said twice.
      expect(summary.tips.some((t) => t.kind === "longestStretch")).toBe(false);
      // Only Friday's morning is free after today, so no free-mornings tip.
      expect(summary.tips.some((t) => t.kind === "freeMornings")).toBe(false);
      const late = ["17", "18", "19", "20"].map((d) => block(`2026-11-${d}T10:15`, `2026-11-${d}T17:00`));
      const mornings = assembleWeek(sources({ blocks: late, now: "2026-11-16T07:00" })).summary.tips.find((t) => t.kind === "freeMornings");
      expect(mornings).toEqual({ kind: "freeMornings", dates: ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"] });
    });

    it("names the longest free stretch when it's on another day than the lightest", () => {
      // Friday is lightest overall (two free stretches); Saturday's single stretch is longer.
      const blocks = [
        ...["16", "17", "18", "19"].map((d) => block(`2026-11-${d}T08:30`, `2026-11-${d}T20:00`)),
        block("2026-11-20T12:00", "2026-11-20T13:00"),
        block("2026-11-21T07:00", "2026-11-21T09:00"),
        block("2026-11-22T07:00", "2026-11-22T22:30"),
      ];
      const { tips } = assembleWeek(sources({ blocks, now: "2026-11-16T07:00" })).summary;
      expect(tips).toContainEqual({ kind: "lightestDay", date: "2026-11-20", freeMinutes: 870 });
      expect(tips).toContainEqual({ kind: "longestStretch", stretch: { date: "2026-11-21", start: "09:00", end: "22:30", minutes: 810 } });
    });

    it("says how booked a heavy week is", () => {
      const heavy = [0, 1, 2, 3, 4, 5, 6].map((day) => block(`${addDays(WEEK, day)}T07:00`, `${addDays(WEEK, day)}T17:00`));
      expect(assembleWeek(sources({ blocks: heavy })).summary.tips).toContainEqual({ kind: "heavyWeek", percentBooked: 65 });
    });

    it("gives at most 4", () => {
      const heavy = [0, 1, 2, 3, 4, 5, 6].map((day) => block(`${addDays(WEEK, day)}T10:15`, `${addDays(WEEK, day)}T20:00`));
      expect(assembleWeek(sources({ blocks: heavy, shared: SHARED_PREFS.defaults })).summary.tips.length).toBeLessThanOrEqual(4);
    });
  });

  it("explains a week with no room", () => {
    const busy = [0, 1, 2, 3, 4, 5, 6].map((day) => block(`${addDays(WEEK, day)}T07:00`, `${addDays(WEEK, day)}T22:30`));
    expect(assembleWeek(sources({ blocks: busy })).summary).toMatchObject({ sessions: 0, nextUp: null, isBusy: true, reason: expect.any(String) });
  });
});
