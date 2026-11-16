// Paper TL;DR. The landing page shows to everyone; only simplifying a paper
// needs sign-in (and, once the free AI credit is used, a saved key), so the
// page says what's missing next to the button instead of blocking the page.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { getAI } from "@/lib/ai";
import PaperTldr from "./PaperTldr";

export const metadata: Metadata = {
  title: "Paper TL;DR",
};

export default async function PaperTldrPage() {
  const ai = await getAI("paper-tldr"); // null when signed out
  const providers = ai ? await ai.providers() : [];
  return <PaperTldr signedIn={ai !== null} providers={providers} labels={PROVIDER_LABELS} />;
}
