// Penn Pals "Log a chat": tell the AI about the chat or fill in the form
// yourself. The form works signed out; the AI needs sign-in and a saved key,
// so this server component looks those up and passes them down.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { getAI } from "@/lib/ai";
import { Tracker } from "./Tracker";

export const metadata: Metadata = {
  title: "Penn Pals: Network Tracker",
};

export default async function PennPalsTrackerPage() {
  const ai = await getAI(); // null when signed out
  const providers = ai ? await ai.providers() : [];
  return <Tracker ai={{ signedIn: Boolean(ai), providers, labels: PROVIDER_LABELS }} />;
}
