// SAMPLE DATA, NOT REAL. Crowd levels and community activity for the
// homepage's Exercise section, so the layout can be seen and judged before
// the features behind them exist: live crowd levels come with Penn Now, and
// group activities with Community (both "Later" in section 12 of
// tools/penn-fitness/docs/outtake.md). Everything shown from here is labelled
// as a sample on the page. Replace this file, don't build on it.

export type CrowdLevel = "quiet" | "moderate" | "busy";

/** How full each kind of place usually is, 6 AM to 10 PM (0 to 1): made-up shapes with a morning and an evening peak. */
const SHAPES: Record<string, number[]> = {
  //      6    7    8    9   10   11   12    1    2    3    4    5    6    7    8    9   10
  gym: [0.3, 0.55, 0.5, 0.35, 0.3, 0.35, 0.5, 0.45, 0.35, 0.4, 0.6, 0.85, 0.9, 0.75, 0.55, 0.35, 0.2],
  pool: [0.4, 0.5, 0.35, 0.25, 0.25, 0.4, 0.6, 0.5, 0.3, 0.3, 0.4, 0.6, 0.55, 0.45, 0.3, 0.2, 0.1],
  court: [0.1, 0.2, 0.25, 0.3, 0.35, 0.45, 0.55, 0.5, 0.45, 0.5, 0.65, 0.85, 0.9, 0.8, 0.6, 0.4, 0.2],
  field: [0.2, 0.35, 0.3, 0.2, 0.2, 0.25, 0.35, 0.3, 0.3, 0.4, 0.6, 0.75, 0.7, 0.55, 0.35, 0.2, 0.1],
};
const FIRST_HOUR = 6;

/** A small, fixed wobble per place, so places of the same kind don't look identical. */
function wobble(placeId: string): number {
  let h = 0;
  for (const c of placeId) h = (h * 31 + c.charCodeAt(0)) % 997;
  return ((h % 21) - 10) / 100;
}

export interface SampleCrowd {
  /** How full it is around now, 0 to 1. */
  now: number;
  level: CrowdLevel;
  /** Hour by hour from 6 AM, 0 to 1. */
  byHour: { hour: number; value: number }[];
  /** The busiest two hours, e.g. "5 PM–7 PM". */
  peak: string;
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? " AM" : " PM"}`;

/** Sample crowd levels for a place at an hour of the day (0–23). */
export function sampleCrowd(placeId: string, kind: string, hour: number): SampleCrowd {
  const shape = SHAPES[kind] ?? SHAPES["gym"]!;
  const w = wobble(placeId);
  const byHour = shape.map((value, i) => ({ hour: FIRST_HOUR + i, value: Math.min(1, Math.max(0.05, value + w)) }));
  const index = Math.min(byHour.length - 1, Math.max(0, hour - FIRST_HOUR));
  const now = hour < FIRST_HOUR || hour > FIRST_HOUR + byHour.length - 1 ? 0.05 : byHour[index]!.value;
  const peakAt = byHour.reduce((best, h, i) => (i < byHour.length - 1 && h.value + byHour[i + 1]!.value > best.sum ? { i, sum: h.value + byHour[i + 1]!.value } : best), { i: 0, sum: -1 }).i;
  const start = byHour[peakAt]!.hour;
  return { now, level: now < 0.4 ? "quiet" : now < 0.7 ? "moderate" : "busy", byHour, peak: `${hourLabel(start)}–${hourLabel(start + 2)}` };
}

export interface SampleActivity {
  id: string;
  who: string;
  emoji: string;
  sport: "Tennis" | "Running" | "Lifting" | "Squash" | "Swimming" | "Yoga";
  title: string;
  /** "started a group tennis session" */
  what: string;
  place: string;
  /** Days from today, 0 to 6. */
  dayOffset: number;
  start: string;
  end: string;
  level: "All levels" | "Casual" | "Competitive";
  joined: number;
  spots: number;
  /** Initials of a few who've joined, for the avatars. */
  going: string[];
}

/** Made-up group activities, as the Community feature might show them, on days relative to today. */
export const SAMPLE_COMMUNITY: SampleActivity[] = [
  { id: "tennis", who: "User 1", emoji: "🎾", sport: "Tennis", title: "Group tennis", what: "started a group tennis session", place: "Hecht Tennis Center", dayOffset: 0, start: "17:00", end: "18:00", level: "All levels", joined: 8, spots: 10, going: ["AK", "JM", "PS", "RT"] },
  { id: "run", who: "User 2", emoji: "🏃", sport: "Running", title: "Schuylkill River run", what: "is leading a Schuylkill River run", place: "Penn Park", dayOffset: 1, start: "07:00", end: "07:45", level: "Casual", joined: 5, spots: 12, going: ["LW", "DN", "MC"] },
  { id: "squash", who: "User 3", emoji: "🟢", sport: "Squash", title: "Squash doubles", what: "wants squash doubles partners", place: "Penn Squash Center", dayOffset: 2, start: "12:15", end: "13:00", level: "Competitive", joined: 3, spots: 4, going: ["SB", "HG"] },
  { id: "lift", who: "User 4", emoji: "🏋️", sport: "Lifting", title: "Learning Team lift", what: "set up a Learning Team lift", place: "Pottruck", dayOffset: 3, start: "10:00", end: "11:00", level: "All levels", joined: 6, spots: 8, going: ["EV", "OK", "TF", "YZ"] },
  { id: "swim", who: "User 5", emoji: "🏊", sport: "Swimming", title: "Lunchtime laps", what: "is swimming laps at lunch", place: "Sheerr Pool", dayOffset: 1, start: "12:00", end: "12:45", level: "Casual", joined: 2, spots: 6, going: ["CR"] },
  { id: "yoga", who: "User 6", emoji: "🧘", sport: "Yoga", title: "Recovery yoga", what: "is hosting recovery yoga", place: "Fox Fitness", dayOffset: 4, start: "18:30", end: "19:15", level: "All levels", joined: 9, spots: 15, going: ["NB", "IA", "GL", "WS"] },
  { id: "run2", who: "User 7", emoji: "🏃", sport: "Running", title: "Rittenhouse 5K", what: "is organizing a 5K loop", place: "Rittenhouse Square", dayOffset: 5, start: "09:00", end: "09:40", level: "All levels", joined: 11, spots: 20, going: ["FP", "UV", "KD", "BX"] },
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The activity's date (YYYY-MM-DD) and when it reads, e.g. "Today, 5:00 PM", from today's date. */
export function activityWhen(activity: SampleActivity, today: string): { date: string; label: string } {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d + activity.dayOffset));
  const date = day.toISOString().slice(0, 10);
  const [h, min] = activity.start.split(":").map(Number) as [number, number];
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  const name = activity.dayOffset === 0 ? "Today" : activity.dayOffset === 1 ? "Tomorrow" : WEEKDAY_SHORT[day.getUTCDay()];
  return { date, label: `${name}, ${time}` };
}
