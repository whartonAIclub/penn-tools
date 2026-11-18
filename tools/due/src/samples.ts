// Made-up course details and deadlines, standing in for what the AI will read
// from an outline. They cover each case the review screen handles: a date and
// time, a date with no time, a week and day, a week only (a guessed date to confirm), class time and no date.

import type { CourseDetails, Deadline, RecurringDeadline } from "./types.js";

export const SAMPLE_COURSE: CourseDetails = {
  name: "FNCE 6110",
  classDays: [1, 3], // Monday and Wednesday
  classStart: "10:15",
  classEnd: "11:45",
  week1Start: "2027-01-13",
};

export const SAMPLE_DEADLINES: Deadline[] = [
  {
    id: "sample-1",
    title: "Problem Set 1",
    kind: "assignment",
    date: "2027-01-27",
    week: null,
    day: null,
    useWeek: true,
    time: { kind: "custom", time: "17:00" },
    include: true,
    note: null,
  },
  {
    id: "sample-2",
    title: "Case write-up: Marriott",
    kind: "assignment",
    date: "2027-02-03",
    week: null,
    day: null,
    useWeek: true,
    time: { kind: "all-day" },
    include: true,
    note: null,
  },
  {
    id: "sample-3",
    title: "Problem Set 2",
    kind: "assignment",
    date: null,
    week: 5,
    day: 3,
    useWeek: true,
    time: { kind: "class-time" },
    include: true,
    note: null,
  },
  {
    id: "sample-4",
    title: "Midterm exam",
    kind: "exam",
    date: "2027-02-24",
    week: null,
    day: null,
    useWeek: true,
    time: { kind: "class-time" },
    include: true,
    note: null,
  },
  {
    id: "sample-5",
    title: "Group project proposal",
    kind: "assignment",
    date: null,
    week: 8,
    day: null,
    useWeek: true,
    time: { kind: "end-of-day" },
    include: true,
    note: null,
  },
  {
    id: "sample-6",
    title: "Final exam",
    kind: "exam",
    date: null,
    week: null,
    day: null,
    useWeek: true,
    time: { kind: "all-day" },
    include: true,
    note: null,
  },
];

/** A repeating deadline, as the AI finds one: ticked, waiting for the student to confirm. */
export const SAMPLE_RECURRING: RecurringDeadline[] = [
  {
    id: "sample-repeating-1",
    title: "Reflection paper",
    kind: "assignment",
    repeat: "weekly",
    weekday: 1,
    time: { kind: "class-time" },
    firstWeek: 2,
    lastWeek: 6,
    skipWeeks: [],
    include: true,
    confirmed: false,
    note: "Due before each Monday class, Weeks 2–6",
  },
];
