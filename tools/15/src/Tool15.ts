import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool15Input, Tool15Output } from "./types.js";

export class Tool15 extends Tool<Tool15Input, Tool15Output> {
  readonly manifest: ToolManifest = {
    id: "15",
    title: "PrepSignal",
    description: "AI-powered case prep intelligence layer that uses pattern recognition to consolidate progress and generate practice recommendations",
    image: "/tools/15/icon.png",
    contributors: ["Ryan Sheehan", "Zoya Ali", "Abhishek Jonnavittula"],
    mentor: "Sanjana",
    version: "0.1.0",
    inceptionDate: "2026-03-18",
    latestReleaseDate: "2026-03-23",
  };

  async execute(
    input: Tool15Input,
    context: ToolContext
  ): Promise<Tool15Output> {
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
