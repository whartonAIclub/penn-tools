// The team's own PennTools user ids (random codes, not names or emails).
//
// On the live site, these accounts can open the stats page, and their own
// practice rounds are left out of the metrics. To add yourself: sign in to the
// live PennTools site, open /api/me, and add the "id" it shows below.
//
// Empty means nobody can open the live stats page: the safe default.

import type { GameMode } from "./game.js";

export const TEAM_USER_IDS: readonly string[] = [
  // Alex Salinas: (add live user id)
  // Tomer Swisa: (add live user id)
];

/**
 * Whether this user may see the stats page. Live, only the team's accounts. In
 * a local preview (a team member's own computer and database), any signed-in
 * user, since the only account there is the local development user.
 */
export function canViewStats(userId: string | null, mode: GameMode): boolean {
  if (userId === null) return false;
  return mode === "preview" || TEAM_USER_IDS.includes(userId);
}

/** Accounts whose rounds the metrics leave out: the team's, on the live site only. */
export function excludedFromMetrics(mode: GameMode): readonly string[] {
  return mode === "live" ? TEAM_USER_IDS : [];
}
