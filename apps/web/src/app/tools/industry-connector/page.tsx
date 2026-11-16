// Industry Connections Tool: choose an industry, see Wharton students and
// alumni who have worked in it, and draft an outreach note to one of them.
// Signed-out visitors are asked to sign in. Search works without an API key;
// drafting notes uses the user's own key from Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import {
  AFTER_CONVERSATION,
  industryCounts,
  INDUSTRIES,
  LENGTHS,
  MESSAGE_TYPES,
  PEOPLE,
  PURPOSES,
  TONES,
} from "@penntools/tool-industry-connector";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { IndustryConnector } from "./IndustryConnector";

export const metadata: Metadata = {
  title: "Industry Connections Tool",
};

export default async function IndustryConnectorPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Industry Connections Tool" />;

  const providers = await (await getAI())!.providers();

  return (
    <IndustryConnector
      industries={[...INDUSTRIES]}
      counts={industryCounts(PEOPLE)}
      outreach={{
        providers,
        labels: PROVIDER_LABELS,
        senderName: user.name ?? "",
        messageTypes: [...MESSAGE_TYPES],
        purposes: [...PURPOSES],
        tones: [...TONES],
        lengths: [...LENGTHS],
        afterConversation: [...AFTER_CONVERSATION],
      }}
    />
  );
}
