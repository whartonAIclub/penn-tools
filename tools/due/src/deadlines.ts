// Turning what the outline says ("Week 5, Day 3", "due before class") into a
// real date and time, and spotting deadlines the student still needs to fix.

import { addDays, formatDate, isDate, isTime, mondayOf, weekdayOf } from "./dates.js";
import { WEEKDAY_LABELS, type CourseDetails, type Deadline } from "./types.js";

/** The Monday that starts `week` of the course, or null without a Week 1 date. */
export function weekStart(course: CourseDetails, week: number): string | null {
  if (!isDate(course.week1Start) || week < 1) return null;
  return addDays(mondayOf(course.week1Start), 7 * (week - 1));
}

/** The deadline's date: the one given, or worked out from its week and day. */
export function resolveDate(deadline: Deadline, course: CourseDetails): string | null {
  if (isDate(deadline.date)) return deadline.date;
  if (deadline.week === null || deadline.day === null) return null;
  const start = weekStart(course, deadline.week);
  return start ? addDays(start, deadline.day - 1) : null;
}

/** What the outline said about the deadline's week, for showing next to the date. */
export function weekHint(deadline: Deadline, course: CourseDetails): string | null {
  if (deadline.week === null) return null;
  const label = `Week ${deadline.week}${deadline.day !== null ? `, Day ${deadline.day}` : ""}`;
  const start = weekStart(course, deadline.week);
  if (deadline.day !== null || !start) return `Outline: ${label}`;
  return `Outline: ${label} (${formatDate(start)} – ${formatDate(addDays(start, 6))})`;
}

/** Why the deadline can't go in the calendar yet, or null if it's ready. */
export function deadlineProblem(deadline: Deadline, course: CourseDetails): string | null {
  if (!deadline.title.trim()) return "Add a title.";

  const date = resolveDate(deadline, course);
  if (!date) {
    if (deadline.week !== null && deadline.day !== null && !isDate(course.week1Start)) {
      return "Add the first week of classes in course details, or pick a date.";
    }
    return "Pick a date.";
  }

  if (deadline.time.kind === "class-time") {
    if (!isTime(course.classStart)) return "Add the class time in course details, or pick another time.";
    const weekday = weekdayOf(date);
    if (course.classDays.length > 0 && !course.classDays.includes(weekday)) {
      return `There's no class on ${WEEKDAY_LABELS[weekday - 1]}. Pick another date or time.`;
    }
  }
  if (deadline.time.kind === "custom" && !isTime(deadline.time.time)) return "Pick a time.";
  return null;
}
