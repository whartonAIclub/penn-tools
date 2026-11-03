"use server";

// Recruiting Helper's server actions for the profile and the list. Scoring goes
// through score/route.ts instead, since screenshots are over the 1 MB that
// Next.js allows a server action.

import { toolSql } from "@penntools/platform/db";
import { checkProfile, removeItem, saveProfile, type RecruitingProfile } from "@penntools/tool-recruiting-helper";
import { getCurrentUser } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; message: string };

function db() {
  const sql = toolSql("recruitinghelper");
  if (!sql) throw new Error("Recruiting Helper's database is not configured (check DATABASE_URL).");
  return sql;
}

const signedOut: ActionResult = { ok: false, message: "Sign in with the button at the top right first." };

export async function saveMyProfile(profile: RecruitingProfile): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const problem = checkProfile(profile);
  if (problem) return { ok: false, message: problem };
  await saveProfile(db(), user.id, profile);
  return { ok: true };
}

export async function removeMyItem(itemId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof itemId !== "string" || !(await removeItem(db(), user.id, itemId))) {
    return { ok: false, message: "That item was already removed." };
  }
  return { ok: true };
}
