import { Task } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Type weights — higher = more urgent by nature
const TYPE_WEIGHTS: Record<string, number> = {
  exam: 10,
  interview: 9,
  application: 8,
  case_prep: 7,
  quiz: 6,
  assignment: 5,
  networking: 3,
  other: 2,
};

function getDaysUntilDue(dueDate: Date): number {
  const now = new Date();
  const due = new Date(dueDate);
  return (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}

// Urgency score: exponential decay — tasks due sooner score higher
function urgencyScore(daysUntil: number): number {
  if (daysUntil <= 0) return 100;
  if (daysUntil <= 1) return 90;
  if (daysUntil <= 2) return 75;
  if (daysUntil <= 3) return 60;
  if (daysUntil <= 5) return 40;
  if (daysUntil <= 7) return 25;
  return 10;
}

export interface PrioritizedTask extends Task {
  daysUntilDue: number;
  urgencyLabel: string;
  recommendedWorkMinutes: number;
  priorityReason: string;
}

export function prioritizeTasks(tasks: Task[]): PrioritizedTask[] {
  const scored = tasks
    .filter((t) => t.status !== "completed")
    .map((task) => {
      const daysUntil = getDaysUntilDue(task.dueDate);
      const typeWeight = TYPE_WEIGHTS[task.type] ?? 5;
      const urgency = urgencyScore(daysUntil);

      // Combined score: 60% urgency, 40% type weight (normalized 0-10)
      const score = urgency * 0.6 + (typeWeight / 10) * 100 * 0.4;

      const urgencyLabel =
        daysUntil <= 0
          ? "Overdue"
          : daysUntil <= 1
          ? "Due today"
          : daysUntil <= 2
          ? "Due tomorrow"
          : daysUntil <= 3
          ? "Due in 2–3 days"
          : daysUntil <= 7
          ? `Due in ${Math.ceil(daysUntil)} days`
          : "Upcoming";

      // Recommend 75% of estimated time (or defaults by type)
      const baseEstimate =
        task.estimatedMinutes ?? defaultEstimate(task.type);
      const recommendedWorkMinutes = Math.round(baseEstimate * 0.75);

      const priorityReason = buildReason(task, daysUntil, typeWeight);

      return {
        ...task,
        priorityScore: score,
        daysUntilDue: daysUntil,
        urgencyLabel,
        recommendedWorkMinutes,
        priorityReason,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((task, index) => ({ ...task, priority: index + 1 }));

  return scored;
}

function defaultEstimate(type: string): number {
  const defaults: Record<string, number> = {
    exam: 180,
    interview: 60,
    application: 90,
    case_prep: 75,
    quiz: 30,
    assignment: 90,
    networking: 30,
    other: 45,
  };
  return defaults[type] ?? 60;
}

function buildReason(task: Task, daysUntil: number, typeWeight: number): string {
  const parts: string[] = [];

  if (daysUntil <= 1) parts.push("due very soon");
  else if (daysUntil <= 3) parts.push("due within 3 days");

  if (typeWeight >= 9) parts.push("high-stakes commitment");
  else if (typeWeight >= 7) parts.push("recruiting-critical");
  else if (typeWeight >= 5) parts.push("academic obligation");

  if (task.source === "careerpath") parts.push("recruiting deadline");
  if (task.source === "canvas") parts.push("coursework deadline");

  return parts.join(", ");
}

// Detect "deadline stacking" — 3+ tasks due within 48 hours
export function detectDeadlineStack(tasks: Task[]): {
  isStacked: boolean;
  stackedTasks: Task[];
  message: string;
} {
  const pending = tasks.filter((t) => t.status !== "completed");
  const stackedTasks = pending.filter((t) => getDaysUntilDue(t.dueDate) <= 2);

  if (stackedTasks.length >= 3) {
    return {
      isStacked: true,
      stackedTasks,
      message: `⚠️ ${stackedTasks.length} deadlines in the next 48 hours — review your priorities now.`,
    };
  }

  return { isStacked: false, stackedTasks, message: "" };
}

// Use Claude to generate a smart daily briefing summary
export async function generateDailySummary(tasks: PrioritizedTask[]): Promise<string> {
  const pending = tasks.filter((t) => t.status !== "completed").slice(0, 8);

  if (pending.length === 0) {
    return "You're all caught up! No pending tasks.";
  }

  const taskList = pending
    .map(
      (t, i) =>
        `${i + 1}. [${t.source.toUpperCase()}] ${t.title} — ${t.urgencyLabel}, ~${t.recommendedWorkMinutes} min`
    )
    .join("\n");

  const prompt = `You are Penn Planner, an AI planning assistant for Wharton MBA students.

Here are the student's upcoming tasks ranked by priority:
${taskList}

Write a concise, encouraging daily briefing (2–3 sentences max) that:
1. Highlights the most urgent item
2. Notes if there's deadline stacking
3. Gives one actionable tip

Keep it warm but direct. No bullet points. No fluff.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type === "text") return content.text;
  return "Focus on your top priority first.";
}
