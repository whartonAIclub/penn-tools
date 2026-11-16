// The shapes Due works with: a course's details, its deadlines, and the
// student's reminder choices. Dates are "YYYY-MM-DD" and times "HH:MM",
// both in Philadelphia time.

export const DEADLINE_KINDS = ["assignment", "exam"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** Day labels in week order: index 0 is Monday, which is weekday 1. */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface CourseDetails {
  name: string;
  /** Weekdays the class meets, 1 = Monday … 7 = Sunday. */
  classDays: number[];
  classStart: string | null;
  classEnd: string | null;
  /** Any date in the first week of classes. Weeks run Monday to Sunday. */
  week1Start: string | null;
}

/** When on its date a deadline falls. */
export type TimeChoice =
  | { kind: "all-day" }
  | { kind: "class-time" }
  | { kind: "end-of-day" }
  | { kind: "custom"; time: string };

export interface Deadline {
  /** Identifies the row on the page; calendar event IDs come from the course and title instead. */
  id: string;
  title: string;
  kind: DeadlineKind;
  /** The date, when the outline gives one or the student picks one. Overrides week and day. */
  date: string | null;
  /** "Week 4" in the outline. */
  week: number | null;
  /** "Day 3" of that week, counted from Monday = 1. */
  day: number | null;
  time: TimeChoice;
  /** Whether it goes in the calendar file. */
  include: boolean;
  /** What the outline says about when it's due, e.g. "Session 5, before class", for the student to check against. */
  note: string | null;
}

/** How a repeating deadline repeats: at every class, or once a week on one day. */
export const REPEAT_KINDS = ["every-class", "weekly"] as const;
export type RepeatKind = (typeof REPEAT_KINDS)[number];

/**
 * A graded deadline that repeats, such as a weekly reflection paper. It goes in
 * the calendar as one event per occurrence, from firstWeek to lastWeek.
 */
export interface RecurringDeadline {
  id: string;
  title: string;
  kind: DeadlineKind;
  repeat: RepeatKind;
  /** For "weekly": the day, 1 = Monday … 7 = Sunday. */
  weekday: number | null;
  time: TimeChoice;
  firstWeek: number | null;
  lastWeek: number | null;
  /** Weeks with nothing due, e.g. spring break. */
  skipWeeks: number[];
  include: boolean;
  /** Whether the student has confirmed it; until then the review screen asks them to. */
  confirmed: boolean;
  /** What the outline says about it, e.g. "Due before each Monday class". */
  note: string | null;
}

export interface ReminderSettings {
  /**
   * For deadlines with a time: minutes before the due time. At least 30, since an
   * assignment's event starts 30 minutes before it's due and calendars such as
   * Google only remind before an event starts.
   */
  timedMinutesBefore: number[];
  /** For all-day deadlines: minutes from the start of the day (540 = 9 AM that day, -900 = 9 AM the day before). */
  allDayOffsets: number[];
}

export const TIMED_REMINDER_OPTIONS = [
  { minutes: 1440, label: "1 day before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 30, label: "30 minutes before" },
] as const;

export const ALL_DAY_REMINDER_OPTIONS = [
  { offset: -900, label: "9 AM the day before" },
  { offset: 540, label: "9 AM that day" },
] as const;

export const DEFAULT_REMINDERS: ReminderSettings = {
  timedMinutesBefore: [180, 30],
  allDayOffsets: [540],
};
