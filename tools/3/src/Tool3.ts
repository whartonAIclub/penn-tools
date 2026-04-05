import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool3Input, Tool3Output } from "./types.js";

export class Tool3 extends Tool<Tool3Input, Tool3Output> {
  readonly manifest: ToolManifest = {
    id: "3",
    title: "Penn Planner",
    description: "The planning tool centralizes a Wharton student's deadlines and commitments across academics and recruiting into a single prioritized to-do list.",
    image: "/tools/3/icon.png",
    contributors: ["Alec Roslin", "Nyla Thompson", "Travon Martin", "Nikunj Agrawal"],
    mentor: "Steven Adelberg",
    version: "0.0.1",
    inceptionDate: "2026-03-18",
    latestReleaseDate: "2026-03-18",
  };

  async execute(
    input: Tool3Input,
    context: ToolContext
  ): Promise<Tool3Output> {
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
