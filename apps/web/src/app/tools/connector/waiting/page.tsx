// Shown to students who have signed up, until matches are released: matching
// runs once, when the team releases it (../team), not as each student signs
// up. Once a release has matched or waitlisted them, they go to ../groups.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toolSql } from "@penntools/platform/db";
import { getStatus, type Status } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import styles from "../Connector.module.css";

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

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>You&apos;re in, {status.signup.name.split(" ")[0]}!</h1>
      <p className={styles.intro}>
        We&apos;re gathering sign-ups so we can find people you&apos;ll genuinely click with. Matches will be released
        soon. Check back here to meet them.
      </p>
    </div>
  );
}
