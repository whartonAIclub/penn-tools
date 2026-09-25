// ─────────────────────────────────────────────────────────────────────────────
// OpenAI embedding adapter
//
// Uses text-embedding-3-small (1536 dimensions) unless another model is
// passed.  Instantiated by the container when OPENAI_API_KEY is set.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";

export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly providerName = "openai";
  readonly model: string;

  private readonly client: OpenAI;

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

  async embedMany(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    // Each result carries its input's index; sort so vectors line up with texts.
    return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
