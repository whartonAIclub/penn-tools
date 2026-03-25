import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool18Input, Tool18Output } from "./types.js";

export class Tool18 extends Tool<Tool18Input, Tool18Output> {
  readonly manifest: ToolManifest = {
    id: "18",
    title: "Climate Scribe",
    description: "ClimateScribe is an AI-powered copilot that helps students plan low-carbon events and trips by analyzing itineraries, receipts, and catering menus to estimate carbon footprints and suggest greener alternatives.",
    image: "/tools/18/icon.png",
    contributors: ["Karthick Ravikumar", "Anvee Naik", "Sade Bamimore", "Charu Shah"],
    mentor: "Nicole Lin",
    version: "0.0.1",
    inceptionDate: "2026-03-23",
    latestReleaseDate: "2026-03-23",
  };

  async execute(
    input: Tool18Input,
    context: ToolContext
  ): Promise<Tool18Output> {
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
