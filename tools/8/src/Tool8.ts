import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import {
  CAREER_CANVAS_SYSTEM_PROMPT,
  buildUserMessageForCareerCanvas,
} from "./careerPrompt.js";
import type { Tool8Input, Tool8Output } from "./types.js";

export class Tool8 extends Tool<Tool8Input, Tool8Output> {
  readonly manifest: ToolManifest = {
    id: "8",
    title: "Career Canvas",
    description:
      "An AI Powered Course, Major and Career Planner which identifies interests and skill gaps and builds a course roadmap for students",
    image: "Default",
    contributors: [
      "Ritika Agarwal",
      "Dee Xie",
      "Parmvir Chahal",
      "Malvika Sinha",
    ],
    mentor: "Itay Zitvar",
    version: "0.1.0",
    inceptionDate: "2026-02-25",
    latestReleaseDate: "2026-03-20",
  };

  async execute(
    input: Tool8Input,
    context: ToolContext
  ): Promise<Tool8Output> {
    const userMessage = buildUserMessageForCareerCanvas(input);
    if (!userMessage.trim()) {
      return {
        assistantMessage:
          "Please provide a target role, resume or experience summary, academic background, or a freeform question so I can tailor a plan.",
        telemetry: { durationMs: 0 },
      };
    }

    const start = Date.now();
    const llmResponse = await context.llm.complete({
      systemPrompt: CAREER_CANVAS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    return {
      assistantMessage: llmResponse.content,
      telemetry: {
        durationMs: Date.now() - start,
        tokensUsed: llmResponse.usage.totalTokens,
      },
    };
  }
}
