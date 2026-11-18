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
 * The deadline's date: the one picked, or else worked out from the outline's
 * week and day. When the outline gives only a week, it's a guess (see
 * guessDate), and the review screen asks the student to confirm it. Once the
 * student clears the date (useWeek false), it stays empty.
 */
export function resolveDate(deadline: Deadline, course: CourseDetails): string | null {
  if (isDate(deadline.date)) return deadline.date;
  if (deadline.week === null || !deadline.useWeek) return null;
  const start = weekStart(course, deadline.week);
  if (!start) return null;
  if (deadline.day !== null) return addDays(start, deadline.day - 1);
  return guessDate(course, start);
}

/**
 * A guessed date for a week the outline gives without a day: the week's first
 * class, the earliest the work is likely due, so a wrong guess reminds the
 * student early rather than late. Never before the first day of classes: Week 1
 * can start mid-week, and when it has no class left after that day, the guess
 * is the next class. Without class days, the week's first day of classes.
 */
function guessDate(course: CourseDetails, start: string): string {
  const firstDay = course.week1Start!; // weekStart needs it
  const from = start < firstDay ? firstDay : start;
  if (course.classDays.length === 0) return from;
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    if (course.classDays.includes(weekdayOf(date))) return date;
  }
  return from; // class days are 1–7, so a week always has one
}

/** Whether resolveDate guessed the day, because the outline gives only a week and the student hasn't picked a date. */
export function isGuessedDate(deadline: Deadline, course: CourseDetails): boolean {
  return (
    !isDate(deadline.date) &&
    deadline.useWeek &&
    deadline.week !== null &&
    deadline.day === null &&
    weekStart(course, deadline.week) !== null
  );
}

/** Why the date was picked, for a guessed date, e.g. "Due picked Mon, Nov 30, the first class in Week 3. Please confirm." */
export function guessExplanation(deadline: Deadline, course: CourseDetails): string | null {
  if (!isGuessedDate(deadline, course)) return null;
  const date = resolveDate(deadline, course)!;
  const start = weekStart(course, deadline.week!)!;
  let which: string;
  if (date >= addDays(start, 7)) which = "the first class after classes start";
  else if (course.classDays.length > 0) which = `the first class in Week ${deadline.week}`;
  else if (date === course.week1Start) which = "the first day of classes";
  else which = `the start of Week ${deadline.week}`;
  return `Due picked ${formatDate(date)}, ${which}. Please confirm.`;
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

  // A week and day from the outline can fall before Week 1's first class.
  if (!isDate(deadline.date) && isDate(course.week1Start) && date < course.week1Start) {
    return `${formatDate(date)} is before the first day of classes (${formatDate(course.week1Start)}). Pick a date.`;
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
