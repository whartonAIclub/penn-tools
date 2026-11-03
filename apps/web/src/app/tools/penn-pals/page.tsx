// Penn Pals: paste notes from a networking chat, get a contact card.
// Signed-out visitors are asked to sign in, and users without a saved AI key
// are sent to Settings (the standard screens, as in AskPenn).

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_NOTES_LENGTH } from "@penntools/tool-penn-pals";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { PennPals } from "./PennPals";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

export default async function PennPalsPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Pals: Network Tracker" />;

  const providers = await (await getAI())!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Penn Pals: Network Tracker" />;

  return <PennPals providers={providers} labels={PROVIDER_LABELS} maxLength={MAX_NOTES_LENGTH} />;
}
