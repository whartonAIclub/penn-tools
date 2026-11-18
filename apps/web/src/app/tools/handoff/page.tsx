// Handoff: the shared market (C-DESIGN §6.3; C-CONTRACT.md §7). Signed-out visitors browse the server's guest view, read-only, and the
// app asks for the platform's sign-in at the action that needs it. Signed-in viewers get their own view, which the app changes only
// through the server actions in actions.ts. When the shared data can't be used (no DATABASE_URL, the handoff role or schema missing,
// the database down) the page says what's missing, never a sample market.
// The sample demo is at /tools/handoff/preview, in development only.

import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { toolSql } from "@penntools/platform/db";
import { getGuestView, getView, setupErrorKind } from "@penntools/tool-handoff";
import { getCurrentUser, signInProvider } from "@/lib/auth";
import { Handoff } from "./Handoff";
import { HandoffUnavailable } from "./HandoffUnavailable";
import { WORLD_COOKIE, resolveWorldId } from "./world";

export const metadata: Metadata = {
  title: "Handoff · PennTools",
  description: "Pass on tickets, trip spots and secondhand finds with classmates.",
};

export default async function HandoffPage() {
  const user = await getCurrentUser();

  const sql = toolSql("handoff");
  if (!sql) return <HandoffUnavailable reason="no-database" />;

  try {
    // The world is "live", except in development, where a check's handoff-world cookie can name its own test world.
    const worldId = resolveWorldId(cookies().get(WORLD_COOKIE)?.value, process.env.NODE_ENV);
    if (!user) {
      // Signed out (or a server with no sign-in): published facts only, built with no viewer and writing nothing (C-CONTRACT §7).
      // A guest signs in with the platform's own provider at an action; null means this server has none yet, and browsing still works.
      const guest = await getGuestView(sql, { worldId });
      return <Handoff mode="guest" initial={guest} signInProvider={signInProvider} />;
    }
    const view = await getView(sql, { worldId, viewer: { id: user.id, name: user.name, email: user.email } });
    // The local development sign-in isn't a Penn account, and the app says so. renderId: one per server render, so Handoff.tsx can tell a
    // render Next's router cache brings back (Back, or a link within 30 s), which another account may be looking at now (conceal-fix).
    return <Handoff mode="live" initial={view} localSignIn={signInProvider === "dev"} renderId={randomUUID()} />;
  } catch (e) {
    const kind = setupErrorKind(e);
    if (kind) return <HandoffUnavailable reason={kind} />;
    throw e;
  }
}
