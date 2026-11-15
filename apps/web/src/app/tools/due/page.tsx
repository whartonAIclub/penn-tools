// Due: turn a course outline into calendar events with reminders. For now the
// page runs on made-up sample deadlines; reading the PDF with the AI API comes
// next (see tools/due/PLAN.md).

import type { Metadata } from "next";
import { SAMPLE_COURSE, SAMPLE_DEADLINES } from "@penntools/tool-due";
import { Due } from "./Due";

export const metadata: Metadata = {
  title: "Due",
};

export default function DuePage() {
  return <Due sampleCourse={SAMPLE_COURSE} sampleDeadlines={SAMPLE_DEADLINES} />;
}
