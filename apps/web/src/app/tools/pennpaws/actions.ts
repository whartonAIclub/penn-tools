"use server";

// PennPaws's server actions. Each gets the signed-in user, checks the
// browser's input, and calls a function in tools/pennpaws/src. AI is optional
// everywhere: without a saved key, drafting falls back to the template.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so expected problems are returned as data instead.

import { revalidatePath } from "next/cache";
import { isAIError } from "@penntools/core/ai";
import type { AI, AIProvider } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  LIMITS,
  PennPawsError,
  acceptOffer,
  agreementTemplate,
  applyChange,
  approveAgreement,
  cancelRequest,
  changeAgreement,
  checkDraft,
  checkProfile,
  createRequest,
  getRequestView,
  getTerms,
  isoDate,
  markAllRead,
  noteChange,
  offerHelp,
  parseSentence,
  polishAgreement,
  saveMember,
  verifySchool,
  type ParsedRequest,
  type Person,
  type RequestView,
} from "@penntools/tool-pennpaws";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ALLOW_LOCAL_TEST_ACCOUNT } from "./school";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string; kind?: string };

const PATH = "/tools/pennpaws";

function db() {
  const sql = toolSql("pennpaws");
  if (!sql) throw new Error("PennPaws's database is not configured (check DATABASE_URL).");
  return sql;
}

async function signedIn(): Promise<Person | null> {
  const user = await getCurrentUser();
  return user ? { id: user.id, name: user.name ?? "A Penn student", email: user.email } : null;
}

const signedOut = { ok: false, error: "Sign in with your Penn account first." } as const;

/** Runs `fn`, turning PennPawsError and AIError into data the page can show. */
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PennPawsError) return { ok: false, error: error.message };
    if (isAIError(error)) return { ok: false, error: error.toJSON().message, kind: error.kind };
    throw error;
  }
}

/** The signed-in user's AI and their first provider with a saved key, if any. */
async function userAI(): Promise<{ ai: AI; provider: AIProvider } | null> {
  const ai = await getAI();
  const provider = ai ? (await ai.providers())[0] : undefined;
  return ai && provider ? { ai, provider } : null;
}

// ── First-time setup ──────────────────────────────────────────────────────────

/** Saves the role and survey answers. Only members signed in with a Penn email (the pilot school) may join. */
export async function saveProfile(input: unknown): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const school = verifySchool(user.email, ALLOW_LOCAL_TEST_ACCOUNT);
  if (!school) return { ok: false, error: "PennPaws is open to Penn for now. Log out, then sign in with your Penn account." };
  const checked = checkProfile(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    await saveMember(db(), user, school, checked.value);
    return null;
  });
}

// ── Owner ─────────────────────────────────────────────────────────────────────

export async function postRequest(input: unknown): Promise<ActionResult<string>> {
  const user = await signedIn();
  if (!user) return signedOut;
  const checked = checkDraft(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(() => createRequest(db(), user, checked.value));
}

/** Survey answers found in one sentence. Needs a saved API key. */
export async function parseRequest(sentence: string): Promise<ActionResult<ParsedRequest>> {
  if (!(await signedIn())) return signedOut;
  if (typeof sentence !== "string" || !sentence.trim()) return { ok: false, error: "Describe what you need first." };
  if (sentence.length > LIMITS.sentence) return { ok: false, error: `Keep it under ${LIMITS.sentence} characters.` };
  const ai = await userAI();
  if (!ai) return { ok: false, error: "Save an API key in Settings to use this, or answer the questions instead.", kind: "missing_key" };
  return run(() => parseSentence(ai.ai, ai.provider, sentence, isoDate(new Date())));
}

/** Accepts an offer and drafts the agreement: the template, polished by AI when the owner has a key. */
export async function accept(offerId: string): Promise<ActionResult<string>> {
  const user = await signedIn();
  if (!user) return signedOut;
  const ai = await userAI();
  return run(() =>
    acceptOffer(db(), user.id, String(offerId), async (draft, ownerFirstName, sitterMessage) => {
      const terms = agreementTemplate(draft, ownerFirstName);
      if (!ai) return terms;
      try {
        return await polishAgreement(ai.ai, ai.provider, terms, sitterMessage);
      } catch (error) {
        if (isAIError(error)) return terms; // a key problem shouldn't block the booking
        throw error;
      }
    }),
  );
}

export async function cancel(requestId: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    await cancelRequest(db(), user.id, String(requestId));
    return null;
  });
}

// ── Sitter ────────────────────────────────────────────────────────────────────

export async function offer(requestId: string, message: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  return run(async () => {
    await offerHelp(db(), user, String(requestId), String(message ?? ""));
    return null;
  });
}

// ── Both ──────────────────────────────────────────────────────────────────────

export async function loadRequest(requestId: string): Promise<RequestView | null> {
  const user = await signedIn();
  return user ? getRequestView(db(), user.id, String(requestId)) : null;
}

export async function approve(requestId: string, version: number): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  if (!Number.isInteger(version)) return { ok: false, error: "Reload the page and try again." };
  return run(async () => {
    await approveAgreement(db(), user.id, String(requestId), version);
    return null;
  });
}

/** Applies the change with AI when the user has a key; otherwise records it in the notes. */
export async function askForChange(requestId: string, change: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return signedOut;
  const text = typeof change === "string" ? change.trim() : "";
  if (!text) return { ok: false, error: "Say what you'd like to change." };
  if (text.length > LIMITS.message) return { ok: false, error: `Keep it under ${LIMITS.message} characters.` };
  const sql = db();
  const current = await getTerms(sql, user.id, String(requestId));
  if (!current) return { ok: false, error: "This agreement can't be changed now." };
  const ai = await userAI();
  return run(async () => {
    let terms = noteChange(current.terms, text, current.me);
    if (ai) {
      try {
        terms = await applyChange(ai.ai, ai.provider, current.terms, text);
      } catch (error) {
        if (!isAIError(error)) throw error;
      }
    }
    await changeAgreement(sql, user.id, String(requestId), terms);
    return null;
  });
}

export async function readNotifications(): Promise<void> {
  const user = await signedIn();
  if (!user) return;
  await markAllRead(db(), user.id);
  revalidatePath(PATH);
}
