// Industry Connections Tool: choose an industry, see Wharton students and
// alumni who have worked in it, and draft an outreach note to one of them.
// Signed-out visitors are asked to sign in. Drafting notes runs on the user's
// free AI credit, then on their own key from Settings; search needs neither.

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

  // Empty once the user has used their free AI credit and saved no key; search still works then.
  const providers = await (await getAI("industry-connector"))!.providers();

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
