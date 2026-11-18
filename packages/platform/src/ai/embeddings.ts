// ─────────────────────────────────────────────────────────────────────────────
// Query embeddings for a user
//
// Embeds with the user's OpenAI key when they've saved one, otherwise with the
// platform's. Every call is reported to `recordUsage` with whose key paid, so
// the platform's spend shows against the user and tool like the AI API's.
// Embeddings cost little next to generation, so they aren't stopped when the
// free credit is used up. Seeds use OpenAIEmbeddingAdapter with the platform's
// key directly, and aren't recorded.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import type { Logger } from "@penntools/core/tools";
import { toAIError } from "./errors.js";
import { callCost, recordSafely } from "./usage.js";
import type { RecordUsage } from "./usage.js";

export interface CreateUserEmbeddingsOptions {
  userKey: string | null;
  platformKey: string | null;
  model: string;
  recordUsage: RecordUsage;
  logger: Logger;
}

/** Null when there is neither a user key nor a platform key. */
export function createUserEmbeddings(options: CreateUserEmbeddingsOptions): EmbeddingProvider | null {
  const { userKey, platformKey, model, recordUsage, logger } = options;
  const apiKey = userKey ?? platformKey;
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, timeout: 15_000 });

  async function embedMany(texts: string[]): Promise<number[][]> {
    try {
      const response = await client.embeddings.create({ model, input: texts });
      const inputTokens = response.usage.prompt_tokens;
      await recordSafely(
        recordUsage,
        {
          provider: "openai",
          model,
          keySource: userKey ? "user" : "platform",
          inputTokens,
          outputTokens: 0,
          costUsd: callCost(model, inputTokens, 0, logger),
          estimated: false,
        },
        logger,
      );
      return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    } catch (error) {
      throw toAIError("openai", error, logger);
    }
  }

  return {
    providerName: "openai",
    model,
    embedMany,
    embed: async (text) => (await embedMany([text]))[0]!,
  };
}
