// The travel model (section 8.3, step 1 of docs/outtake.md): walking minutes
// between two locations. Corner to corner, it counts blocks on the street grid;
// when either end has no corner, it falls back to the area matrix.

import { blocksBetween, type Location } from "../../location.js";
import { ENGINE_CONFIG, type TravelConfig } from "./config.js";

/** Minutes to walk from a to b, rounded up so a gap is never overestimated. */
export function walkingMinutes(a: Location, b: Location, config: TravelConfig = ENGINE_CONFIG.travel): number {
  if (a.corner && b.corner) return Math.ceil(blocksBetween(a.corner, b.corner) * config.minutesPerBlock);
  return config.areaMinutes[a.area][b.area];
}
