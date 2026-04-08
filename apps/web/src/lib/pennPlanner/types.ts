export type TaskSource = "canvas" | "careerpath" | "manual";

export interface PennPlannerTask {
  id: string;
  title: string;
  description?: string | null;
  source: TaskSource;
  type: string;
  dueDate: string;
  estimatedMinutes?: number | null;
  priority: number;
  priorityScore: number;
  status: "pending" | "in_progress" | "completed";
  course?: string | null;
  company?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrioritizedTask extends PennPlannerTask {
  daysUntilDue: number;
  urgencyLabel: string;
  recommendedWorkMinutes: number;
  priorityReason: string;
}

export interface ExternalTask {
  externalId: string;
  title: string;
  description?: string;
  source: "canvas" | "careerpath";
  type: string;
  dueDate: string;
  course?: string;
  company?: string;
  estimatedMinutes?: number;
}
