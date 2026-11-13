import "server-only";

// Who may use Connector's team page: the team's emails (TEAM_EMAILS), plus,
// only when the site is signing in with the local development user (no
// Google sign-in, in development), that user, so the team can test releases
// on their own computers.

import { isTeamMember } from "@penntools/tool-connector";
import type { User } from "@penntools/core/types";
import { signInProvider } from "@/lib/auth";

export function canRelease(user: User | null): user is User {
  if (!user) return false;
  return isTeamMember(user.email) || (signInProvider === "dev" && user.email === "dev@localhost");
}
