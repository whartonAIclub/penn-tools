// Turning what the outline says ("Week 5, Day 3", "due before class") into a
// real date and time, and spotting deadlines the student still needs to fix.

import { addDays, formatDate, isDate, isTime, mondayOf, weekdayOf } from "./dates.js";
import { WEEKDAY_LABELS, type CourseDetails, type Deadline } from "./types.js";

/** The Monday that starts `week` of the course, or null without a Week 1 date. */
export function weekStart(course: CourseDetails, week: number): string | null {
  if (!isDate(course.week1Start) || week < 1) return null;
  return addDays(mondayOf(course.week1Start), 7 * (week - 1));
}

/**
 * The deadline's date: the one given, or worked out from its week and day.
 * When the outline gives only a week, it's a guess: the week's first class
 * (or its Monday, without class days), the earliest the work is likely due,
 * so a wrong guess reminds the student early rather than late. The review
 * screen asks the student to confirm it (see isGuessedDate).
 */
export function resolveDate(deadline: Deadline, course: CourseDetails): string | null {
  if (isDate(deadline.date)) return deadline.date;
  if (deadline.week === null) return null;
  const start = weekStart(course, deadline.week);
  if (!start) return null;
  if (deadline.day !== null) return addDays(start, deadline.day - 1);
  // The week's first class, but never before the first day of classes (Week 1 can start mid-week).
  const firstDay = course.week1Start!; // weekStart needs it
  const classDates = [...course.classDays].sort((a, b) => a - b).map((d) => addDays(start, d - 1));
  const guess = classDates.find((date) => date >= firstDay) ?? classDates[0] ?? start;
  return guess < firstDay ? firstDay : guess;
}

/** Whether resolveDate guessed the day, because the outline gives only a week and the student hasn't picked a date. */
export function isGuessedDate(deadline: Deadline, course: CourseDetails): boolean {
  return !isDate(deadline.date) && deadline.week !== null && deadline.day === null && weekStart(course, deadline.week) !== null;
}

/** Why the date was picked, for a guessed date, e.g. "Due picked Mon, Nov 30, the first class in Week 3." */
export function guessExplanation(deadline: Deadline, course: CourseDetails): string | null {
  if (!isGuessedDate(deadline, course)) return null;
  const date = resolveDate(deadline, course)!;
  const which = course.classDays.length > 0 ? "the first class" : "the first day";
  return `Due picked ${formatDate(date)}, ${which} in Week ${deadline.week}. Please confirm.`;
}

/**
 * What the outline said about when the deadline is due, for showing next to
 * the date, with the week's dates when it gives a week but no day.
 */
export function weekHint(deadline: Deadline, course: CourseDetails): string | null {
  const said = deadline.note?.trim();
  if (deadline.week === null) return said ? `Outline: “${said}”` : null;
  const label = said
    ? `“${said}”`
    : `Week ${deadline.week}${deadline.day !== null ? `, ${WEEKDAY_LABELS[deadline.day - 1] ?? `Day ${deadline.day}`}` : ""}`;
  const start = weekStart(course, deadline.week);
  if (deadline.day !== null || !start) return `Outline: ${label}`;
  return `Outline: ${label} (Week ${deadline.week} is ${formatDate(start)} – ${formatDate(addDays(start, 6))})`;
}

/** Why the deadline can't go in the calendar yet, or null if it's ready. */
export function deadlineProblem(deadline: Deadline, course: CourseDetails): string | null {
  if (!deadline.title.trim()) return "Add a title.";

  const date = resolveDate(deadline, course);
  if (!date) {
    if (deadline.week !== null && !isDate(course.week1Start)) {
      return "Add the first day of classes in course details, or pick a date.";
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
