"use server";

// The Exercise page's changes to the user's schedule (the review screen,
// section 8.2 of tools/penn-fitness/docs/outtake.md). Every action works on
// the signed-in user's own data only, checks its input, and returns problems
// as data. The page refreshes afterwards to show the result. Screenshots go
// through screenshot/route.ts instead: images can be over a server action's
// 1 MB limit.

import {
  addBlocks,
  addDays,
  areaOfCorner,
  isCorner,
  OUTTAKE_PREFS,
  type Corner,
  type OuttakePrefs,
  type SharedPrefs,
  checkAwayDay,
  checkQuickAdd,
  confirmBlocks,
  deleteBlock,
  getBlock,
  getPreferences,
  InvalidPreferencesError,
  InvalidScheduleError,
  isLocalDate,
  isTimeOfDay,
  quickAddBlock,
  replaceImportedBlocks,
  savePreferences,
  setAwayDay,
  SHARED_PREFS,
  updateBlock,
  type BusyBlock,
  type QuickAdd,
} from "@penntools/tool-penn-fitness";
import { getCurrentUser } from "@/lib/auth";
import { db } from "./data";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const SIGNED_OUT: ActionResult = { ok: false, error: "Sign in with the button at the top of the page." };
const MAX_IMPORTED_BLOCKS = 200;

/** Runs a change for the signed-in user, turning known problems into messages. */
async function forUser(change: (userId: string) => Promise<ActionResult>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  try {
    return await change(user.id);
  } catch (error) {
    if (error instanceof InvalidScheduleError || error instanceof InvalidPreferencesError) return { ok: false, error: error.problems.join(" ") };
    console.error("[penn-fitness] exercise action failed", error);
    return { ok: false, error: "Something went wrong saving that. Try again." };
  }
}

export async function addQuickBlock(input: QuickAdd): Promise<ActionResult> {
  return forUser(async (userId) => {
    const problems = checkQuickAdd(input);
    if (problems.length > 0) return { ok: false, error: problems.join(" ") };
    await addBlocks(db(), userId, [quickAddBlock(input)]);
    return { ok: true };
  });
}

export async function setAway(date: string, away: boolean): Promise<ActionResult> {
  return forUser(async (userId) => {
    const problem = checkAwayDay(date);
    if (problem) return { ok: false, error: problem };
    await setAwayDay(db(), userId, date, away === true);
    return { ok: true };
  });
}

/**
 * Changes a block's times and name. Times only, not dates: a weekly class
 * shown this week is stored in the week it was first added, and keeps that
 * date. A block ending at or before it starts is taken to run past midnight.
 */
export async function editBlock(id: string, startTime: string, endTime: string, label: string | null): Promise<ActionResult> {
  return forUser(async (userId) => {
    if (![startTime, endTime].every((t) => typeof t === "string" && isTimeOfDay(t) && t !== "24:00")) {
      return { ok: false, error: "Enter start and end times, like 09:00 and 10:30." };
    }
    if (startTime === endTime) return { ok: false, error: "It has to end after it starts." };
    const sql = db();
    const current = await getBlock(sql, userId, id);
    if (!current) return { ok: false, error: "That commitment isn't there any more. Refresh the page." };
    const date = current.start.slice(0, 10);
    const endDate = endTime > startTime ? date : addDays(date, 1);
    const trimmed = typeof label === "string" ? label.trim() : "";
    await updateBlock(sql, userId, id, { start: `${date}T${startTime}`, end: `${endDate}T${endTime}`, label: trimmed || null });
    return { ok: true };
  });
}

export async function removeBlock(id: string): Promise<ActionResult> {
  return forUser(async (userId) => {
    const deleted = await deleteBlock(db(), userId, id);
    return deleted ? { ok: true } : { ok: false, error: "That commitment isn't there any more. Refresh the page." };
  });
}

export async function confirmCommitments(ids: string[]): Promise<ActionResult> {
  return forUser(async (userId) => {
    if (!Array.isArray(ids)) return { ok: false, error: "Nothing to confirm." };
    const count = await confirmBlocks(db(), userId, ids.filter((id) => typeof id === "string"));
    return { ok: true, message: `Confirmed ${count} ${count === 1 ? "commitment" : "commitments"}.` };
  });
}

/** Saves a week's .ics import (read in the browser with importIcs), replacing the last one for that week. */
export async function saveCalendarImport(weekStart: string, blocks: BusyBlock[]): Promise<ActionResult> {
  return forUser(async (userId) => {
    if (!isLocalDate(weekStart) || !Array.isArray(blocks)) return { ok: false, error: "That import couldn't be read. Try again." };
    if (blocks.length > MAX_IMPORTED_BLOCKS) return { ok: false, error: `That's over ${MAX_IMPORTED_BLOCKS} events for one week; is it the right file?` };
    // Imported blocks are never confirmed until the user reviews them, whatever the page sends.
    const imported = blocks.map((block) => ({ ...block, source: "ICS" as const, confirmed: false, recurringWeekly: false, confidence: null }));
    const saved = await replaceImportedBlocks(db(), userId, "ICS", weekStart, imported);
    return { ok: true, message: `Added ${saved.length} ${saved.length === 1 ? "event" : "events"} from your calendar. Check them, then confirm.` };
  });
}

export interface ExercisePreferencesInput {
  /** Nearest corner, or null to give only the area. */
  homeCorner: { street: number; crossStreet: string } | null;
  homeBase: string;
  hasBuildingGym: boolean;
  wakingStart: string;
  wakingEnd: string;
  weeklyTargetSessions: number;
  sessionMinutes: number;
  preferredTimes: string[];
  spreadOut: boolean;
}

/**
 * Saves what planning needs to know: home and waking hours (shared with
 * Nutrition) and workout preferences. Semester dates and check-in adjustments
 * are kept as they are. A corner decides the area it's in.
 */
export async function saveExercisePreferences(input: ExercisePreferencesInput): Promise<ActionResult> {
  return forUser(async (userId) => {
    const sql = db();
    const [shared, outtake] = await Promise.all([getPreferences(sql, userId, SHARED_PREFS), getPreferences(sql, userId, OUTTAKE_PREFS)]);
    const corner = input.homeCorner && isCorner(input.homeCorner as Corner) ? (input.homeCorner as Corner) : null;
    if (input.homeCorner && !corner) return { ok: false, error: "Pick your nearest corner from the lists." };
    const nextShared: SharedPrefs = {
      ...shared,
      homeCorner: corner,
      homeBase: corner ? areaOfCorner(corner) : (input.homeBase as SharedPrefs["homeBase"]),
      hasBuildingGym: input.hasBuildingGym,
      wakingStart: input.wakingStart,
      wakingEnd: input.wakingEnd,
    };
    const nextOuttake: OuttakePrefs = {
      ...outtake,
      weeklyTargetSessions: Number(input.weeklyTargetSessions),
      sessionMinutes: Number(input.sessionMinutes),
      preferredTimes: input.preferredTimes as OuttakePrefs["preferredTimes"],
      spreadOut: input.spreadOut,
    };
    // Check both before saving either, so a mistake in one doesn't half-save.
    const problems = [...SHARED_PREFS.check(nextShared), ...OUTTAKE_PREFS.check(nextOuttake)];
    if (problems.length > 0) return { ok: false, error: problems.join(" ") };
    await savePreferences(sql, userId, SHARED_PREFS, nextShared);
    await savePreferences(sql, userId, OUTTAKE_PREFS, nextOuttake);
    return { ok: true, message: "Saved your preferences. Your suggestions now use them." };
  });
}

/** Saves the semester dates weekly classes repeat between (shared preferences). */
export async function saveSemesterDates(start: string, end: string): Promise<ActionResult> {
  return forUser(async (userId) => {
    const sql = db();
    const shared = await getPreferences(sql, userId, SHARED_PREFS);
    await savePreferences(sql, userId, SHARED_PREFS, { ...shared, semesterStart: start || null, semesterEnd: end || null });
    return { ok: true, message: "Saved your semester dates." };
  });
}
