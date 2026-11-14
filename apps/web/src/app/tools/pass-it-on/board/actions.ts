"use server";

// Server actions for the board, the template tab and an event's checklist.
// Each checks the signed-in user and the browser's input, and returns problems
// as data, like ../actions.ts.

import {
  createTodo,
  databaseProblem,
  databaseProblemMessage,
  deleteTask,
  generateEventChecklist,
  revertTemplate,
  setTemplateIssueStatus,
  syncMembers,
  updateTask,
  type TaskStatus,
} from "@penntools/tool-pass-it-on";
import { getCurrentUser } from "@/lib/auth";
import { db } from "../db";
import type { ActionResult } from "../actions";

const fail = (message: string): ActionResult<never> => ({ ok: false, message });
const signedOut = fail("Sign in with the button at the top right to use Pass It On.");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    // The tool's own checks (a blank title, a bad date) throw RangeError with a message meant for people.
    if (error instanceof RangeError) return fail(error.message);
    const problem = databaseProblem(error);
    if (problem) return fail(databaseProblemMessage(problem));
    throw error;
  }
}

const wholeNumber = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** What the board can change on a task. A blank owner means Unassigned; a blank waiting-on clears it. */
export interface TaskChange {
  status?: TaskStatus;
  owner?: string;
  waitingOn?: string;
  notes?: string;
}

export async function updateTaskAction(id: number, change: TaskChange): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!wholeNumber(id) || typeof change !== "object" || change === null) return fail("That task no longer exists.");
  return run(async () => {
    const update: Parameters<typeof updateTask>[2] = {};
    if (change.status !== undefined) update.status = change.status;
    if (change.owner !== undefined) update.owner = text(change.owner);
    if (change.waitingOn !== undefined) update.waitingOn = text(change.waitingOn);
    if (change.notes !== undefined) update.notes = text(change.notes);
    if (!(await updateTask(db(), id, update))) return fail("That task no longer exists.");
    if (update.owner) await syncMembers(db());
    return { ok: true, data: null };
  });
}

/** Adds a to-do by hand: on an event (`eventId` + `offsetDays` from its date) or ongoing (`dueDate`, or none). */
export async function addTodoAction(input: {
  title: string;
  owner: string;
  eventId: string;
  offsetDays: string;
  dueDate: string;
}): Promise<ActionResult<{ id: number }>> {
  if (!(await getCurrentUser())) return signedOut;
  if (typeof input !== "object" || input === null) return fail("Fill in the to-do.");
  const eventId = text(input.eventId);
  const offsetText = text(input.offsetDays);
  const offset = offsetText === null ? undefined : Number(offsetText);
  if (offset !== undefined && !Number.isInteger(offset)) return fail("Days from the event must be a whole number, like -3 or 5.");
  return run(async () => {
    const id = await createTodo(db(), {
      title: String(input.title ?? ""),
      ...(text(input.owner) && { owner: text(input.owner)! }),
      ...(eventId ? { eventId, ...(offset !== undefined && { offsetDays: offset }) } : text(input.dueDate) && { dueDate: text(input.dueDate)! }),
    });
    await syncMembers(db());
    return { ok: true, data: { id } };
  });
}

export async function deleteTaskAction(id: number): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!wholeNumber(id)) return fail("That task no longer exists.");
  return run(async () => ((await deleteTask(db(), id)) ? { ok: true, data: null } : fail("That task no longer exists.")));
}

/** Gives an event its checklist, or adds what's new (a partner club, a module). Returns how many tasks were added. */
export async function generateChecklistAction(eventId: string, moduleKeys: string[]): Promise<ActionResult<{ created: number }>> {
  if (!(await getCurrentUser())) return signedOut;
  if (typeof eventId !== "string" || !Array.isArray(moduleKeys)) return fail("That event no longer exists.");
  return run(async () => {
    const result = await generateEventChecklist(db(), eventId, { moduleKeys: moduleKeys.map(String) });
    if (!result) return fail("That event no longer exists.");
    await syncMembers(db());
    return { ok: true, data: { created: result.created } };
  });
}

export async function revertTemplateAction(versionId: number): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!wholeNumber(versionId)) return fail("That version no longer exists.");
  return run(async () => ((await revertTemplate(db(), versionId)) === null ? fail("That version no longer exists.") : { ok: true, data: null }));
}

export async function setIssueStatusAction(issueId: number, status: "open" | "resolved"): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!wholeNumber(issueId)) return fail("That issue no longer exists.");
  return run(async () => ((await setTemplateIssueStatus(db(), issueId, status)) ? { ok: true, data: null } : fail("That issue no longer exists.")));
}
