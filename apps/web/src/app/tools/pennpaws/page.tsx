// PennPaws: Penn students find a verified fellow student to look after their
// pet. Signed-out visitors are asked to sign in. AI is optional, so users
// without a saved key still get the whole tool.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { firstName, listMyRequests, listNotifications, listOpenRequests } from "@penntools/tool-pennpaws";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { isPennEmail } from "@/lib/pennEmail";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { PennPaws } from "./PennPaws";

export const metadata: Metadata = {
  title: "PennPaws",
};

export default async function PennPawsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <SignInPrompt
        title="PennPaws"
        message="Going away? Find a verified Penn student to walk your dog or visit your cat, or offer to help. Everyone here signs in with a Penn account."
      />
    );
  }

  const sql = toolSql("pennpaws");
  if (!sql) throw new Error("PennPaws's database is not configured (check DATABASE_URL).");

  const [open, mine, notifications, providers] = await Promise.all([
    listOpenRequests(sql, user.id),
    listMyRequests(sql, user.id),
    listNotifications(sql, user.id),
    getAI().then((ai) => ai?.providers() ?? []),
  ]);

  return (
    <PennPaws
      userFirstName={firstName(user.name ?? "")}
      pennVerified={isPennEmail(user.email)}
      open={open}
      mine={mine}
      notifications={notifications}
      hasAI={providers.length > 0}
    />
  );
}
