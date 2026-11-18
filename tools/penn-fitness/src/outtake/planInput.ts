// Builds the slot engine's input from the stored data: preferences, schedule
// and places in whatever shape they have. This is the only code that knows both
// sides, so new or renamed attributes are handled here and the engine never
// changes for them.

import { atCorner, type Corner, type Location, type Zone } from "../location.js";
import type { Place } from "../places.js";
import type { AwayDay, BusyBlock } from "../schedule.js";
import type { SharedPrefs } from "../sharedPrefs.js";
import type { LocalDate, LocalDateTime } from "../time.js";
import type { EngineBlock, EnginePlace, PlanInput, PlannedSlot } from "./engine/types.js";
import { WORKOUT_PLACE_KINDS } from "./facilities.js";
import { PREFERRED_TIME_WINDOWS, type OuttakePrefs } from "./prefs.js";
import type { DismissedTime, WorkoutSlot } from "./types.js";

export interface PlanSources {
  weekStart: LocalDate;
  shared: SharedPrefs;
  outtake: OuttakePrefs;
  /** The user's schedule; only confirmed blocks are planned around. */
  blocks: readonly BusyBlock[];
  awayDays: readonly AwayDay[];
  /** Every known place; the ones a workout can't happen at, or this user can't use, are left out. */
  places: readonly Place[];
  crunchMode: boolean;
  dismissed: readonly DismissedTime[];
  /** The week's slots so far; completed ones stay in the plan. None when planning a fresh week. */
  slots?: readonly WorkoutSlot[];
  /** Plan only from this time on, when regenerating mid-week; the whole week when absent. */
  now?: LocalDateTime;
}

/**
 * Where a campus block is when it doesn't say: Huntsman Hall (3730 Walnut
 * Street, at 38th), where Wharton MBAs' classes, Learning Teams and corporate
 * presentations mostly are.
 */
export const CAMPUS_BLOCK_CORNER: Corner = { street: 38, crossStreet: "Walnut" };

export function buildPlanInput(sources: PlanSources): PlanInput {
  const { shared, outtake } = sources;
  const home: Location = shared.homeCorner ? atCorner(shared.homeCorner) : { area: shared.homeBase, corner: null };

  /** A zone from a stored record, as a location: HOME (or unknown) is wherever the user lives. */
  const locate = (zone: Zone | null, place?: Place): Location => {
    if (zone === null || zone === "HOME") return home;
    if (place?.corner) return atCorner(place.corner);
    return { area: zone, corner: null };
  };

  const blocks: EngineBlock[] = sources.blocks
    .filter((block) => block.confirmed)
    .map((block) => ({
      start: block.start,
      end: block.end,
      location: block.zone === "CAMPUS" ? atCorner(CAMPUS_BLOCK_CORNER) : locate(block.zone),
    }));

  const places: EnginePlace[] = sources.places
    .filter((place) => (WORKOUT_PLACE_KINDS as readonly string[]).includes(place.kind))
    .filter((place) => place.kind !== "building-gym" || shared.hasBuildingGym)
    .map((place) => ({ id: place.id, location: locate(place.zone, place), hours: place.hours }));

  const keptSlots: PlannedSlot[] = (sources.slots ?? [])
    .filter((slot) => slot.status === "COMPLETED")
    .map((slot) => ({ start: slot.start, end: slot.end, placeId: slot.placeId, travelMinutes: slot.travelMinutes, score: slot.score }));

  return {
    weekStart: sources.weekStart,
    busyBlocks: blocks,
    awayDays: sources.awayDays.map((day) => day.date),
    home,
    wakingStart: shared.wakingStart,
    wakingEnd: shared.wakingEnd,
    weeklyTargetSessions: outtake.weeklyTargetSessions,
    sessionMinutes: outtake.sessionMinutes,
    preferredWindows: outtake.preferredTimes.map((time) => PREFERRED_TIME_WINDOWS[time]),
    places,
    crunchMode: sources.crunchMode,
    dismissed: sources.dismissed,
    planFrom: sources.now ?? null,
    keptSlots,
  };
}
