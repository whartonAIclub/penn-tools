"use server";

// Handoff's server actions (C-DESIGN §2.4; C-CONTRACT.md §1, §7): what the live page calls to act, refresh, mark notifications
// read, save how the viewer is paid and delete their data. They are POSTs to this page's route; there are no /api routes.
// Handoff.tsx passes them to the live app. A change that carries a photo goes to the act route (act/route.ts) instead.
//
// Without a session, every one answers "signed_out" before reading anything, except a refresh from a signed-out visitor's page
// (viewerId null), which gets the guest view: published facts only, built with no viewer, writing nothing (C-CONTRACT §7).
//
// Each one gives the tool's handler (tools/handoff/src/handlers.ts) three things, which it asks for only when needed and in
// this order: the session's user (getCurrentUser: who acts comes only from the session), the pool (toolSql), and the world
// (the handoff-world cookie, honored only in development: resolveWorldId). The handler compares the tab's account and
// protocol, calls the store and returns every outcome as data, since errors thrown from a server action lose their meaning
// on the way to the browser. Nothing here calls revalidatePath: each answer that changes the page carries the fresh view.

import { cookies } from "next/headers";
import { toolSql } from "@penntools/platform/db";
import {
  handleAct,
  handleDeleteMyData,
  handleMarkRead,
  handleRefresh,
  handleSaveMyProfile,
  type ActAnswer,
  type ActInput,
  type ActionContext,
  type Guard,
  type MarkReadAnswer,
  type MarkReadInput,
  type RefreshAnswer,
  type RefreshInput,
  type SaveProfileInput,
} from "@penntools/tool-handoff";
import { getCurrentUser } from "@/lib/auth";
import { WORLD_COOKIE, resolveWorldId } from "./world";

async function context(): Promise<ActionContext> {
  const jar = await cookies(); // Next.js 15 and later read the request's cookies asynchronously
  return {
    user: () => getCurrentUser(),
    sql: () => toolSql("handoff"),
    worldId: () => resolveWorldId(jar.get(WORLD_COOKIE)?.value, process.env.NODE_ENV),
  };
}

/**
 * One action, as the session's user: `requestId` is one UUID per intent, reused when retrying it. Never one with a photo: those go to
 * the act route (act/route.ts), which caps its body (review of PR #88), and the handler refuses a photo here.
 */
export async function act(input: ActInput): Promise<ActAnswer> {
  return handleAct(await context(), input, { photo: false });
}

/**
 * "Unchanged" while the world is at `version`, nothing is due and the tab's view hasn't reached `nextRefreshAt` (both from the
 * view the tab shows); otherwise the viewer's fresh view. A signed-out visitor's page sends viewerId null and gets the same
 * answers about the guest view (C-CONTRACT §7).
 */
export async function refresh(input: RefreshInput): Promise<RefreshAnswer> {
  return handleRefresh(await context(), input);
}

/** Marks the viewer's own notifications read: some by id, or "all". */
export async function markRead(input: MarkReadInput): Promise<MarkReadAnswer> {
  return handleMarkRead(await context(), input);
}

/** Saves the viewer's payment methods (0 to 2, the first preferred; none removes them) and answers with the fresh view. */
export async function saveMyProfile(input: SaveProfileInput): Promise<ActAnswer> {
  return handleSaveMyProfile(await context(), input);
}

/**
 * Deletes the viewer's Handoff data (their profile, notifications and activity log; review of PR #88), unless something of theirs is
 * still open, and answers with the fresh view.
 */
export async function deleteMyData(input: Guard): Promise<ActAnswer> {
  return handleDeleteMyData(await context(), input);
}
