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
import { OpenAIAdapter, AnthropicAdapter } from "@penntools/platform/llm";
import { OpenAIEmbeddingAdapter } from "@penntools/platform/embeddings";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { toolRegistry } from "@penntools/core/tools";
import type { LLMProvider } from "@penntools/core/llm";
import type { UserId } from "@penntools/core/types";

// ── Tool bootstrap ────────────────────────────────────────────────────────────
import { PlatformPlaygroundTool } from "@penntools/tool-platform-playground";
toolRegistry.register(new PlatformPlaygroundTool());
// import { Tool3 } from "@penntools/tool-3";
// toolRegistry.register(new Tool3());
import { ResumeCustomizerTool } from "@penntools/tool-resume-customizer";
toolRegistry.register(new ResumeCustomizerTool());
import { CareerCanvasTool } from "@penntools/tool-career-canvas";
toolRegistry.register(new CareerCanvasTool());
import { PennPlannerTool } from "@penntools/tool-penn-planner";
toolRegistry.register(new PennPlannerTool());
import { CourseMatchAssistTool } from "@penntools/tool-coursematch-assist";
toolRegistry.register(new CourseMatchAssistTool());
// import { Tool18 } from "@penntools/tool-18";
// toolRegistry.register(new Tool18());
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

// Visits to each tool, recorded by POST /api/visits for the admin page.
export const toolVisits: ToolVisitRepository = new PrismaToolVisitRepository(prisma);

// ── Embedding provider ─────────────────────────────────────────────────────
// The platform's OpenAI key, for tools that embed with it directly (Career
// Canvas). Null when OPENAI_API_KEY is absent; tools then skip semantic search.

export const embeddingProvider: EmbeddingProvider | null =
  process.env["OPENAI_API_KEY"]
    ? new OpenAIEmbeddingAdapter(process.env["OPENAI_API_KEY"])
    : null;

if (!embeddingProvider) {
  console.warn(
    "[PennTools] OPENAI_API_KEY not set — the platform's embeddings are disabled."
  );
}

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

// ── LLM provider (legacy) ─────────────────────────────────────────────────────
// For existing tools only (/api/llm/complete); new tools use the AI API above.
// Uses ANTHROPIC_API_KEY if set, else OPENAI_API_KEY.

function createLLMProvider(): LLMProvider {
  if (process.env["ANTHROPIC_API_KEY"]) {
    return new AnthropicAdapter(process.env["ANTHROPIC_API_KEY"]);
  }
  if (process.env["OPENAI_API_KEY"]) {
    return new OpenAIAdapter(process.env["OPENAI_API_KEY"]);
  }
  // No platform key: legacy requests fail with an authentication error, unless
  // the browser sends its own key (X-Api-Key, see createLLMFromKey).
  console.warn(
    "[PennTools] Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set — the legacy LLM API (/api/llm/complete) will fail without a browser-sent key."
  );
  return new OpenAIAdapter("missing-key");
}

export const llm: LLMProvider = createLLMProvider();

/**
 * Create a per-request LLM provider from a user-supplied API key.
 * Detects provider by key prefix: "sk-ant-" → Anthropic, otherwise → OpenAI.
 */
export function createLLMFromKey(apiKey: string): LLMProvider {
  if (apiKey.startsWith("sk-ant-")) {
    return new AnthropicAdapter(apiKey);
  }
  return new OpenAIAdapter(apiKey);
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
