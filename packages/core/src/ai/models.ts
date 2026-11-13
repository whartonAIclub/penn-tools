// ─────────────────────────────────────────────────────────────────────────────
// Model catalog for the AI API
//
// The only models tools may use, and each tier's default reasoning. Owned by the
// Platform team: to change a model, change it here. A tool picks a tier (or one
// of these model IDs) and may override reasoning and maxOutputTokens per call.
//
// Reasoning maps to Anthropic's `output_config.effort` and OpenAI's
// `reasoning.effort`; every model here accepts low, medium and high. Neither
// provider can turn reasoning fully off on all of these models, so there is no
// "off" level.
// ─────────────────────────────────────────────────────────────────────────────

import type { AIProvider, AIReasoning, AITier } from "./types.js";

/** Every tier and reasoning level the AI API takes; AITier and AIReasoning come from these. */
export const AI_TIERS = ["fast", "standard", "best"] as const;
export const AI_REASONING_LEVELS = ["low", "medium", "high"] as const;

export interface ModelSpec {
  readonly id: string;
  readonly reasoning: AIReasoning;
}

export const MODELS = {
  anthropic: {
    fast: { id: "claude-haiku-5-5", reasoning: "low" },
    standard: { id: "claude-sonnet-5-5", reasoning: "medium" },
    best: { id: "claude-opus-5-5", reasoning: "high" },
  },
  openai: {
    fast: { id: "gpt-6-luna", reasoning: "low" },
    standard: { id: "gpt-6.1-sol", reasoning: "medium" },
    best: { id: "gpt-6-astra", reasoning: "high" },
  },
} as const satisfies Record<AIProvider, Record<AITier, ModelSpec>>;

/** Every provider the AI API takes: MODELS' keys, which must include them all. */
export const AI_PROVIDERS = Object.keys(MODELS) as readonly AIProvider[];

/** The tier used when a request names neither a tier nor a model. */
export const DEFAULT_TIER: AITier = "standard";

/** maxOutputTokens when a request doesn't set it; it includes reasoning. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

/** The largest maxOutputTokens a request may ask for. */
export const MAX_OUTPUT_TOKENS_LIMIT = 64_000;

/** Every model ID in the catalog. A request's model must belong to its provider (checked at runtime). */
export type ModelId = (typeof MODELS)[AIProvider][AITier]["id"];

/**
 * The embedding model. OpenAI only, set by the platform; tools cannot choose
 * another. Changing it means re-embedding stored vectors (seeds re-embed rows
 * whose stored model differs).
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Display names for messages and UI. */
export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};
