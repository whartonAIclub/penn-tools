// ─────────────────────────────────────────────────────────────────────────────
// Service container — SERVER ONLY
//
// This is the single place that reads env vars and wires concrete platform
// implementations together.  It must NEVER be imported by client components.
//
// Every API route imports from here instead of constructing services inline.
// This makes it trivial to swap implementations (e.g. switch LLM provider)
// and keeps env access out of every other file.
//
// Pattern: manual DI via a lazy singleton.  We avoid heavy DI frameworks to
// keep the surface area small.  If complexity grows, consider tsyringe or
// awilix.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only"; // Next.js guard — this module cannot be bundled client-side

import {
  prisma,
  PrismaChatRepository,
  PrismaMessageRepository,
  PrismaToolDataRepository,
  PrismaUserRepository,
  InMemoryChatRepository,
  InMemoryMessageRepository,
  InMemoryToolDataRepository,
  InMemoryUserRepository,
} from "@penntools/platform/db";
import { OpenAIAdapter, AnthropicAdapter } from "@penntools/platform/llm";
import { PostHogAnalytics } from "@penntools/platform/analytics";
import { AnonymousIdentityService } from "@penntools/platform/identity";
import { NoopAnalytics } from "@penntools/core/analytics";
import { toolRegistry, ToolRunner } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { LLMProvider } from "@penntools/core/llm";
import type { Analytics } from "@penntools/core/analytics";
import type { UserId, User } from "@penntools/core/types";

// ── Tool bootstrap ────────────────────────────────────────────────────────────
import { PlatformPlaygroundTool } from "@penntools/tool-platform-playground";
toolRegistry.register(new PlatformPlaygroundTool());

// ── Repositories ──────────────────────────────────────────────────────────────
// If DATABASE_URL is not set, use in-memory repositories so the app runs
// without a database (sufficient for prototyping). Swap to Prisma repos when
// a real DB is configured.

const useInMemory = !process.env["DATABASE_URL"];

if (useInMemory) {
  console.warn("[PennTools] DATABASE_URL not set — using in-memory repositories. Data will not persist across restarts.");
}

export const repositories = useInMemory
  ? {
      chats: new InMemoryChatRepository(),
      messages: new InMemoryMessageRepository(),
      toolData: new InMemoryToolDataRepository(),
      users: new InMemoryUserRepository(),
    }
  : {
      chats: new PrismaChatRepository(prisma),
      messages: new PrismaMessageRepository(prisma),
      toolData: new PrismaToolDataRepository(prisma),
      users: new PrismaUserRepository(prisma),
    };

// ── LLM provider ──────────────────────────────────────────────────────────────
// Reads OPENAI_API_KEY or ANTHROPIC_API_KEY from env.  Falls back to OpenAI.

function createLLMProvider(): LLMProvider {
  if (process.env["ANTHROPIC_API_KEY"]) {
    return new AnthropicAdapter(process.env["ANTHROPIC_API_KEY"]);
  }
  if (process.env["OPENAI_API_KEY"]) {
    return new OpenAIAdapter(process.env["OPENAI_API_KEY"]);
  }
  // No key configured — use stub (OpenAI adapter still returns a canned response).
  console.warn(
    "[PennTools] No LLM API key configured. Responses will be stubbed."
  );
  return new OpenAIAdapter("stub-key");
}

export const llm: LLMProvider = createLLMProvider();

// ── Analytics ─────────────────────────────────────────────────────────────────

function createAnalytics(): Analytics {
  const key = process.env["POSTHOG_API_KEY"];
  const host = process.env["POSTHOG_HOST"] ?? "https://app.posthog.com";
  if (key) {
    return new PostHogAnalytics(key, host);
  }
  return new NoopAnalytics();
}

export const analytics: Analytics = createAnalytics();

// ── Identity ──────────────────────────────────────────────────────────────────

export const identityService = new AnonymousIdentityService(repositories.users);

// ── Logger ────────────────────────────────────────────────────────────────────

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", msg, ...meta })),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
  error: (msg: string, error?: unknown) =>
    console.error(JSON.stringify({ level: "error", msg, error: String(error) })),
};

// ── ToolRunner ────────────────────────────────────────────────────────────────

export const toolRunner = new ToolRunner({
  registry: toolRegistry,
  contextFactory: async (toolId: string, userId: UserId): Promise<ToolContext> => {
    const user = await repositories.users.findById(userId);
    if (!user) throw new Error(`User not found: ${userId}`);
    return {
      userId,
      currentUser: user,
      db: repositories,
      llm,
      analytics,
      logger,
      config: { toolId },
    };
  },
  logger,
});
