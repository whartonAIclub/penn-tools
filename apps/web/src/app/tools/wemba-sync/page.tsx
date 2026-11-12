// WEMBA Sync: upload a class weekend's schedule PDF and see the weekend as a
// calendar, keep each course's syllabus for the semester, and add events
// outside class; all are saved to the student's account. Signed-out visitors are asked to sign in, and users without a
// saved key are sent to Settings, as in the Platform Playground.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import {
  MAX_PDF_BYTES,
  listEvents,
  listSyllabi,
  listWeekends,
  type SavedEvent,
  type SavedSyllabus,
  type SavedWeekend,
} from "@penntools/tool-wemba-sync";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { WembaSync } from "./WembaSync";
import { db } from "./db";

export const metadata: Metadata = {
  title: "WEMBA Sync",
};

export default async function WembaSyncPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="WEMBA Sync" />;

  const providers = await (await getAI())!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="WEMBA Sync" />;

  return (
    <WembaSync
      providers={providers}
      labels={PROVIDER_LABELS}
      maxBytes={MAX_PDF_BYTES}
      {...await saved(user.id)}
    />
  );
}

interface Saved {
  weekends: SavedWeekend[] | null;
  syllabi: SavedSyllabus[] | null;
  events: SavedEvent[] | null;
}

/**
 * The student's saved weekends, syllabi and events, or nulls if storage isn't
 * set up; reading a weekend's schedule works either way.
 */
async function saved(userId: string): Promise<Saved> {
  const none = { weekends: null, syllabi: null, events: null };
  const sql = db();
  if (!sql) return none;
  try {
    const [weekends, syllabi, events] = await Promise.all([
      listWeekends(sql, userId),
      listSyllabi(sql, userId),
      listEvents(sql, userId),
    ]);
    return { weekends, syllabi, events };
  } catch (error) {
    console.error("[wemba-sync] loading saved uploads failed", error);
    return none;
  }
}
