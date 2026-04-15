import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { PlatformPlaygroundInput, PlatformPlaygroundOutput } from "./types.js";

export class PlatformPlaygroundTool extends Tool<PlatformPlaygroundInput, PlatformPlaygroundOutput> {
  readonly manifest: ToolManifest = {
    id: "platform-playground",
    title: "Platform Playground",
    description: "To test Platform APIs",
    image: "/tools/platform-playground/icon.png",
    contributors: ["Ananya Chandra", "Ritika Agarwal", "Raven Kao"],
    mentor: "Ananya Chandra",
    version: "0.0.1",
    inceptionDate: "2026-03-14",
    latestReleaseDate: "2026-03-14",
  };

  async execute(
    input: PlatformPlaygroundInput,
    context: ToolContext
  ): Promise<PlatformPlaygroundOutput> {
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
