// Recruiting Helper: paste job postings and LinkedIn profiles (text or
// screenshots), get them scored against your own target companies and roles,
// and keep a ranked list. The profile and list are saved to the signed-in
// user's account, in the tool's own database (tools/recruiting-helper/schema.sql),
// so they follow the user to any device.

import type { Metadata } from "next";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { toolSql } from "@penntools/platform/db";
import {
  MAX_BACKGROUND_LENGTH,
  MAX_PASTE_LENGTH,
  MAX_RESUME_BYTES,
  MAX_SCREENSHOTS,
  SAMPLE_LINKEDIN,
  SAMPLE_POSTING,
  SAMPLE_PROFILE,
  getProfile,
  listItems,
} from "@penntools/tool-recruiting-helper";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { RecruitingHelper } from "./RecruitingHelper";

export const metadata: Metadata = {
  title: "Recruiting Helper",
};

export default async function RecruitingHelperPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Recruiting Helper" />;

  const providers = await (await getAI("recruiting-helper"))!.providers();
  if (providers.length === 0) return <ApiKeyPrompt title="Recruiting Helper" />;

  const sql = toolSql("recruitinghelper");
  if (!sql) throw new Error("Recruiting Helper's database is not configured (check DATABASE_URL).");
  const [profile, items] = await Promise.all([getProfile(sql, user.id), listItems(sql, user.id)]);

  return (
    <RecruitingHelper
      userId={user.id}
      initialProfile={profile}
      initialItems={items}
      providers={providers}
      labels={PROVIDER_LABELS}
      samples={{ profile: SAMPLE_PROFILE, posting: SAMPLE_POSTING, linkedIn: SAMPLE_LINKEDIN }}
      limits={{
        pasteLength: MAX_PASTE_LENGTH,
        screenshots: MAX_SCREENSHOTS,
        resumeBytes: MAX_RESUME_BYTES,
        backgroundLength: MAX_BACKGROUND_LENGTH,
      }}
    />
  );
}
