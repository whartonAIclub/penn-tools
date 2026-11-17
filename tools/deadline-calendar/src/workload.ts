// ─────────────────────────────────────────────────────────────────────────────
// Busy weeks across all of a student's classes
//
// Each upcoming deadline counts for points by how much work it is (an exam
// more than a homework), and a week, Monday to Sunday, whose deadlines add up
// to BUSY_WEEK_LOAD or more is flagged, so students see the crunch coming.
// Two quizzes and two homeworks make a busy week; so do two exams; five
// homeworks don't. Plain counting, no AI, so it updates as students fix items.
// A deadline the syllabus lists once per section (WHCP's Class 12 town hall
// on Nov 30, Dec 1 or Dec 2) counts once, since a student is in one section.
//
// The page uses it in the browser, so like calendar.ts it imports no runtime
// code and is exported on its own as "@penntools/tool-deadline-calendar/workload".
// ─────────────────────────────────────────────────────────────────────────────

import type { Deadline, DeadlineType } from "./extract.js";

/** How much work each type of deadline is. */
export const LOAD_POINTS: Record<DeadlineType, number> = {
  exam: 3,
  project: 3,
  presentation: 2,
  quiz: 2,
  assignment: 1,
  other: 1,
};

/** A week whose deadlines add up to this many points or more is busy. */
export const BUSY_WEEK_LOAD = 6;

export interface WorkloadCourse {
  course: string | null;
  deadlines: Deadline[];
}

export interface BusyWeek {
  /** The week's Monday and Sunday, YYYY-MM-DD. */
  start: string;
  end: string;
  /** The week's deadlines' points added up. */
  load: number;
  /** The week's deadlines, earliest first, each with its class. */
  items: BusyItem[];
}

export interface BusyItem {
  course: string | null;
  /** The deadline, or its earliest section's version. */
  deadline: Deadline;
  /**
   * Every date it falls on this week, earliest first: one, or one per section
   * when the syllabus gives sections different dates.
   */
  dates: string[];
}

/** Section versions of one deadline share their class and title; other deadlines never merge. */
function sectionKey(course: string | null, deadline: Deadline): string | null {
  return deadline.section === null ? null : `${course ?? ""}\u0000${deadline.title.trim().toLowerCase()}`;
}

/** `date` (YYYY-MM-DD) moved by `days`. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** The Monday of `date`'s week. */
export function weekStart(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); // 0 is Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * The weeks from `today` (YYYY-MM-DD) on whose deadlines, across all the
 * courses, add up to BUSY_WEEK_LOAD points or more, earliest first. Deadlines
 * before today and undated ones don't count, and a deadline's section
 * versions in the same week count once.
 */
export function busyWeeks(courses: WorkloadCourse[], today: string): BusyWeek[] {
  const key = (d: Deadline) => `${d.date} ${d.time ?? "00:00"}`;
  const dated = courses
    .flatMap(({ course, deadlines }) => deadlines.map((deadline) => ({ course, deadline })))
    .filter(({ deadline }) => deadline.date !== null && deadline.date >= today)
    .sort((a, b) => (key(a.deadline) < key(b.deadline) ? -1 : key(a.deadline) > key(b.deadline) ? 1 : 0));

  const weeks = new Map<string, BusyWeek & { bySection: Map<string, BusyItem> }>();
  for (const { course, deadline } of dated) {
    const date = deadline.date!;
    const start = weekStart(date);
    const week = weeks.get(start) ?? {
      start,
      end: addDays(start, 6),
      load: 0,
      items: [] as BusyItem[],
      bySection: new Map<string, BusyItem>(),
    };
    weeks.set(start, week);

    const merge = sectionKey(course, deadline);
    const earlier = merge === null ? undefined : week.bySection.get(merge);
    if (earlier) {
      // Another section's version of a deadline already counted.
      if (!earlier.dates.includes(date)) earlier.dates.push(date);
      continue;
    }
    const item: BusyItem = { course, deadline, dates: [date] };
    week.items.push(item);
    week.load += LOAD_POINTS[deadline.type];
    if (merge !== null) week.bySection.set(merge, item);
  }

  return [...weeks.values()]
    .filter((week) => week.load >= BUSY_WEEK_LOAD)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map(({ bySection: _bySection, ...week }) => week);
}
