// ─────────────────────────────────────────────────────────────────────────────
// AI API for tools' own routes and server actions — SERVER ONLY
//
// Both functions are bound to the signed-in user and the calling tool: the
// platform picks the key (its own while the user's free credit lasts, then
// theirs) server-side, tool code never sees it, and every call is recorded
// against the user and the tool.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import type { AI } from "@penntools/core/ai";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import { toolRegistry } from "@penntools/core/tools";
import { getCurrentUser } from "./auth";
import { createUserAI, createUserEmbeddingProvider } from "./container";

function checkToolId(toolId: string): void {
  if (!toolRegistry.get(toolId)) {
    throw new Error(`Unknown tool "${toolId}": pass your tool's manifest id.`);
  }
}

/**
 * The AI API for the signed-in user, or null when signed out (respond with
 * signInRequired()). Pass your tool's manifest id: its calls are recorded
 * against it.
 */
export async function getAI(toolId: string): Promise<AI | null> {
  checkToolId(toolId);
  const user = await getCurrentUser();
  return user ? createUserAI(user.id, toolId) : null;
}

/**
 * Embeddings for search queries, using the user's OpenAI key or else the
 * platform's. Null when signed out or when no OpenAI key is available. Pass
 * your tool's manifest id: its calls are recorded against it.
 */
export async function getEmbeddings(toolId: string): Promise<EmbeddingProvider | null> {
  checkToolId(toolId);
  const user = await getCurrentUser();
  return user ? createUserEmbeddingProvider(user.id, toolId) : null;
}
