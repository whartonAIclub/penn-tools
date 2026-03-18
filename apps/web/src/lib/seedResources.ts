// ─────────────────────────────────────────────────────────────────────────────
// seedResources
//
// Called once at server startup (fire-and-forget from container.ts).
// Embeds every entry in resources.json plus every registered tool and upserts
// them into the resource repository so they are available for RAG retrieval.
//
// Seeding is idempotent: existing rows are updated (embedding refreshed) on
// every cold start, so edits to resources.json take effect on the next deploy.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { toolRegistry } from "@penntools/core/tools";
import type { EmbeddingProvider } from "@penntools/core/embeddings";
import type { ResourceRepository } from "@penntools/core/resources";
import resourcesData from "../data/resources.json";

interface StaticResource {
  id: string;
  title: string;
  url: string;
  description: string;
  intent: string;
  semanticTags: string[];
}

function buildContent(r: StaticResource): string {
  return [r.title, r.description, r.intent, r.semanticTags.join(", ")].join(
    ". "
  );
}

export async function seedResources(
  embedding: EmbeddingProvider,
  repository: ResourceRepository,
  logger: { info: (m: string) => void; error: (m: string, e?: unknown) => void }
): Promise<void> {
  const entries: { id: string; title: string; url: string; content: string }[] =
    [];

  // Static resources from resources.json
  for (const r of resourcesData.resources as StaticResource[]) {
    entries.push({
      id: `static-${r.id}`,
      title: r.title,
      url: r.url,
      content: buildContent(r),
    });
  }

  // Registered AskPenn tools
  for (const m of toolRegistry.listManifests()) {
    entries.push({
      id: `tool-${m.id}`,
      title: m.title,
      url: `/tools/${m.id}`,
      content: [m.title, m.description].join(". "),
    });
  }

  let seeded = 0;
  for (const entry of entries) {
    try {
      const vec = await embedding.embed(entry.content);
      await repository.upsert({ ...entry, embedding: vec });
      seeded++;
    } catch (err) {
      logger.error(`[seedResources] failed to seed "${entry.id}"`, err);
    }
  }

  logger.info(`[seedResources] seeded ${seeded}/${entries.length} resources`);
}
