import { describe, it, expect } from "vitest";
import { NO_ATTRIBUTES } from "../../../attributes.js";
import type { BusyBlock } from "../../../schedule.js";
import { SHARED_PREFS } from "../../../sharedPrefs.js";
import { planWeek } from "../../engine/plan.js";
import { FACILITIES } from "../../facilities.js";
import { buildPlanInput } from "../../planInput.js";
import { OUTTAKE_PREFS } from "../../prefs.js";
import { timelineBlocks, weekTimeline, type TimelineSources } from "../timeline.js";

const block = (id: string, start: string, end: string, changes: Partial<BusyBlock> = {}): BusyBlock => ({
  id,
  start,
  end,
  label: id,
  source: "ICS",
  recurringWeekly: false,
  confidence: null,
  confirmed: true,
  zone: "CAMPUS",
  attributes: NO_ATTRIBUTES,
  ...changes,
});

const WEEK = "2026-11-16";
const sources = (changes: Partial<TimelineSources>): TimelineSources => ({
  weekStart: WEEK,
  blocks: [],
  awayDays: [],
  semesterStart: "2026-08-26",
  semesterEnd: "2026-12-11",
  ...changes,
});
const view = (s: TimelineSources) =>
  weekTimeline(s).entries.map((e) => ({ id: e.block.id, start: e.block.start, end: e.block.end, repeated: e.repeated, alsoFrom: e.alsoFrom }));

describe("weekTimeline", () => {
  it("lists the week's blocks from every source in time order", () => {
    const timeline = weekTimeline(
      sources({
        blocks: [
          block("quick", "2026-11-17T16:00", "2026-11-17T16:30", { source: "MANUAL" }),
          block("class", "2026-11-16T08:30", "2026-11-16T09:50"),
          block("photo", "2026-11-18T10:15", "2026-11-18T11:35", { source: "SCREENSHOT", confirmed: false, confidence: 0.9 }),
          block("last week", "2026-11-09T08:30", "2026-11-09T09:50"),
          block("next week", "2026-11-23T08:30", "2026-11-23T09:50"),
        ],
      }),
    );
    expect(timeline.entries.map((e) => e.block.id)).toEqual(["class", "quick", "photo"]);
    expect(timeline.unconfirmed).toBe(1);
  });

  it("repeats weekly blocks into later weeks, on the same weekday and times, within the semester", () => {
    const fnce = block("fnce", "2026-09-02T13:45", "2026-09-02T15:05", { recurringWeekly: true }); // a Wednesday
    expect(view(sources({ blocks: [fnce] }))).toEqual([{ id: "fnce", start: "2026-11-18T13:45", end: "2026-11-18T15:05", repeated: true, alsoFrom: [] }]);
    // Not before it was first added, nor outside the semester.
    expect(view(sources({ blocks: [fnce], weekStart: "2026-08-24" }))).toEqual([]);
    expect(view(sources({ blocks: [fnce], weekStart: "2026-12-14" }))).toEqual([]);
    // With no semester dates, it repeats on.
    expect(view(sources({ blocks: [fnce], weekStart: "2027-03-01", semesterStart: null, semesterEnd: null }))[0]!.start).toBe("2027-03-03T13:45");
  });

  it("shows a weekly block in its own week as it is, not repeated", () => {
    const fnce = block("fnce", "2026-11-18T13:45", "2026-11-18T15:05", { recurringWeekly: true });
    expect(view(sources({ blocks: [fnce] }))).toEqual([{ id: "fnce", start: "2026-11-18T13:45", end: "2026-11-18T15:05", repeated: false, alsoFrom: [] }]);
  });

  it("keeps a repeated block that runs past midnight running past midnight", () => {
    const late = block("late", "2026-09-04T22:00", "2026-09-05T01:00", { recurringWeekly: true }); // Friday night
    expect(view(sources({ blocks: [late] }))[0]).toMatchObject({ start: "2026-11-20T22:00", end: "2026-11-21T01:00" });
  });

  it("shows the same block from two sources once, preferring a confirmed one, then manual, .ics, screenshot", () => {
    const ics = block("ics", "2026-11-16T08:30", "2026-11-16T09:50", { confirmed: false });
    const photo = block("photo", "2026-11-16T08:30", "2026-11-16T09:50", { source: "SCREENSHOT", confirmed: false });
    const manual = block("manual", "2026-11-16T08:30", "2026-11-16T09:50", { source: "MANUAL", confirmed: false });
    expect(view(sources({ blocks: [photo, ics] }))).toEqual([expect.objectContaining({ id: "ics", alsoFrom: ["SCREENSHOT"] })]);
    expect(view(sources({ blocks: [photo, ics, manual] }))).toEqual([expect.objectContaining({ id: "manual", alsoFrom: ["ICS", "SCREENSHOT"] })]);
    const confirmedPhoto = { ...photo, confirmed: true };
    expect(view(sources({ blocks: [ics, confirmedPhoto] }))).toEqual([expect.objectContaining({ id: "photo", alsoFrom: ["ICS"] })]);
    expect(weekTimeline(sources({ blocks: [ics, confirmedPhoto] })).unconfirmed).toBe(0);
  });

  it("merges a weekly class from an earlier screenshot with this week's .ics copy", () => {
    const fromPhoto = block("photo", "2026-09-02T13:45", "2026-09-02T15:05", { source: "SCREENSHOT", recurringWeekly: true });
    const fromIcs = block("ics", "2026-11-18T13:45", "2026-11-18T15:05", { confirmed: false });
    expect(view(sources({ blocks: [fromIcs, fromPhoto] }))).toEqual([expect.objectContaining({ id: "photo", repeated: true, alsoFrom: ["ICS"] })]);
  });

  it("keeps blocks that only overlap as separate entries", () => {
    const a = block("presentation", "2026-11-17T18:00", "2026-11-17T20:00");
    const b = block("chat", "2026-11-17T19:30", "2026-11-17T20:30", { source: "MANUAL" });
    expect(view(sources({ blocks: [a, b] })).map((e) => e.id)).toEqual(["presentation", "chat"]);
  });

  it("lists the week's away days once each, in order", () => {
    const away = ["2026-11-21", "2026-11-19", "2026-11-19", "2026-11-25"].map((date) => ({ date, attributes: NO_ATTRIBUTES }));
    expect(weekTimeline(sources({ awayDays: away })).awayDays).toEqual(["2026-11-19", "2026-11-21"]);
  });

  it("doesn't change the blocks it's given", () => {
    const fnce = block("fnce", "2026-09-02T13:45", "2026-09-02T15:05", { recurringWeekly: true });
    const before = structuredClone(fnce);
    weekTimeline(sources({ blocks: [fnce] }));
    expect(fnce).toEqual(before);
  });
});

describe("from timeline to plan", () => {
  it("plans around weekly classes added weeks ago, once confirmed", () => {
    // Classes from a screenshot in the first week of the semester, confirmed then.
    const classes = [
      block("mgmt", "2026-08-31T08:30", "2026-08-31T09:50", { recurringWeekly: true, source: "SCREENSHOT" }),
      block("mgmt-w", "2026-09-02T08:30", "2026-09-02T09:50", { recurringWeekly: true, source: "SCREENSHOT" }),
      block("acct", "2026-09-01T10:15", "2026-09-01T11:35", { recurringWeekly: true, source: "SCREENSHOT" }),
    ];
    const timeline = weekTimeline(sources({ blocks: classes }));
    const input = buildPlanInput({
      weekStart: WEEK,
      shared: SHARED_PREFS.defaults,
      outtake: OUTTAKE_PREFS.defaults,
      blocks: timelineBlocks(timeline),
      awayDays: [],
      places: FACILITIES,
      crunchMode: false,
      dismissed: [],
    });
    expect(input.busyBlocks.map((b) => b.start)).toEqual(["2026-11-16T08:30", "2026-11-17T10:15", "2026-11-18T08:30"]);
    const plan = planWeek(input);
    expect(plan.targetMet).toBe(true);
    for (const slot of plan.slots) {
      for (const busy of input.busyBlocks) expect(slot.start < busy.end && busy.start < slot.end).toBe(false);
    }
  });
});
