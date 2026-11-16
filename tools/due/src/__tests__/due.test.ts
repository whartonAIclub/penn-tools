import { describe, it, expect } from "vitest";
import { addDays, formatTime, mondayOf, weekdayOf } from "../dates.js";
import { deadlineProblem, guessExplanation, isGuessedDate, resolveDate, weekHint } from "../deadlines.js";
import { buildCalendar, calendarFileName, eventTitle } from "../ics.js";
import { SAMPLE_COURSE, SAMPLE_DEADLINES } from "../samples.js";
import { DEFAULT_REMINDERS, type Deadline } from "../types.js";

const NOW = new Date("2026-11-10T17:00:00Z");

function deadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: "d",
    title: "Problem Set 1",
    kind: "assignment",
    date: "2027-01-27",
    week: null,
    day: null,
    time: { kind: "all-day" },
    include: true,
    note: null,
    ...overrides,
  };
}

/** The calendar's lines, with folded lines joined back up. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("dates", () => {
  it("counts weekdays from Monday and works across months", () => {
    expect(weekdayOf("2027-01-11")).toBe(1);
    expect(weekdayOf("2027-01-17")).toBe(7);
    expect(mondayOf("2027-01-13")).toBe("2027-01-11");
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("23:59")).toBe("11:59 PM");
  });
});

describe("resolveDate", () => {
  it("turns Week 5, Day 3 into the Wednesday of the fifth week", () => {
    expect(resolveDate(deadline({ date: null, week: 5, day: 3 }), SAMPLE_COURSE)).toBe("2027-02-10");
  });

  it("prefers a picked date over the week", () => {
    expect(resolveDate(deadline({ date: "2027-03-01", week: 5, day: 3 }), SAMPLE_COURSE)).toBe("2027-03-01");
  });

  it("guesses the week's first class when the outline gives only a week, for the student to confirm", () => {
    const weekOnly = deadline({ date: null, week: 8 });
    expect(resolveDate(weekOnly, SAMPLE_COURSE)).toBe("2027-03-01");
    expect(resolveDate(weekOnly, { ...SAMPLE_COURSE, classDays: [3, 4] })).toBe("2027-03-03");
    expect(resolveDate(weekOnly, { ...SAMPLE_COURSE, classDays: [] })).toBe("2027-03-01");
    expect(isGuessedDate(weekOnly, SAMPLE_COURSE)).toBe(true);
    expect(guessExplanation(weekOnly, SAMPLE_COURSE)).toBe("Due picked Mon, Mar 1, the first class in Week 8. Please confirm.");
  });

  it("never guesses a date before the first day of classes", () => {
    // Week 1 starts on Wednesday, Jan 13, so its Monday isn't a class.
    expect(resolveDate(deadline({ date: null, week: 1 }), SAMPLE_COURSE)).toBe("2027-01-13");
    expect(resolveDate(deadline({ date: null, week: 1 }), { ...SAMPLE_COURSE, classDays: [] })).toBe("2027-01-13");
  });

  it("stops guessing once the student picks a date, or when the outline names the day", () => {
    expect(isGuessedDate(deadline({ date: "2027-03-02", week: 8 }), SAMPLE_COURSE)).toBe(false);
    expect(isGuessedDate(deadline({ date: null, week: 8, day: 5 }), SAMPLE_COURSE)).toBe(false);
    expect(guessExplanation(deadline({ date: null, week: 8, day: 5 }), SAMPLE_COURSE)).toBeNull();
  });

  it("has no date for a week without a Week 1 date", () => {
    const noWeek1 = { ...SAMPLE_COURSE, week1Start: null };
    expect(resolveDate(deadline({ date: null, week: 5, day: 3 }), noWeek1)).toBeNull();
    expect(resolveDate(deadline({ date: null, week: 8 }), noWeek1)).toBeNull();
    expect(deadlineProblem(deadline({ date: null, week: 8 }), noWeek1)).toBe(
      "Add the first day of classes in course details, or pick a date.",
    );
  });

  it("shows the week's dates when the outline gives only a week", () => {
    expect(weekHint(deadline({ date: null, week: 8 }), SAMPLE_COURSE)).toBe("Outline: Week 8 (Week 8 is Mon, Mar 1 – Sun, Mar 7)");
  });
});

describe("deadlineProblem", () => {
  it("is null for a ready deadline", () => {
    expect(deadlineProblem(deadline(), SAMPLE_COURSE)).toBeNull();
  });

  it("asks for a title, a date and a time", () => {
    expect(deadlineProblem(deadline({ title: " " }), SAMPLE_COURSE)).toBe("Add a title.");
    expect(deadlineProblem(deadline({ date: null }), SAMPLE_COURSE)).toBe("Pick a date.");
    expect(deadlineProblem(deadline({ time: { kind: "custom", time: "" } }), SAMPLE_COURSE)).toBe("Pick a time.");
  });

  it("flags class time on a day without class, or without a class time", () => {
    const tuesday = deadline({ date: "2027-01-26", time: { kind: "class-time" } });
    expect(deadlineProblem(tuesday, SAMPLE_COURSE)).toBe("There's no class on Tue. Pick another date or time.");
    expect(deadlineProblem(tuesday, { ...SAMPLE_COURSE, classStart: null })).toBe(
      "Add the class time in course details, or pick another time.",
    );
  });

  it("leaves one sample deadline for the student to fix, and one to confirm", () => {
    const problems = SAMPLE_DEADLINES.filter((d) => deadlineProblem(d, SAMPLE_COURSE) !== null).map((d) => d.title);
    expect(problems).toEqual(["Final exam"]);
    expect(SAMPLE_DEADLINES.filter((d) => isGuessedDate(d, SAMPLE_COURSE)).map((d) => d.title)).toEqual(["Group project proposal"]);
  });
});

describe("buildCalendar", () => {
  it("makes an all-day deadline a free, all-day event with its reminder", () => {
    const ics = lines(buildCalendar(SAMPLE_COURSE, [deadline()], DEFAULT_REMINDERS, NOW));
    expect(ics).toContain("DTSTART;VALUE=DATE:20270127");
    expect(ics).toContain("DTEND;VALUE=DATE:20270128");
    expect(ics).toContain("TRANSP:TRANSPARENT");
    expect(ics).toContain("TRIGGER:PT540M");
    expect(ics).toContain("SUMMARY:DUE: Problem Set 1 (FNCE 6110)");
    expect(ics.find((l) => l.startsWith("DESCRIPTION:Due"))).toContain("Due Wed\\, Jan 27 (all day)");
  });

  it("ends an assignment's event at its due time, says when it's due, and reminds before the event starts", () => {
    const ics = lines(
      buildCalendar(SAMPLE_COURSE, [deadline({ time: { kind: "end-of-day" } })], DEFAULT_REMINDERS, NOW),
    );
    expect(ics).toContain("DTSTART;TZID=America/New_York:20270127T232900");
    expect(ics).toContain("DTEND;TZID=America/New_York:20270127T235900");
    expect(ics).toContain("DESCRIPTION:Due Wed\\, Jan 27 at 11:59 PM\\nCourse: FNCE 6110\\nAdded by Due on PennTools.");
    // 3 hours before it's due is 150 minutes before the event; 30 minutes before is when it starts
    expect(ics).toContain("TRIGGER:-PT150M");
    expect(ics).toContain("TRIGGER:PT0M");
    expect(ics.filter((l) => l.startsWith("TRIGGER")).every((l) => l.includes("-") || l.endsWith("PT0M"))).toBe(true);
  });

  it("starts an assignment's event the day before when it's due just after midnight", () => {
    const ics = lines(
      buildCalendar(SAMPLE_COURSE, [deadline({ time: { kind: "custom", time: "00:10" } })], DEFAULT_REMINDERS, NOW),
    );
    expect(ics).toContain("DTSTART;TZID=America/New_York:20270126T234000");
    expect(ics).toContain("DTEND;TZID=America/New_York:20270127T001000");
  });

  it("puts a class-time exam in the class's slot", () => {
    const exam = deadline({ kind: "exam", title: "Midterm", date: "2027-02-24", time: { kind: "class-time" } });
    const ics = lines(buildCalendar(SAMPLE_COURSE, [exam], DEFAULT_REMINDERS, NOW));
    expect(ics).toContain("DTSTART;TZID=America/New_York:20270224T101500");
    expect(ics).toContain("DTEND;TZID=America/New_York:20270224T114500");
    expect(ics).toContain("TRIGGER:-PT180M");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics.find((l) => l.startsWith("DESCRIPTION:Exam"))).toBe(
      "DESCRIPTION:Exam Wed\\, Feb 24\\, 10:15 AM – 11:45 AM\\nCourse: FNCE 6110\\nAdded by Due on PennTools.",
    );
    expect(ics).toContain("SUMMARY:EXAM: Midterm (FNCE 6110)");
  });

  it("leaves out unticked deadlines and ones that aren't ready", () => {
    const ics = buildCalendar(SAMPLE_COURSE, SAMPLE_DEADLINES, DEFAULT_REMINDERS, NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    const unticked = SAMPLE_DEADLINES.map((d) => ({ ...d, include: false }));
    expect(buildCalendar(SAMPLE_COURSE, unticked, DEFAULT_REMINDERS, NOW)).not.toContain("BEGIN:VEVENT");
  });

  it("gives the same deadline the same event ID in every download, and duplicates their own", () => {
    const twice = [deadline({ id: "a" }), deadline({ id: "b" })];
    const first = lines(buildCalendar(SAMPLE_COURSE, twice, DEFAULT_REMINDERS, NOW));
    const later = lines(buildCalendar(SAMPLE_COURSE, twice, DEFAULT_REMINDERS, new Date("2027-01-01T00:00:00Z")));
    const ids = first.filter((l) => l.startsWith("UID:"));
    expect(ids).toEqual(["UID:fnce-6110-problem-set-1@due.penntools.org", "UID:fnce-6110-problem-set-1-2@due.penntools.org"]);
    expect(later.filter((l) => l.startsWith("UID:"))).toEqual(ids);
  });

  it("escapes text and keeps every line within 75 bytes", () => {
    const long = deadline({ title: "Reading response; chapters 1, 2 and 3 — the long version of the title goes on" });
    const ics = buildCalendar(SAMPLE_COURSE, [long], DEFAULT_REMINDERS, NOW);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(lines(ics).find((l) => l.startsWith("SUMMARY:"))).toContain("Reading response\\; chapters 1\\, 2");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("names", () => {
  it("names the file and events after the course", () => {
    expect(calendarFileName(SAMPLE_COURSE)).toBe("due-fnce-6110.ics");
    expect(calendarFileName({ ...SAMPLE_COURSE, name: "" })).toBe("due-course.ics");
    expect(eventTitle(deadline(), { ...SAMPLE_COURSE, name: "" })).toBe("DUE: Problem Set 1");
  });
});
