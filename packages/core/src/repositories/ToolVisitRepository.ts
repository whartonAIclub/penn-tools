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

/**
 * Who opened which tool, for the admin page. A visit is opening a tool's
 * pages, signed in or not; moving between pages within a tool isn't another
 * one. Tools never use this.
 */
export interface ToolVisitRepository {
  record(toolId: string, userId: UserId | null): Promise<void>;
  /** Tools with at least one visit, most recent visits first. */
  report(): Promise<ToolVisits[]>;
}

/** The window for a report's `recentVisits` and `recentUsers`. */
export const VISIT_RECENT_DAYS = 30;
