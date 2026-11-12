// Test data shared by the tests.

import type { Event } from "../events.js";
import type { Syllabus } from "../syllabus.js";

/** A two-session course with four assignments; `overrides` replaces fields. */
export function syllabus(overrides: Partial<Syllabus> = {}): Syllabus {
  return {
    courseCode: "FNCE 6130",
    title: "Corporate Finance",
    term: "Fall 2026",
    summary: null,
    instructors: [{ name: "Leonid Kogan", role: "Professor", email: null, officeHours: "Fridays after class" }],
    sessions: [
      { number: 1, date: "2026-11-13", topic: "Valuation", readings: ["BMA ch. 2"], prepare: [], notes: null },
      { number: 2, date: "2026-11-14", topic: "Capital budgeting", readings: [], prepare: ["Problem set 1"], notes: null },
    ],
    assignments: [
      { title: "Problem set 1", due: "2026-11-14", dueTime: "09:00", weight: "10%", group: true, details: null },
      { title: "Midterm", due: "2026-12-05", dueTime: null, weight: "40%", group: false, details: null },
      { title: "Case write-up", due: "2026-10-30", dueTime: null, weight: "10%", group: false, details: null },
      { title: "Participation", due: null, dueTime: null, weight: "20%", group: false, details: null },
    ],
    grading: [{ component: "Midterm", weight: "40%" }],
    materials: [],
    policies: [],
    warnings: [],
    ...overrides,
  };
}

/** An evening event on Saturday, Nov 14; `overrides` replaces fields. */
export function event(overrides: Partial<Event> = {}): Event {
  return {
    title: "Diwali celebration",
    date: "2026-11-14",
    endDate: null,
    start: "19:00",
    end: "22:00",
    location: "Houston Hall",
    organizer: "South Asian Society",
    link: "https://example.com/rsvp",
    notes: null,
    ...overrides,
  };
}
