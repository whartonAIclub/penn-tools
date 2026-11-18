// Places, shared by both halves: gyms and fields for exercise, dining halls and
// cafés for intake, all with the same location and hours. Each half keeps its
// own list (e.g. outtake/facilities.ts) and filters by kind.

import type { Attributes } from "./attributes.js";
import type { Corner, Zone } from "./location.js";
import type { TimeOfDay, Weekday } from "./time.js";

/** Opening and closing time on one weekday; null when closed all day. */
export type DayHours = { open: TimeOfDay; close: TimeOfDay } | null;
export type OpeningHours = Record<Weekday, DayHours>;

export interface Place {
  /** Stable, kebab-case, unique across both halves; records store it. */
  id: string;
  name: string;
  /**
   * What it is, e.g. "gym", "pool", "dining-hall". A free string: each half
   * defines the kinds it uses (outtake: WORKOUT_PLACE_KINDS).
   */
  kind: string;
  /** Its area, or HOME for one wherever the user lives (their building's gym). */
  zone: Zone;
  /** Its nearest corner, for walking times; null when unknown or at HOME. */
  corner: Corner | null;
  hours: OpeningHours;
  /** False until someone has checked its hours and corner against its own listing. */
  verified: boolean;
  /** For a map later; null until looked up. */
  lat: number | null;
  lng: number | null;
  attributes: Attributes;
}
