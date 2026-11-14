"use server";

// Server actions for after matching (visits.ts in the tool): how to get in,
// check-ins with photos, and paying for each visit. Kept apart from
// actions.ts so the booking actions stay readable.

import { revalidatePath } from "next/cache";
import { toolSql } from "@penntools/platform/db";
import {
  PennPawsError,
  TEST_ID_PREFIX,
  checkCheckIn,
  checkEntryGuide,
  checkIn,
  checkOut,
  checkPayHandles,
  checkVisitPayment,
  getAfterMatch,
  markVisitPaid,
  playFakeVisits,
  saveEntryGuide,
  savePayHandles,
  type AfterMatchView,
} from "@penntools/tool-pennpaws";
import { getCurrentUser } from "@/lib/auth";
import { isPennEmail } from "@/lib/pennEmail";
import { ALLOW_LOCAL_TEST_ACCOUNT } from "./school";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const PATH = "/tools/pennpaws";
const signedOut = { ok: false, error: "Sign in with your Penn account first." } as const;

function db() {
  const sql = toolSql("pennpaws");
  if (!sql) throw new Error("PennPaws's database is not configured (check DATABASE_URL).");
  return sql;
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof PennPawsError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function loadAfterMatch(requestId: string): Promise<AfterMatchView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return getAfterMatch(db(), user.id, String(requestId));
}

export async function saveGuide(requestId: string, input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkEntryGuide(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(() => saveEntryGuide(db(), user.id, String(requestId), checked.value).then(() => null));
}

export async function saveHandles(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkPayHandles(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(() => savePayHandles(db(), user.id, checked.value).then(() => null));
}

export async function arrive(requestId: string, input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkCheckIn(input, true);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(async () => {
    await checkIn(db(), user.id, String(requestId), checked.value);
    return null;
  });
}

export async function leave(requestId: string, input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkCheckIn(input, false);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(() => checkOut(db(), user.id, String(requestId), checked.value).then(() => null));
}

export async function payVisit(requestId: string, visitId: string, input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const checked = checkVisitPayment(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return run(() => markVisitPaid(db(), user.id, String(requestId), String(visitId), checked.value).then(() => null));
}

/** Test menu: the fake sitter on each booked request checks in, or finishes the visit. Local test user only. */
export async function testFakeVisit(): Promise<Result<string[]>> {
  const user = await getCurrentUser();
  if (!ALLOW_LOCAL_TEST_ACCOUNT || !user || isPennEmail(user.email)) {
    return { ok: false, error: "The test menu only works for the local test user under pnpm dev." };
  }
  return run(() => playFakeVisits(db(), user.id, TEST_ID_PREFIX));
}
