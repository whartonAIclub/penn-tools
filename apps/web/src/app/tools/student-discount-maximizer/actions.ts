"use server";

// Student Discount Central's server actions. Each one checks the browser's
// input, gets the signed-in student where it needs one, and calls a function in
// tools/student-discount-maximizer/src/. Browsing works signed out; voting,
// adding and expiring need sign-in.
//
// Errors thrown from a server action lose their class on the way to the
// browser, so problems to show the student are returned as data instead.

import { isAIError } from "@penntools/core/ai";
import type { AIProvider } from "@penntools/core/ai";
import {
  CATEGORIES,
  DiscountError,
  DuplicateDealError,
  KINDS,
  NEIGHBORHOODS,
  SCOPES,
  addDiscount,
  checkPastedText,
  findSimilarDeals,
  fillFromText,
  listDiscountPage,
  markExpired,
  restore,
  vote,
  type Discount,
  type SimilarDeal,
  type DiscountAudience,
  type DiscountPage,
  type DiscountCategory,
  type DiscountKind,
  type DiscountScope,
  type DiscountSort,
  type DealDraft,
  type Neighborhood,
} from "@penntools/tool-student-discount-maximizer";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { db, setupProblem } from "./database";

export interface ActionError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
  /** The deals at the store, when adding a deal was refused as a possible duplicate. */
  similar?: SimilarDeal[];
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export interface Filters {
  status: "active" | "expired";
  kind: DiscountKind | null;
  scope: DiscountScope | null;
  category: DiscountCategory | null;
  audience: DiscountAudience | null;
  neighborhood: Neighborhood | null;
  search: string;
  sort: DiscountSort;
}

const signedOut: ActionResult<never> = {
  ok: false,
  error: { message: "Sign in with the button at the top right to do that." },
};

function fail(message: string): ActionResult<never> {
  return { ok: false, error: { message } };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof DuplicateDealError) return { ok: false, error: { message: error.message, similar: error.similar } };
    if (error instanceof DiscountError) return fail(error.message);
    if (isAIError(error)) return { ok: false, error: error.toJSON() };
    const problem = setupProblem(error);
    if (problem) return fail(problem);
    throw error;
  }
}

function database() {
  const sql = db();
  if (!sql) throw new Error("The database is not configured (check DATABASE_URL).");
  return sql;
}

/**
 * A page of deals matching the filters, starting `offset` deals in, with the
 * student's own votes when signed in.
 */
export async function loadDiscounts(filters: Filters, offset = 0): Promise<ActionResult<DiscountPage>> {
  const f = (filters ?? {}) as Partial<Filters>;
  const user = await getCurrentUser();
  return run(() =>
    listDiscountPage(database(), {
      offset: typeof offset === "number" && Number.isFinite(offset) ? offset : 0,
      userId: user?.id ?? null,
      status: f.status === "expired" ? "expired" : "active",
      kind: KINDS.includes(f.kind as DiscountKind) ? (f.kind as DiscountKind) : null,
      scope: SCOPES.includes(f.scope as DiscountScope) ? (f.scope as DiscountScope) : null,
      category: CATEGORIES.includes(f.category as DiscountCategory) ? (f.category as DiscountCategory) : null,
      audience: f.audience === "penn" || f.audience === "general" ? f.audience : null,
      neighborhood: NEIGHBORHOODS.includes(f.neighborhood as Neighborhood) ? (f.neighborhood as Neighborhood) : null,
      search: typeof f.search === "string" ? f.search : null,
      sort: f.sort === "new" || f.sort === "top" ? f.sort : "az",
    }),
  );
}

/** Adds a deal from the Add a deal form; addDiscount checks every field. */
export async function addDeal(input: unknown): Promise<ActionResult<Discount>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return run(() => addDiscount(database(), user.id, input));
}

/** Active deals at the same store, for the Add a deal form's duplicate warning. Works signed out too. */
export async function similarDeals(business: string): Promise<ActionResult<SimilarDeal[]>> {
  if (typeof business !== "string") return fail("Enter a store name.");
  const user = await getCurrentUser();
  return run(() => findSimilarDeals(database(), business, user?.id ?? null));
}

/** true "works", false "doesn't work", null to take the vote back. */
export async function castVote(discountId: string, works: boolean | null): Promise<ActionResult<Discount>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof discountId !== "string") return fail("That deal doesn't exist.");
  return run(() => vote(database(), user.id, discountId, works));
}

export async function expireDeal(discountId: string): Promise<ActionResult<Discount>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof discountId !== "string") return fail("That deal doesn't exist.");
  return run(() => markExpired(database(), user.id, discountId));
}

export async function restoreDeal(discountId: string): Promise<ActionResult<Discount>> {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  if (typeof discountId !== "string") return fail("That deal doesn't exist.");
  return run(() => restore(database(), user.id, discountId));
}

/** A draft of the Add a deal form from pasted text, with the AI API (free credit, then the student's own key). */
export async function fillForm(provider: AIProvider, pastedText: string): Promise<ActionResult<DealDraft>> {
  const ai = await getAI("student-discount-maximizer");
  if (!ai) return signedOut;
  const problem = checkPastedText(pastedText);
  if (problem) return fail(problem);
  // The AI API checks provider itself.
  return run(() => fillFromText(ai, provider, pastedText));
}
