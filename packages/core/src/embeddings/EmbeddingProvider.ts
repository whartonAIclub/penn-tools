// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingProvider interface
//
// Converts text into a dense float vector suitable for semantic similarity
// search.  The platform adapter (OpenAI text-embedding-3-small) implements
// this; tools and routes import only this interface, never a vendor SDK.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmbeddingProvider {
  /**
   * Embed a single string.  Returns a float array of length `dimensions`.
   */
  embed(text: string): Promise<number[]>;

  /** Dimensionality of the output vectors, e.g. 1536 for text-embedding-3-small. */
  readonly dimensions: number;

  /** Human-readable provider name, e.g. "openai". */
  readonly providerName: string;
}
