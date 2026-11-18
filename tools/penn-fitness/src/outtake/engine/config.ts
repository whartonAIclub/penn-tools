// Every setting the slot engine uses, in one place, so they can be tuned at
// the engine review (step 6 of docs/outtake.md).

import type { Area } from "../../location.js";

export interface TravelConfig {
  /**
   * Walking minutes per block on the street grid, between two corners. An
   * approximation: blocks vary in length and the Schuylkill has fixed bridges.
   */
  minutesPerBlock: number;
  /** Walking minutes between areas, for when either end has no corner. */
  areaMinutes: Record<Area, Record<Area, number>>;
}

/** Points a slot gains or loses (section 8.3, step 2). Higher totals are better. */
export interface ScoringConfig {
  /** Gained by a slot wholly inside a preferred time of day; a share of it for a slot partly inside. */
  preferredTime: number;
  /** Lost per minute of walking there and back. */
  travelPerMinute: number;
  /** The same in crunch mode: higher, to keep sessions close to where the user already is. */
  crunchTravelPerMinute: number;
  /** A slot ending less than bufferMinutes before the next commitment loses `buffer`. */
  bufferMinutes: number;
  buffer: number;
  /** Lost by a slot overlapping a time the user dismissed before. */
  dismissed: number;
  /** Lost for each two slots on consecutive days. */
  backToBack: number;
}

export interface PlanConfig {
  /** Slots start on the quarter hour (or whatever this is), when the gap allows. */
  startStepMinutes: number;
  /** A week at or over this busyness counts as busy (section 8.3, step 5). */
  busyThreshold: number;
  /** Crunch mode (section 8.3, step 4): fewer, shorter sessions. */
  crunch: {
    sessions: number;
    /** Sessions are as long as this when they fit (and no longer than the user's usual session)... */
    longestMinutes: number;
    /** ...and as short as this when they don't. */
    shortestMinutes: number;
  };
}

export interface EngineConfig {
  travel: TravelConfig;
  scoring: ScoringConfig;
  plan: PlanConfig;
}

export const ENGINE_CONFIG: EngineConfig = {
  travel: {
    minutesPerBlock: 1.5,
    areaMinutes: {
      CAMPUS: { CAMPUS: 0, CENTER_CITY: 25 },
      CENTER_CITY: { CAMPUS: 25, CENTER_CITY: 0 },
    },
  },
  scoring: {
    preferredTime: 2,
    travelPerMinute: 0.05,
    crunchTravelPerMinute: 0.15,
    bufferMinutes: 30,
    buffer: 3,
    dismissed: 10,
    backToBack: 2,
  },
  plan: {
    startStepMinutes: 15,
    busyThreshold: 0.5,
    crunch: { sessions: 2, longestMinutes: 30, shortestMinutes: 20 },
  },
};
