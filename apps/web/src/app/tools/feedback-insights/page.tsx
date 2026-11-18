// Feedback Insights: upload a survey export, get ranked themes, flagged
// responses and recommended changes. The file is read and analyzed in the
// browser, so the page works signed out; only "Tag with AI" needs a signed-in
// user, and asks for one there.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackInsights } from "./FeedbackInsights";

export const metadata: Metadata = {
  title: "Feedback Insights",
};

export default async function FeedbackInsightsPage() {
  // Null when signed out; no providers when the free credit is used and no key is saved.
  const [user, ai] = await Promise.all([getCurrentUser(), getAI("feedback-insights")]);
  const providers = ai ? await ai.providers() : [];
  return <FeedbackInsights signedIn={ai !== null} userId={user?.id ?? null} providers={providers} labels={PROVIDER_LABELS} />;
}
