export type Dimension =
  | "clarifying_questions"
  | "structuring"
  | "pace_driving"
  | "quantitative"
  | "exhibits"
  | "brainstorming"
  | "recommendation"
  | "communication";

export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "clarifying_questions", label: "Clarifying Qs" },
  { key: "structuring", label: "Structuring" },
  { key: "pace_driving", label: "Pace & Drive" },
  { key: "quantitative", label: "Quant / Math" },
  { key: "exhibits", label: "Exhibits" },
  { key: "brainstorming", label: "Brainstorming" },
  { key: "recommendation", label: "Recommendation" },
  { key: "communication", label: "Communication" },
];

export interface DimensionScore {
  score: number; // 1–5
  quote: string; // verbatim excerpt from the session
  rationale: string; // one sentence explaining the score
  notApplicable?: boolean; // true when no evidence found in notes
}

export interface TopDrill {
  dimension: string;
  label: string;
  urgency: "critical" | "high" | "medium";
  avgScore: number;
  insight: string;
  drills: { title: string; description: string; duration: string }[];
}

export interface SkillBreakdown {
  dimension: string;
  label: string;
  avgScore: number;
  level: "weak" | "developing" | "strong";
  trend: "improving" | "declining" | "stable" | "n/a";
  gaps: string;
  drills: string[];
}

export interface DrillPlan {
  generatedAt: string;
  sessionCount: number;
  topDrills: TopDrill[];
  skillBreakdown: SkillBreakdown[];
  coverageGaps: {
    industries: string[];
    caseTypes: string[];
    recommendations: string[];
  };
  weeklyPlan: { label: string; activity: string; type: "drill" | "case" }[];
  trends: {
    improving: string[];
    declining: string[];
    stagnant: string[];
    summary: string;
  };
}

export interface SessionResult {
  scores: Record<Dimension, DimensionScore>;
  priority: {
    dimension: Dimension;
    label: string;
    advice: string;
  };
}
