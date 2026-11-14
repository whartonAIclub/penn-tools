"use server";

// Keep in Touch's server actions: each checks the signed-in user and the
// browser's input, then calls the tool's logic in tools/keepintouch/src.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so AIErrors are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIErrorKind, AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  LIMITS,
  checkContactInput,
  checkInteractionInput,
  createContact,
  deleteContact,
  draftContact,
  isDate,
  listInteractions,
  listTags,
  logInteraction,
  updateContact,
  type Contact,
  type ContactDraft,
  type Interaction,
} from "@penntools/tool-keepintouch";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /** The AIError kind, when the AI API failed. */
      kind?: AIErrorKind;
    };

const signedOut: ActionResult<never> = { ok: false, error: "Sign in with the button at the top right." };
const notFound: ActionResult<never> = { ok: false, error: "That contact no longer exists. Reload the page." };

function db() {
  const sql = toolSql("keepintouch");
  if (!sql) throw new Error("Keep in Touch's database is not configured (check DATABASE_URL).");
  return sql;
}

/** Adds a contact (contactId null) or replaces an existing one's details. */
export async function saveContact(contactId: string | null, input: unknown): Promise<ActionResult<Contact>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (contactId !== null && typeof contactId !== "string") return notFound;
  const checked = checkContactInput(input);
  if (!checked.ok) return checked;

  const contact =
    contactId === null
      ? await createContact(db(), user.id, checked.value)
      : await updateContact(db(), user.id, contactId, checked.value);
  return contact ? { ok: true, data: contact } : notFound;
}

export async function removeContact(contactId: string): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof contactId !== "string") return notFound;
  return (await deleteContact(db(), user.id, contactId)) ? { ok: true, data: null } : notFound;
}

/** The contact's interactions, latest first. */
export async function loadInteractions(contactId: string): Promise<ActionResult<Interaction[]>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof contactId !== "string") return notFound;
  const interactions = await listInteractions(db(), user.id, contactId);
  return interactions ? { ok: true, data: interactions } : notFound;
}

/** Records a time in touch and sets the next follow-up; returns both with the updated contact. */
export async function addInteraction(
  contactId: string,
  input: unknown,
): Promise<ActionResult<{ interaction: Interaction; contact: Contact }>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof contactId !== "string") return notFound;
  const checked = checkInteractionInput(input);
  if (!checked.ok) return checked;

  const logged = await logInteraction(db(), user.id, contactId, checked.value);
  return logged ? { ok: true, data: logged } : notFound;
}

/**
 * Turns a quick note about someone into a draft for the add form, with the
 * user's own API key. Nothing is saved: the user checks the draft and saves it
 * with saveContact. `today` is the browser's date, for words like "yesterday".
 */
export async function draftFromNote(provider: AIProvider, note: string, today: string): Promise<ActionResult<ContactDraft>> {
  const user = await getCurrentUser();
  const ai = user && (await getAI());
  if (!user || !ai) return signedOut;
  if (typeof note !== "string" || !note.trim()) return { ok: false, error: "Write a few words about who you met." };
  if (note.length > LIMITS.quickNote) return { ok: false, error: `Keep the note to at most ${LIMITS.quickNote} characters.` };
  if (typeof today !== "string" || !isDate(today)) return { ok: false, error: "Check the form and try again." };

  try {
    const knownTags = await listTags(db(), user.id);
    // The AI API checks provider itself.
    return { ok: true, data: await draftContact(ai, provider, note, { today, knownTags }) };
  } catch (error) {
    if (isAIError(error)) return { ok: false, error: error.message, kind: error.kind };
    throw error;
  }
}
