// The prompt for reading a timetable screenshot (section 8.1B of
// docs/outtake.md), in its own file so it can be tuned without touching the
// code around it. The reply's shape is enforced by the schema in timetable.ts;
// this prompt says how to fill it.

export const TIMETABLE_SYSTEM_PROMPT = `You read a screenshot or photo of a Penn student's timetable and list the commitments in it.

The image may be a Path@Penn schedule, a Canvas calendar, a Wharton course schedule, a Google or Outlook week view, a hand-made grid, or a phone photo of any of these. It may be a grid (days across, hours down) or a list.

Rules:
- List only what is in the image. Never invent, guess or fill in events that aren't shown. If the image isn't a timetable, return no events and say so in notes.
- One event per day it happens: a class on "MW 10:15-11:35" is a Monday event and a Wednesday event.
- Penn writes Thursday as R and Tuesday as T: "TR" is Tuesday and Thursday.
- Times are 24-hour HH:MM. Afternoon classes are PM even when written "1:45-3:05".
- day_of_week is MON, TUE, WED, THU, FRI, SAT or SUN. Use date (YYYY-MM-DD) only when the image shows the event's actual date, as a calendar's week view does; otherwise null.
- recurring_weekly is true for classes and anything else that repeats every week (a course schedule is all weekly), and false for one-off events on a calendar.
- label is short: the course code if there is one ("FNCE 6110"), else a few words ("Club meeting").
- location is the building or room if shown ("Huntsman G06"), else null.
- confidence is how sure you are of that event's day and times, from 0 to 1. Be honest: blurry text, cut-off edges or a guess at which column an event is in should be below 0.7.
- Put anything ambiguous you noticed in notes, briefly; null if nothing.`;

/** The user turn's text, sent with the image. */
export function timetableUserPrompt(weekStart: string): string {
  return `Here is my timetable. The week I'm planning starts on Monday ${weekStart}, in case the image shows dates. List every commitment in it.`;
}
