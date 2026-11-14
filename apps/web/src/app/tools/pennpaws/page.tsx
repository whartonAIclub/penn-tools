// PennPaws: students find a verified fellow student to look after their pet.
// Signed-out visitors are asked to sign in. First-time members pick a role,
// pass the Penn email check (Penn is the pilot school) and answer the survey
// before they see the tool. AI is optional, so users without a saved key still get the whole
// tool.

import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { toolSql } from "@penntools/platform/db";
import {
  firstName,
  getMember,
  listMyRequests,
  listMyReviews,
  listNotifications,
  listOpenRequests,
  listPets,
  isPaused,
  isTeamEmail,
  listSitterJobs,
  matchRequests,
  postedRates,
  savePetFromProfile,
  verifySchool,
  type Pet,
} from "@penntools/tool-pennpaws";
import { getAI } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { isPennEmail } from "@/lib/pennEmail";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { Onboarding } from "./Onboarding";
import { PennPaws } from "./PennPaws";
import { TestMenu } from "./TestMenu";
import { ALLOW_LOCAL_TEST_ACCOUNT } from "./school";

// PennPaws's type: Fraunces, a soft heavy serif, for headlines, and Manrope
// for everything else. next/font bundles both at build time, so the page
// never loads anything from Google while someone uses it.
const display = Fraunces({ subsets: ["latin"], variable: "--pp-display", axes: ["SOFT", "opsz"], display: "swap" });
const body = Manrope({ subsets: ["latin"], variable: "--pp-body", display: "swap" });
const fonts = `${display.variable} ${body.variable}`;

export const metadata: Metadata = {
  title: "PennPaws",
};

export default async function PennPawsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <SignInPrompt
        title="PennPaws"
        message="Going away? Find a verified student to walk your dog or visit your cat, or offer to help. Everyone here signs in with a Penn email."
      />
    );
  }

  const sql = toolSql("pennpaws");
  if (!sql) throw new Error("PennPaws's database is not configured (check DATABASE_URL).");

  const school = verifySchool(user.email, ALLOW_LOCAL_TEST_ACCOUNT);
  const member = await getMember(sql, user.id);
  // Members are called what they chose at setup; before that, their Google first name (the local test account's "Local Developer" isn't a name).
  const googleName = user.email === "dev@localhost" ? "" : (user.name ?? "");
  const shownName = member?.name ?? googleName;
  const userFirstName = shownName.trim() ? firstName(shownName) : "there";
  // The local test user under `pnpm dev` gets a Test menu to play the other side and start over.
  const testMenu = ALLOW_LOCAL_TEST_ACCOUNT && !isPennEmail(user.email) ? <TestMenu /> : null;
  if (!member || !school) {
    return (
      <div className={fonts}>
        <Onboarding name={member?.name ?? googleName} email={user.email} school={school} initial={member?.profile ?? null} />
        {testMenu}
      </div>
    );
  }

  const isSitter = member.role === "sitter";
  const [open, mine, notifications, providers, jobs, reviews, paused] = await Promise.all([
    // Only sitters browse open requests, so nobody else is even sent them.
    isSitter ? listOpenRequests(sql, user.id) : [],
    listMyRequests(sql, user.id),
    listNotifications(sql, user.id),
    getAI("pennpaws").then((ai) => ai?.providers() ?? []),
    isSitter ? listSitterJobs(sql, user.id) : [],
    isSitter ? listMyReviews(sql, user.id) : [],
    isPaused(sql, user.id),
  ]);
  // What members here ask to pay, so the pay step suggests from the real
  // market rather than a rate we guessed once.
  const rates = member.profile.role === "owner" ? await postedRates(sql) : {};
  const matches = member.profile.role === "sitter" ? await matchRequests(sql, member.profile, open.filter((r) => !r.mine)) : [];
  // An owner's saved pets. The pet they described at setup becomes the first
  // one, so My Pets is never empty for someone who has already answered.
  let pets: Pet[] = [];
  if (member.profile.role === "owner") {
    await savePetFromProfile(sql, user.id, member.profile.pet);
    pets = await listPets(sql, user.id);
  }

  return (
    <div className={fonts}>
      <PennPaws
        userFirstName={userFirstName}
        pennVerified={isPennEmail(user.email)}
        email={user.email}
        member={member}
        open={open}
        matches={matches}
        mine={mine}
        pets={pets}
        rates={rates}
        jobs={jobs}
        reviews={reviews}
        notifications={notifications}
        hasAI={providers.length > 0}
        isTeam={isTeamEmail(user.email, ALLOW_LOCAL_TEST_ACCOUNT)}
        paused={paused}
      />
      {testMenu}
    </div>
  );
}
