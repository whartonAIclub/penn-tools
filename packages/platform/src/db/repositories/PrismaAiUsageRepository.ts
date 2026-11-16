import { RESERVATION_TTL_MINUTES } from "@penntools/core/repositories";
import type {
  AiCreditReservation,
  AiKeySource,
  AiReservationUsage,
  AiUsageApi,
  AiUsageEntry,
  AiUsageReport,
  AiUsageRepository,
} from "@penntools/core/repositories";
import type { ApiKeyProvider, UserId } from "@penntools/core/types";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  AiKeySource as PrismaKeySource,
  AiUsageApi as PrismaUsageApi,
  ApiKeyProvider as PrismaProvider,
} from "@prisma/client";

const PROVIDERS: Record<ApiKeyProvider, PrismaProvider> = {
  openai: PrismaProvider.OPENAI,
  anthropic: PrismaProvider.ANTHROPIC,
};
const KEY_SOURCES: Record<AiKeySource, PrismaKeySource> = {
  platform: PrismaKeySource.PLATFORM,
  user: PrismaKeySource.USER,
};
const APIS: Record<AiUsageApi, PrismaUsageApi> = {
  ai: PrismaUsageApi.AI,
  embeddings: PrismaUsageApi.EMBEDDINGS,
  legacy: PrismaUsageApi.LEGACY,
};

// Rows from the report's queries. Sums of the double precision cost column
// come back as numbers; counts are cast to int so they aren't bigints.
interface TotalsRow {
  calls: number;
  users: number;
  users_low_on_credit: number;
  estimated_calls: number;
  platform_usd: number;
  user_key_usd: number;
}
interface ToolRow {
  tool_id: string;
  calls: number;
  users: number;
  input_tokens: number;
  output_tokens: number;
  platform_usd: number;
  user_key_usd: number;
}
interface UserRow {
  user_id: string;
  name: string | null;
  email: string | null;
  calls: number;
  platform_usd: number;
  user_key_usd: number;
  last_used_at: Date;
}

/** Reservations created before this are abandoned. */
function reservationCutoff(): Date {
  return new Date(Date.now() - RESERVATION_TTL_MINUTES * 60_000);
}

/** Platform spend: settled calls plus live reservations. */
async function spendOf(db: PrismaClient | Prisma.TransactionClient, userId: UserId): Promise<number> {
  const { _sum } = await db.aiUsage.aggregate({
    where: {
      userId,
      keySource: PrismaKeySource.PLATFORM,
      OR: [{ pending: false }, { createdAt: { gt: reservationCutoff() } }],
    },
    _sum: { costUsd: true },
  });
  return _sum.costUsd ?? 0;
}

export class PrismaAiUsageRepository implements AiUsageRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: AiUsageEntry): Promise<void> {
    await this.db.aiUsage.create({
      data: {
        ...entry,
        api: APIS[entry.api],
        provider: PROVIDERS[entry.provider],
        keySource: KEY_SOURCES[entry.keySource],
      },
    });
  }

  async platformSpend(userId: UserId): Promise<number> {
    return spendOf(this.db, userId);
  }

  async reserve(call: AiCreditReservation, limitUsd: number): Promise<string | null> {
    const { amountUsd, ...rest } = call;
    return this.db.$transaction(async (tx) => {
      // One reservation at a time per user: the lock is held until the
      // transaction ends, so another call can't read the spend in between.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai_credit:${call.userId}`}))`;
      if ((await spendOf(tx, call.userId)) + amountUsd > limitUsd) return null;
      const row = await tx.aiUsage.create({
        data: {
          ...rest,
          api: APIS[call.api],
          provider: PROVIDERS[call.provider],
          keySource: PrismaKeySource.PLATFORM,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: amountUsd,
          pending: true,
        },
        select: { id: true },
      });
      return row.id;
    });
  }

  async settle(reservationId: string, usage: AiReservationUsage): Promise<void> {
    await this.db.aiUsage.update({ where: { id: reservationId }, data: { ...usage, pending: false } });
  }

  async release(reservationId: string): Promise<void> {
    await this.db.aiUsage.deleteMany({ where: { id: reservationId, pending: true } });
  }

  async report({ limit, lowCreditUsd }: { limit: number; lowCreditUsd: number }): Promise<AiUsageReport> {
    const [totals] = await this.db.$queryRaw<TotalsRow[]>`
      SELECT
        COUNT(*)::int AS calls,
        COUNT(DISTINCT user_id)::int AS users,
        (SELECT COUNT(*)::int FROM (
          SELECT 1 FROM ai_usage
          WHERE NOT pending AND key_source = 'PLATFORM'
          GROUP BY user_id
          HAVING SUM(cost_usd) >= ${lowCreditUsd}
        ) low) AS users_low_on_credit,
        (COUNT(*) FILTER (WHERE estimated))::int AS estimated_calls,
        COALESCE(SUM(cost_usd) FILTER (WHERE key_source = 'PLATFORM'), 0) AS platform_usd,
        COALESCE(SUM(cost_usd) FILTER (WHERE key_source = 'USER'), 0) AS user_key_usd
      FROM ai_usage
      WHERE NOT pending`;

    const tools = await this.db.$queryRaw<ToolRow[]>`
      SELECT
        tool_id,
        COUNT(*)::int AS calls,
        COUNT(DISTINCT user_id)::int AS users,
        SUM(input_tokens)::float8 AS input_tokens,
        SUM(output_tokens)::float8 AS output_tokens,
        COALESCE(SUM(cost_usd) FILTER (WHERE key_source = 'PLATFORM'), 0) AS platform_usd,
        COALESCE(SUM(cost_usd) FILTER (WHERE key_source = 'USER'), 0) AS user_key_usd
      FROM ai_usage
      WHERE NOT pending
      GROUP BY tool_id
      ORDER BY SUM(cost_usd) DESC`;

    const users = await this.db.$queryRaw<UserRow[]>`
      SELECT
        u.id AS user_id,
        u.name,
        u.email,
        COUNT(*)::int AS calls,
        COALESCE(SUM(a.cost_usd) FILTER (WHERE a.key_source = 'PLATFORM'), 0) AS platform_usd,
        COALESCE(SUM(a.cost_usd) FILTER (WHERE a.key_source = 'USER'), 0) AS user_key_usd,
        MAX(a.created_at) AS last_used_at
      FROM ai_usage a
      JOIN users u ON u.id = a.user_id
      WHERE NOT a.pending
      GROUP BY u.id
      ORDER BY SUM(a.cost_usd) DESC
      LIMIT ${limit}`;

    return {
      totals: {
        calls: totals?.calls ?? 0,
        users: totals?.users ?? 0,
        usersLowOnCredit: totals?.users_low_on_credit ?? 0,
        estimatedCalls: totals?.estimated_calls ?? 0,
        platformUsd: totals?.platform_usd ?? 0,
        userKeyUsd: totals?.user_key_usd ?? 0,
      },
      byTool: tools.map((row) => ({
        toolId: row.tool_id,
        calls: row.calls,
        users: row.users,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        platformUsd: row.platform_usd,
        userKeyUsd: row.user_key_usd,
      })),
      byUser: users.map((row) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        calls: row.calls,
        platformUsd: row.platform_usd,
        userKeyUsd: row.user_key_usd,
        lastUsedAt: row.last_used_at,
      })),
    };
  }
}
