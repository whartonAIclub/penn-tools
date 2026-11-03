// Choose My MBA Major. The core loop: students rate their interest in each
// MBA course offered this term from 1 to 5, and see their ranking. The course
// list ships with the tool (tools/choose-mba-major/src/currentCatalog.ts,
// refreshed each semester), so nothing here needs sign-in: ratings stay in
// the student's browser.

import type { Metadata } from "next";
import { CURRENT_CATALOG, DEPARTMENTS, RATING_LABELS } from "@penntools/tool-choose-mba-major";
import { CourseRanker } from "./CourseRanker";

export const metadata: Metadata = {
  title: "Choose My MBA Major",
};

export default function ChooseMbaMajorPage() {
  return <CourseRanker catalog={CURRENT_CATALOG} departments={DEPARTMENTS} ratingLabels={RATING_LABELS} />;
}
