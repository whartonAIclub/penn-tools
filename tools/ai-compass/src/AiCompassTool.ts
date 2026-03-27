import { Tool } from "@penntools/core/tools";
import type { ToolManifest, ToolContext } from "@penntools/core/tools";
import type { AiCompassInput, AiCompassOutput, ModelRecommendation } from "./types.js";

const SYSTEM_PROMPT = `You are an AI model recommendation expert. Given a user's use case, recommend the top 3 AI models ranked by fit.

Ranking criteria (in priority order):
1. Capability fit — does the model's strengths match the use case?
2. Cost-to-capability ratio — cheapest model that meets the capability bar
3. Context window fit — does it fit the user's data volume?

Key models to consider (current as of early 2026):
- claude-sonnet-4-6: Best balance of intelligence and speed. $3/1M input, $15/1M output. 1M context. Excellent reasoning, coding, summarization.
- claude-haiku-4-5: Fastest Claude model. $1/1M input, $5/1M output. 200K context. Great for simple tasks, high volume, low latency.
- claude-opus-4-6: Most capable Claude model. $5/1M input, $25/1M output. 1M context. Best for complex reasoning, agentic workflows.
- gpt-4o: OpenAI's flagship. $2.50/1M input, $10/1M output. 128K context. Strong vision, coding, and tool use.
- gpt-4o-mini: Lightweight GPT-4o. $0.15/1M input, $0.60/1M output. 128K context. Great for classification and simple completions.
- o3: OpenAI reasoning model. $10/1M input, $40/1M output. 200K context. Best for math, science, deep reasoning.
- gemini-2.0-flash: Google's fast model. ~$0.10/1M input. 1M context. Excellent for document-heavy workflows and multimodal.
- gemini-2.5-pro: Google's most capable. $1.25/1M input (under 200K). 1M context. Top benchmarks, strong coding.
- llama-3.3-70b: Meta open-source. Free to self-host. 128K context. Strong general capability, no API cost.
- mistral-large: Mistral's flagship. ~$2/1M input. 128K context. Good multilingual and coding.
- dall-e-3: OpenAI image generation. $0.04-0.08 per image. Best quality image generation.
- stable-diffusion-xl: Open-source image gen. Free to self-host. Fast, customizable.
- whisper: OpenAI speech-to-text. $0.006/min. Excellent accuracy, multilingual.
- text-embedding-3-large: OpenAI embeddings. $0.13/1M tokens. Best for RAG and semantic search.

Return ONLY a valid JSON array. No markdown. No preamble. Raw JSON only.

Schema: [{"model_id": string, "rank": number, "rank_label": string, "capability_fit": "High" | "Medium" | "Low", "reasoning": string, "estimated_cost_example": string, "tradeoffs": string}]

rank_label: short label like "Best Balance", "Most Capable", "Budget-Friendly".
capability_fit: "High" = excellent fit, "Medium" = adequate, "Low" = usable but not ideal.
estimated_cost_example: concrete cost estimate for the user's specific use case.
tradeoffs: honest tradeoffs for this model given the use case.`;

export class AiCompassTool extends Tool<AiCompassInput, AiCompassOutput> {
  readonly manifest: ToolManifest = {
    id: "ai-compass",
    title: "AI Compass",
    description:
      "Describe what you want to build — get ranked AI model recommendations with cost estimates and tradeoffs in seconds.",
    contributors: ["Akshit Kalra"],
    mentor: "Wharton AI & Analytics Club",
    version: "0.1.0",
    inceptionDate: "2026-03-27",
    latestReleaseDate: "2026-03-27",
  };

  async execute(
    input: AiCompassInput,
    context: ToolContext
  ): Promise<AiCompassOutput> {
    if (!input.useCase.trim()) {
      return {
        assistantMessage: "Please describe your use case to get recommendations.",
        recommendations: [],
      };
    }

    const llmResponse = await context.llm.complete({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input.useCase },
      ],
    });

    let recommendations: ModelRecommendation[] = [];

    try {
      const raw = llmResponse.content;
      const arrayMatch = raw.match(/\[[\s\S]*\]/);
      const cleaned = arrayMatch ? arrayMatch[0] : raw;
      recommendations = JSON.parse(cleaned) as ModelRecommendation[];
    } catch {
      return {
        assistantMessage:
          "Could not parse recommendations. Please try rephrasing your use case.",
        recommendations: [],
      };
    }

    const summary = recommendations
      .map(
        (r) =>
          `${r.rank}. **${r.model_id}** (${r.rank_label}) — ${r.reasoning}`
      )
      .join("\n");

    return {
      assistantMessage: `Here are the top AI model recommendations for your use case:\n\n${summary}`,
      recommendations,
      artifacts: recommendations.map((r) => ({
        kind: "json" as const,
        label: `${r.rank}. ${r.model_id} — ${r.rank_label}`,
        data: r,
      })),
    };
  }
}
