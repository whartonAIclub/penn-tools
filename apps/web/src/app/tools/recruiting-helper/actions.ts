"use server";

// Recruiting Helper's server actions for the profile, the list and outreach
// drafts. Scoring and résumés go through score/route.ts and resume/route.ts
// instead, since their files are over the 1 MB that Next.js allows a server action.

import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  checkOutreach,
  checkProfile,
  draftOutreach,
  getContact,
  getProfile,
  listItems,
  removeItem,
  rescoreItems,
  saveOutreach,
  saveProfile,
  type OutreachDraft,
  type RecruitingProfile,
  type SavedItem,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; message: string; kind?: string };

function db() {
  const sql = toolSql("recruitinghelper");
  if (!sql) throw new Error("Recruiting Helper's database is not configured (check DATABASE_URL).");
  return sql;
}

const signedOut = { ok: false, message: "Sign in with the button at the top right first." } as const;

/** Saves the profile and re-scores the list against it; returns the re-scored list. */
export async function saveMyProfile(profile: RecruitingProfile): Promise<ActionResult<SavedItem[]>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const problem = checkProfile(profile);
  if (problem) return { ok: false, message: problem };
  const sql = db();
  await saveProfile(sql, user.id, profile);
  await rescoreItems(sql, user.id, profile);
  return { ok: true, data: await listItems(sql, user.id) };
}

export async function removeMyItem(itemId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof itemId !== "string" || !(await removeItem(db(), user.id, itemId))) {
    return { ok: false, message: "That item was already removed." };
  }
  return { ok: true };
}

/** Drafts a cold outreach email to one of the user's people, and saves it on them. */
export async function draftMyOutreach(provider: AIProvider, itemId: string): Promise<ActionResult<OutreachDraft>> {
  const user = await getCurrentUser();
  const ai = await getAI();
  if (!user || !ai) return signedOut;
  if (!AI_PROVIDERS.includes(provider)) return { ok: false, message: "Pick an AI provider." };
  const sql = db();
  const [contact, profile] = await Promise.all([getContact(sql, user.id, String(itemId)), getProfile(sql, user.id)]);
  if (!contact) return { ok: false, message: "That person isn't on your list anymore." };
  if (!profile) return { ok: false, message: "Save your profile first." };
  try {
    const draft = await draftOutreach(ai, provider, profile, contact);
    await saveOutreach(sql, user.id, contact.id, draft);
    return { ok: true, data: draft };
  } catch (error) {
    if (isAIError(error)) return { ok: false, message: error.message, kind: error.kind };
    throw error;
  }
}

/** Saves the student's edits to an outreach draft. */
export async function saveMyOutreach(itemId: string, draft: OutreachDraft): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const problem = checkOutreach(draft);
  if (problem) return { ok: false, message: problem };
  if (!(await saveOutreach(db(), user.id, String(itemId), { subject: draft.subject, body: draft.body }))) {
    return { ok: false, message: "That person isn't on your list anymore." };
  }
  return { ok: true };
}
