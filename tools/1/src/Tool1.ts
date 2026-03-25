import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool1Input, Tool1Output } from "./types.js";

export class Tool1 extends Tool<Tool1Input, Tool1Output> {
  readonly manifest: ToolManifest = {
    id: "1",
    title: "CourseMatch Assist",
    description: "CourseMatch Assist will curate a course list and recommended utilities for your next semester! Send it your priorities and transcript - and watch the magic happen as it reduces your stress",
    image: "/tools/1/icon.png",
    contributors: ["Ishi Tripathi", "Brendan Holleck", "Evens Esperance", "Sanjana Wadhwa"],
    mentor: "Manas Sharma",
    version: "0.0.1",
    inceptionDate: "2026-03-23",
    latestReleaseDate: "2026-03-23",
  };

  async execute(
    input: Tool1Input,
    context: ToolContext
  ): Promise<Tool1Output> {
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
