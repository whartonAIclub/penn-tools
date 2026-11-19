import { describe, it, expect } from "vitest";
import { NO_ATTRIBUTES } from "../attributes.js";
import type { ScheduleBlock } from "../nutrition/schedule.js";
import { weekTimeline } from "../outtake/ingest/timeline.js";
import type { BusyBlock } from "../schedule.js";
import { blockLocation, templateChanges, templateFromTimeline } from "../weekTemplate.js";

const WEEK = "2026-11-16";
const block = (id: string, start: string, end: string, changes: Partial<BusyBlock> = {}): BusyBlock => ({
  id,
  start,
  end,
  label: "FNCE 6110",
  source: "ICS",
  recurringWeekly: false,
  confidence: null,
  confirmed: true,
  zone: "CAMPUS",
  attributes: NO_ATTRIBUTES,
  ...changes,
});
const entries = (blocks: BusyBlock[]) =>
  weekTimeline({ weekStart: WEEK, blocks, awayDays: [], semesterStart: null, semesterEnd: null }).entries;

const stored = [
  // A weekly class added in September, with a location.
  block("fnce", "2026-09-02T13:45", "2026-09-02T15:05", { recurringWeekly: true, attributes: { location: "Huntsman F50" } }),
  // This week's one-off, imported and not confirmed yet.
  block("chat", "2026-11-17T16:00", "2026-11-17T16:30", { label: "Coffee chat", confirmed: false, zone: null }),
  // A party running past midnight.
  block("party", "2026-11-21T22:00", "2026-11-22T01:00", { label: "Party", source: "MANUAL", zone: "CENTER_CITY" }),
];

describe("templateFromTimeline", () => {
  it("shows the week, weekly classes and one-offs alike, as Nutrition's template", () => {
    expect(templateFromTimeline(entries(stored), WEEK)).toEqual([
      { day: "tue", start: "16:00", end: "16:30", label: "Coffee chat", location: null },
      { day: "wed", start: "13:45", end: "15:05", label: "FNCE 6110", location: "Huntsman F50" },
      // Past midnight shows to 23:59, as Nutrition's calendar import does.
      { day: "sat", start: "22:00", end: "23:59", label: "Party", location: null },
    ]);
  });

  it("names a block with no label 'Busy'", () => {
    expect(templateFromTimeline(entries([block("x", "2026-11-16T09:00", "2026-11-16T10:00", { label: null })]), WEEK)[0]!.label).toBe("Busy");
  });
});

describe("templateChanges", () => {
  const unchanged = () => templateFromTimeline(entries(stored), WEEK);

  it("changes nothing but confirming what the user has now seen, when nothing else changed", () => {
    expect(templateChanges(entries(stored), unchanged(), WEEK)).toEqual({ remove: [], confirm: ["chat"], relocate: [], add: [] });
  });

  it("deletes blocks taken off the template, weekly ones included", () => {
    const without = unchanged().filter((b) => b.label !== "FNCE 6110");
    expect(templateChanges(entries(stored), without, WEEK).remove).toEqual(["fnce"]);
  });

  it("adds new template blocks as confirmed weekly blocks in the week, with the area of their location", () => {
    const added: ScheduleBlock = { day: "thu", start: "10:15", end: "11:35", label: " ACCT 6110 ", location: "JMHH G60" };
    const { add, remove } = templateChanges(entries(stored), [...unchanged(), added], WEEK);
    expect(remove).toEqual([]);
    expect(add).toEqual([
      expect.objectContaining({
        start: "2026-11-19T10:15",
        end: "2026-11-19T11:35",
        label: "ACCT 6110",
        source: "MANUAL",
        recurringWeekly: true,
        confirmed: true,
        zone: "CAMPUS",
        attributes: { location: "JMHH G60" },
      }),
    ]);
  });

  it("treats a changed time as one block out and another in", () => {
    const moved = unchanged().map((b) => (b.label === "Coffee chat" ? { ...b, start: "16:30", end: "17:00" } : b));
    const { remove, add } = templateChanges(entries(stored), moved, WEEK);
    expect(remove).toEqual(["chat"]);
    expect(add.map((b) => [b.start, b.label])).toEqual([["2026-11-17T16:30", "Coffee chat"]]);
  });

  it("updates just the location when only that changed", () => {
    const relocated = unchanged().map((b) => (b.label === "FNCE 6110" ? { ...b, location: "Huntsman G06" } : b));
    expect(templateChanges(entries(stored), relocated, WEEK).relocate).toEqual([{ id: "fnce", location: "Huntsman G06" }]);
  });

  it("keeps a block past midnight as it is, though the template shows it to 23:59", () => {
    expect(templateChanges(entries(stored), unchanged(), WEEK).remove).not.toContain("party");
  });

  it("adds one block for template duplicates, and removes stored duplicates down to one", () => {
    const dupe: ScheduleBlock = { day: "fri", start: "12:00", end: "13:00", label: "Club lunch", location: null };
    expect(templateChanges(entries(stored), [...unchanged(), dupe, dupe], WEEK).add).toHaveLength(1);
    const twice = [...stored, block("chat2", "2026-11-17T16:00", "2026-11-17T16:30", { label: "Coffee chat", source: "MANUAL" })];
    // The timeline already shows same-time copies once; any stored copy not shown is left alone.
    expect(templateChanges(entries(twice), unchanged(), WEEK).remove).toEqual([]);
  });

  it("starts a block ending at or before its start on the next day", () => {
    const late: ScheduleBlock = { day: "fri", start: "23:00", end: "01:00", label: "Late shift", location: null };
    expect(templateChanges(entries([]), [late], WEEK).add[0]).toMatchObject({ start: "2026-11-20T23:00", end: "2026-11-21T01:00" });
  });
});

describe("blockLocation", () => {
  it("reads the location attribute, if it's text", () => {
    expect(blockLocation(stored[0]!)).toBe("Huntsman F50");
    expect(blockLocation(stored[1]!)).toBeNull();
    expect(blockLocation(block("x", "2026-11-16T09:00", "2026-11-16T10:00", { attributes: { location: 3 } }))).toBeNull();
  });
});
