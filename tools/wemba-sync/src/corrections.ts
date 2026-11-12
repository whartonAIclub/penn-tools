// ─────────────────────────────────────────────────────────────────────────────
// WEMBA Sync: fixes for details the program's PDF leaves out
//
// Some schedules miss things the class learns separately, e.g. a speaker
// session's time and room, or a classmates' event shared on Partiful. Each
// correction names the weekend it's for, so it never touches another
// weekend's schedule, and is applied to every upload of that weekend's PDF
// (see extract/route.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { sortItems, type ScheduleItem, type WeekendSchedule } from "./schedule.js";

interface Addition {
  /** The event as it should appear. */
  item: ScheduleItem;
  /**
   * Matches the PDF's own entries for this event, in item, upcoming and
   * warning text; those are dropped in favor of `item`.
   */
  replaces: RegExp;
}

const NOVEMBER_13 = "2026-11-13";

/** Events to add to the November 13–14 weekend. */
const NOVEMBER_13_ADDITIONS: Addition[] = [
  {
    // From the class (the PDF lists it without a time or room).
    item: {
      date: NOVEMBER_13,
      start: "19:00",
      end: "20:15",
      kind: "event",
      title: "Executive Perspectives: Meeting with alumna Bo Zhao",
      course: null,
      instructor: null,
      location: "SCC, Parkinson, 2nd Floor",
      section: null,
      signupOnly: false,
      notes: "Bo Zhao, founder and CEO of Baby Gear Group. Food will be provided in the classroom.",
    },
    replaces: /executive perspectives|bo zhao/i,
  },
  {
    // From https://partiful.com/e/IwmpJ5kg9AiaAc1nNDdX; the end time is from the class.
    item: {
      date: NOVEMBER_13,
      start: "17:30",
      end: "19:00",
      kind: "event",
      title: "Beers & Baby 🍺💕",
      course: null,
      instructor: null,
      location: "Frankford Hall, 1210 Frankford Ave, Philadelphia (Fishtown)",
      section: null,
      signupOnly: false,
      notes: "Classmate's Baby Shower. Details and RSVP on Partiful: https://partiful.com/e/IwmpJ5kg9AiaAc1nNDdX",
    },
    replaces: /beers\s*(&|and)\s*baby/i,
  },
];

/**
 * The schedule with the events the PDF leaves out, on the weekend they're
 * for. The PDF's own entries for them, wherever the AI put them (items or
 * upcoming), and its warnings about them are dropped. Other weekends are
 * returned unchanged.
 */
export function applyCorrections(schedule: WeekendSchedule): WeekendSchedule {
  if (!schedule.items.some((item) => item.date === NOVEMBER_13)) return schedule;

  const replaced = (...texts: (string | null)[]) =>
    NOVEMBER_13_ADDITIONS.some(({ replaces }) => texts.some((text) => text !== null && replaces.test(text)));
  return {
    ...schedule,
    items: sortItems([
      ...schedule.items.filter((item) => !replaced(item.title, item.notes)),
      ...NOVEMBER_13_ADDITIONS.map(({ item }) => item),
    ]),
    upcoming: schedule.upcoming.filter((entry) => !replaced(entry.title, entry.details)),
    warnings: schedule.warnings.filter((warning) => !replaced(warning)),
  };
}
