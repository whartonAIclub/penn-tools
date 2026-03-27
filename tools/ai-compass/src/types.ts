import type { ToolOutput } from "@penntools/core/tools";

export interface AiCompassInput {
  useCase: string;
}

export interface ModelRecommendation {
  model_id: string;
  rank: number;
  rank_label: string;
  capability_fit: "High" | "Medium" | "Low";
  reasoning: string;
  estimated_cost_example: string;
  tradeoffs: string;
}

export interface AiCompassOutput extends ToolOutput {
  recommendations: ModelRecommendation[];
}
