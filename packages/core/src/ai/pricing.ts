// ─────────────────────────────────────────────────────────────────────────────
// Prices and the free AI credit
//
// What each model costs, so the platform can record the cost of every AI call
// and stop paying for a user once they've used their free credit. Owned by the
// Platform team: when a provider changes its prices, or MODELS or the legacy
// LLM API's defaults change, update MODEL_PRICES (a test checks that every
// catalog model has a price).
// ─────────────────────────────────────────────────────────────────────────────

import { MODELS } from "./models.js";

/**
 * What the platform's keys pay for, per user, ever, across OpenAI and
 * Anthropic. Past it, calls use the user's own key.
 */
export const FREE_CREDIT_USD = 0.5;

/**
 * The reply length (reasoning included) a call on free credit reserves, or its
 * maxOutputTokens if lower. Each call reserves its exact input cost plus this
 * much reply before it starts, so input can never take a user past the
 * credit; a reply longer than this can, by at most the rest of its reply cap.
 * Reserving the whole cap instead would leave much of the credit unusable on
 * the larger models.
 */
export const EXPECTED_REPLY_TOKENS = 4_000;

export interface ModelPrice {
  /** USD per million input tokens. */
  readonly input: number;
  /** USD per million output tokens, reasoning included. */
  readonly output: number;
  /** Higher rates for the whole request once its input is over `above` tokens. */
  readonly longContext?: { readonly above: number; readonly input: number; readonly output: number };
}

/**
 * Standard (not batch or fast) rates, checked 2026-11-11 against
 * https://platform.claude.com/docs/en/about-claude/pricing and
 * https://developers.openai.com/api/docs/pricing. Cached input isn't priced
 * separately: OpenAI caches long prompts automatically and bills cached tokens
 * for less, so those calls are slightly overcounted, never under.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  // The AI API's catalog (MODELS). Anthropic's other models charge the same
  // rate across their whole context window.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longContext: { above: 100_000, input: 0.5, output: 2.5 } },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "gpt-6-luna": { input: 0.1, output: 0.5, longContext: { above: 272_000, input: 0.2, output: 0.75 } },
  "gpt-6.1-sol": { input: 2, output: 10, longContext: { above: 272_000, input: 4, output: 15 } },
  "gpt-6-astra": { input: 10, output: 50, longContext: { above: 272_000, input: 20, output: 75 } },
  // The legacy LLM API's defaults
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "gpt-4o": { input: 2.5, output: 10 },
  // Embeddings (EMBEDDING_MODEL), which have no output
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

/**
 * Charged for a model missing from MODEL_PRICES: the highest rates there, so
 * an unpriced model never undercounts a user's spend.
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = {
  input: Math.max(...Object.values(MODEL_PRICES).map((p) => p.longContext?.input ?? p.input)),
  output: Math.max(...Object.values(MODEL_PRICES).map((p) => p.longContext?.output ?? p.output)),
};

/**
 * The price of `model`, or null if it has none. Providers may answer with a
 * dated snapshot of the model asked for (e.g. "gpt-4o-2024-08-06"), which takes
 * that model's price.
 */
export function priceOf(model: string): ModelPrice | null {
  const exact = MODEL_PRICES[model];
  if (exact) return exact;
  const base = Object.keys(MODEL_PRICES)
    .filter((id) => model.startsWith(`${id}-`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? MODEL_PRICES[base]! : null;
}

/** The cost in USD of a call with these token counts. */
export function costUsd(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  const rates = price.longContext && inputTokens > price.longContext.above ? price.longContext : price;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

/**
 * The least a call on free credit reserves: EXPECTED_REPLY_TOKENS of reply
 * from the cheapest catalog model. With less free credit left than this, no
 * call fits, so the credit counts as used: tools offer only the user's own
 * keys, and Settings shows none left.
 */
export const MIN_CALL_USD = Math.min(
  ...Object.values(MODELS)
    .flatMap((tiers) => Object.values(tiers))
    .map((spec) => costUsd(priceOf(spec.id) ?? UNKNOWN_MODEL_PRICE, 0, EXPECTED_REPLY_TOKENS)),
);
