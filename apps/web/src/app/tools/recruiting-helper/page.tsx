// Recruiting Helper: paste job postings and LinkedIn profiles, get them scored
// against your own target companies and roles, and keep a ranked list. The
// profile and list are saved in the browser (localStorage), not on the server.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_PASTE_LENGTH, SAMPLE_LINKEDIN, SAMPLE_POSTING, SAMPLE_PROFILE } from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { RecruitingHelper } from "./RecruitingHelper";

export const metadata: Metadata = {
  title: "Recruiting Helper",
};

export default async function RecruitingHelperPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Recruiting Helper" />;

  const providers = await (await getAI())!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Recruiting Helper" />;

  return (
    <RecruitingHelper
      userId={user.id}
      providers={providers}
      labels={PROVIDER_LABELS}
      samples={{ profile: SAMPLE_PROFILE, posting: SAMPLE_POSTING, linkedIn: SAMPLE_LINKEDIN }}
      maxPasteLength={MAX_PASTE_LENGTH}
    />
  );
}
