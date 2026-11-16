// Repeating deadlines, such as weekly reflection papers: when each one falls,
// what the student still needs to fix, and the single deadlines they become in
// the calendar. Each occurrence is its own event, so skipped weeks (spring
// break) are simply left out.

import { addDays, formatDate, isDate, isTime } from "./dates.js";
import { deadlineProblem, weekStart } from "./deadlines.js";
import { WEEKDAY_LABELS, type CourseDetails, type Deadline, type RecurringDeadline } from "./types.js";

/** The most weeks a repeating deadline may span, more than any term. */
export const MAX_RECURRING_WEEKS = 30;

/** Every date it's due, in order. Empty until it has weeks, days and a Week 1 date. */
export function occurrenceDates(recurring: RecurringDeadline, course: CourseDetails): string[] {
  const { firstWeek, lastWeek } = recurring;
  if (firstWeek === null || lastWeek === null || firstWeek < 1 || lastWeek < firstWeek) return [];
  if (lastWeek - firstWeek >= MAX_RECURRING_WEEKS) return [];
  const days = recurring.repeat === "every-class" ? course.classDays : recurring.weekday !== null ? [recurring.weekday] : [];
  const dates: string[] = [];
  for (let week = firstWeek; week <= lastWeek; week++) {
    if (recurring.skipWeeks.includes(week)) continue;
    const start = weekStart(course, week);
    if (!start) return [];
    for (const day of [...days].sort((a, b) => a - b)) {
      const date = addDays(start, day - 1);
      // Week 1 can start mid-week; nothing is due before the first class.
      if (isDate(course.week1Start) && date < course.week1Start) continue;
      dates.push(date);
    }
  }
  return dates;
}

/** Why the repeating deadline can't go in the calendar yet, or null if it's ready. */
export function recurringProblem(recurring: RecurringDeadline, course: CourseDetails): string | null {
  if (!recurring.title.trim()) return "Add a title.";
  if (!isDate(course.week1Start)) return "Add the first day of classes in course details.";
  if (recurring.firstWeek === null || recurring.lastWeek === null) return "Pick the first and last week.";
  if (recurring.lastWeek < recurring.firstWeek) return "The last week is before the first week.";
  if (recurring.lastWeek - recurring.firstWeek >= MAX_RECURRING_WEEKS) return `Pick at most ${MAX_RECURRING_WEEKS} weeks.`;
  if (recurring.repeat === "every-class" && course.classDays.length === 0) {
    return "Add the class days in course details, or pick a day of the week.";
  }
  if (recurring.repeat === "weekly" && recurring.weekday === null) return "Pick a day.";
  const { time } = recurring;
  if (time.kind === "class-time") {
    if (!isTime(course.classStart)) return "Add the class time in course details, or pick another time.";
    if (recurring.repeat === "weekly" && course.classDays.length > 0 && !course.classDays.includes(recurring.weekday!)) {
      return `There's no class on ${WEEKDAY_LABELS[recurring.weekday! - 1]}. Pick another day or time.`;
    }
  }
  if (time.kind === "custom" && !isTime(time.time)) return "Pick a time.";
  if (occurrenceDates(recurring, course).length === 0) return "Nothing falls in those weeks. Check the weeks.";
  return null;
}

/** e.g. "11 deadlines, Mon, Jan 18 – Mon, Apr 12". */
export function recurringSummary(recurring: RecurringDeadline, course: CourseDetails): string | null {
  const dates = occurrenceDates(recurring, course);
  if (dates.length === 0) return null;
  if (dates.length === 1) return `1 deadline, ${formatDate(dates[0]!)}`;
  return `${dates.length} deadlines, ${formatDate(dates[0]!)} – ${formatDate(dates.at(-1)!)}`;
}

/** The single deadlines it becomes, one per date. */
export function expandRecurring(recurring: RecurringDeadline, course: CourseDetails): Deadline[] {
  return occurrenceDates(recurring, course).map((date) => ({
    id: `${recurring.id}-${date}`,
    title: recurring.title,
    kind: recurring.kind,
    date,
    week: null,
    day: null,
    time: recurring.time,
    include: true,
    note: recurring.note,
  }));
}

/** Everything that goes in the calendar: ticked deadlines and repeating ones that are ready, in date order. */
export function calendarDeadlines(course: CourseDetails, deadlines: Deadline[], recurring: RecurringDeadline[]): Deadline[] {
  const single = deadlines.filter((d) => d.include && deadlineProblem(d, course) === null);
  const repeated = recurring
    .filter((r) => r.include && recurringProblem(r, course) === null)
    .flatMap((r) => expandRecurring(r, course));
  return [...single, ...repeated];
}
