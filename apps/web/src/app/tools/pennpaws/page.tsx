// PennPaws: students find a verified fellow student to look after their pet.
// Signed-out visitors are asked to sign in. First-time members pick a role,
// pass the Penn email check (Penn is the pilot school) and answer the survey
// before they see the tool. AI is optional, so users without a saved key still get the whole
// tool.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { firstName, getMember, listMyRequests, listNotifications, listOpenRequests, verifySchool } from "@penntools/tool-pennpaws";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { isPennEmail } from "@/lib/pennEmail";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Onboarding } from "./Onboarding";
import { PennPaws } from "./PennPaws";
import { ALLOW_LOCAL_TEST_ACCOUNT } from "./school";

export const metadata: Metadata = {
  title: "PennPaws",
};

export default async function PennPawsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <SignInPrompt
        title="PennPaws"
        message="Going away? Find a verified student to walk your dog or visit your cat, or offer to help. Everyone here signs in with a Penn email."
      />
    );
  }

  const sql = toolSql("pennpaws");
  if (!sql) throw new Error("PennPaws's database is not configured (check DATABASE_URL).");

  const userFirstName = firstName(user.name ?? "");
  const school = verifySchool(user.email, ALLOW_LOCAL_TEST_ACCOUNT);
  const member = await getMember(sql, user.id);
  if (!member || !school) {
    return <Onboarding userFirstName={userFirstName} email={user.email} school={school} initial={member?.profile ?? null} />;
  }

  const [open, mine, notifications, providers] = await Promise.all([
    listOpenRequests(sql, user.id),
    listMyRequests(sql, user.id),
    listNotifications(sql, user.id),
    getAI().then((ai) => ai?.providers() ?? []),
  ]);

  return (
    <PennPaws
      userFirstName={userFirstName}
      pennVerified={isPennEmail(user.email)}
      email={user.email}
      member={member}
      open={open}
      mine={mine}
      notifications={notifications}
      hasAI={providers.length > 0}
    />
  );
}
