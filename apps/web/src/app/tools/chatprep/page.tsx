// ChatPrep: a one-page brief for each coffee chat. Signed-out visitors are
// asked to sign in, and users without a saved key are sent to Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import {
  CHAT_TIPS,
  CLOSING_LINE,
  MAX_COMPANY_LENGTH,
  MAX_NEWS_LENGTH,
  MAX_PROFILE_LENGTH,
  MAX_RESUME_LENGTH,
  MAX_TARGET_ROLES_LENGTH,
  MAX_WEIGHING_LENGTH,
} from "@penntools/tool-chatprep";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { ChatPrep } from "./ChatPrep";

export const metadata: Metadata = {
  title: "ChatPrep",
};

export default async function ChatprepPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="ChatPrep" />;

  const providers = await (await getAI())!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="ChatPrep" />;

  return (
    <ChatPrep
      providers={providers}
      labels={PROVIDER_LABELS}
      closingLine={CLOSING_LINE}
      tips={CHAT_TIPS}
      limits={{
        resume: MAX_RESUME_LENGTH,
        targetRoles: MAX_TARGET_ROLES_LENGTH,
        weighing: MAX_WEIGHING_LENGTH,
        profile: MAX_PROFILE_LENGTH,
        company: MAX_COMPANY_LENGTH,
        news: MAX_NEWS_LENGTH,
      }}
    />
  );
}
