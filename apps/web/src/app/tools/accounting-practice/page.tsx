// Accounting Practice: pick a topic, answer five questions with feedback after
// each, then see what to review. The game runs in the browser (Practice.tsx);
// this server page decides which questions it may show.

import type { Metadata } from "next";
import { TOPICS, playableTopics } from "@penntools/tool-accounting-practice";
import type { GameMode } from "@penntools/tool-accounting-practice";
import { Practice } from "./Practice";

export const metadata: Metadata = {
  title: "Accounting Practice",
};

// `pnpm dev` on a team member's computer runs in development: a preview that
// includes questions still awaiting review. The deployed site, and any team
// test instance, run in production, where only verified questions are shown.
// The filtering happens here, on the server, so unverified questions are never
// sent to a live visitor's browser.
const MODE: GameMode = process.env["NODE_ENV"] === "development" ? "preview" : "live";

export default function AccountingPracticePage() {
  const topics = playableTopics(TOPICS, MODE);
  const pendingCount = topics
    .flatMap((topic) => topic.questions)
    .filter((question) => question.review.status !== "verified").length;

  return <Practice topics={topics} pendingCount={pendingCount} />;
}
