// Whether this server is a team member's local preview or the live site, for
// the page, its server actions and the stats page.
//
// `pnpm dev` on a team member's computer runs in development: a preview that
// includes questions still awaiting review. The deployed site, and any team
// test instance, run in production, where only verified questions are shown
// and only listed team accounts can open the stats page.

import type { GameMode } from "@penntools/tool-accounting-practice";

export const MODE: GameMode = process.env["NODE_ENV"] === "development" ? "preview" : "live";
