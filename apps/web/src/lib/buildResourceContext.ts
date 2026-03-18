// ─────────────────────────────────────────────────────────────────────────────
// buildResourceContext
//
// TODO: Switch to RAG (pgvector semantic search) once the DB + embeddings are
// set up. The full pipeline is already implemented — just uncomment the block
// below labelled "RAG PATH" and remove the "STATIC PATH" block.
//
// For now, all resources from resources.json are injected directly into the
// system prompt (prompt-stuffing). Fine for a small dictionary; does not scale.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { toolRegistry } from "@penntools/core/tools";
import resourcesData from "../data/resources.json";

// ── RAG PATH (disabled until pgvector is provisioned) ────────────────────────
// import { embeddingProvider, resourceRepository } from "./container";
// import type { Resource } from "@penntools/core/resources";
//
// const TOP_K = 5;
// const MAX_FALLBACK = 10;
//
// function formatResource(r: Resource, index: number): string {
//   return [
//     `${index + 1}. **${r.title}**`,
//     `   URL: ${r.url}`,
//     `   ${r.content}`,
//   ].join("\n");
// }
//
// export async function buildResourceContext(query: string): Promise<string> {
//   let results: Resource[];
//   if (embeddingProvider) {
//     try {
//       const queryEmbedding = await embeddingProvider.embed(query);
//       results = await resourceRepository.searchSimilar(queryEmbedding, TOP_K);
//     } catch {
//       results = (await resourceRepository.listAll()).slice(0, MAX_FALLBACK);
//     }
//   } else {
//     results = (await resourceRepository.listAll()).slice(0, MAX_FALLBACK);
//   }
//   if (results.length === 0) return "";
//   const entries = results.map(formatResource).join("\n\n");
//   return (
//     "## Relevant Penn Resources\n" +
//     "Use the following resources to answer the user's question. Always include the URL.\n\n" +
//     entries
//   );
// }

// ── STATIC PATH (active) ─────────────────────────────────────────────────────

interface StaticResource {
  id: string;
  title: string;
  url: string;
  description: string;
  intent: string;
  semanticTags: string[];
}

function formatEntry(
  title: string,
  url: string,
  description: string,
  intent: string,
  tags: string[],
  index: number
): string {
  return [
    `${index + 1}. **${title}**`,
    `   URL: ${url}`,
    `   What it does: ${description}`,
    `   When to suggest it: ${intent}`,
    `   Keywords: ${tags.join(", ")}`,
  ].join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function buildResourceContext(_query: string): Promise<string> {
  const staticSection = (resourcesData.resources as StaticResource[]).map(
    (r, i) =>
      formatEntry(r.title, r.url, r.description, r.intent, r.semanticTags, i)
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const toolSection = toolRegistry.listManifests().map((m, i) =>
    formatEntry(
      m.title,
      `${baseUrl}/tools/${m.id}`,
      m.description,
      `Use the ${m.title} tool: ${m.description}`,
      [m.id, m.title.toLowerCase()],
      i
    )
  );

  const parts: string[] = [];

  if (staticSection.length > 0) {
    parts.push(
      "## Penn Resources\n" +
        "Official University of Pennsylvania services and portals:\n\n" +
        staticSection.join("\n\n")
    );
  }

  if (toolSection.length > 0) {
    parts.push(
      "## AskPenn Tools\n" +
        "Interactive tools built into this application. Recommend the URL so the user can navigate there:\n\n" +
        toolSection.join("\n\n")
    );
  }

  return parts.join("\n\n");
}
