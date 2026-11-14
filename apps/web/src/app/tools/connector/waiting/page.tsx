// Shown to students who have signed up, until matches are released: matching
// runs once, when the team releases it (../team), not as each student signs
// up. Once a release has matched or waitlisted them, they go to ../groups.
// The sky shows the ending: only "your" stars are left, linked to as many
// matches as the student asked to meet.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toolSql } from "@penntools/platform/db";
import { getStatus, meetFormat, type MeetFormat, type Status } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { SkyScene } from "../sky/SkyContext";
import styles from "../Connector.module.css";

/** How many stars to link to, and who the student will meet, by how they'd like to meet. */
const ENDING: Record<MeetFormat, { stars: number; who: string }> = {
  "one-on-one": { stars: 1, who: "one person" },
  "small-group": { stars: 3, who: "a small group" },
  either: { stars: 2, who: "your people" },
};

export const metadata: Metadata = {
  title: "Connector",
};

// Always show the student's current status, never a cached page.
export const dynamic = "force-dynamic";

/** Where the student stands, or null if Connector's database can't be read. */
async function loadStatus(userId: string): Promise<Status | null> {
  const sql = toolSql("connector");
  if (!sql) return null;
  try {
    return await getStatus(sql, userId);
  } catch (error) {
    console.error("Connector: reading a student's status failed", error);
    return null;
  }
}

export default async function ConnectorWaitingPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector" />;

  const status = await loadStatus(user.id);
  if (status?.kind === "matched" || status?.kind === "waitlisted") redirect("/tools/connector/groups");

  if (!status) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Connector</h1>
        <p className={styles.error}>Connector&apos;s sign-ups couldn&apos;t be read right now. Try again in a moment.</p>
      </div>
    );
  }

  if (status.kind === "not-signed-up") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Connector</h1>
        <p className={styles.intro}>You haven&apos;t signed up yet. Answer a few quick questions to be matched.</p>
        <div>
          <Link href="/tools/connector" className={styles.button}>
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  const ending = ENDING[meetFormat(status.signup)];
  return (
    <div className={styles.page}>
      <SkyScene progress={1} matches={ending.stars} />
      <h1 className={styles.title}>You&apos;re in. Now we find your people.</h1>
      <p className={styles.intro}>
        Thanks for answering, {status.signup.name.split(" ")[0]}. When matches are released, you&apos;ll meet{" "}
        {ending.who} from beyond your usual circle. Check back here to meet them.
      </p>
    </div>
  );
}
