// ─────────────────────────────────────────────────────────────────────────────
// Weekly schedule: a student's classes and commitments, read from pasted text
// by the AI, and the free windows between them where meals can go.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { optionKeys } from "./preferences.js";
import { formatMinutes, toMinutes } from "./today.js";

export const DAYS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
} as const;
export type Day = keyof typeof DAYS;
export const DAY_KEYS = optionKeys(DAYS);

/** A 24-hour HH:MM time. */
export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const MAX_SCHEDULE_BLOCKS = 60;
export const MAX_SCHEDULE_TEXT_LENGTH = 3000;

export const ScheduleBlock = z.object({
  day: z.enum(DAY_KEYS),
  start: Time,
  end: Time,
  label: z.string().trim().min(1).max(80),
  /** Where it happens, e.g. "Huntsman Hall", or null if unknown. */
  location: z.string().trim().min(1).max(120).nullable(),
});
export type ScheduleBlock = z.infer<typeof ScheduleBlock>;

export const WeeklySchedule = z.array(ScheduleBlock).max(MAX_SCHEDULE_BLOCKS);
export type WeeklySchedule = z.infer<typeof WeeklySchedule>;

/** Why `value` can't be read as a schedule, or null if it's fine. */
export function checkScheduleText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Paste or type your schedule.";
  if (value.length > MAX_SCHEDULE_TEXT_LENGTH) return `Keep it to at most ${MAX_SCHEDULE_TEXT_LENGTH} characters.`;
  return null;
}

// What the AI returns: times as loose strings, checked and tidied by cleanBlocks.
const ReadBlocks = z.object({
  blocks: z.array(
    z.object({
      day: z.enum(DAY_KEYS),
      start: z.string().describe("24-hour HH:MM"),
      end: z.string().describe("24-hour HH:MM"),
      label: z.string().describe("Short name, e.g. 'FNCE 6110' or 'Club meeting'"),
      location: z.string().nullable().describe("Building or address if given, e.g. 'Huntsman Hall', else null"),
    }),
  ),
});

const SYSTEM = `You turn a Penn student's weekly schedule into time blocks.
- One block per day a commitment happens: "MW 10:15-11:45" is a Monday block and a Wednesday block.
- Use 24-hour HH:MM times. Classes in the afternoon are PM even if written "1:45-3:15".
- Include only recurring weekly commitments: classes, recitations, work shifts, practices, meetings.
- Keep the building or address as the location when the text gives one.
- Don't invent anything that isn't in the text.`;

/** The weekly blocks described in `text`, tidied by cleanBlocks. */
export async function readSchedule(ai: AI, provider: AIProvider, text: string): Promise<ScheduleBlock[]> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: ReadBlocks,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  return cleanBlocks(object.blocks);
}

/** Drops blocks with unreadable times or that end before they start, pads times to HH:MM, and sorts. */
export function cleanBlocks(blocks: z.infer<typeof ReadBlocks>["blocks"]): ScheduleBlock[] {
  return blocks
    .flatMap((block) => {
      const start = toMinutes(block.start.trim());
      const end = toMinutes(block.end.trim());
      if (start === null || end === null || end <= start) return [];
      const label = block.label.trim().slice(0, 80) || "Busy";
      const location = block.location?.trim().slice(0, 120) || null;
      return [{ day: block.day, start: formatMinutes(start), end: formatMinutes(end), label, location }];
    })
    .sort(byDayThenStart)
    .slice(0, MAX_SCHEDULE_BLOCKS);
}

export function byDayThenStart(a: ScheduleBlock, b: ScheduleBlock): number {
  return DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.start.localeCompare(b.start);
}

export interface TimeWindow {
  start: string;
  end: string;
}

/**
 * The gaps on `day`, between waking and going to sleep, that are at least
 * `minMinutes` long. A bedtime after midnight counts as the end of the day.
 */
export function freeWindows(
  blocks: ScheduleBlock[],
  day: Day,
  wakeTime: string,
  sleepTime: string,
  minMinutes = 30,
): TimeWindow[] {
  const dayStart = toMinutes(wakeTime) ?? 7 * 60;
  let dayEnd = toMinutes(sleepTime) ?? 23 * 60;
  if (dayEnd <= dayStart) dayEnd = 24 * 60 - 1;

  const busy = blocks
    .filter((b) => b.day === day)
    .map((b) => [toMinutes(b.start)!, toMinutes(b.end)!] as const)
    .sort((a, b) => a[0] - b[0]);

  const windows: [number, number][] = [];
  let cursor = dayStart;
  for (const [start, end] of busy) {
    if (start > cursor) windows.push([cursor, Math.min(start, dayEnd)]);
    cursor = Math.max(cursor, end);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) windows.push([cursor, dayEnd]);

  return windows
    .filter(([start, end]) => end - start >= minMinutes)
    .map(([start, end]) => ({ start: formatMinutes(start), end: formatMinutes(end) }));
}

/** The block `time` falls in on `day`, or null if the student is free then. */
export function busyAt(blocks: ScheduleBlock[], day: Day, time: string): ScheduleBlock | null {
  const minutes = toMinutes(time);
  if (minutes === null) return null;
  return (
    blocks.find((b) => b.day === day && toMinutes(b.start)! <= minutes && minutes < toMinutes(b.end)!) ?? null
  );
}
