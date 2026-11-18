// Deadline Calendar: upload syllabus PDFs and see their deadlines. Everything
// runs on the AI API, so signed-out visitors are asked to sign in, and users
// out of free credit without a saved key are sent to Settings.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { MAX_PDF_BYTES } from "@penntools/tool-deadline-calendar";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { DeadlineCalendar } from "./DeadlineCalendar";

export const metadata: Metadata = {
  title: "Deadline Calendar",
};

export default async function DeadlineCalendarPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Deadline Calendar" />;

  const providers = await (await getAI("deadline-calendar"))!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Deadline Calendar" />;

  return <DeadlineCalendar providers={providers} labels={PROVIDER_LABELS} maxPdfBytes={MAX_PDF_BYTES} />;
}
