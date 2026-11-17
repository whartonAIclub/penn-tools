// The file library: every uploaded excerpt is embedded so questions can find
// the right passages by meaning. The model is stored next to each vector and
// searches only use vectors from the current model; embedLibrary re-embeds
// rows from any other model, so a platform model change can't mix them.

import type { EmbeddingProvider } from "@penntools/core/embeddings";
import type { Sql } from "postgres";
import type { ExcerptMeta } from "./imports/excerpts.js";
import type { SourceKind } from "./storage.js";

export const MAX_SEARCH_QUERY_LENGTH = 500;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 40;
/** Excerpts per embedding request (the platform limit is 2048). */
export const EMBED_BATCH_SIZE = 100;
export const DEFAULT_SEARCH_LIMIT = 8;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One passage found by a search, with where it came from. */
export interface Passage {
  excerptId: number;
  sourceId: string;
  filename: string;
  kind: SourceKind;
  tags: string[];
  meta: ExcerptMeta;
  text: string;
  /** Cosine similarity: higher is closer in meaning. */
  score: number;
}

export interface SearchFilters {
  /** Only files with at least one of these tags. */
  tags?: string[];
  /** Only files attached to this event. */
  eventId?: string;
  limit?: number;
}

/** Lowercases, trims and dedupes tags; rejects empty or oversized ones. */
export function checkTags(tags: unknown): { ok: true; value: string[] } | { ok: false; message: string } {
  if (tags === undefined || tags === null) return { ok: true, value: [] };
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) return { ok: false, message: "Tags must be words." };
  const cleaned = [...new Set((tags as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length > MAX_TAGS) return { ok: false, message: `Use at most ${MAX_TAGS} tags.` };
  if (cleaned.some((t) => t.length > MAX_TAG_LENGTH)) return { ok: false, message: `Keep each tag to at most ${MAX_TAG_LENGTH} characters.` };
  return { ok: true, value: cleaned };
}

/** Why `query` can't be searched, or null if it's fine. */
export function checkSearchQuery(query: unknown): string | null {
  if (typeof query !== "string" || !query.trim()) return "Type a question.";
  if (query.length > MAX_SEARCH_QUERY_LENGTH) return `Keep the question to at most ${MAX_SEARCH_QUERY_LENGTH} characters.`;
  return null;
}

/**
 * Embeds the excerpts that have no vector yet, or one from a different model.
 * Limit it to one source (right after an upload) or leave it open to catch up
 * on everything. Returns how many it embedded.
 */
export async function embedLibrary(sql: Sql, embeddings: EmbeddingProvider, sourceId?: string): Promise<number> {
  if (sourceId !== undefined && !UUID_RE.test(sourceId)) return 0;
  let embedded = 0;
  for (;;) {
    const rows = await sql<{ id: string; text: string }[]>`
      SELECT id, text FROM excerpts
      WHERE (embedding IS NULL OR embedding_model IS DISTINCT FROM ${embeddings.model})
        ${sourceId === undefined ? sql`` : sql`AND source_id = ${sourceId}`}
      ORDER BY id
      LIMIT ${EMBED_BATCH_SIZE}
    `;
    if (rows.length === 0) return embedded;
    const vectors = await embeddings.embedMany(rows.map((r) => r.text));
    if (vectors.length !== rows.length) throw new Error("The embedding service returned the wrong number of vectors.");
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql; // see saveEvent in storage.ts
      for (const [i, row] of rows.entries()) {
        await tx`
          UPDATE excerpts SET embedding = ${`[${vectors[i]!.join(",")}]`}::public.vector, embedding_model = ${embeddings.model}
          WHERE id = ${row.id}
        `;
      }
    });
    embedded += rows.length;
  }
}

/** The passages closest in meaning to `query`, best first, from vectors of the current model only. */
export async function searchLibrary(sql: Sql, embeddings: EmbeddingProvider, query: string, filters: SearchFilters = {}): Promise<Passage[]> {
  if (filters.eventId !== undefined && !UUID_RE.test(filters.eventId)) return [];
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_SEARCH_LIMIT, 1), 50);
  const vector = `[${(await embeddings.embed(query)).join(",")}]`;
  const tags = filters.tags && filters.tags.length > 0 ? filters.tags : null;
  // pgvector's type and operator live in `public`, outside this role's
  // search_path, so both are schema-qualified.
  const rows = await sql<
    { id: string; source_id: string; filename: string; kind: SourceKind; tags: string[]; meta: ExcerptMeta; text: string; score: number }[]
  >`
    SELECT e.id, e.source_id, s.filename, s.kind, s.tags, e.meta, e.text,
           1 - (e.embedding OPERATOR(public.<=>) ${vector}::public.vector) AS score
    FROM excerpts e JOIN sources s ON s.id = e.source_id
    WHERE e.embedding IS NOT NULL AND e.embedding_model = ${embeddings.model}
      ${tags ? sql`AND s.tags && ${tags}` : sql``}
      ${filters.eventId !== undefined ? sql`AND s.event_id = ${filters.eventId}` : sql``}
    ORDER BY e.embedding OPERATOR(public.<=>) ${vector}::public.vector
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    excerptId: Number(r.id),
    sourceId: r.source_id,
    filename: r.filename,
    kind: r.kind,
    tags: r.tags,
    meta: r.meta,
    text: r.text,
    score: Number(r.score),
  }));
}

/** Changes a file's tags. Returns false if the file doesn't exist. */
export async function setSourceTags(sql: Sql, sourceId: string, tags: string[]): Promise<boolean> {
  if (!UUID_RE.test(sourceId)) return false;
  const rows = await sql`UPDATE sources SET tags = ${tags} WHERE id = ${sourceId} RETURNING id`;
  return rows.length > 0;
}

/**
 * Passages that contain the words of `query`, best match first. Needs no AI or
 * embeddings, so it works without any API key; it finds words, not meaning.
 */
export async function searchLibraryKeywords(sql: Sql, query: string, filters: SearchFilters = {}): Promise<Passage[]> {
  if (filters.eventId !== undefined && !UUID_RE.test(filters.eventId)) return [];
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_SEARCH_LIMIT, 1), 50);
  const tags = filters.tags && filters.tags.length > 0 ? filters.tags : null;
  const rows = await sql<
    { id: string; source_id: string; filename: string; kind: SourceKind; tags: string[]; meta: ExcerptMeta; text: string; score: number }[]
  >`
    SELECT e.id, e.source_id, s.filename, s.kind, s.tags, e.meta, e.text,
           ts_rank(to_tsvector('english', e.text), websearch_to_tsquery('english', ${query})) AS score
    FROM excerpts e JOIN sources s ON s.id = e.source_id
    WHERE to_tsvector('english', e.text) @@ websearch_to_tsquery('english', ${query})
      ${tags ? sql`AND s.tags && ${tags}` : sql``}
      ${filters.eventId !== undefined ? sql`AND s.event_id = ${filters.eventId}` : sql``}
    ORDER BY score DESC, e.id
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    excerptId: Number(r.id),
    sourceId: r.source_id,
    filename: r.filename,
    kind: r.kind,
    tags: r.tags,
    meta: r.meta,
    text: r.text,
    score: Number(r.score),
  }));
}
