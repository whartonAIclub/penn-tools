import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { PitchCoachInput, PitchCoachOutput } from "./types.js";

export class PitchCoachTool extends Tool<PitchCoachInput, PitchCoachOutput> {
  readonly manifest: ToolManifest = {
    id: "pitch-coach",
    title: "PitchCoach AI",
    description:
      "Practice behavioral interviews and networking pitches with AI-powered feedback on delivery, STAR framework adherence, and communication clarity.",
    image: "/tools/pitch-coach/icon.png",
    contributors: ["Tony Sui", "Hannah Gao", "Ariana Katsanis", "Chithira Mamallan"],
    mentor: "Wharton AI & Analytics Club",
    version: "0.1.0",
    inceptionDate: "2026-03-31",
    latestReleaseDate: "2026-03-31",
  };

  async execute(
    input: PitchCoachInput,
    context: ToolContext
  ): Promise<PitchCoachOutput> {
    const systemPrompt = `You are PitchCoach AI, an expert communication coach specializing in behavioral interview preparation and networking pitches for MBA students recruiting in technology.

Evaluate the user's response using the STAR framework (Situation, Task, Action, Result) and provide structured, actionable feedback. Be encouraging but specific about areas for improvement.

Always respond with a JSON object in this exact format:
{
  "star": {
    "situation": { "score": <1-10>, "present": <true|false>, "feedback": "<specific feedback>" },
    "task": { "score": <1-10>, "present": <true|false>, "feedback": "<specific feedback>" },
    "action": { "score": <1-10>, "present": <true|false>, "feedback": "<specific feedback>" },
    "result": { "score": <1-10>, "present": <true|false>, "feedback": "<specific feedback>" }
  },
  "content": {
    "clarity": { "score": <1-10>, "feedback": "<specific feedback>" },
    "specificity": { "score": <1-10>, "feedback": "<specific feedback>" },
    "relevance": { "score": <1-10>, "feedback": "<specific feedback>" },
    "impact": { "score": <1-10>, "feedback": "<specific feedback>" },
    "conciseness": { "score": <1-10>, "feedback": "<specific feedback>" }
  },
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "improvedTranscript": "<rewritten version of their response>",
  "overallScore": <1-10>,
  "summary": "<2-3 sentence overall summary>"
}`;

    const llmResponse = await context.llm.complete({
      messages: [{ role: "user", content: input.prompt }],
      systemPrompt,
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
