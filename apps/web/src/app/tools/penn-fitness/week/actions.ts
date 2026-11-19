"use server";

// The user's week, shared by Nutrition and Exercise: one schedule in the
// database (schedule_blocks), so a class added in either half shows in both.
// Nutrition reads and saves it as its weekly template (see
// tools/penn-fitness/src/weekTemplate.ts); Exercise reads the same blocks.

import {
  addBlocks,
  confirmBlocks,
  deleteBlock,
  getBlock,
  getPreferences,
  listBlocksForWeek,
  mondayOf,
  newYorkNow,
  SHARED_PREFS,
  templateChanges,
  templateFromTimeline,
  updateBlock,
  weekTimeline,
  WeeklySchedule,
  type ScheduleBlock,
  type WeekTimeline,
} from "@penntools/tool-penn-fitness";
import { getCurrentUser } from "@/lib/auth";
import { db } from "../exercise/data";

export type WeekResult = { ok: true; schedule: ScheduleBlock[] } | { ok: false; error: string };

async function thisWeek(userId: string): Promise<{ weekStart: string; timeline: WeekTimeline }> {
  const sql = db();
  const weekStart = mondayOf(newYorkNow().slice(0, 10));
  const [shared, blocks] = await Promise.all([getPreferences(sql, userId, SHARED_PREFS), listBlocksForWeek(sql, userId, weekStart)]);
  const timeline = weekTimeline({ weekStart, blocks, awayDays: [], semesterStart: shared.semesterStart, semesterEnd: shared.semesterEnd });
  return { weekStart, timeline };
}

/** This week's schedule, as Nutrition's weekly template. */
export async function loadSharedWeek(): Promise<WeekResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in with the button at the top of the page." };
  try {
    const { weekStart, timeline } = await thisWeek(user.id);
    return { ok: true, schedule: templateFromTimeline(timeline.entries, weekStart) };
  } catch (error) {
    console.error("[penn-fitness] loading the shared week failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "Your week couldn't be loaded. Try again." };
  }
}

/**
 * Saves Nutrition's template as the shared week: only what changed is
 * written, and what the user has now seen is confirmed. Returns the week as
 * stored.
 */
export async function saveSharedWeek(schedule: ScheduleBlock[]): Promise<WeekResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in with the button at the top of the page." };
  const parsed = WeeklySchedule.safeParse(schedule);
  if (!parsed.success) return { ok: false, error: "Some of your week looks wrong. Check the times and try again." };
  try {
    const sql = db();
    const { weekStart, timeline } = await thisWeek(user.id);
    const changes = templateChanges(timeline.entries, parsed.data, weekStart);
    for (const id of changes.remove) await deleteBlock(sql, user.id, id);
    if (changes.confirm.length > 0) await confirmBlocks(sql, user.id, changes.confirm);
    for (const { id, location } of changes.relocate) {
      const block = await getBlock(sql, user.id, id);
      if (!block) continue;
      const { location: _old, ...rest } = block.attributes as Record<string, unknown>;
      await updateBlock(sql, user.id, id, { attributes: location ? { ...rest, location } : rest });
    }
    if (changes.add.length > 0) await addBlocks(sql, user.id, changes.add);
    const after = await thisWeek(user.id);
    return { ok: true, schedule: templateFromTimeline(after.timeline.entries, after.weekStart) };
  } catch (error) {
    console.error("[penn-fitness] saving the shared week failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "Your week couldn't be saved. Try again." };
  }
}
