// The page shell: sign-in, a check that the tool's database is ready, and the
// tabs. Everything inside needs a signed-in user and the database, so it's
// checked once here.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { checkDatabaseReady, databaseProblemMessage } from "@penntools/tool-pass-it-on";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { maybeDb } from "./db";
import { Nav } from "./Nav";
import styles from "./PassItOn.module.css";

export const metadata: Metadata = {
  title: "Pass It On",
};

export default async function PassItOnLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Pass It On" />;

  const sql = maybeDb();
  const problem = sql ? await checkDatabaseReady(sql) : "not_set_up";
  if (problem) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Pass It On</h1>
        <section className={styles.card}>
          <p className={styles.muted}>{sql ? databaseProblemMessage(problem) : "Pass It On's database isn't configured: DATABASE_URL is missing. Run `bash scripts/setup.sh` once."}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Pass It On</h1>
      <Nav />
      {children}
    </div>
  );
}
