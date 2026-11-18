"use server";

// Handoff's server actions (C-DESIGN §2.4; C-CONTRACT.md §1, §7): what the live page calls to act, refresh, mark notifications
// read, save how the viewer is paid, and turn email updates on or off (follow-on B4). They are POSTs to this page's route; there are
// no /api routes. Handoff.tsx passes them to the live app.
//
// Without a session, every one answers "signed_out" before reading anything, except a refresh from a signed-out visitor's page
// (viewerId null), which gets the guest view: published facts only, built with no viewer, writing nothing (C-CONTRACT §7).
//
// Each one gives the tool's handler (tools/handoff/src/handlers.ts) three things, which it asks for only when needed and in
// this order: the session's user (getCurrentUser: who acts comes only from the session), the pool (toolSql), and the world
// (the handoff-world cookie, honored only in development: resolveWorldId). The handler compares the tab's account and
// protocol, calls the store and returns every outcome as data, since errors thrown from a server action lose their meaning
// on the way to the browser. Nothing here calls revalidatePath: each answer that changes the page carries the fresh view.
// saveEmailPrefs also gives the handler how this server signs people in (signInProvider), so a real email provider never sends to
// the local development sign-in; the address it records is always the session's PennTools sign-in email.

import { cookies } from "next/headers";
import { toolSql } from "@penntools/platform/db";
import {
  handleAct,
  handleMarkRead,
  handleRefresh,
  handleSaveEmailPrefs,
  handleSaveMyProfile,
  type ActAnswer,
  type ActInput,
  type ActionContext,
  type MarkReadAnswer,
  type MarkReadInput,
  type RefreshAnswer,
  type RefreshInput,
  type SaveEmailPrefsInput,
  type SaveProfileInput,
} from "@penntools/tool-handoff";
import { getCurrentUser, signInProvider } from "@/lib/auth";
import { WORLD_COOKIE, resolveWorldId } from "./world";

function context(): ActionContext {
  return {
    user: () => getCurrentUser(),
    sql: () => toolSql("handoff"),
    worldId: () => resolveWorldId(cookies().get(WORLD_COOKIE)?.value, process.env.NODE_ENV),
    // Anything but Google is the local development sign-in, which a real email provider never sends to (email/gates.ts).
    signIn: () => (signInProvider === "google" ? "google" : "dev"),
  };
}

/** One action, as the session's user: `requestId` is one UUID per intent, reused when retrying it. */
export async function act(input: ActInput): Promise<ActAnswer> {
  return handleAct(context(), input);
}

/**
 * "Unchanged" while the world is at `version`, nothing is due and the tab's view hasn't reached `nextRefreshAt` (both from the
 * view the tab shows); otherwise the viewer's fresh view. A signed-out visitor's page sends viewerId null and gets the same
 * answers about the guest view (C-CONTRACT §7).
 */
export async function refresh(input: RefreshInput): Promise<RefreshAnswer> {
  return handleRefresh(context(), input);
}

/** Marks the viewer's own notifications read: some by id, or "all". */
export async function markRead(input: MarkReadInput): Promise<MarkReadAnswer> {
  return handleMarkRead(context(), input);
}

/** Saves the viewer's payment methods (0 to 2, the first preferred; none removes them) and answers with the fresh view. */
export async function saveMyProfile(input: SaveProfileInput): Promise<ActAnswer> {
  return handleSaveMyProfile(context(), input);
}

/**
 * Turns the viewer's email updates on or off (follow-on B4): `exchange` ("Exchanges that need you") and `matches` ("Matches for your
 * requests and alerts"), at least one. Turning one on records their PennTools sign-in address; it answers with the fresh view, whose
 * `email` shows the result.
 */
export async function saveEmailPrefs(input: SaveEmailPrefsInput): Promise<ActAnswer> {
  return handleSaveEmailPrefs(context(), input);
}
