// The .ics file a weekend downloads as.

import { describe, it, expect } from "vitest";
import { icsFilename, toICS } from "../calendar.js";
import type { ScheduleItem, WeekendSchedule } from "../schedule.js";

function item(overrides: Partial<ScheduleItem>): ScheduleItem {
  return {
    date: "2026-11-13",
    start: "09:00",
    end: "12:00",
    kind: "class",
    title: "Corporate Finance",
    course: "FNCE 6130",
    instructor: "Kurmann",
    location: "Huntsman Hall 365",
    section: "Section 1",
    signupOnly: false,
    notes: null,
    ...overrides,
  };
}

const schedule: WeekendSchedule = {
  title: "Class weekend · November 13–14",
  program: "WEMBA 52",
  sections: ["Section 1", "Section 2"],
  items: [],
  logistics: [],
  upcoming: [],
  warnings: [],
};

const NOW = new Date("2026-11-09T15:04:05.678Z");

/** The file's lines, unfolded. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("toICS", () => {
  it("writes a timed item in Philadelphia time", () => {
    const ics = toICS(schedule, [item({})], NOW);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(lines(ics)).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "TZID:America/New_York",
        "DTSTAMP:20261109T150405Z",
        "DTSTART;TZID=America/New_York:20261113T090000",
        "DTEND;TZID=America/New_York:20261113T120000",
        "SUMMARY:Corporate Finance",
        "LOCATION:Huntsman Hall 365",
        "DESCRIPTION:FNCE 6130\\nKurmann\\nSection 1",
        "CATEGORIES:CLASS",
        "END:VCALENDAR",
      ]),
    );
  });

  it("makes an untimed item all-day, and gives one without an end an hour", () => {
    const ics = lines(
      toICS(schedule, [item({ start: null, end: null }), item({ date: "2026-11-30", start: "18:30", end: null })], NOW),
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261113");
    expect(ics).toContain("DTEND;VALUE=DATE:20261114");
    expect(ics).toContain("DTEND;TZID=America/New_York:20261130T193000");
  });

  it("marks sign-up events, escapes text and leaves out bad dates", () => {
    const ics = lines(
      toICS(
        schedule,
        [item({ title: "Lunch; with alumni, 2026", signupOnly: true, notes: "Bring\nID" }), item({ date: "Nov 14" })],
        NOW,
      ),
    );
    expect(ics).toContain("SUMMARY:Lunch\\; with alumni\\, 2026 (if you signed up)");
    expect(ics.find((l) => l.startsWith("DESCRIPTION:"))).toContain("Bring\\nID");
    expect(ics.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  });

  it("gives the same item the same UID, and different items different ones", () => {
    const uids = (items: ScheduleItem[]) => lines(toICS(schedule, items, NOW)).filter((l) => l.startsWith("UID:"));
    const [a] = uids([item({})]);
    expect(uids([item({})])).toEqual([a]);
    expect(uids([item({ section: "Section 2" })])).not.toEqual([a]);
  });

  it("folds long lines at 75 bytes without splitting characters", () => {
    const ics = toICS(schedule, [item({ notes: "Café · ".repeat(40) })], NOW);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines(ics).find((l) => l.startsWith("DESCRIPTION:"))).toContain("Café · ".repeat(40).trimEnd());
  });
});

describe("icsFilename", () => {
  it("names the file for the weekend and section", () => {
    expect(icsFilename([item({})], "Section 1")).toBe("wemba-weekend-2026-11-13-section-1.ics");
    expect(icsFilename([item({})], null)).toBe("wemba-weekend-2026-11-13.ics");
    expect(icsFilename([], null)).toBe("wemba-weekend.ics");
  });
});
