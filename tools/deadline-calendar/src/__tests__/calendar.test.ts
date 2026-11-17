import { describe, it, expect } from "vitest";
import {
  buildCalendar,
  calendarEventCount,
  calendarFileName,
  courseCode,
  escapeText,
  eventTitle,
  foldLine,
  gradeLines,
  type CalendarCourse,
} from "../calendar.js";
import type { Deadline, GradingCategory } from "../extract.js";

/** ACCT 6130's grading, as the tool reads it. */
const ACCT_GRADING: GradingCategory[] = [
  { category: "Class engagement", percent: 10, count: null, counted: null },
  { category: "Quizzes", percent: 10, count: 7, counted: 5 },
  { category: "Homework", percent: 16, count: 5, counted: 4 },
  { category: "Midterm exam", percent: 30, count: 1, counted: 1 },
  { category: "Final exam", percent: 34, count: 1, counted: 1 },
];

const NOW = new Date("2026-11-13T15:04:05Z");
const ACCT = "ACCT 6130: Fundamentals of Financial and Managerial Accounting";

function deadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    title: "Quiz #3",
    type: "quiz",
    date: "2026-09-29",
    time: "23:59",
    endTime: null,
    section: null,
    needsReview: false,
    note: null,
    category: "Quizzes",
    ...overrides,
  };
}

/** The file's lines, unfolded, for checking properties without caring where long lines broke. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

/** Each VEVENT's lines. */
function events(ics: string): string[][] {
  const all = lines(ics);
  const result: string[][] = [];
  let current: string[] | null = null;
  for (const line of all) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT") {
      result.push(current!);
      current = null;
    } else current?.push(line);
  }
  return result;
}

/** A calendar of these classes, with no grading unless a class gives some. */
function build(...courses: (Omit<CalendarCourse, "grading"> & { grading?: GradingCategory[] })[]): string {
  return buildCalendar(
    courses.map((c) => ({ ...c, grading: c.grading ?? [] })),
    NOW,
  );
}

/** An event's description, unescaped. */
function description(event: string[]): string {
  return event.find((l) => l.startsWith("DESCRIPTION:"))!.slice("DESCRIPTION:".length).replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
}

describe("buildCalendar", () => {
  it("is a calendar with CRLF line endings and Philadelphia's time zone", () => {
    const ics = build({ course: ACCT, deadlines: [deadline()] });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    expect(lines(ics)).toContain("TZID:America/New_York");
  });

  it("makes a deadline with a due time an all-day event, the time in its description", () => {
    const [event] = events(build({ course: ACCT, deadlines: [deadline()] }));
    expect(event).toContain("DTSTART;VALUE=DATE:20260929");
    expect(event).toContain("DTEND;VALUE=DATE:20260930");
    expect(event).toContain("SUMMARY:ACCT 6130: Quiz #3");
    expect(event).toContain("TRANSP:TRANSPARENT");
    expect(event!.find((l) => l.startsWith("DESCRIPTION:"))).toContain("Due 11:59pm ET");
  });

  it("keeps an exam's hours, in Philadelphia time", () => {
    const midterm = deadline({ title: "Midterm exam", type: "exam", date: "2026-10-08", time: "08:00", endTime: "10:00" });
    const [event] = events(build({ course: ACCT, deadlines: [midterm] }));
    expect(event).toContain("DTSTART;TZID=America/New_York:20261008T080000");
    expect(event).toContain("DTEND;TZID=America/New_York:20261008T100000");
    expect(event).toContain("TRANSP:OPAQUE");
    expect(event!.find((l) => l.startsWith("DESCRIPTION:"))).not.toContain("Due");
  });

  it("makes a deadline without a time all-day, with no due time", () => {
    const [event] = events(build({ course: ACCT, deadlines: [deadline({ time: null })] }));
    expect(event).toContain("DTSTART;VALUE=DATE:20260929");
    expect(event!.find((l) => l.startsWith("DESCRIPTION:"))).not.toContain("Due");
  });

  it("ends an all-day event on the next day across month and year ends", () => {
    const ics = build({ course: ACCT, deadlines: [deadline({ date: "2026-12-31" }), deadline({ title: "Quiz #4", date: "2026-09-30" })] });
    expect(lines(ics)).toContain("DTEND;VALUE=DATE:20270101");
    expect(lines(ics)).toContain("DTEND;VALUE=DATE:20261001");
  });

  it("leaves out undated deadlines", () => {
    const ics = build({ course: ACCT, deadlines: [deadline(), deadline({ title: "Quizzes", date: null })] });
    expect(events(ics)).toHaveLength(1);
  });

  it("puts every class's deadlines in one calendar", () => {
    const ics = build(
      { course: ACCT, deadlines: [deadline()] },
      { course: "BEPP 6120: Advanced Microeconomics for Managers", deadlines: [deadline({ title: "Problem set 2" })] },
    );
    expect(events(ics).map((e) => e.find((l) => l.startsWith("SUMMARY:")))).toEqual([
      "SUMMARY:ACCT 6130: Quiz #3",
      "SUMMARY:BEPP 6120: Problem set 2",
    ]);
  });

  it("describes a quiz with its due time, what it's worth and the class's grading", () => {
    const [event] = events(build({ course: ACCT, deadlines: [deadline()], grading: ACCT_GRADING }));
    expect(description(event!)).toBe(
      [
        "Due 11:59pm ET",
        "Worth: 2% of your grade",
        "Dropped: 2 of 7 (your best 5 count)",
        "Grading: Class engagement 10% · Quizzes 10% · Homework 16% · Midterm exam 30% · Final exam 34%",
        "",
        ACCT,
        "From your syllabus, via Penn Tools Deadline Calendar. Check Canvas for any changes.",
      ].join("\n"),
    );
  });

  it("gives each event a UID from its course, section and title, not its date", () => {
    const before = events(build({ course: ACCT, deadlines: [deadline()] }))[0]!;
    const after = events(build({ course: ACCT, deadlines: [deadline({ date: "2026-10-01" })] }))[0]!;
    const uid = (event: string[]) => event.find((l) => l.startsWith("UID:"));
    expect(uid(before)).toBe("UID:acct-6130-quiz-3@deadline-calendar.penntools");
    expect(uid(after)).toBe(uid(before));
  });

  it("keeps UIDs unique, without clashing with similarly numbered titles", () => {
    const ics = build({
      course: ACCT,
      deadlines: [deadline({ title: "Quiz #3" }), deadline({ title: "Quiz #3", date: "2026-10-01" }), deadline({ title: "Quiz #2" })],
    });
    const uids = lines(ics).filter((l) => l.startsWith("UID:"));
    expect(uids).toEqual([
      "UID:acct-6130-quiz-3@deadline-calendar.penntools",
      "UID:acct-6130-quiz-3--2@deadline-calendar.penntools",
      "UID:acct-6130-quiz-2@deadline-calendar.penntools",
    ]);
  });

  it("names the section in the UID and description when there is one", () => {
    const [event] = events(build({ course: "MKTG 612: Dynamic Marketing Strategy", deadlines: [deadline({ title: "Guest Analyst #1", section: "TR sections" })] }));
    expect(event).toContain("UID:mktg-612-tr-sections-guest-analyst-1@deadline-calendar.penntools");
    expect(event!.find((l) => l.startsWith("DESCRIPTION:"))).toContain("Section: TR sections");
  });

  it("stamps every event with the time it was built, in UTC", () => {
    expect(lines(build({ course: ACCT, deadlines: [deadline()] }))).toContain("DTSTAMP:20261113T150405Z");
  });

  it("escapes commas and semicolons in titles", () => {
    const [event] = events(build({ course: ACCT, deadlines: [deadline({ title: "Case: A, B; C" })] }));
    expect(event).toContain("SUMMARY:ACCT 6130: Case: A\\, B\\; C");
  });
});

describe("gradeLines", () => {
  it("gives a single exam its whole category, with nothing dropped", () => {
    const midterm = deadline({ title: "Midterm exam", type: "exam", category: "Midterm exam" });
    expect(gradeLines(ACCT_GRADING, midterm).slice(0, 2)).toEqual(["Worth: 30% of your grade", "Dropped: none"]);
  });

  it("divides a category among the items that count, to one decimal place", () => {
    const homework = deadline({ title: "Homework #2", category: "homework" }); // matched ignoring case
    expect(gradeLines(ACCT_GRADING, homework).slice(0, 2)).toEqual(["Worth: 4% of your grade", "Dropped: 1 of 5 (your best 4 count)"]);
    const grading = [{ category: "Quizzes", percent: 10, count: 7, counted: 7 }];
    expect(gradeLines(grading, deadline()).slice(0, 2)).toEqual(["Worth: 1.4% of your grade", "Dropped: none, all 7 count"]);
  });

  it("names the category when the syllabus doesn't say how many items it has", () => {
    const participation = deadline({ title: "Case write-up", category: "Class engagement" });
    expect(gradeLines(ACCT_GRADING, participation)[0]).toBe("Worth: part of Class engagement (10% of your grade)");
  });

  it("gives only the grading when the deadline's category isn't in it", () => {
    expect(gradeLines(ACCT_GRADING, deadline({ category: null }))).toEqual([
      "Grading: Class engagement 10% · Quizzes 10% · Homework 16% · Midterm exam 30% · Final exam 34%",
    ]);
  });

  it("gives nothing when the syllabus has no grading", () => {
    expect(gradeLines([], deadline())).toEqual([]);
  });
});

describe("foldLine", () => {
  it("leaves lines of up to 75 bytes alone", () => {
    expect(foldLine("x".repeat(75))).toBe("x".repeat(75));
  });

  it("folds longer lines so no line passes 75 bytes", () => {
    const folded = foldLine("SUMMARY:" + "é".repeat(100));
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é".repeat(100));
  });
});

describe("escapeText", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
});

describe("courseCode and eventTitle", () => {
  it("takes the code before the colon", () => {
    expect(courseCode(ACCT)).toBe("ACCT 6130");
    expect(courseCode(null)).toBeNull();
  });

  it("leaves the code out of the title when there's no course", () => {
    expect(eventTitle(null, deadline({ type: "other", title: "Group project" }))).toBe("Group project");
  });
});

describe("one class's calendar", () => {
  it("is named for the class, in its name and its file name", () => {
    const ics = buildCalendar([{ course: ACCT, deadlines: [deadline()], grading: [] }], NOW, "ACCT 6130 deadlines");
    expect(lines(ics)).toContain("X-WR-CALNAME:ACCT 6130 deadlines");
    expect(calendarFileName(ACCT)).toBe("acct-6130-deadlines.ics");
    expect(calendarFileName(null)).toBe("deadlines.ics");
  });

  it("names the all-classes calendar Deadline Calendar", () => {
    expect(lines(build({ course: ACCT, deadlines: [deadline()] }))).toContain("X-WR-CALNAME:Deadline Calendar");
  });
});

describe("calendarEventCount", () => {
  it("counts the dated deadlines", () => {
    expect(calendarEventCount([{ course: ACCT, deadlines: [deadline(), deadline({ date: null })], grading: [] }])).toBe(1);
  });
});
