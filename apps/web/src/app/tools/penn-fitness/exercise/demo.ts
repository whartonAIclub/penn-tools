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
  who: string;
  emoji: string;
  /** "started a group tennis session" */
  what: string;
  place: string;
  when: string;
  joined: number;
  spots: number;
}

/** Made-up group activities, as the Community feature might show them. */
export const SAMPLE_COMMUNITY: SampleActivity[] = [
  { who: "User 1", emoji: "🎾", what: "started a group tennis session", place: "Hecht Tennis Center", when: "Today, 5:00 PM", joined: 8, spots: 10 },
  { who: "User 2", emoji: "🏃", what: "is leading a Schuylkill River run", place: "Penn Park", when: "Tomorrow, 7:00 AM", joined: 5, spots: 12 },
  { who: "User 3", emoji: "🟢", what: "wants squash doubles partners", place: "Penn Squash Center", when: "Fri, 12:15 PM", joined: 3, spots: 4 },
  { who: "User 4", emoji: "🏋️", what: "set up a Learning Team lift", place: "Pottruck", when: "Sat, 10:00 AM", joined: 6, spots: 8 },
];
