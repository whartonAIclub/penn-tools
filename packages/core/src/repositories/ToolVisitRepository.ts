import type { UserId } from "../types/index.js";

/** Visits to one tool: all time, and in the last VISIT_RECENT_DAYS days. */
export interface ToolVisits {
  toolId: string;
  visits: number;
  /** Distinct signed-in users; signed-out visits count only in `visits`. */
  users: number;
  recentVisits: number;
  recentUsers: number;
}

/** Visits to one tool over some recent window (ToolVisitRepository.visitsSince). */
export interface ToolVisitCount {
  toolId: string;
  visits: number;
  /**
   * Distinct signed-in users, plus one for everyone signed out together if
   * any visit was signed out, so a tool with visits has at least one user.
   */
  users: number;
}

/**
 * Who opened which tool, for /admin, /stats and the home page's top tools. A
 * visit is opening a tool's pages, signed in or not; moving between pages
 * within a tool isn't another one. Tools never use this.
 */
export interface ToolVisitRepository {
  record(toolId: string, userId: UserId | null): Promise<void>;
  /** Tools with at least one visit, most recent visits first. */
  report(): Promise<ToolVisits[]>;
  /** Each tool's visits in the last `days` days, most visits first; tools with none are left out. */
  visitsSince(days: number): Promise<ToolVisitCount[]>;
}

/** The window for a report's `recentVisits` and `recentUsers`. */
export const VISIT_RECENT_DAYS = 30;
