// Connector: helps Wharton students meet people outside their usual circles.
// For now: the profile form, then the questions; nothing is saved yet. The
// questions and cohorts come from the tool's shared lists (questions.ts), which
// the matching reads too.

import type { Metadata } from "next";
import { COHORTS, QUESTIONS } from "@penntools/tool-connector";
import { Connector } from "./Connector";

export const metadata: Metadata = {
  title: "Connector",
};

export default function ConnectorPage() {
  return <Connector questions={QUESTIONS} cohorts={COHORTS} />;
}
