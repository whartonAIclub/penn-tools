import { describe, expect, it } from "vitest";
import { groupByMonth, splitByToday } from "../calendarView.js";
import type { PlannedEventSummary } from "../planning.js";

const ev = (title: string, eventDate: string | null): PlannedEventSummary => ({
  id: title,
  title,
  eventDate,
  eventTime: null,
  theme: null,
  venue: null,
  budget: null,
  pubLeader: null,
  cancelled: false,
});

describe("groupByMonth", () => {
  it("groups events by month in date order, undated last", () => {
    const groups = groupByMonth([ev("Oktoberfest", "2026-09-24"), ev("International", "2026-10-22"), ev("TBD", null), ev("Halloween", "2026-10-29")]);
    expect(groups.map((g) => [g.month, g.events.map((e) => e.title)])).toEqual([
      ["September 2026", ["Oktoberfest"]],
      ["October 2026", ["International", "Halloween"]],
      ["Date to be decided", ["TBD"]],
    ]);
  });

  it("keeps the same month of different years apart and returns nothing for no events", () => {
    expect(groupByMonth([ev("a", "2026-10-01"), ev("b", "2027-10-01")]).map((g) => g.month)).toEqual(["October 2026", "October 2027"]);
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("splitByToday and descending order", () => {
  const events = [ev("old", "2026-11-01"), ev("now", "2026-11-12"), ev("later", "2026-12-01"), ev("tbd", null)];

  it("splits upcoming (soonest first), undated and past (newest first)", () => {
    const { upcoming, undated, past } = splitByToday([...events].reverse(), "2026-11-12");
    expect(upcoming.map((e) => e.title)).toEqual(["now", "later"]);
    expect(past.map((e) => e.title)).toEqual(["old"]);
    expect(undated.map((e) => e.title)).toEqual(["tbd"]);
  });

  it("keeps cancelled events in their date's list", () => {
    const { past } = splitByToday([{ ...ev("x", "2026-01-01"), cancelled: true }], "2026-11-12");
    expect(past.map((e) => e.title)).toEqual(["x"]);
  });

  it("groups months newest first when order is desc", () => {
    const groups = groupByMonth([ev("a", "2026-09-01"), ev("b", "2026-11-01"), ev("c", "2026-11-05")], "desc");
    expect(groups.map((g) => [g.month, g.events.map((e) => e.title)])).toEqual([
      ["November 2026", ["c", "b"]],
      ["September 2026", ["a"]],
    ]);
  });
});
