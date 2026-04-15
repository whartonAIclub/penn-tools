import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool5Input, Tool5Output } from "./types.js";

export class Tool5 extends Tool<Tool5Input, Tool5Output> {
  readonly manifest: ToolManifest = {
    id: "5",
    title: "Startup Matcher",
    description: "A tool matching student contributers to startup founders within a university ecosystem.",
    image: "/tools/5/icon.png",
    contributors: ["Anoushka Menon", "Mo Ayodele", "Camryn Grussmark"],
    version: "0.1.0",
    inceptionDate: "2026-04-15",
    latestReleaseDate: "2026-04-15",
  };

  async execute(
    input: Tool5Input,
    context: ToolContext
  ): Promise<Tool5Output> {
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
