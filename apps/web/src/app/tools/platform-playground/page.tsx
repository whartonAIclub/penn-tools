// Platform Playground: working examples of the platform APIs, for tool teams.
// AskPenn (/tools/askpenn) is the other reference tool: streaming, chat
// history and a tool's own database. Signed-out visitors are asked to sign in,
// and users out of free credit without a saved key are sent to Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_PROMPT_LENGTH, MAX_QUERY_LENGTH, MAX_SYLLABUS_LENGTH, SAMPLE_SYLLABUS } from "@penntools/tool-platform-playground";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Playground } from "./Playground";

export const metadata: Metadata = {
  title: "Platform Playground",
};

export default async function PlatformPlaygroundPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Platform Playground" />;

  const providers = await (await getAI("platform-playground"))!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Platform Playground" />;

  return (
    <Playground
      providers={providers}
      labels={PROVIDER_LABELS}
      sampleSyllabus={SAMPLE_SYLLABUS}
      limits={{ prompt: MAX_PROMPT_LENGTH, syllabus: MAX_SYLLABUS_LENGTH, query: MAX_QUERY_LENGTH }}
    />
  );
}
