// Reading a week from an .ics calendar file. Times here are "floating" (no
// time zone), so they read the same on any machine.

import { describe, it, expect } from "vitest";
import { readIcs, shortLocation, weekStart } from "../nutrition/calendarImport.js";

const ics = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events, "END:VCALENDAR"].join("\r\n");

const event = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

// The week of Monday 2 November 2026.
const week = new Date(2026, 10, 2);

describe("weekStart", () => {
  it("is the Monday of the date's week, at midnight", () => {
    expect(weekStart(new Date(2026, 10, 5, 15, 30))).toEqual(week); // a Thursday
    expect(weekStart(new Date(2026, 10, 8, 9))).toEqual(week); // the Sunday after
    expect(weekStart(week)).toEqual(week);
  });
});

describe("readIcs", () => {
  it("expands a weekly class into each of its days that week, with its location", () => {
    const file = ics(
      event(
        "UID:fnce",
        "SUMMARY:FNCE 6110",
        "LOCATION:Jon M. Huntsman Hall\\, 3730 Walnut St\\, Philadelphia",
        "DTSTART:20260831T101500",
        "DTEND:20260831T114500",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261210T235959",
      ),
    );
    expect(readIcs(file, week)).toEqual([
      { day: "mon", start: "10:15", end: "11:45", label: "FNCE 6110", location: "Jon M. Huntsman Hall" },
      { day: "wed", start: "10:15", end: "11:45", label: "FNCE 6110", location: "Jon M. Huntsman Hall" },
    ]);
  });

  it("leaves out excluded and cancelled occurrences, and uses moved ones", () => {
    const file = ics(
      event(
        "UID:stat",
        "SUMMARY:STAT 6130",
        "DTSTART:20260901T083000",
        "DTEND:20260901T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
        "EXDATE:20261103T083000",
      ),
      event("UID:stat", "RECURRENCE-ID:20261105T083000", "SUMMARY:STAT 6130 (moved)", "DTSTART:20261105T140000", "DTEND:20261105T153000"),
    );
    expect(readIcs(file, week)).toEqual([
      { day: "thu", start: "14:00", end: "15:30", label: "STAT 6130 (moved)", location: null },
    ]);
  });

  it("includes one-off events in the week and skips all-day, cancelled and other weeks' events", () => {
    const file = ics(
      event("UID:a", "SUMMARY:Coffee chat", "DTSTART:20261106T160000", "DTEND:20261106T163000"),
      event("UID:b", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261103", "DTEND;VALUE=DATE:20261104"),
      event("UID:c", "SUMMARY:Cancelled", "STATUS:CANCELLED", "DTSTART:20261104T120000", "DTEND:20261104T130000"),
      event("UID:d", "SUMMARY:Next week", "DTSTART:20261110T120000", "DTEND:20261110T130000"),
    );
    expect(readIcs(file, week)).toEqual([
      { day: "fri", start: "16:00", end: "16:30", label: "Coffee chat", location: null },
    ]);
  });

  it("cuts an event that runs past midnight at the end of its first day", () => {
    const file = ics(event("UID:late", "SUMMARY:Hackathon", "DTSTART:20261107T200000", "DTEND:20261108T020000"));
    expect(readIcs(file, week)).toEqual([{ day: "sat", start: "20:00", end: "23:59", label: "Hackathon", location: null }]);
  });

  it("throws on a file that isn't a calendar", () => {
    expect(() => readIcs("hello", week)).toThrow();
  });
});

describe("shortLocation", () => {
  it("keeps the part before the first comma", () => {
    expect(shortLocation("2040 Market St, Philadelphia, PA")).toBe("2040 Market St");
    expect(shortLocation("  ")).toBeNull();
    expect(shortLocation(undefined)).toBeNull();
  });
});
