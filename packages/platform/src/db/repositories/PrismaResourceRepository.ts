// ─────────────────────────────────────────────────────────────────────────────
// PrismaResourceRepository
//
// Uses raw SQL for the vector(1536) column (pgvector) because Prisma marks
// Unsupported columns as opaque and excludes them from generated types.
//
// Vector literal format expected by pgvector: '[x1,x2,...,xN]'
// ─────────────────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
  ResourceRepository,
  Resource,
  UpsertResourceInput,
} from "@penntools/core/resources";

function toResource(row: {
  id: string;
  title: string;
  url: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}): Resource {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function vecLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export class PrismaResourceRepository implements ResourceRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: UpsertResourceInput): Promise<Resource> {
    const vec = vecLiteral(input.embedding);
    const rows = await this.db.$queryRaw<
      {
        id: string;
        title: string;
        url: string;
        content: string;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      INSERT INTO resources (id, title, url, content, embedding, created_at, updated_at)
      VALUES (
        ${input.id},
        ${input.title},
        ${input.url},
        ${input.content},
        ${vec}::vector,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title     = EXCLUDED.title,
        url       = EXCLUDED.url,
        content   = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
      RETURNING id, title, url, content, created_at, updated_at
    `;
    return toResource(rows[0]!);
  }

  async searchSimilar(
    queryEmbedding: number[],
    topK: number
  ): Promise<Resource[]> {
    const vec = vecLiteral(queryEmbedding);
    const rows = await this.db.$queryRaw<
      {
        id: string;
        title: string;
        url: string;
        content: string;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT id, title, url, content, created_at, updated_at
      FROM resources
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${topK}
    `;
    return rows.map(toResource);
  }

  async listAll(): Promise<Resource[]> {
    const rows = await this.db.$queryRaw<
      {
        id: string;
        title: string;
        url: string;
        content: string;
        created_at: Date;
        updated_at: Date;
      }[]
    >`
      SELECT id, title, url, content, created_at, updated_at
      FROM resources
      ORDER BY created_at ASC
    `;
    return rows.map(toResource);
  }
}
