// WEMBA Sync: upload a class weekend's schedule PDF and see the weekend as a
// calendar. Signed-out visitors are asked to sign in, and users without a
// saved key are sent to Settings, as in the Platform Playground.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_PDF_BYTES } from "@penntools/tool-wemba-sync";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { WembaSync } from "./WembaSync";

export const metadata: Metadata = {
  title: "WEMBA Sync",
};

export default async function WembaSyncPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="WEMBA Sync" />;

  const providers = await (await getAI())!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="WEMBA Sync" />;

  return <WembaSync providers={providers} labels={PROVIDER_LABELS} maxBytes={MAX_PDF_BYTES} />;
}
