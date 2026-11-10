// Connector: helps Wharton students meet people outside their usual circles.
// Signed-out visitors are asked to sign in; signed-in students fill in the
// profile form and the questions, and their sign-up is saved. Students who
// have already signed up are matched, and their answers are locked in, so
// they go straight to their group. The questions and cohorts come from the
// tool's shared lists (questions.ts), which the matching reads too.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { toolSql } from "@penntools/platform/db";
import { COHORTS, listSignups, QUESTIONS } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Connector } from "./Connector";

export const metadata: Metadata = {
  title: "Connector",
};

/** Whether the student has saved a sign-up. False if the database can't be read: saving will say so. */
async function hasSignedUp(userId: string): Promise<boolean> {
  const sql = toolSql("connector");
  if (!sql) return false;
  try {
    return (await listSignups(sql)).some((s) => s.id === userId);
  } catch (error) {
    console.error("Connector: reading sign-ups failed", error);
    return false;
  }
}

export default async function ConnectorPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector" />;
  if (await hasSignedUp(user.id)) redirect("/tools/connector/groups");
  return <Connector questions={QUESTIONS} cohorts={COHORTS} />;
}
