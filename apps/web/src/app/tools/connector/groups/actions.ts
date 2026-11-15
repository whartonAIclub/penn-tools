"use server";

// After a match: saying whether you met, then asking to be matched again in
// the next round. Both act for the signed-in student only.

import { revalidatePath } from "next/cache";
import { toolSql } from "@penntools/platform/db";
import { checkIn, matchAgain, type RoundResult } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";

async function asStudent(act: (sql: NonNullable<ReturnType<typeof toolSql>>, userId: string) => Promise<RoundResult>) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in with the button at the top right first." } as const;
  const sql = toolSql("connector");
  if (!sql) return { ok: false, error: "Connector's database isn't set up." } as const;
  try {
    const result = await act(sql, user.id);
    revalidatePath("/tools/connector/groups");
    return result;
  } catch (error) {
    console.error("Connector: saving a round answer failed", error);
    return { ok: false, error: "That didn't save. Try again in a moment." } as const;
  }
}

export async function saveCheckIn(met: boolean): Promise<RoundResult> {
  if (typeof met !== "boolean") return { ok: false, error: "Choose yes or not yet." };
  return asStudent((sql, userId) => checkIn(sql, userId, met));
}

export async function joinNextRound(): Promise<RoundResult> {
  return asStudent((sql, userId) => matchAgain(sql, userId));
}
