import type { Sql } from "postgres";
import type { EmbeddingProvider } from "@penntools/core/embeddings";

/** What course search needs; the web app supplies both. */
export interface CourseSearchDeps {
  sql: Sql;
  embeddings: EmbeddingProvider;
}

// ── Semantic course search ─────────────────────────────────────────────────
export async function filterCourses(
  deps: CourseSearchDeps,
  major: string,
  interests: string,
  targetRoles: string,
  maxResults = 20,
): Promise<string> {
  // Combine all student context into one query
  const query = [major, interests, targetRoles].filter(Boolean).join(". ");
  if (!query.trim()) return "";

  try {
    const embedding = await deps.embeddings.embed(query);
    const vector = `[${embedding.join(",")}]`;

    // Cosine distance via pgvector. Its type and operator live in `public`,
    // outside this role's search_path, so both are schema-qualified. Only
    // vectors from the query's model are comparable (see seed.mjs).
    const results = await deps.sql<{ code: string; name: string }[]>`
      SELECT code, name
      FROM course_embeddings
      WHERE model = ${deps.embeddings.model}
      ORDER BY embedding OPERATOR(public.<=>) ${vector}::public.vector
      LIMIT ${maxResults}
    `;

    if (results.length === 0) return "";

    const lines = results.map((r) => `- ${r.code}: ${r.name}`).join("\n");
    return `### Relevant Penn courses (from 2025–26 catalog)\n${lines}\n\nNote: verify availability and prerequisites at https://catalog.upenn.edu/courses/`;
  } catch (e) {
    console.warn("[CareerCanvas] Semantic course search failed, skipping:", e);
    return "";
  }
}
