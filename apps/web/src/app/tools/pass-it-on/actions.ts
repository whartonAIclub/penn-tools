"use server";

// Server actions for Pass It On's pages: saving events and asking the
// library. Each checks the signed-in user and the browser's input, and
// returns problems as data. Errors thrown from a server action lose their
// class on the way to the browser, so AIErrors and database problems are
// turned into messages here.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  answerFromLibrary,
  checkPlannedEventInput,
  checkSearchQuery,
  checkTags,
  createPlannedEvent,
  databaseProblem,
  databaseProblemMessage,
  deletePlannedEvent,
  deleteSource,
  parseNameList,
  parseVendorLines,
  searchLibrary,
  searchLibraryKeywords,
  updatePlannedEvent,
  type CitedAnswer,
  type Passage,
} from "@penntools/tool-pass-it-on";
import { getAI, getEmbeddings } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { db } from "./db";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string; kind?: string };

const fail = (message: string, kind?: string): ActionResult<never> => ({ ok: false, message, ...(kind && { kind }) });
const signedOut = fail("Sign in with the button at the top right to use Pass It On.");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (isAIError(error)) return fail(error.message, error.kind);
    const problem = databaseProblem(error);
    if (problem) return fail(databaseProblemMessage(problem));
    throw error;
  }
}

/** What the event form sends: plain text, parsed here. */
export interface EventFormValues {
  title: string;
  eventDate: string;
  theme: string;
  venue: string;
  budget: string;
  pubLeader: string;
  partnerClubs: string;
  vendors: string;
}

/** Creates an event (id null) or saves changes to one. */
export async function saveEvent(id: string | null, values: EventFormValues): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkPlannedEventInput({
    ...values,
    partnerClubs: parseNameList(String(values?.partnerClubs ?? "")),
    vendors: parseVendorLines(String(values?.vendors ?? "")),
  });
  if (!checked.ok) return fail(checked.message);

  return run(async () => {
    if (id === null) return { ok: true, data: { id: await createPlannedEvent(db(), checked.value, user.id) } };
    if (typeof id !== "string" || !(await updatePlannedEvent(db(), id, checked.value))) return fail("That event no longer exists.");
    return { ok: true, data: { id } };
  });
}

export async function deleteEvent(id: string): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  return run(async () => ((await deletePlannedEvent(db(), String(id))) ? { ok: true, data: null } : fail("That event no longer exists.")));
}

/** Answers a question from the library, with citations, or says it couldn't find one. */
export async function askLibrary(provider: AIProvider, question: string, tags: string[]): Promise<ActionResult<CitedAnswer>> {
  const ai = await getAI();
  if (!ai) return signedOut;
  const problem = checkSearchQuery(question);
  if (problem) return fail(problem);
  const checkedTags = checkTags(tags);
  if (!checkedTags.ok) return fail(checkedTags.message);

  // Uses the user's OpenAI key, or the platform's when they haven't saved one.
  const embeddings = await getEmbeddings("pass-it-on");
  if (!embeddings) return fail("Search isn't available: no OpenAI key is set up. Add yours in Settings.");

  return run(async () => {
    const passages = await searchLibrary(db(), embeddings, question, { tags: checkedTags.value });
    return { ok: true, data: await answerFromLibrary(ai, provider, question, passages) };
  });
}

/** Passages containing the question's words. Needs no AI key or embeddings, so it works without any API key. */
export async function searchPassages(question: string, tags: string[]): Promise<ActionResult<Passage[]>> {
  if (!(await getCurrentUser())) return signedOut;
  const problem = checkSearchQuery(question);
  if (problem) return fail(problem);
  const checkedTags = checkTags(tags);
  if (!checkedTags.ok) return fail(checkedTags.message);
  return run(async () => ({ ok: true, data: await searchLibraryKeywords(db(), question, { tags: checkedTags.value }) }));
}

/** Deletes an uploaded file and everything taken from it. */
export async function deleteFile(id: string): Promise<ActionResult<null>> {
  if (!(await getCurrentUser())) return signedOut;
  return run(async () => ((await deleteSource(db(), String(id))) ? { ok: true, data: null } : fail("That file no longer exists.")));
}
