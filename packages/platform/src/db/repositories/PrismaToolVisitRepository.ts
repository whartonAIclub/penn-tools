import { VISIT_RECENT_DAYS } from "@penntools/core/repositories";
import type { ToolVisitRepository, ToolVisits } from "@penntools/core/repositories";
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
}
