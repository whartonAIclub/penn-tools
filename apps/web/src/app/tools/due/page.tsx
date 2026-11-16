// Due: turn a course outline into calendar events with reminders. The AI reads
// the outline PDF, on the platform's free AI credit and then the student's own
// key (see tools/due/PLAN.md), so the page asks signed-out visitors to sign in
// and sends students out of credit without a saved key to Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_PDF_BYTES, SAMPLE_COURSE, SAMPLE_DEADLINES, SAMPLE_RECURRING } from "@penntools/tool-due";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Due } from "./Due";

export const metadata: Metadata = {
  title: "Due",
};

export default async function DuePage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Due" />;

  const providers = await (await getAI("due"))!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Due" />;

  return (
    <Due
      providers={providers}
      labels={PROVIDER_LABELS}
      maxPdfBytes={MAX_PDF_BYTES}
      sampleCourse={SAMPLE_COURSE}
      sampleDeadlines={SAMPLE_DEADLINES}
      sampleRecurring={SAMPLE_RECURRING}
    />
  );
}
