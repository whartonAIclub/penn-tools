import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool7Input, Tool7Output } from "./types.js";

export class Tool7 extends Tool<Tool7Input, Tool7Output> {
  readonly manifest: ToolManifest = {
    id: "7",
    title: "Resume Customizer",
    description: "AI-powered tool that generates tailored resumes and cover letters from a student's full professional knowledge base",
    image: "/tools/7/icon.png",
    contributors: ["Vismay Churiwala", "Nicole Goon", "Hongyu Mao", "Samir Patki"],
    mentor: "Sanjana Wadhwa",
    version: "0.0.1",
    inceptionDate: "2026-03-19",
    latestReleaseDate: "2026-03-19",
  };

  async execute(
    input: Tool7Input,
    context: ToolContext
  ): Promise<Tool7Output> {
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
