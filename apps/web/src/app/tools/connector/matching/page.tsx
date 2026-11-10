// Shown right after a student saves their sign-up: a short "matching you"
// screen, then on to their group (../groups).

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Matching } from "./Matching";

export const metadata: Metadata = {
  title: "Connector",
};

export default async function ConnectorMatchingPage() {
  if (!(await getCurrentUser())) return <SignInPrompt title="Connector" />;
  return <Matching />;
}
