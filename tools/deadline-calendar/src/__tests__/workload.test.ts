import { describe, it, expect } from "vitest";
import type { Deadline } from "../extract.js";
import { BUSY_WEEK_LOAD, busyWeeks, weekStart } from "../workload.js";

const TODAY = "2026-11-13"; // a Friday

function deadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    title: "Homework",
    type: "assignment",
    date: "2026-11-17",
    time: "23:59",
    endTime: null,
    section: null,
    needsReview: false,
    note: null,
    category: null,
    ...overrides,
  };
}

describe("weekStart", () => {
  it("is the Monday of the date's week, Sundays included", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(weekStart("2026-11-19")).toBe("2026-11-16"); // Thursday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(weekStart("2026-12-01")).toBe("2026-11-30"); // across a month end
  });
});

describe("busyWeeks", () => {
  it("flags two quizzes and two homeworks in one week", () => {
    const weeks = busyWeeks(
      [
        { course: "ACCT 6130", deadlines: [deadline({ type: "quiz", date: "2026-11-19" }), deadline({ date: "2026-11-16" })] },
        { course: "BEPP 6120", deadlines: [deadline({ type: "quiz", date: "2026-11-17" }), deadline({ date: "2026-11-20" })] },
      ],
      TODAY,
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ start: "2026-11-16", end: "2026-11-22", load: BUSY_WEEK_LOAD });
    // Earliest first, each with its class.
    expect(weeks[0]!.items.map((i) => `${i.course} ${i.deadline.date}`)).toEqual([
      "ACCT 6130 2026-11-16",
      "BEPP 6120 2026-11-17",
      "ACCT 6130 2026-11-19",
      "BEPP 6120 2026-11-20",
    ]);
  });

  it("flags two exams in one week", () => {
    const exams = [deadline({ type: "exam", date: "2026-12-02" }), deadline({ type: "exam", date: "2026-12-03" })];
    expect(busyWeeks([{ course: null, deadlines: exams }], TODAY)).toHaveLength(1);
  });

  it("doesn't flag five homeworks", () => {
    const homeworks = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"].map((date) => deadline({ date }));
    expect(busyWeeks([{ course: null, deadlines: homeworks }], TODAY)).toEqual([]);
  });

  it("ignores past and undated deadlines", () => {
    const deadlines = [
      deadline({ type: "exam", date: "2026-11-12" }), // yesterday
      deadline({ type: "exam", date: null }),
      deadline({ type: "exam", date: "2026-11-13" }), // today counts
    ];
    expect(busyWeeks([{ course: null, deadlines }], TODAY)).toEqual([]);
  });

  it("counts a deadline listed once per section once, with every section's date", () => {
    const townHall = (date: string, section: string) =>
      deadline({ title: "6-minute team town hall", type: "presentation", date, section });
    const weeks = busyWeeks(
      [
        {
          course: "WHCP 6160X",
          deadlines: [
            townHall("2026-12-02", "Wednesday sections"),
            townHall("2026-11-30", "Monday sections"),
            townHall("2026-12-01", "Tuesday and Thursday sections"),
          ],
        },
        { course: "BEPP 6120", deadlines: [deadline({ type: "exam", date: "2026-12-02" }), deadline({ type: "assignment", date: "2026-11-30" })] },
      ],
      TODAY,
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.load).toBe(2 + 3 + 1); // the town hall once, the exam, the problem set
    const merged = weeks[0]!.items.find((i) => i.course === "WHCP 6160X")!;
    expect(merged.dates).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(weeks[0]!.items).toHaveLength(3);
  });

  it("keeps same-named deadlines without sections apart", () => {
    const reading = (date: string) => deadline({ title: "Reading response", type: "quiz", date });
    const weeks = busyWeeks([{ course: null, deadlines: [reading("2026-11-16"), reading("2026-11-18"), reading("2026-11-20")] }], TODAY);
    expect(weeks[0]!.items).toHaveLength(3);
  });

  it("lists busy weeks earliest first", () => {
    const exam = (date: string) => deadline({ type: "exam", date });
    const weeks = busyWeeks([{ course: null, deadlines: [exam("2026-12-02"), exam("2026-12-03"), exam("2026-11-16"), exam("2026-11-18")] }], TODAY);
    expect(weeks.map((w) => w.start)).toEqual(["2026-11-16", "2026-11-30"]);
  });
});
