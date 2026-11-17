"use server";

// Recruiting Helper's server actions for the profile, the list, outreach
// drafts and follow-up chats. Scoring and résumés go through score/route.ts and
// resume/route.ts instead, since their files are over the 1 MB that Next.js
// allows a server action, and chat answers through chat/route.ts, which streams.

import { AI_PROVIDERS, isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  clearChat,
  getChat,
  type ChatMessage,
  checkEmail,
  checkSchools,
  saveEmail,
  saveSchools,
  checkInstruction,
  checkOutreach,
  checkProfile,
  draftOutreach,
  reviseOutreach,
  setOutreachStyle,
  getContact,
  getProfile,
  listItems,
  removeItem,
  rescoreItems,
  saveOutreach,
  saveProfile,
  type OutreachDraft,
  type RecruitingProfile,
  type SavedContact,
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
  const ai = await getAI("recruiting-helper");
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

/** How many drafts are written at the same time: quick for a long list, gentle on the user's rate limits. */
const DRAFTS_AT_ONCE = 4;

/**
 * Runs `write` for each person, DRAFTS_AT_ONCE at a time, stopping at the
 * first AI error (a missing key, no credit…), which it returns. Returns how
 * many succeeded.
 */
async function forEachPerson(
  people: SavedContact[],
  write: (contact: SavedContact) => Promise<void>,
): Promise<{ done: number; failure: { ok: false; message: string; kind?: string } | null }> {
  const queue = [...people];
  let done = 0;
  let failure: { ok: false; message: string; kind?: string } | null = null;
  // Any other error stops every worker too, and is thrown only once they've all
  // stopped, so nothing keeps writing (and spending credit) after it returns.
  let unexpected: { error: unknown } | null = null;
  async function worker() {
    for (let contact = queue.shift(); contact && !failure && !unexpected; contact = queue.shift()) {
      try {
        await write(contact);
        done++;
      } catch (error) {
        if (isAIError(error)) failure = { ok: false, message: error.message, kind: error.kind };
        else unexpected = { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DRAFTS_AT_ONCE, queue.length) }, worker));
  if (unexpected) throw (unexpected as { error: unknown }).error;
  return { done, failure };
}

/**
 * Writes an outreach draft for every person on the user's list who has none
 * (people scored before drafts were automatic, or whose draft failed). Returns
 * the updated list and how many were written.
 */
export async function draftMissingOutreach(
  provider: AIProvider,
): Promise<ActionResult<{ items: SavedItem[]; drafted: number; total: number }>> {
  const user = await getCurrentUser();
  const ai = await getAI("recruiting-helper");
  if (!user || !ai) return signedOut;
  if (!AI_PROVIDERS.includes(provider)) return { ok: false, message: "Pick an AI provider." };
  const sql = db();
  const profile = await getProfile(sql, user.id);
  if (!profile) return { ok: false, message: "Save your profile first." };
  const missing = (await listItems(sql, user.id)).filter(
    (item): item is SavedContact => item.kind === "contact" && !item.outreach,
  );

  const { done, failure } = await forEachPerson(missing, async (contact) => {
    await saveOutreach(sql, user.id, contact.id, await draftOutreach(ai, provider, profile, contact));
  });
  if (failure && done === 0) return failure;
  return { ok: true, data: { items: await listItems(sql, user.id), drafted: done, total: missing.length } };
}

/**
 * Rewrites every outreach draft on the user's list to follow one instruction
 * (e.g. "make them shorter"), and if `remember` is set, has new drafts follow
 * it too. Returns the updated list and how many drafts were rewritten. Stops at
 * the first AI error, such as a missing key or no credit, keeping drafts done so far.
 */
export async function reviseAllMyOutreach(
  provider: AIProvider,
  instruction: string,
  remember: boolean,
): Promise<ActionResult<{ items: SavedItem[]; revised: number; total: number }>> {
  const user = await getCurrentUser();
  const ai = await getAI("recruiting-helper");
  if (!user || !ai) return signedOut;
  if (!AI_PROVIDERS.includes(provider)) return { ok: false, message: "Pick an AI provider." };
  const problem = checkInstruction(instruction);
  if (problem) return { ok: false, message: problem };

  const sql = db();
  const profile = await getProfile(sql, user.id);
  if (!profile) return { ok: false, message: "Save your profile first." };
  const withDrafts = (await listItems(sql, user.id)).filter(
    (item): item is SavedContact => item.kind === "contact" && !!item.outreach,
  );

  const { done: revised, failure } = await forEachPerson(withDrafts, async (contact) => {
    const draft = await reviseOutreach(ai, provider, profile, contact, contact.outreach!, instruction.trim());
    await saveOutreach(sql, user.id, contact.id, draft);
  });

  // Remembered only once it worked, so a failed run doesn't change future drafts.
  if (remember && !failure) await setOutreachStyle(sql, user.id, instruction);
  if (failure && revised === 0) return failure;
  return { ok: true, data: { items: await listItems(sql, user.id), revised, total: withDrafts.length } };
}

/** Stops new drafts following a remembered instruction. */
export async function clearMyOutreachStyle(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  await setOutreachStyle(db(), user.id, null);
  return { ok: true };
}

/** Sets a person's schools, typed in by the student, and returns them re-scored. */
export async function saveMySchools(itemId: string, schools: string[]): Promise<ActionResult<SavedContact>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkSchools(schools);
  if ("problem" in checked) return { ok: false, message: checked.problem };
  const sql = db();
  const profile = await getProfile(sql, user.id);
  if (!profile) return { ok: false, message: "Save your profile first." };
  const updated = await saveSchools(sql, user.id, String(itemId), checked.schools, profile);
  return updated ? { ok: true, data: updated } : { ok: false, message: "That person isn't on your list anymore." };
}

/** Sets (or, when blank, clears) a person's email address; returns it as saved. */
export async function saveMyEmail(itemId: string, email: string): Promise<ActionResult<string | null>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkEmail(email);
  if ("problem" in checked) return { ok: false, message: checked.problem };
  if (!(await saveEmail(db(), user.id, String(itemId), checked.email))) {
    return { ok: false, message: "That person isn't on your list anymore." };
  }
  return { ok: true, data: checked.email };
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

/** An item's follow-up chat, oldest first. */
export async function loadMyChat(itemId: string): Promise<ActionResult<ChatMessage[]>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const chat = typeof itemId === "string" ? await getChat(db(), user.id, itemId) : null;
  if (!chat) return { ok: false, message: "That item isn't on your list anymore." };
  return { ok: true, data: chat };
}

/** Deletes an item's follow-up chat. */
export async function clearMyChat(itemId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof itemId !== "string" || !(await clearChat(db(), user.id, itemId))) {
    return { ok: false, message: "That item isn't on your list anymore." };
  }
  return { ok: true };
}
