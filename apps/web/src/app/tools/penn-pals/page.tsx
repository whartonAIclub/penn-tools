// Penn Pals landing page: follow-ups on the left, everyone the student has
// talked to on the right. Shows sample data until the tool has its own
// database (section 4 of CLAUDE.md).

import type { Metadata } from "next";
import { sampleNetwork } from "@penntools/tool-penn-pals";
import { Landing } from "./Landing";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

export default function PennPalsPage() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return <Landing contacts={sampleNetwork(now)} today={today} />;
}
