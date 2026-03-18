import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool1Input, Tool1Output } from "./types.js";

export class Tool1 extends Tool<Tool1Input, Tool1Output> {
  readonly manifest: ToolManifest = {
    id: "1",
    title: "CourseMatch Assist",
    description: "This tool is a one-stop-shop for making the most of CourseMatch: giving you your recommended schedule based on various inputs, and even exact utilities you should put into CourseMatch",
    image: "/tools/1/icon.png",
    contributors: ["Ishi Tripathi", "Sanjana Wadhwa", "Brendan Holleck", "Evens Esperance"],
    mentor: "Manas Sharma",
    version: "0.0.1",
    inceptionDate: "2026-03-18",
    latestReleaseDate: "2026-03-18",
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
