// ─────────────────────────────────────────────────────────────────────────────
// Service container — SERVER ONLY
//
// Registers the tools, reads the platform's env vars (auth.ts reads the
// sign-in ones) and wires the platform implementations together. Server code
// gets services from here, or through lib/ai.ts and lib/auth.ts, instead of
// constructing them inline. It must NEVER be imported by client components.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only"; // Next.js guard — this module cannot be bundled client-side

import {
  prisma,
  PrismaUserRepository,
  PrismaUserApiKeyRepository,
  PrismaAiUsageRepository,
  PrismaAdminRepository,
  PrismaToolVisitRepository,
} from "@penntools/platform/db";
import type {
  AdminRepository,
  AiUsageRepository,
  ToolVisitRepository,
  UserApiKeyRepository,
} from "@penntools/core/repositories";
import { createAI, createUserEmbeddings } from "@penntools/platform/ai";
import { EMBEDDING_MODEL, FREE_CREDIT_USD, MIN_CALL_USD } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { toolRegistry } from "@penntools/core/tools";
import type { UserId } from "@penntools/core/types";

// ── Tool bootstrap ────────────────────────────────────────────────────────────
import { PlatformPlaygroundTool } from "@penntools/tool-platform-playground";
toolRegistry.register(new PlatformPlaygroundTool());
import { ResumeCustomizerTool } from "@penntools/tool-resume-customizer";
toolRegistry.register(new ResumeCustomizerTool());
import { PitchCoachTool } from "@penntools/tool-pitch-coach";
toolRegistry.register(new PitchCoachTool());
import { AskPennTool } from "@penntools/tool-askpenn";
toolRegistry.register(new AskPennTool());
import { RecruitingHelperTool } from "@penntools/tool-recruiting-helper";
toolRegistry.register(new RecruitingHelperTool());
import { AccountingPracticeTool } from "@penntools/tool-accounting-practice";
toolRegistry.register(new AccountingPracticeTool());
import { ChooseMbaMajorTool } from "@penntools/tool-choose-mba-major";
toolRegistry.register(new ChooseMbaMajorTool());
import { NonWhartonCourseManagerTool } from "@penntools/tool-non-wharton-course-manager";
toolRegistry.register(new NonWhartonCourseManagerTool());
import { KeepintouchTool } from "@penntools/tool-keepintouch";
toolRegistry.register(new KeepintouchTool());
import { DeadlineCalendarTool } from "@penntools/tool-deadline-calendar";
toolRegistry.register(new DeadlineCalendarTool());
import { WembaSyncTool } from "@penntools/tool-wemba-sync";
toolRegistry.register(new WembaSyncTool());
import { IndustryConnectorTool } from "@penntools/tool-industry-connector";
toolRegistry.register(new IndustryConnectorTool());
import { PassItOnTool } from "@penntools/tool-pass-it-on";
toolRegistry.register(new PassItOnTool());
import { StudentDiscountMaximizerTool } from "@penntools/tool-student-discount-maximizer";
toolRegistry.register(new StudentDiscountMaximizerTool());
import { ChatprepTool } from "@penntools/tool-chatprep";
toolRegistry.register(new ChatprepTool());
import { FeedbackInsightsTool } from "@penntools/tool-feedback-insights";
toolRegistry.register(new FeedbackInsightsTool());
import { PennPalsTool } from "@penntools/tool-penn-pals";
toolRegistry.register(new PennPalsTool());
import { PaperTldrTool } from "@penntools/tool-paper-tldr";
toolRegistry.register(new PaperTldrTool());
import { DueTool } from "@penntools/tool-due";
toolRegistry.register(new DueTool());
// ── Repositories ──────────────────────────────────────────────────────────────
// Postgres is required, locally too (see README for the Docker setup).

if (!process.env["DATABASE_URL"]) {
  console.error("[PennTools] DATABASE_URL not set — every database call will fail. See README for local setup.");
}

export const users = new PrismaUserRepository(prisma);

// Users' saved keys. Tool code must not import this (CLAUDE.md, and
// `pnpm check:tools`); the AI API below reads keys on the tool's behalf.
export const userApiKeys: UserApiKeyRepository = new PrismaUserApiKeyRepository(prisma);

// Every AI call's tokens and cost, by user and tool: the free credit is checked
// against it, and the admin page reads it. Tool code must not import this.
export const aiUsage: AiUsageRepository = new PrismaAiUsageRepository(prisma);

// Who can open /admin; see lib/admin.ts.
export const admins: AdminRepository = new PrismaAdminRepository(prisma);

// Visits to each tool, recorded by POST /api/visits for /admin, /stats and the
// home page's top tools.
export const toolVisits: ToolVisitRepository = new PrismaToolVisitRepository(prisma);

// ── AI API (new tools) ────────────────────────────────────────────────────────
// Generation uses the platform's keys (OPENAI_API_KEY, ANTHROPIC_API_KEY) while
// the user's FREE_CREDIT_USD covers the call (each call reserves its expected
// cost first; see createAI), then the user's saved keys.
// Search-query embeddings use the user's OpenAI key, or OPENAI_API_KEY when
// they have none. Every call is recorded in aiUsage with the user and tool.
// Tool routes reach these through getAI / getEmbeddings in lib/ai.ts.

const platformKeys: Record<AIProvider, string | null> = {
  openai: process.env["OPENAI_API_KEY"] || null,
  anthropic: process.env["ANTHROPIC_API_KEY"] || null,
};

/**
 * The user's free credit left in USD, less calls in progress, or 0 when it's
 * too little for any call (MIN_CALL_USD); null when the platform has no keys,
 * so there's no free credit to offer.
 */
export async function freeCreditLeft(userId: UserId): Promise<number | null> {
  if (!Object.values(platformKeys).some(Boolean)) return null;
  const left = FREE_CREDIT_USD - (await aiUsage.platformSpend(userId));
  return left >= MIN_CALL_USD ? left : 0;
}

export function createUserAI(userId: UserId, toolId: string): AI {
  return createAI({
    getKey: (provider) => userApiKeys.get(userId, provider),
    listProviders: async () => (await userApiKeys.list(userId)).map((key) => key.provider),
    credit: {
      platformKey: (provider) => platformKeys[provider],
      spent: () => aiUsage.platformSpend(userId),
      limitUsd: FREE_CREDIT_USD,
      reserve: async ({ provider, model, amountUsd }) => {
        const id = await aiUsage.reserve({ userId, toolId, api: "ai", provider, model, amountUsd }, FREE_CREDIT_USD);
        return id
          ? {
              settle: ({ model, inputTokens, outputTokens, costUsd, estimated }) =>
                aiUsage.settle(id, { model, inputTokens, outputTokens, costUsd, estimated }),
              release: () => aiUsage.release(id),
            }
          : null;
      },
    },
    recordUsage: (usage) => aiUsage.record({ ...usage, userId, toolId, api: "ai" }),
    logger,
  });
}

export async function createUserEmbeddingProvider(
  userId: UserId,
  toolId: string,
): Promise<EmbeddingProvider | null> {
  return createUserEmbeddings({
    userKey: await userApiKeys.get(userId, "openai"),
    platformKey: platformKeys.openai,
    model: EMBEDDING_MODEL,
    recordUsage: (usage) => aiUsage.record({ ...usage, userId, toolId, api: "embeddings" }),
    logger,
  });
}

// ── Logger ────────────────────────────────────────────────────────────────────

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg: string, error?: unknown) =>
    console.error(JSON.stringify({ level: "error", msg, error: String(error) })),
};
