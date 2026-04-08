import type { ToolDataRepository } from "@penntools/core/repositories";
import type { UserId } from "@penntools/core/types";
import type { PennPlannerTask } from "./types";

export const PENN_PLANNER_TOOL_ID = "penn-planner";
const STATE_KEY = "planner-state";

interface PlannerState {
  tasks: PennPlannerTask[];
}

function normalizeTask(input: unknown): PennPlannerTask | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  if (typeof obj.id !== "string") return null;
  if (typeof obj.title !== "string") return null;
  if (typeof obj.source !== "string") return null;
  if (typeof obj.type !== "string") return null;
  if (typeof obj.dueDate !== "string") return null;
  if (typeof obj.status !== "string") return null;
  if (typeof obj.createdAt !== "string") return null;
  if (typeof obj.updatedAt !== "string") return null;

  return {
    id: obj.id,
    title: obj.title,
    description: typeof obj.description === "string" ? obj.description : null,
    source: obj.source as PennPlannerTask["source"],
    type: obj.type,
    dueDate: obj.dueDate,
    estimatedMinutes:
      typeof obj.estimatedMinutes === "number" ? obj.estimatedMinutes : null,
    priority: typeof obj.priority === "number" ? obj.priority : 0,
    priorityScore: typeof obj.priorityScore === "number" ? obj.priorityScore : 0,
    status: obj.status as PennPlannerTask["status"],
    course: typeof obj.course === "string" ? obj.course : null,
    company: typeof obj.company === "string" ? obj.company : null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

export async function getPlannerTasks(
  toolData: ToolDataRepository,
  userId: UserId
): Promise<PennPlannerTask[]> {
  const record = await toolData.get(userId, PENN_PLANNER_TOOL_ID, STATE_KEY);
  if (!record) return [];

  const maybeTasks = (record.jsonValue as PlannerState)?.tasks;
  if (!Array.isArray(maybeTasks)) return [];

  return maybeTasks.map(normalizeTask).filter((t): t is PennPlannerTask => t !== null);
}

export async function savePlannerTasks(
  toolData: ToolDataRepository,
  userId: UserId,
  tasks: PennPlannerTask[]
): Promise<void> {
  await toolData.upsert({
    userId,
    toolId: PENN_PLANNER_TOOL_ID,
    key: STATE_KEY,
    jsonValue: { tasks },
  });
}
