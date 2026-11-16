import { VISIT_RECENT_DAYS } from "@penntools/core/repositories";
import type { ToolVisitCount, ToolVisitRepository, ToolVisits } from "@penntools/core/repositories";
import type { UserId } from "@penntools/core/types";
import type { PrismaClient } from "@prisma/client";

// Counts are cast to int so they aren't bigints.
interface VisitRow {
  tool_id: string;
  visits: number;
  users: number;
  recent_visits: number;
  recent_users: number;
}

export class PrismaToolVisitRepository implements ToolVisitRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(toolId: string, userId: UserId | null): Promise<void> {
    await this.db.toolVisit.create({ data: { toolId, userId } });
  }

  async report(): Promise<ToolVisits[]> {
    const since = new Date(Date.now() - VISIT_RECENT_DAYS * 24 * 60 * 60_000);
    const rows = await this.db.$queryRaw<VisitRow[]>`
      SELECT
        tool_id,
        COUNT(*)::int AS visits,
        COUNT(DISTINCT user_id)::int AS users,
        (COUNT(*) FILTER (WHERE created_at > ${since}))::int AS recent_visits,
        (COUNT(DISTINCT user_id) FILTER (WHERE created_at > ${since}))::int AS recent_users
      FROM tool_visits
      GROUP BY tool_id
      ORDER BY recent_visits DESC, visits DESC`;
    return rows.map((row) => ({
      toolId: row.tool_id,
      visits: row.visits,
      users: row.users,
      recentVisits: row.recent_visits,
      recentUsers: row.recent_users,
    }));
  }

  async visitsSince(days: number): Promise<ToolVisitCount[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    // COUNT(user_id) skips signed-out visits, so it's under COUNT(*) when there
    // are any; they count as one user between them.
    const rows = await this.db.$queryRaw<{ tool_id: string; visits: number; users: number }[]>`
      SELECT
        tool_id,
        COUNT(*)::int AS visits,
        (COUNT(DISTINCT user_id) + CASE WHEN COUNT(user_id) < COUNT(*) THEN 1 ELSE 0 END)::int AS users
      FROM tool_visits
      WHERE created_at > ${since}
      GROUP BY tool_id
      ORDER BY visits DESC, users DESC, tool_id`;
    return rows.map((row) => ({ toolId: row.tool_id, visits: row.visits, users: row.users }));
  }
}
