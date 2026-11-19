// The development preview's entry (/tools/handoff/preview, development only). Handoff.tsx loads it in a chunk of its own when the page
// has no mode (preview/page.tsx), so the live route's chunk (HandoffPrototype.jsx and what it imports) carries none of the preview.
// It renders App, the same app the live route runs, with the preview's kit: the sample market (seed: App's first state when this
// browser has no saved demo, and Reset demo) and its ids (SEED_IDS: the share sheet says when something was made in this browser),
// the feedback runtime (useRuntime), and the preview's own pages and dialogs (_preview/pages.jsx; the self-test page brings the rule
// self-tests, runSelfTests).
import React from "react";
import { seed, SEED_IDS } from "@penntools/tool-handoff/preview";
import App from "../HandoffPrototype";
import { useRuntime, WelcomeSheet, ProfilePage, HowPage, ReviewerPage, SelfTestPage, ClubsPage, FeedbackModal, ResultsPage } from "./pages";

/** What App reads from the preview (its preview prop), and only off the live route. */
const kit = {
  seed, SEED_IDS, useRuntime, WelcomeSheet, ProfilePage, HowPage, ReviewerPage, SelfTestPage, ClubsPage, FeedbackModal, ResultsPage,
};
/** @typedef {typeof kit} PreviewKit */

export default function Preview() {
  return <App preview={kit} />;
}
