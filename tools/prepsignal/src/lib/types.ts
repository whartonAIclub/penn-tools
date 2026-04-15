export type Dimension =
  | "structuring"
  | "quantitative"
  | "creativity"
  | "synthesis"
  | "communication"
  | "business_judgment";

export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "structuring", label: "Structuring" },
  { key: "quantitative", label: "Quantitative" },
  { key: "creativity", label: "Creativity" },
  { key: "synthesis", label: "Synthesis" },
  { key: "communication", label: "Communication" },
  { key: "business_judgment", label: "Biz Judgment" },
];

export interface DimensionScore {
  score: number; // 1–5
  quote: string; // verbatim excerpt from the session
  rationale: string; // one sentence explaining the score
}

export interface SessionResult {
  scores: Record<Dimension, DimensionScore>;
  priority: {
    dimension: Dimension;
    label: string;
    advice: string;
  };
}
