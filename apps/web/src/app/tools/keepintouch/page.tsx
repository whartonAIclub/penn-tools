// Keep in Touch: remember the people you meet, and see who needs attention
// soonest. Contacts are personal, so signed-out visitors are asked to sign in.
// The AI API is optional: with a saved key, a quick note can fill in the add
// form; without one, people fill it in themselves.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import { CADENCES, DEFAULT_CADENCE_DAYS, LIMITS, MET_HOW, listContacts } from "@penntools/tool-keepintouch";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { KeepInTouch } from "./KeepInTouch";

export const metadata: Metadata = {
  title: "Keep in Touch",
};

export default async function KeepintouchPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Keep in Touch" />;

  const sql = toolSql("keepintouch");
  if (!sql) throw new Error("Keep in Touch's database is not configured (check DATABASE_URL).");

  // Today as YYYY-MM-DD in Penn's time zone (en-CA formats dates that way).
  // The page switches to the browser's own date once it loads.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  const ai = await getAI();
  const [contacts, providers] = await Promise.all([listContacts(sql, user.id), ai ? ai.providers() : []]);

  return (
    <KeepInTouch
      initialContacts={contacts}
      today={today}
      cadences={CADENCES}
      metHow={MET_HOW}
      defaultCadenceDays={DEFAULT_CADENCE_DAYS}
      limits={LIMITS}
      providers={providers}
      providerLabels={PROVIDER_LABELS}
    />
  );
}
