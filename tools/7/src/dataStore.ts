/**
 * dataStore.ts — in-memory store keyed by user_id.
 *
 * Persists for the lifetime of the server process.
 * Swap Map → database (Prisma) later without changing callers.
 */
import type { ContextItem, GeneratedOutput, UserData } from "./types.js";

const store = new Map<string, UserData>();

function getOrCreate(user_id: string): UserData {
  if (!store.has(user_id)) {
    store.set(user_id, {
      user_id,
      base_resume: "",
      context_items: [],
      generated_outputs: [],
    });
  }
  return store.get(user_id)!;
}

/** Store or replace the user's base resume. */
export function uploadResume(user_id: string, resume: string): UserData {
  const data = getOrCreate(user_id);
  data.base_resume = resume;
  return data;
}

/** Append a context item (project, past resume, writing sample, etc.). */
export function addContext(
  user_id: string,
  type: ContextItem["type"],
  content: string
): UserData {
  const data = getOrCreate(user_id);
  const item: ContextItem = {
    id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    content,
  };
  data.context_items.push(item);
  return data;
}

/** Read a user's stored data (undefined if never seen). */
export function getUser(user_id: string): UserData | undefined {
  return store.get(user_id);
}

/** Append a generated output and return it. */
export function storeOutput(
  user_id: string,
  job_description: string,
  output_resume: string
): GeneratedOutput {
  const data = getOrCreate(user_id);
  const output: GeneratedOutput = {
    id: `out_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    job_description,
    output_resume,
    created_at: Date.now(),
  };
  data.generated_outputs.push(output);
  return output;
}
