// PitchCoach AI: practice interview answers and pitches aloud, then get
// coaching feedback. Signed-out visitors are asked to sign in, and users out
// of free credit without a saved key are sent to Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_CONTEXT_LENGTH, MAX_QUESTION_LENGTH } from "@penntools/tool-pitch-coach";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { PitchCoach } from "./PitchCoach";

export const metadata: Metadata = {
  title: "PitchCoach AI",
};

export default async function PitchCoachPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="PitchCoach AI" />;

  const providers = await (await getAI("pitch-coach"))!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="PitchCoach AI" />;

  // Keyed by the user, so signing in as someone else starts a fresh page
  // rather than keeping the last user's answer and resume on screen.
  return (
    <PitchCoach
      key={user.id}
      providers={providers}
      labels={PROVIDER_LABELS}
      limits={{ question: MAX_QUESTION_LENGTH, context: MAX_CONTEXT_LENGTH }}
    />
  );
}
