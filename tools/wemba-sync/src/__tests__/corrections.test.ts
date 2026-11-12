// The fixes for what the program's PDF leaves out.

import { describe, it, expect } from "vitest";
import { applyCorrections } from "../corrections.js";
import type { ScheduleItem, WeekendSchedule } from "../schedule.js";

function item(overrides: Partial<ScheduleItem>): ScheduleItem {
  return {
    date: "2026-11-13",
    start: "09:00",
    end: "12:00",
    kind: "class",
    title: "FNCE 6130",
    course: "FNCE 6130",
    instructor: "Kurmann",
    location: "Huntsman Hall 365",
    section: "Section 1",
    signupOnly: false,
    notes: null,
    ...overrides,
  };
}

function weekend(overrides: Partial<WeekendSchedule>): WeekendSchedule {
  return {
    title: "Class weekend · November 13–14",
    program: "WEMBA 52",
    sections: ["Section 1", "Section 2"],
    items: [],
    logistics: [],
    upcoming: [],
    warnings: [],
    ...overrides,
  };
}

describe("applyCorrections", () => {
  const november = weekend({
    items: [
      item({}),
      item({ start: null, end: null, kind: "event", title: "Executive Perspectives", course: null, instructor: null, location: null, section: null }),
      item({ start: "12:00", end: "13:00", kind: "meal", title: "Lunch", section: null }),
    ],
    upcoming: [
      { date: "2026-12-03", endDate: null, title: "Meeting with alumna Bo Zhao", details: "On Zoom" },
      { date: "2026-12-04", endDate: "2026-12-05", title: "Class weekend", details: null },
    ],
    warnings: ["Corrected Friday lunch from 12:00am to 12:00pm.", "Executive Perspectives is listed without a time."],
  });

  it("makes Executive Perspectives and the Bo Zhao meeting one event, with its time, room and description", () => {
    const fixed = applyCorrections(november);
    const sessions = fixed.items.filter((i) => /executive perspectives|bo zhao/i.test(i.title));
    expect(sessions).toEqual([
      {
        date: "2026-11-13",
        start: "19:00",
        end: "20:15",
        kind: "event",
        title: "Executive Perspectives: Meeting with alumna Bo Zhao",
        course: null,
        instructor: null,
        location: "SCC, Parkinson, 2nd Floor",
        section: null,
        signupOnly: false,
        notes: "Bo Zhao, founder and CEO of Baby Gear Group. Food will be provided in the classroom.",
      },
    ]);
  });

  it("adds Beers & Baby from Partiful, 5:30–7pm at Frankford Hall", () => {
    const fixed = applyCorrections(november);
    expect(fixed.items.filter((i) => i.title.startsWith("Beers & Baby"))).toEqual([
      expect.objectContaining({
        date: "2026-11-13",
        start: "17:30",
        end: "19:00",
        kind: "event",
        location: "Frankford Hall, 1210 Frankford Ave, Philadelphia (Fishtown)",
        section: null,
        notes: expect.stringContaining("https://partiful.com/e/IwmpJ5kg9AiaAc1nNDdX"),
      }),
    ]);
  });

  it("drops the PDF's own entries and warnings for them, and keeps everything else in order", () => {
    const fixed = applyCorrections(november);
    expect(fixed.items.map((i) => i.title)).toEqual([
      "FNCE 6130",
      "Lunch",
      "Beers & Baby 🍺💕",
      "Executive Perspectives: Meeting with alumna Bo Zhao",
    ]);
    expect(fixed.upcoming.map((u) => u.title)).toEqual(["Class weekend"]);
    expect(fixed.warnings).toEqual(["Corrected Friday lunch from 12:00am to 12:00pm."]);
  });

  it("adds the events even when the AI left Executive Perspectives out", () => {
    const fixed = applyCorrections(weekend({ items: [item({})] }));
    expect(fixed.items.map((i) => i.title)).toEqual([
      "FNCE 6130",
      "Beers & Baby 🍺💕",
      "Executive Perspectives: Meeting with alumna Bo Zhao",
    ]);
  });

  it("doesn't list Beers & Baby twice if a schedule ever includes it", () => {
    const listed = weekend({
      items: [item({}), item({ start: "17:30", end: null, kind: "event", title: "Beers and Baby", section: null })],
    });
    expect(applyCorrections(listed).items.filter((i) => /beers/i.test(i.title))).toHaveLength(1);
  });

  it("is the same on a second upload", () => {
    expect(applyCorrections(applyCorrections(november))).toEqual(applyCorrections(november));
  });

  it("leaves other weekends alone", () => {
    const december = weekend({
      title: "Class weekend · December 4–5",
      items: [item({ date: "2026-12-04", start: null, end: null, kind: "event", title: "Executive Perspectives", section: null })],
    });
    expect(applyCorrections(december)).toBe(december);
  });
});
