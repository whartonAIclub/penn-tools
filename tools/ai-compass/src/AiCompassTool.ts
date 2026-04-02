import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { AiCompassInput, AiCompassOutput } from "./types.js";

export class AiCompassTool extends Tool<AiCompassInput, AiCompassOutput> {
  readonly manifest: ToolManifest = {
    id: "ai-compass",
    title: "AI Compass",
    description: "Describe your AI use case, get ranked model recommendations with cost estimates and tradeoffs across 62 models from 29 providers.",
    image: "/tools/ai-compass/icon.png",
    contributors: ["Akshit Kalra"],
    mentor: "",
    version: "0.1.0",
    inceptionDate: "2026-03-27",
    latestReleaseDate: "2026-03-27",
  };

  async execute(
    _input: AiCompassInput,
    _context: ToolContext
  ): Promise<AiCompassOutput> {
    return {
      assistantMessage: "Use AI Compass at https://akshitkalra.com/aicompass — describe your use case and get ranked model recommendations in 30 seconds.",
      telemetry: { durationMs: 0, tokensUsed: 0 },
    };
  }
}
