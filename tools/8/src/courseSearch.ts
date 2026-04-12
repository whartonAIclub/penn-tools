import { PrismaClient } from "../src/generated/client/index.js";

const MODEL = "text-embedding-3-small";

// ── Singleton Prisma client ────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as { ccSearchPrisma?: PrismaClient };
const prisma =
  globalForPrisma.ccSearchPrisma ??
  new PrismaClient({ datasources: { db: { url: process.env.CC_DATABASE_URL ?? "" } } });
if (process.env.NODE_ENV !== "production") globalForPrisma.ccSearchPrisma = prisma;

// ── Embed a query string via OpenAI ───────────────────────────────────────
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  const first = data.data[0];
  if (!first) throw new Error("No embedding returned");
  return first.embedding;
}

// ── Semantic course search ─────────────────────────────────────────────────
export async function filterCourses(
  major: string,
  interests: string,
  targetRoles: string,
  maxResults = 20,
): Promise<string> {
  // Combine all student context into one query
  const query = [major, interests, targetRoles].filter(Boolean).join(". ");
  if (!query.trim()) return "";

  try {
    const embedding = await embedQuery(query);
    const vectorStr = `[${embedding.join(",")}]`;

    // Cosine similarity search via pgvector
    const results = await prisma.$queryRaw<{ code: string; name: string }[]>`
      SELECT code, name
      FROM cc_course_embeddings
      ORDER BY embedding <=> ${vectorStr}::vector
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
