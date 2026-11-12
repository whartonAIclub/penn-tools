// Penn Pals tracker: a form to log a chat, and a list of who to follow
// up with. No AI and no sign-in: contacts are saved in this browser only.

import type { Metadata } from "next";
import { Tracker } from "./Tracker";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

export default function PennPalsTrackerPage() {
  return <Tracker />;
}
