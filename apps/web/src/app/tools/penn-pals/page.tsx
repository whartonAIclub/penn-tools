// Penn Pals landing page: follow-ups on the left, everyone the student has
// talked to on the right, from the user's saved contacts (their account when
// signed in, this browser otherwise).

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { AdminAccessLink } from "./AdminAccessLink";
import { Landing } from "./Landing";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

// Read per request: the admin link depends on who is signed in. ("Today" is
// worked out in the browser, in the user's own time zone, not here.)
export const dynamic = "force-dynamic";

export default async function PennPalsPage() {
  const signedIn = Boolean(await getCurrentUser());
  return (
    <>
      <Landing signedIn={signedIn} />
      <AdminAccessLink />
    </>
  );
}
