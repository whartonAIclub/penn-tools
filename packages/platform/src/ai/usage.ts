// What one AI call used and cost, for the AI and Embeddings APIs to report to
// the platform (container.ts records it with the user and tool).

import { UNKNOWN_MODEL_PRICE, costUsd, priceOf } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import type { AiKeySource } from "@penntools/core/repositories";
import type { Logger } from "@penntools/core/tools";
import type { ResolvedRequest } from "./adapter.js";

export interface CallUsage {
  provider: AIProvider;
  model: string;
  keySource: AiKeySource;
  inputTokens: number;
  /** Reasoning included. */
  outputTokens: number;
  costUsd: number;
  /** The provider didn't report usage, so the tokens are estimated. */
  estimated: boolean;
}

/** Records a call's usage. Failures are logged, never thrown, so they can't fail a call that succeeded. */
export type RecordUsage = (usage: CallUsage) => Promise<void>;

/** The cost of a call; a model with no price is charged UNKNOWN_MODEL_PRICE, and logged. */
export function callCost(model: string, inputTokens: number, outputTokens: number, logger: Logger): number {
  const price = priceOf(model);
  if (!price) logger.warn("ai.unpriced_model", { model });
  return costUsd(price ?? UNKNOWN_MODEL_PRICE, inputTokens, outputTokens);
}

/** Calls `record`, logging instead of throwing if it fails. */
export async function recordSafely(record: RecordUsage, usage: CallUsage, logger: Logger): Promise<void> {
  try {
    await record(usage);
  } catch (error) {
    logger.error(`ai.usage_not_recorded (${usage.provider} ${usage.model}, $${usage.costUsd})`, error);
  }
}

// Rough token counts for a request whose usage the provider never reported (a
// stream cancelled or broken partway). About four characters a token for text;
// an image at most ~1,600 tokens (both providers shrink larger ones); a PDF
// counted as a few pages. Reasoning the model did before the cut isn't
// visible, so an estimate can undercount it.
const CHARS_PER_TOKEN = 4;
const IMAGE_TOKENS = 1_600;
const PDF_TOKENS = 6_000;

export function estimateInputTokens(request: ResolvedRequest): number {
  let chars = request.system?.length ?? 0;
  let tokens = 0;
  for (const message of request.messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }
    for (const part of message.content) {
      if (part.type === "text") chars += part.text.length;
      else tokens += part.type === "image" ? IMAGE_TOKENS : PDF_TOKENS;
    }
  }
  return tokens + Math.ceil(chars / CHARS_PER_TOKEN);
}

export function estimateOutputTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
