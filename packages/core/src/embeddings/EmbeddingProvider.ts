// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingProvider interface
//
// Converts text into a dense float vector suitable for semantic similarity
// search.  The platform adapter (OpenAI text-embedding-3-small) implements
// this; tools and routes import only this interface, never a vendor SDK.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmbeddingProvider {
  /**
   * Embed a single string.  Returns one float vector; its length depends on
   * the model.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embed several strings in one request.  Returns one vector per input, in
   * the same order.  Use for bulk work such as seeding a table.  OpenAI accepts
   * at most 2048 inputs per request, so callers batch larger sets.
   */
  embedMany(texts: string[]): Promise<number[][]>;

  /** Human-readable provider name, e.g. "openai". */
  readonly providerName: string;

  /**
   * Model that produces the vectors, e.g. "text-embedding-3-small".  Vectors
   * from different models are not comparable, so stored vectors should record
   * it and searches should compare only vectors from the current model.
   */
  readonly model: string;
}
