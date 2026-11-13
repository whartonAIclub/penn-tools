// Shown to students who have signed up, until matches are released: matching
// runs once, when the team releases it, not as each student signs up.

import type { Metadata } from "next";
import Link from "next/link";
import { toolSql } from "@penntools/platform/db";
import { listSignups, type Signup } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import styles from "../Connector.module.css";

export const metadata: Metadata = {
  title: "Connector",
};

/** The student's saved sign-up, null if they have none, or undefined if the database can't be read. */
async function loadSignup(userId: string): Promise<Signup | null | undefined> {
  const sql = toolSql("connector");
  if (!sql) return undefined;
  try {
    return (await listSignups(sql)).find((s) => s.id === userId) ?? null;
  } catch (error) {
    console.error("Connector: reading sign-ups failed", error);
    return undefined;
  }
}

export default async function ConnectorWaitingPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector" />;

  const signup = await loadSignup(user.id);

  if (signup === undefined) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Connector</h1>
        <p className={styles.error}>Connector&apos;s sign-ups couldn&apos;t be read right now. Try again in a moment.</p>
      </div>
    );
  }

  if (signup === null) {
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
      <h1 className={styles.title}>You&apos;re in, {signup.name.split(" ")[0]}!</h1>
      <p className={styles.intro}>
        We&apos;re gathering sign-ups so we can find people you&apos;ll genuinely click with. Matches will be released
        soon. Check back here to meet them.
      </p>
    </div>
  );
}
