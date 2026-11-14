// Penn Pals landing page: follow-ups on the left, everyone the student has
// talked to on the right, from the contacts saved in this browser.

import type { Metadata } from "next";
import { AdminAccessLink } from "./AdminAccessLink";
import { Landing } from "./Landing";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

// Read per request: the admin link depends on who is signed in, and "today" must be today.
export const dynamic = "force-dynamic";

export default async function PennPalsPage() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return (
    <>
      <Landing today={today} />
      <AdminAccessLink />
    </>
  );
}
