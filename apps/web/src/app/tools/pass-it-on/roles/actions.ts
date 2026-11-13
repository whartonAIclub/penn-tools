"use server";

// Server actions for the Roles tab. Each checks the signed-in user and the
// browser's input, and returns problems as data, like ../actions.ts.

import { MAX_FIELD_LENGTH, ROLE_SLOTS, addMember, databaseProblem, databaseProblemMessage, renameMember, setEventRole, setMemberActive, setRoleDefault, syncMembers, type RoleSlot } from "@penntools/tool-pass-it-on";
import { getCurrentUser } from "@/lib/auth";
import { db } from "../db";
import type { ActionResult } from "../actions";

const fail = (message: string): ActionResult<never> => ({ ok: false, message });
const signedOut = fail("Sign in with the button at the top right to use Pass It On.");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RangeError) return fail(error.message);
    const problem = databaseProblem(error);
    if (problem) return fail(databaseProblemMessage(problem));
    throw error;
  }
}

const isSlot = (role: unknown): role is RoleSlot => typeof role === "string" && (ROLE_SLOTS as readonly string[]).includes(role);
const MAX_ALTERNATES = 10;
const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Names who holds `role` on an event. A blank person removes the holder. */
export async function setEventRoleAction(eventId: string, role: string, person: string): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (typeof eventId !== "string" || eventId === "") return fail("That event no longer exists.");
  if (!isSlot(role)) return fail("Unknown role.");
  return run(async () => {
    const name = clean(person);
    if (name.length > MAX_FIELD_LENGTH) return fail(`Keep the name to at most ${MAX_FIELD_LENGTH} characters.`);
    if (!(await setEventRole(db(), eventId, role, name === "" ? null : name))) return fail("That event no longer exists.");
    await syncMembers(db());
    return { ok: true, data: null };
  });
}

/** Sets a club default: its person (blank for none) and comma-separated alternates. */
export async function setRoleDefaultAction(role: string, person: string, alternates: string): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!isSlot(role)) return fail("Unknown role.");
  return run(async () => {
    const name = clean(person);
    const others = clean(alternates)
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n !== "");
    if (name.length > MAX_FIELD_LENGTH || others.some((n) => n.length > MAX_FIELD_LENGTH)) return fail(`Keep each name to at most ${MAX_FIELD_LENGTH} characters.`);
    if (others.length > MAX_ALTERNATES) return fail(`Keep alternates to at most ${MAX_ALTERNATES} names.`);
    await setRoleDefault(db(), role, name === "" ? null : name, others);
    await syncMembers(db());
    return { ok: true, data: null };
  });
}

const personId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

/** Adds someone to the people list (or shows them again if they were hidden). */
export async function addPersonAction(name: string): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  return run(async () => {
    const id = await addMember(db(), clean(name));
    await setMemberActive(db(), id, true);
    return { ok: true, data: null };
  });
}

/** Renames someone everywhere their exact name is used; onto an existing name, the two are merged. */
export async function renamePersonAction(id: number, name: string): Promise<ActionResult<{ merged: boolean }>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!personId(id)) return fail("That person is no longer on the list.");
  return run(async () => {
    const result = await renameMember(db(), id, clean(name));
    return result ? { ok: true, data: { merged: result.merged } } : fail("That person is no longer on the list.");
  });
}

/** Hides someone from every drop-down (they keep any roles and tasks they already have), or shows them again. */
export async function setPersonHiddenAction(id: number, hidden: boolean): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  if (!personId(id) || typeof hidden !== "boolean") return fail("That person is no longer on the list.");
  return run(async () => ((await setMemberActive(db(), id, !hidden)) ? { ok: true, data: null } : fail("That person is no longer on the list.")));
}
