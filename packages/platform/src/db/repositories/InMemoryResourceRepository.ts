// ─────────────────────────────────────────────────────────────────────────────
// InMemoryResourceRepository
//
// Used when DATABASE_URL is not set (development / prototyping mode).
// Cosine similarity is computed in-process against stored embeddings.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ResourceRepository,
  Resource,
  UpsertResourceInput,
} from "@penntools/core/resources";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface StoredResource extends Resource {
  embedding: number[];
}

export class InMemoryResourceRepository implements ResourceRepository {
  private readonly store = new Map<string, StoredResource>();

  async upsert(input: UpsertResourceInput): Promise<Resource> {
    const now = new Date();
    const existing = this.store.get(input.id);
    const resource: StoredResource = {
      id: input.id,
      title: input.title,
      url: input.url,
      content: input.content,
      embedding: input.embedding,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.store.set(input.id, resource);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { embedding: _, ...rest } = resource;
    return rest;
  }

  async searchSimilar(
    queryEmbedding: number[],
    topK: number
  ): Promise<Resource[]> {
    const scored = Array.from(this.store.values()).map((r) => ({
      resource: r,
      score: cosineSimilarity(queryEmbedding, r.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ resource }) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { embedding: _, ...rest } = resource;
      return rest;
    });
  }

  async listAll(): Promise<Resource[]> {
    return Array.from(this.store.values()).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { embedding: _, ...rest } = r;
      return rest;
    });
  }
}
