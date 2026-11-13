"use server";

// Releasing matches from the team page. Only the team may release; the
// groups are worked out at the moment of release and saved.

import { revalidatePath } from "next/cache";
import { toolSql } from "@penntools/platform/db";
import { releaseMatches } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { canRelease } from "./access";

export type ReleaseOutcome = { ok: true; groups: number; waitlist: number } | { ok: false; error: string };

export async function release(): Promise<ReleaseOutcome> {
  const user = await getCurrentUser();
  if (!canRelease(user)) return { ok: false, error: "Only the Connector team can release matches." };

  const sql = toolSql("connector");
  if (!sql) return { ok: false, error: "Connector's database isn't set up." };
  try {
    const result = await releaseMatches(sql, user.email ?? user.id);
    revalidatePath("/tools/connector/team");
    return { ok: true, groups: result.groups.length, waitlist: result.waitlist.length };
  } catch (error) {
    console.error("Connector: releasing matches failed", error);
    return { ok: false, error: "Matches couldn't be released. Try again in a moment." };
  }
}
