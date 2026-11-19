// The slot engine (section 8.3 of docs/outtake.md): finds the gaps in a week
// and picks workout slots for them. Pure functions with no I/O; its expected
// behavior is set out by the fixture weeks in __tests__/. Its input comes from
// buildPlanInput (../planInput.ts).

export type { EngineBlock, EnginePlace, WorkoutPlanInput, PlannedSlot, PreferredWindow, WeekPlan } from "./types.js";
export { ENGINE_CONFIG, type EngineConfig, type PlanConfig, type ScoringConfig, type TravelConfig } from "./config.js";
export { walkingMinutes } from "./travel.js";
export { findGaps, placeOptions, type Gap, type GapInput, type PlaceOption } from "./gaps.js";
export { scoreSlot, type ScoreParts, type ScoringInput, type SlotToScore } from "./scoring.js";
export { measureBusyness } from "./busyness.js";
export { bestSlotPerDay, explainSlot, planWeek, spreadPoints } from "./plan.js";
