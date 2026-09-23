import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool19Input, Tool19Output } from "./types.js";

export class Tool19 extends Tool<Tool19Input, Tool19Output> {
  readonly manifest: ToolManifest = {
    id: "19",
    title: "Compass",
    description:
      "Compass MVP backend for ingesting Penn/Wharton ICS events and serving a read-only events API.",
    image: "/tools/19/icon.png",
    contributors: ["Pak Kanjanakosit", "Iris Liu"],
    mentor: "Manas Sharma",
    version: "0.0.1",
    inceptionDate: "2026-03-31",
    latestReleaseDate: "2026-03-31",
  };

  async execute(
    input: Tool19Input,
    context: ToolContext
  ): Promise<Tool19Output> {
    const llmResponse = await context.llm.complete({
      messages: [{ role: "user", content: input.prompt }],
    });

    return {
      assistantMessage: llmResponse.content,
      telemetry: {
        durationMs: 0,
        tokensUsed: llmResponse.usage.totalTokens,
      },
    };
  }
}
