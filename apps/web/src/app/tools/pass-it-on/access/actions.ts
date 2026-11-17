"use server";

// Server actions for the Access tab: adding and removing board members. Any
// member can do both; the last member can't be removed.

import { databaseProblem, databaseProblemMessage, grantBoardAccess, revokeBoardAccess } from "@penntools/tool-pass-it-on";
import { boardMember } from "../access";
import { db } from "../db";
import type { ActionResult } from "../actions";

const fail = (message: string): ActionResult<never> => ({ ok: false, message });

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    // normalizeEmail throws RangeError with a message meant for people.
    if (error instanceof RangeError) return fail(error.message);
    const problem = databaseProblem(error);
    if (problem) return fail(databaseProblemMessage(problem));
    throw error;
  }
}

/** Gives a Penn email access; `added` is false when it already had it. */
export async function grantAccessAction(email: string): Promise<ActionResult<{ added: boolean }>> {
  const gate = await boardMember();
  if (!gate.ok) return gate;
  if (typeof email !== "string") return fail("Enter an email address.");
  return run(async () => ({ ok: true, data: { added: await grantBoardAccess(db(), email, gate.user.email) } }));
}

export async function revokeAccessAction(email: string): Promise<ActionResult<null>> {
  const gate = await boardMember();
  if (!gate.ok) return gate;
  if (typeof email !== "string") return fail("That person no longer has access.");
  return run(async () => {
    switch (await revokeBoardAccess(db(), email)) {
      case "removed":
        return { ok: true, data: null };
      case "not_found":
        return fail("That person no longer has access.");
      case "last_member":
        return fail("You can't remove the last person: add someone else first.");
    }
  });
}
