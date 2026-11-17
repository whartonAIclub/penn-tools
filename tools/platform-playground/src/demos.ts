// ─────────────────────────────────────────────────────────────────────────────
// Platform Playground demos: the AI and Embeddings APIs as a tool uses them
//
// Tool logic like this lives in tools/{id}/src. It receives `ai` and
// `embeddings` from the tool's server actions (getAI / getEmbeddings in
// @/lib/ai), so it never sees API keys and is easy to test with fakes (see
// __tests__/demos.test.ts). AskPenn (tools/askpenn) shows streaming, chat
// history and a tool's own database.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "@penntools/core/ai";
import type { AI, AIProvider, GenerateResult } from "@penntools/core/ai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { SAMPLE_RESOURCES, type SampleResource } from "./samples.js";

export const MAX_PROMPT_LENGTH = 4000;
export const MAX_SYLLABUS_LENGTH = 8000;
export const MAX_QUERY_LENGTH = 200;

/** Why `value` can't be sent, or null if it's fine. Server actions get browser input, so check it. */
export function checkText(value: unknown, label: string, maxLength: number): string | null {
  if (typeof value !== "string" || !value.trim()) return `Enter ${label}.`;
  if (value.length > maxLength) return `Keep ${label} to at most ${maxLength} characters.`;
  return null;
}

// ── Generate text ─────────────────────────────────────────────────────────────

/** One reply to one prompt, on the cheapest tier: a single call, no streaming. */
export async function generateAnswer(ai: AI, provider: AIProvider, prompt: string): Promise<GenerateResult> {
  return ai.generate({
    provider, // the tool picks; the platform chooses the key (free credit, then the user's)
    tier: "fast",
    reasoning: "low",
    system: "You help Penn students. Keep answers short and concrete.",
    messages: [{ role: "user", content: prompt }],
  });
}

// ── Structured output ─────────────────────────────────────────────────────────

// One schema tells the model the shape, checks the reply, and types the result.
// Fields that may be missing are .nullable(), not .optional().
export const SyllabusTasks = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      type: z.enum(["assignment", "exam", "reading", "project"]),
      dueDate: z.string().nullable().describe("YYYY-MM-DD, or null if the syllabus gives none"),
    }),
  ),
});
export type SyllabusTasks = z.infer<typeof SyllabusTasks>;

/** The syllabus's graded tasks and readings, as typed data. */
export async function extractTasks(ai: AI, provider: AIProvider, syllabus: string): Promise<SyllabusTasks> {
  const { object } = await ai.generateObject({
    provider,
    tier: "fast",
    reasoning: "low",
    schema: SyllabusTasks,
    system: "List every graded task and required reading in the syllabus.",
    messages: [{ role: "user", content: syllabus }],
  });
  return object; // already checked against SyllabusTasks
}

// ── Semantic search ───────────────────────────────────────────────────────────

export interface ScoredResource extends SampleResource {
  /** Cosine similarity to the query: higher is closer in meaning. */
  score: number;
}

/**
 * The resources closest in meaning to `query`, best first. Real tools embed
 * their documents once (in seed.mjs) and store the vectors with pgvector, as
 * Career Canvas does; this demo embeds its few samples with each query.
 */
export async function searchResources(
  embeddings: EmbeddingProvider,
  query: string,
  resources: SampleResource[] = SAMPLE_RESOURCES,
): Promise<ScoredResource[]> {
  const texts = resources.map((r) => `${r.title}: ${r.description}`);
  const [queryVector, ...resourceVectors] = await embeddings.embedMany([query, ...texts]);

  return resources
    .map((resource, i) => ({ ...resource, score: cosineSimilarity(queryVector!, resourceVectors[i]!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}
