import { describe, expect, it } from "vitest";
import { groupByMonth } from "../calendarView.js";
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
