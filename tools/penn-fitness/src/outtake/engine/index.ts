// The slot engine: finds the gaps in a week and picks workout slots for them.
// Built in steps 4 and 5 of docs/outtake.md; its expected behavior is set out
// by the fixture weeks in __tests__/.

import type { PlanInput, WeekPlan } from "./types.js";

export type { PlanInput, PlannedSlot, WeekPlan } from "./types.js";

export function planWeek(input: PlanInput): WeekPlan {
  void input;
  throw new Error("planWeek isn't built yet: see steps 4 and 5 of docs/outtake.md.");
}
