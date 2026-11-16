// ─────────────────────────────────────────────────────────────────────────────
// Admins — SERVER ONLY
//
// Who can open /admin: signed-in users whose email is in the admins table.
// Admins add and remove each other there; `db:deploy` adds the first ones
// (packages/platform/scripts/seed-platform.mjs). In development without
// Google sign-in, the local user is an admin too, so the page can be tried.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import type { User } from "@penntools/core/types";
import { signInProvider } from "./auth";
import { admins } from "./container";

export async function isAdmin(user: Pick<User, "email"> | null): Promise<boolean> {
  if (!user) return false;
  if (signInProvider === "dev") return true;
  return !!user.email && admins.isAdmin(user.email);
}
