// Busyness (section 8.3, step 5 of docs/outtake.md): the share of the week's
// waking hours taken by busy blocks. It splits the success metric into busy
// and normal weeks.
//
// Away days count only for the blocks on them: whether a trek day is "busy" is
// an open question (see the trek fixture).

import { minutesOfDay } from "../../time.js";
import { findGaps, type GapInput } from "./gaps.js";

/** Busy waking minutes / waking minutes, from 0 to 1. */
export function measureBusyness(input: GapInput): number {
  const waking = 7 * (minutesOfDay(input.wakingEnd) - minutesOfDay(input.wakingStart));
  const free = findGaps({ ...input, awayDays: [] }).reduce((sum, gap) => sum + minutesOfDay(gap.end) - minutesOfDay(gap.start), 0);
  return (waking - free) / waking;
}
