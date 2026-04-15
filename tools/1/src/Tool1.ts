import { Tool } from "@penntools/core/tools";
import type { ToolManifest } from "@penntools/core/tools";
import type { ToolContext } from "@penntools/core/tools";
import type { Tool1Input, Tool1Output } from "./types.js";

const TRANSCRIPT_SYSTEM_PROMPT = `You are a transcript parser for University of Pennsylvania Wharton MBA transcripts.

Extract every completed course from the transcript text. A "completed course" has a letter grade assigned (A, A-, B+, B, B-, C+, C, P, etc.). Do NOT include courses that are in-progress, withdrawn (W), or incomplete (I).

Return ONLY a valid JSON array — no explanation, no markdown, no code fences. Just the raw JSON array.

Each object must follow this exact shape:
{
  "courseId": "FNCE6110",
  "title": "Corporate Finance",
  "credits": 1.0,
  "grade": "A",
  "term": "Fall 2024",
  "crossListedAs": []
}

Rules:
- courseId: Wharton course code (e.g. "FNCE6110"). Use null if unparseable.
- title: Course name as it appears on the transcript.
- credits: Numeric credit units (0.5 or 1.0 are typical). Use null if not shown.
- grade: Letter grade exactly as shown. Use null if not found.
- term: Semester and year (e.g. "Fall 2024"). Use null if not found.
- crossListedAs: Array of any cross-listed course codes shown on the transcript. Use [] if none.`;

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
      systemPrompt: TRANSCRIPT_SYSTEM_PROMPT,
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
