import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { PennPlannerInput, PennPlannerOutput } from "./types.js";

export class PennPlannerTool extends Tool<PennPlannerInput, PennPlannerOutput> {
  readonly manifest: ToolManifest = {
    id: "penn-planner",
    title: "Penn Planner",
    description: "AI-powered time-planning assistant that integrates with Canvas and your calendar to estimate effort and suggest study blocks.",
    image: "/tools/penn-planner/icon.png",
    contributors: ["Sam Lazarus", "Ana Akra", "Krishna Vadera", "Shreya Khetan"],
    mentor: "Alex Sulimanov",
    version: "0.1.0",
    inceptionDate: "2026-03-18",
    latestReleaseDate: "2026-03-18",
  };

  async execute(
    input: PennPlannerInput,
    context: ToolContext
  ): Promise<PennPlannerOutput> {
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
