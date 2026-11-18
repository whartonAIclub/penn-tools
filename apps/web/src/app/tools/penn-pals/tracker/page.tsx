// Penn Pals "Log a chat": paste notes or screenshots for the AI, or fill in the form
// yourself. The form works signed out; the AI needs sign-in (free credit or a saved key),
// so this server component looks those up and passes them down.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { getAI } from "@/lib/ai";
import { AdminAccessLink } from "../AdminAccessLink";
import { Tracker } from "./Tracker";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

export default async function PennPalsTrackerPage() {
  const ai = await getAI("penn-pals"); // null when signed out
  const providers = ai ? await ai.providers() : [];
  return (
    <>
      <Tracker ai={{ signedIn: Boolean(ai), providers, labels: PROVIDER_LABELS }} />
      <AdminAccessLink />
    </>
  );
}
