// Resume Customizer: tailor a resume to a job description, refine it with AI,
// and download it as a PDF or Word document. Signed-out visitors are asked to
// sign in, and users out of free credit without a saved key are sent to
// Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { ResumeCustomizer } from "./ResumeCustomizer";

export const metadata: Metadata = {
  title: "Resume Customizer",
};

export default async function ResumeCustomizerPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Resume Customizer" />;

  const providers = await (await getAI("resume-customizer"))!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Resume Customizer" />;

  // Keyed by the user, so signing in as someone else starts a fresh page
  // rather than keeping the last user's files and resume on screen.
  return <ResumeCustomizer key={user.id} providers={providers} labels={PROVIDER_LABELS} />;
}
