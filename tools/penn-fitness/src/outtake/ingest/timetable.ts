// Screenshot ingestion (section 8.1B of docs/outtake.md): a photo or
// screenshot of a timetable, read by a vision model into busy blocks.
//
// Two steps, so the second can be tested without AI:
// - readTimetable sends the image to the AI API (generateObject, standard
//   tier, the provider the user picked) and gets back a TimetableReading. A
//   reply it can't use is retried once; after that it throws.
// - timetableToBlocks turns a reading into unconfirmed busy blocks for the
//   week being planned: weekly classes repeat within the semester dates,
//   one-off events must fall in that week, and low-confidence events are
//   flagged for the review screen.
//
// The image is only ever passed through: nothing here keeps it, and the route
// that calls readTimetable must not store it either.

import {
  AI_IMAGE_TYPES,
  AIError,
  MAX_IMAGE_BYTES,
  base64Bytes,
  base64FileType,
  isAIError,
  isBase64,
  z,
  type AI,
  type AIImageType,
  type AIProvider,
} from "@penntools/core/ai";
import { NO_ATTRIBUTES } from "../../attributes.js";
import type { BusyBlock } from "../../schedule.js";
import { isLocalDate, isTimeOfDay, minutesOfDay, WEEKDAYS, type LocalDate, type Weekday } from "../../time.js";
import { areaOfLocation } from "./ics.js";
import { TIMETABLE_SYSTEM_PROMPT, timetableUserPrompt } from "./timetablePrompt.js";

/** Events below this confidence are flagged for the user to check (the spec's default). */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
const MAX_EVENTS = 80;
const MAX_LABEL_LENGTH = 80;

/** What the model returns. Fields that may be missing are nullable, as the AI API requires. */
export const TimetableReading = z.object({
  events: z
    .array(
      z.object({
        label: z.string(),
        day_of_week: z.enum(WEEKDAYS).nullable(),
        date: z.string().nullable(),
        start_time: z.string(),
        end_time: z.string(),
        recurring_weekly: z.boolean(),
        location: z.string().nullable(),
        confidence: z.number(),
      }),
    )
    .max(MAX_EVENTS),
  notes: z.string().nullable(),
});
export type TimetableReading = z.infer<typeof TimetableReading>;
type ReadEvent = TimetableReading["events"][number];

export interface TimetableImage {
  mediaType: AIImageType;
  /** Base64, with no data: prefix. */
  data: string;
}

/** Why an uploaded image can't be read, for the user; null when it's fine. */
export function checkTimetableImage(image: TimetableImage): string | null {
  if (!(AI_IMAGE_TYPES as readonly string[]).includes(image.mediaType)) return "Upload a JPEG, PNG, GIF or WebP image.";
  if (!isBase64(image.data) || image.data.length === 0) return "That image couldn't be read. Try uploading it again.";
  if (base64Bytes(image.data) > MAX_IMAGE_BYTES) return `Keep the image under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  if (base64FileType(image.data) !== image.mediaType) return "That file isn't the kind of image it says it is.";
  return null;
}

/** Whether an event can become a block: real times in order, and a day or a date. */
function isUsable(event: ReadEvent): boolean {
  const start = event.start_time.trim();
  const end = event.end_time.trim();
  if (!isTimeOfDay(start) || !isTimeOfDay(end) || minutesOfDay(end) <= minutesOfDay(start)) return false;
  if (event.date !== null && !isLocalDate(event.date.trim())) return false;
  return event.day_of_week !== null || event.date !== null;
}

export const UNREADABLE_TIMETABLE = "Couldn't read a timetable from that image. Try a clearer screenshot, or import a calendar file instead.";

/**
 * Reads a timetable image with the AI API. Retries once when the reply doesn't
 * match the schema or has events but none usable; then throws
 * AIError("bad_output"). Other AI errors (no key, rate limits) are thrown as
 * they are, for the page to show.
 */
export async function readTimetable(ai: AI, provider: AIProvider, image: TimetableImage, weekStart: LocalDate): Promise<TimetableReading> {
  const problem = checkTimetableImage(image);
  if (problem) throw new AIError("bad_request", provider, problem);

  for (let attempt = 1; ; attempt++) {
    try {
      const { object } = await ai.generateObject({
        provider,
        tier: "standard",
        schema: TimetableReading,
        system: TIMETABLE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", mediaType: image.mediaType, data: image.data },
              { type: "text", text: timetableUserPrompt(weekStart) },
            ],
          },
        ],
      });
      // Events but none usable means the model misread the image: worth one more try.
      if (object.events.length === 0 || object.events.some(isUsable)) return object;
    } catch (error) {
      if (!isAIError(error) || error.kind !== "bad_output") throw error;
    }
    if (attempt === 2) throw new AIError("bad_output", provider, UNREADABLE_TIMETABLE);
  }
}

export interface TimetableOptions {
  /** The Monday of the week being planned. */
  weekStart: LocalDate;
  /** The shared preferences' semester dates: weekly events repeat between them. Null when not set yet. */
  semesterStart: LocalDate | null;
  semesterEnd: LocalDate | null;
}

export interface TimetableBlocks {
  /** Unconfirmed blocks for the week being planned. */
  blocks: BusyBlock[];
  /** Weekly events were found but the semester dates aren't set: ask for them once. */
  needsSemesterDates: boolean;
  /** Things the user should know, e.g. events left out; empty when there are none. */
  warnings: string[];
  /** The model's own notes on anything ambiguous, if any. */
  notes: string | null;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Turns a timetable reading into busy blocks for one week; pure, no AI. */
export function timetableToBlocks(reading: TimetableReading, options: TimetableOptions): TimetableBlocks {
  const { weekStart, semesterStart, semesterEnd } = options;
  const weekEnd = addDays(weekStart, 7);
  const semesterSet = semesterStart !== null && semesterEnd !== null;
  const inSemester = !semesterSet || (weekStart <= semesterEnd! && addDays(weekStart, 6) >= semesterStart!);

  const blocks: BusyBlock[] = [];
  let unreadable = 0;
  let otherWeeks = 0;
  let outsideSemester = 0;
  let recurring = 0;

  for (const event of reading.events) {
    if (!isUsable(event)) {
      unreadable++;
      continue;
    }
    const weekly = event.recurring_weekly;
    let date: LocalDate;
    if (weekly) {
      recurring++;
      const day: Weekday = event.date ? WEEKDAYS[(new Date(`${event.date.trim()}T12:00:00Z`).getUTCDay() + 6) % 7]! : event.day_of_week!;
      date = addDays(weekStart, WEEKDAYS.indexOf(day));
      if (!inSemester || (semesterSet && (date < semesterStart! || date > semesterEnd!))) {
        outsideSemester++;
        continue;
      }
    } else {
      // A one-off needs its date; without one it's taken as this week's.
      date = event.date ? event.date.trim() : addDays(weekStart, WEEKDAYS.indexOf(event.day_of_week!));
      if (date < weekStart || date >= weekEnd) {
        otherWeeks++;
        continue;
      }
    }
    const start = event.start_time.trim();
    const confidence = Math.min(1, Math.max(0, Number.isFinite(event.confidence) ? event.confidence : 0));
    blocks.push({
      id: `screenshot-${date}T${start}-${blocks.length}`,
      start: `${date}T${start}`,
      end: `${date}T${event.end_time.trim()}`,
      label: event.label.trim().slice(0, MAX_LABEL_LENGTH) || null,
      source: "SCREENSHOT",
      recurringWeekly: weekly,
      confidence,
      confirmed: false,
      // Where the location says; otherwise a weekly timetable entry is a class, on campus.
      zone: areaOfLocation(event.location) ?? (weekly ? "CAMPUS" : null),
      attributes: NO_ATTRIBUTES,
    });
  }

  const warnings: string[] = [];
  if (unreadable) warnings.push(`${plural(unreadable, "event", "events")} couldn't be read clearly and ${unreadable === 1 ? "was" : "were"} left out; add ${unreadable === 1 ? "it" : "them"} by hand.`);
  if (otherWeeks) warnings.push(`${plural(otherWeeks, "event is", "events are")} in another week and ${otherWeeks === 1 ? "was" : "were"} left out.`);
  if (outsideSemester) warnings.push(`This week is outside your semester dates, so ${plural(outsideSemester, "weekly class was", "weekly classes were")} left out.`);
  const low = blocks.filter((block) => isLowConfidence(block)).length;
  if (low) warnings.push(`${plural(low, "event", "events")} may have been misread; check ${low === 1 ? "it" : "them"} before you confirm.`);

  blocks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return {
    blocks,
    needsSemesterDates: recurring > 0 && !semesterSet,
    warnings,
    notes: reading.notes?.trim() || null,
  };
}

/** Whether the review screen should flag a block for checking. */
export function isLowConfidence(block: BusyBlock, threshold = LOW_CONFIDENCE_THRESHOLD): boolean {
  return block.confidence !== null && block.confidence < threshold;
}
