import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool17Input, Tool17Output } from "./types.js";

export class Tool17 extends Tool<Tool17Input, Tool17Output> {
  readonly manifest: ToolManifest = {
    id: "17",
    title: "PennXchange",
    description: "A buy/sell marketplace for Penn students",
    image: "/tools/17/icon.png",
    contributors: ["Johnny Kim", "Samragyee De", "Alex Goreing"],
    mentor: "Mahima Singh",
    version: "0.0.1",
    inceptionDate: "2026-03-19",
    latestReleaseDate: "2026-03-19",
  };

  async execute(
    input: Tool17Input,
    context: ToolContext
  ): Promise<Tool17Output> {
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
