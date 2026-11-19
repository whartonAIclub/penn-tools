// Handoff's pilot metrics report (USER-INSTRUCTIONS §8 item 3): a small, read-only, owner-run report from the records Handoff
// already keeps. Not a dashboard and not tracking: it adds nothing to what is stored.
//
//   collect.ts    every read, in one REPEATABLE READ, READ ONLY transaction
//   aggregate.ts  the figures: pure functions over what was read, with the engine's own read-only rules
//   markdown.ts   a short Markdown summary
//
// The owner's runner is scripts/pilot-report.mjs (local database only). The web app doesn't import this module.

import type { Sql } from "postgres";
import { buildPilotReport } from "./aggregate.js";
import type { BuildOptions } from "./aggregate.js";
import { collectPilotData } from "./collect.js";
import type { CollectHooks, CollectOptions } from "./collect.js";
import type { PilotReport } from "./types.js";

export { buildPilotReport } from "./aggregate.js";
export type { BuildOptions } from "./aggregate.js";
export { collectPilotData } from "./collect.js";
export type { CollectHooks, CollectOptions } from "./collect.js";
export { pilotReportMarkdown } from "./markdown.js";
export { PILOT_REPORT_FORMAT, REPORT_WORLD } from "./types.js";
export type {
  ActionRow,
  CategorySupplyDemand,
  ClosedByReason,
  Count,
  Duration,
  EventSupplyDemand,
  GoodsSupplyDemand,
  KnownTestAccounts,
  PilotData,
  PilotReport,
  Units,
  Waited,
} from "./types.js";

export interface PilotReportOptions {
  /** Identify known TEST and Local Developer accounts in public.users and leave their records out (collect.ts). */
  identifyTestAccounts?: boolean;
  /** More accounts to leave out (tests: made-up ids). */
  excludeUserIds?: readonly string[];
  /** Tests only: the time to report at (ms); otherwise the database clock. */
  now?: number;
  /** Tests only. */
  hooks?: CollectHooks;
}

/** Reads (read-only) and builds the report: the live market only. */
export async function runPilotReport(sql: Sql, opts: PilotReportOptions = {}): Promise<PilotReport> {
  const collect: CollectOptions = {
    ...(opts.identifyTestAccounts !== undefined ? { identifyTestAccounts: opts.identifyTestAccounts } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.hooks !== undefined ? { hooks: opts.hooks } : {}),
  };
  const build: BuildOptions = opts.excludeUserIds !== undefined ? { excludeUserIds: opts.excludeUserIds } : {};
  return buildPilotReport(await collectPilotData(sql, collect), build);
}
