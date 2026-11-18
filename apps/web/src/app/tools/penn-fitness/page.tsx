// Penn Fitness. Every part needs a signed-in user, so signed-out visitors get
// the standard sign-in screen. Signed in, the user's id (getCurrentUser().id)
// is what the tool's storage functions are scoped to: it's the only identity
// the tool uses, and it never makes its own.
//
// The pennfitness database isn't registered yet (see tools/penn-fitness/CLAUDE.md),
// so this page doesn't read or write data until it is.

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";

export const metadata: Metadata = {
  title: "Penn Fitness",
};

export default async function PennFitnessPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Fitness" />;

  return (
    <div>
      <h1>Penn Fitness</h1>
      <p>My fitness week is on its way: a weekly plan that fits short workouts into the gaps in your schedule.</p>
    </div>
  );
}
