// Choose My MBA Major. The core loop: students rate their interest in each
// MBA course offered this term from 1 to 5, and see their ranking. The course
// list ships with the tool (tools/choose-mba-major/src/currentCatalog.ts,
// refreshed each semester), so nothing here needs sign-in: ratings stay in
// the student's browser.
//
// Students considering an individualized major also get a builder for their
// proposal. Its Claude suggestions are the one part that needs sign-in and the
// student's own Anthropic key, so the page checks for both and tells the
// builder; everything else in it works signed out.

import type { Metadata } from "next";
import { CURRENT_CATALOG, DEPARTMENTS, RATING_LABELS, SUGGESTION_PROVIDER } from "@penntools/tool-choose-mba-major";
import { getAI } from "@/lib/ai";
import { CourseRanker } from "./CourseRanker";
import type { SuggestionAccess } from "./IndividualizedMajor";

export const metadata: Metadata = {
  title: "Choose My MBA Major",
};

async function suggestionAccess(): Promise<SuggestionAccess> {
  const ai = await getAI();
  if (!ai) return "signed_out";
  return (await ai.providers()).includes(SUGGESTION_PROVIDER) ? "ready" : "no_key";
}

export default async function ChooseMbaMajorPage() {
  return (
    <CourseRanker
      catalog={CURRENT_CATALOG}
      departments={DEPARTMENTS}
      ratingLabels={RATING_LABELS}
      suggestionAccess={await suggestionAccess()}
    />
  );
}
