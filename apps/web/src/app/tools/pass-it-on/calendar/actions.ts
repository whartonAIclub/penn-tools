"use server";

// Server actions for the calendar approval screen. Each checks the signed-in
// user and returns problems as data, like ../actions.ts.

import {
  approveAllPending,
  approveProposal,
  checkPlannedEventInput,
  databaseProblem,
  databaseProblemMessage,
  deleteCalendarImport,
  parseVendorLines,
  restoreProposal,
  skipProposal,
  updateProposal,
} from "@penntools/tool-pass-it-on";
import { getCurrentUser } from "@/lib/auth";
import { db } from "../db";
import type { ActionResult, EventFormValues } from "../actions";

const fail = (message: string): ActionResult<never> => ({ ok: false, message });
const signedOut = fail("Sign in with the button at the top right to use Pass It On.");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return fail(databaseProblemMessage(problem));
    throw error;
  }
}

const proposalId = (id: unknown): number | null => (typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null);

export async function approveProposalAction(id: number): Promise<ActionResult<{ eventId: string }>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const pid = proposalId(id);
  if (pid === null) return fail("That proposal no longer exists.");
  return run(async () => {
    const result = await approveProposal(db(), pid, user.id);
    return result.ok ? { ok: true, data: { eventId: result.eventId } } : fail(result.message);
  });
}

export async function approveAllAction(importId: string): Promise<ActionResult<{ approved: number }>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return run(async () => ({ ok: true, data: { approved: await approveAllPending(db(), String(importId), user.id) } }));
}

export async function skipProposalAction(id: number): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  const pid = proposalId(id);
  return run(async () => (pid !== null && (await skipProposal(db(), pid)) ? { ok: true, data: null } : fail("That proposal can't be skipped.")));
}

export async function restoreProposalAction(id: number): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  const pid = proposalId(id);
  return run(async () => (pid !== null && (await restoreProposal(db(), pid)) ? { ok: true, data: null } : fail("That proposal can't be restored.")));
}

/** Saves edits to a proposal's event details before approval. */
export async function saveProposalAction(id: number, values: EventFormValues): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  const pid = proposalId(id);
  if (pid === null) return fail("That proposal no longer exists.");
  const checked = checkPlannedEventInput({ ...values, vendors: parseVendorLines(String(values?.vendors ?? "")) });
  if (!checked.ok) return fail(checked.message);
  return run(async () => ((await updateProposal(db(), pid, checked.value)) ? { ok: true, data: null } : fail("That proposal was already approved or no longer exists.")));
}

export async function deleteImportAction(importId: string): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  return run(async () => ((await deleteCalendarImport(db(), String(importId))) ? { ok: true, data: null } : fail("That import no longer exists.")));
}
