// ─────────────────────────────────────────────────────────────────────────────
// ResourceRepository interface
//
// Persists Penn resources (static directory entries + registered tools) and
// supports nearest-neighbour retrieval via pre-computed vector embeddings.
//
// Platform adapters:
//   - PrismaResourceRepository  — pgvector cosine similarity search
//   - InMemoryResourceRepository — in-process cosine similarity (no DB)
// ─────────────────────────────────────────────────────────────────────────────

export interface Resource {
  id: string;
  title: string;
  url: string;
  /** Combined text that was embedded: title + description + intent + tags. */
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertResourceInput {
  id: string;
  title: string;
  url: string;
  content: string;
  embedding: number[];
}

export interface ResourceRepository {
  /**
   * Insert or update a resource and its embedding.
   * If a resource with the same id already exists its embedding is refreshed.
   */
  upsert(input: UpsertResourceInput): Promise<Resource>;

  /**
   * Return the `topK` resources whose embeddings are most similar to
   * `queryEmbedding` (cosine similarity, descending).
   */
  searchSimilar(queryEmbedding: number[], topK: number): Promise<Resource[]>;

  /** Return all stored resources (used for seeding checks). */
  listAll(): Promise<Resource[]>;
}
