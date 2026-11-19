// The weekly check-in: a few plain questions at the end of each week whose
// answers tune that user's plans. Everyone starts from the same base
// (ENGINE_CONFIG); each answer nudges one of their adjustments (prefs.ts), and
// tunedConfig turns base + adjustments into the settings their next plan uses.
//
// Questions talk about time and getting there, never about guilt or effort
// (docs/outtake.md, section 3). Every answer has an "about right" that changes
// nothing, and every change is small and bounded, so one odd week can't make
// plans impossible.

import type { EngineConfig } from "./engine/config.js";
import { ADJUSTMENT_RANGES, SESSIONS_RANGE, type Adjustments, type OuttakePrefs } from "./prefs.js";

export const CHECK_IN_QUESTIONS = [
  {
    id: "walk",
    question: "How did getting to your workouts feel this week?",
    answers: [
      { id: "too_far", label: "Too far to go" },
      { id: "fine", label: "About right" },
      { id: "would_go_further", label: "I'd go further for a better time" },
    ],
  },
  {
    id: "rushed",
    question: "Did you have enough time before your next thing?",
    answers: [
      { id: "rushed", label: "I felt rushed" },
      { id: "fine", label: "About right" },
      { id: "time_to_spare", label: "I had time to spare" },
    ],
  },
  {
    id: "timing",
    question: "How were the times of day?",
    answers: [
      { id: "too_early", label: "Too early" },
      { id: "fine", label: "About right" },
      { id: "too_late", label: "Too late" },
    ],
  },
  {
    id: "sessions",
    question: "How many workouts would suit next week?",
    answers: [
      { id: "fewer", label: "Fewer" },
      { id: "same", label: "The same" },
      { id: "more", label: "More" },
    ],
  },
] as const;

type Question = (typeof CHECK_IN_QUESTIONS)[number];
export type CheckInQuestionId = Question["id"];
/** One answer per question, by id; questions left out change nothing. */
export type CheckInAnswers = { [Q in Question as Q["id"]]?: Q["answers"][number]["id"] };

/** How much one answer moves things. */
export const CHECK_IN_STEPS = {
  /** "Too far" multiplies travelFactor by this; "I'd go further" divides by it. */
  travelFactor: 1.25,
  /** "I felt rushed" adds this many minutes before the next commitment; "time to spare" takes them away. */
  bufferMinutes: 10,
  /** "Too early" adds this many minutes after waking (and takes them from before bed); "too late" the reverse. */
  wakeBufferMinutes: 15,
  bedBufferMinutes: 30,
} as const;

const clamp = (value: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, value));

function adjust(adjustments: Adjustments, key: keyof Adjustments, change: (value: number) => number): Adjustments {
  const value = clamp(change(adjustments[key]), ADJUSTMENT_RANGES[key]);
  // Rounded so repeated multiplying doesn't build up float noise in stored values.
  return { ...adjustments, [key]: Math.round(value * 1000) / 1000 };
}

/** The user's outtake preferences after a check-in; doesn't change the ones it's given. */
export function applyCheckIn(prefs: OuttakePrefs, answers: CheckInAnswers): OuttakePrefs {
  const step = CHECK_IN_STEPS;
  let a = prefs.adjustments;
  if (answers.walk === "too_far") a = adjust(a, "travelFactor", (v) => v * step.travelFactor);
  if (answers.walk === "would_go_further") a = adjust(a, "travelFactor", (v) => v / step.travelFactor);
  if (answers.rushed === "rushed") a = adjust(a, "bufferMinutes", (v) => v + step.bufferMinutes);
  if (answers.rushed === "time_to_spare") a = adjust(a, "bufferMinutes", (v) => v - step.bufferMinutes);
  if (answers.timing === "too_early") {
    a = adjust(a, "wakeBufferMinutes", (v) => v + step.wakeBufferMinutes);
    a = adjust(a, "bedBufferMinutes", (v) => v - step.bedBufferMinutes);
  }
  if (answers.timing === "too_late") {
    a = adjust(a, "bedBufferMinutes", (v) => v + step.bedBufferMinutes);
    a = adjust(a, "wakeBufferMinutes", (v) => v - step.wakeBufferMinutes);
  }

  let sessions = prefs.weeklyTargetSessions;
  if (answers.sessions === "fewer") sessions = clamp(sessions - 1, SESSIONS_RANGE);
  if (answers.sessions === "more") sessions = clamp(sessions + 1, SESSIONS_RANGE);

  return { ...prefs, weeklyTargetSessions: sessions, adjustments: a };
}

/** The engine settings for one user: the shared starting point with their adjustments applied. */
export function tunedConfig(base: EngineConfig, adjustments: Adjustments): EngineConfig {
  return {
    ...base,
    scoring: {
      ...base.scoring,
      travelPerMinute: base.scoring.travelPerMinute * adjustments.travelFactor,
      crunchTravelPerMinute: base.scoring.crunchTravelPerMinute * adjustments.travelFactor,
      bufferMinutes: Math.max(0, base.scoring.bufferMinutes + adjustments.bufferMinutes),
    },
    plan: {
      ...base.plan,
      wakeBufferMinutes: Math.max(0, base.plan.wakeBufferMinutes + adjustments.wakeBufferMinutes),
      bedBufferMinutes: Math.max(0, base.plan.bedBufferMinutes + adjustments.bedBufferMinutes),
    },
  };
}
