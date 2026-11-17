// The one check of who may use Pass It On: a signed-in user whose email is on
// the board's list (the Access tab), or a PennTools site admin (isAdmin, the
// admins who run the site from /admin). The layout, every page, every server
// action and both upload routes call it. The layout alone isn't enough: a page's
// content can be requested without its layout running, and actions and routes
// are reached directly.

import { cache } from "react";
import type { User } from "@penntools/core/types";
import { databaseProblem, databaseProblemMessage, hasBoardAccess } from "@penntools/tool-pass-it-on";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser, signInRequired } from "@/lib/auth";
import { maybeDb } from "./db";

/** A member is on the board's list ("board") or gets in as a site admin ("admin"). */
export type Access =
  | { kind: "member"; user: User; via: "board" | "admin" }
  | { kind: "signed_out" }
  | { kind: "not_member"; email: string | null }
  | { kind: "unavailable"; message: string };

export const NOT_MEMBER_MESSAGE = "Pass It On is only for the Pub board. Ask someone on the board to add your Penn email in the Access tab.";
const SIGNED_OUT_MESSAGE = "Sign in with the button at the top right to use Pass It On.";

/** Who is asking, checked once per request. */
export const getAccess = cache(async (): Promise<Access> => {
  const user = await getCurrentUser();
  if (!user) return { kind: "signed_out" };
  const sql = maybeDb();
  if (!sql) return { kind: "unavailable", message: "Pass It On's database is not configured." };
  try {
    if (await hasBoardAccess(sql, user.email)) return { kind: "member", user, via: "board" };
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return { kind: "unavailable", message: databaseProblemMessage(problem) };
    throw error;
  }
  // Site admins get in on top of the board's list, without being on it.
  return (await isAdmin(user)) ? { kind: "member", user, via: "admin" } : { kind: "not_member", email: user.email };
});

/**
 * For server actions: the member, or a failed ActionResult to return as it is.
 * `const member = await boardMember(); if (!member.ok) return member;`
 */
export async function boardMember(): Promise<{ ok: true; user: User } | { ok: false; message: string }> {
  const access = await getAccess();
  switch (access.kind) {
    case "member":
      return { ok: true, user: access.user };
    case "signed_out":
      return { ok: false, message: SIGNED_OUT_MESSAGE };
    case "not_member":
      return { ok: false, message: NOT_MEMBER_MESSAGE };
    case "unavailable":
      return { ok: false, message: access.message };
  }
}

/** For pages: whether to render. The layout shows the reason when it's false. */
export async function isBoardMember(): Promise<boolean> {
  return (await getAccess()).kind === "member";
}

/** For routes: the member, or the response to send instead. */
export async function routeMember(): Promise<{ ok: true; user: User } | { ok: false; response: Response }> {
  const access = await getAccess();
  switch (access.kind) {
    case "member":
      return { ok: true, user: access.user };
    case "signed_out":
      return { ok: false, response: signInRequired() };
    case "not_member":
      return { ok: false, response: Response.json({ error: NOT_MEMBER_MESSAGE }, { status: 403 }) };
    case "unavailable":
      return { ok: false, response: Response.json({ error: access.message }, { status: 503 }) };
  }
}
