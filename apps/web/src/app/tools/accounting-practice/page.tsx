// Accounting Practice: pick a topic, answer five questions with feedback after
// each, then see what to review. The game runs in the browser (Practice.tsx);
// this server page decides which questions it may show. Anyone can play;
// signed-in students' rounds are linked to their PennTools account.

import type { Metadata } from "next";
import { TOPICS, playableTopics } from "@penntools/tool-accounting-practice";
import { getCurrentUser } from "@/lib/auth";
import { MODE } from "./mode";
import { Practice } from "./Practice";

export const metadata: Metadata = {
  title: "Accounting Practice",
};

export default async function AccountingPracticePage() {
  // The filtering happens here, on the server, so unverified questions are
  // never sent to a live visitor's browser (see mode.ts).
  const topics = playableTopics(TOPICS, MODE);
  const pendingCount = topics
    .flatMap((topic) => topic.questions)
    .filter((question) => question.review.status !== "verified").length;

  // Signing in is optional; if it can't be checked, play as signed out.
  const signedIn = await getCurrentUser().then(
    (user) => user !== null,
    () => false,
  );

  return <Practice topics={topics} pendingCount={pendingCount} signedIn={signedIn} />;
}
