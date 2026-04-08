import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { PennPlannerInput, PennPlannerOutput } from "./types.js";

export class PennPlannerTool extends Tool<PennPlannerInput, PennPlannerOutput> {
  readonly manifest: ToolManifest = {
    id: "penn-planner",
    title: "Penn Planner",
    description: "The planning tool centralizes a Wharton student's deadlines and commitments across academics and recruiting into a single prioritized to-do list.",
    image: "/tools/penn-planner/icon.png",
    contributors: ["Alec Roslin", "Nyla Thompson", "Travon Martin", "Nikunj Agrawal"],
    mentor: "Steven Adelberg",
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
