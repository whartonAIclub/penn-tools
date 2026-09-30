// ─────────────────────────────────────────────────────────────────────────────
// ToolContext
//
// The only thing a Tool is allowed to import from outside its own folder is
// this type.  ToolRunner constructs a concrete ToolContext and passes it to
// Tool.execute() — tools never construct one themselves.
//
// Dependency rule (enforced by convention + lint in the future):
//   tools/*  →  @penntools/core/tools (ToolContext, Tool base, types)
//   tools/*  ✗  @penntools/platform   (never)
//   tools/*  ✗  process.env           (never)
//   tools/*  ✗  fetch / db / prisma   (never)
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatRepository } from "../repositories/ChatRepository.js";
import type { MessageRepository } from "../repositories/MessageRepository.js";
import type { ToolDataRepository } from "../repositories/ToolDataRepository.js";
import type { UserRepository } from "../repositories/UserRepository.js";
import type { LLMProvider } from "../llm/LLMProvider.js";
import type { Analytics } from "../analytics/Analytics.js";
import type { UserId, User } from "../types/index.js";

// ── Logger ───────────────────────────────────────────────────────────────────
// Minimal interface so tools can log without importing console directly
// (easier to swap for structured logging later).

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown): void;
}

// ── Config ───────────────────────────────────────────────────────────────────
// Typed config object passed to tools. Constructed by platform at startup
// from env vars — tools never read process.env directly.

export interface ToolConfig {
  /** The stable id of the tool currently executing. */
  toolId: string;
  /** Add tool-specific config keys here as needed. */
  [key: string]: unknown;
}

// ── ToolContext ───────────────────────────────────────────────────────────────

export interface ToolContext {
  /** Identity of the user who triggered this tool invocation. */
  userId: UserId;

  /**
   * Full profile of the current user, pre-resolved by the platform.
   * Tools read this directly — they never fetch the user themselves.
   * Always a signed-in user; tools only run for signed-in users.
   */
  currentUser: User;

  /** Repositories — tools interact with the DB through these interfaces only. */
  db: {
    chats: ChatRepository;
    messages: MessageRepository;
    toolData: ToolDataRepository;
    users: UserRepository;
  };

  /** LLM orchestration — tools call this, not a vendor SDK directly. */
  llm: LLMProvider;

  /** Analytics event emission. */
  analytics: Analytics;

  /** Structured logger. */
  logger: Logger;

  /** Injected configuration. */
  config: ToolConfig;
}
