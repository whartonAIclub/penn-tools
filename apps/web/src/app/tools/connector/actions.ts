"use server";

// Saving the signed-in student's sign-up. Their id and email always come from
// their Penn sign-in, never from the form.

import { toolSql } from "@penntools/platform/db";
import { checkSignup, saveSignup as storeSignup } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveSignup(input: unknown): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in with the button at the top right to save your answers." };
  if (!user.email) return { ok: false, error: "Your sign-in has no email address. Log out and sign in again." };

  const checked = checkSignup(input);
  if (!checked.ok) return checked;

  const sql = toolSql("connector");
  if (!sql) return { ok: false, error: "Connector's database isn't set up, so your answers can't be saved." };
  try {
    await storeSignup(sql, user.id, user.email, checked.input);
    return { ok: true };
  } catch (error) {
    // Most likely Connector's database section doesn't exist yet on this machine.
    console.error("Connector: saving a sign-up failed", error);
    return { ok: false, error: "Your answers couldn't be saved. Try again in a moment." };
  }
}
