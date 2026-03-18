// ─────────────────────────────────────────────────────────────────────────────
// OpenAI embedding adapter
//
// Uses text-embedding-3-small (1536 dimensions).  Instantiated by the
// container when OPENAI_API_KEY is set.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";

export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly providerName = "openai";
  readonly dimensions = 1536;

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "text-embedding-3-small") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0]!.embedding;
  }
}
