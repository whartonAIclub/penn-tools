// Connector: helps Wharton students meet people outside their usual circles.
// Signed-out visitors are asked to sign in; signed-in students fill in the
// profile form and the questions, and their sign-up is saved. The questions
// and cohorts come from the tool's shared lists (questions.ts), which the
// matching reads too.

import type { Metadata } from "next";
import { COHORTS, QUESTIONS } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Connector } from "./Connector";

export const metadata: Metadata = {
  title: "Connector",
};

export default async function ConnectorPage() {
  if (!(await getCurrentUser())) return <SignInPrompt title="Connector" />;
  return <Connector questions={QUESTIONS} cohorts={COHORTS} />;
}
