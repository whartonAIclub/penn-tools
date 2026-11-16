import { describe, it, expect } from "vitest";
import {
  calendarDeadlines,
  expandRecurring,
  occurrenceDates,
  recurringProblem,
  recurringSummary,
} from "../recurring.js";
import { buildCalendar } from "../ics.js";
import { SAMPLE_COURSE, SAMPLE_DEADLINES, SAMPLE_RECURRING } from "../samples.js";
import { DEFAULT_REMINDERS, type RecurringDeadline } from "../types.js";

function repeating(overrides: Partial<RecurringDeadline> = {}): RecurringDeadline {
  return { ...SAMPLE_RECURRING[0]!, ...overrides };
}

describe("occurrenceDates", () => {
  it("is due on the day each week from the first week to the last", () => {
    expect(occurrenceDates(repeating(), SAMPLE_COURSE)).toEqual([
      "2027-01-18",
      "2027-01-25",
      "2027-02-01",
      "2027-02-08",
      "2027-02-15",
    ]);
  });

  it("skips break weeks", () => {
    expect(occurrenceDates(repeating({ skipWeeks: [3, 4] }), SAMPLE_COURSE)).toEqual(["2027-01-18", "2027-02-08", "2027-02-15"]);
  });

  it("is due at every class, but not before the first class", () => {
    // Week 1 starts on Wednesday, Jan 13: the Monday before isn't a class.
    const everyClass = repeating({ repeat: "every-class", weekday: null, firstWeek: 1, lastWeek: 2 });
    expect(occurrenceDates(everyClass, SAMPLE_COURSE)).toEqual(["2027-01-13", "2027-01-18", "2027-01-20"]);
  });

  it("summarizes the dates", () => {
    expect(recurringSummary(repeating(), SAMPLE_COURSE)).toBe("5 deadlines, Mon, Jan 18 – Mon, Feb 15");
  });
});

describe("recurringProblem", () => {
  it("is null for a ready repeating deadline", () => {
    expect(recurringProblem(repeating(), SAMPLE_COURSE)).toBeNull();
  });

  it("asks for what's missing", () => {
    expect(recurringProblem(repeating({ title: "" }), SAMPLE_COURSE)).toBe("Add a title.");
    expect(recurringProblem(repeating({ lastWeek: null }), SAMPLE_COURSE)).toBe("Pick the first and last week.");
    expect(recurringProblem(repeating({ firstWeek: 6, lastWeek: 2 }), SAMPLE_COURSE)).toBe("The last week is before the first week.");
    expect(recurringProblem(repeating({ weekday: null }), SAMPLE_COURSE)).toBe("Pick a day.");
    expect(recurringProblem(repeating(), { ...SAMPLE_COURSE, week1Start: null })).toBe(
      "Add the first week of classes in course details.",
    );
    expect(recurringProblem(repeating({ weekday: 2 }), SAMPLE_COURSE)).toBe("There's no class on Tue. Pick another day or time.");
    expect(recurringProblem(repeating({ repeat: "every-class" }), { ...SAMPLE_COURSE, classDays: [] })).toBe(
      "Add the class days in course details, or pick a day of the week.",
    );
  });
});

describe("in the calendar", () => {
  it("becomes one event per date, each with its own ID", () => {
    const expanded = expandRecurring(repeating(), SAMPLE_COURSE);
    expect(expanded).toHaveLength(5);
    expect(expanded[0]).toMatchObject({ title: "Reflection paper", date: "2027-01-18", time: { kind: "class-time" } });
    const ics = buildCalendar(SAMPLE_COURSE, expanded, DEFAULT_REMINDERS);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(new Set(ics.match(/UID:.*/g)).size).toBe(5);
    expect(ics).toContain("DTSTART;TZID=America/New_York:20270118T094500");
  });

  it("joins the ready single and repeating deadlines, leaving out unticked ones", () => {
    expect(calendarDeadlines(SAMPLE_COURSE, SAMPLE_DEADLINES, SAMPLE_RECURRING)).toHaveLength(5 + 5);
    expect(calendarDeadlines(SAMPLE_COURSE, SAMPLE_DEADLINES, [repeating({ include: false })])).toHaveLength(5);
  });
});
