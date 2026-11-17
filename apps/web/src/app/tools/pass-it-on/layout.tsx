// The page shell: sign-in, a check that the tool's database is ready, that the
// user is on the board's list or is a site admin, and the tabs. Each page checks
// again (see access.ts): a page can be requested without this layout running.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { checkDatabaseReady, databaseProblemMessage } from "@penntools/tool-pass-it-on";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { NOT_MEMBER_MESSAGE, getAccess } from "./access";
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

  const access = await getAccess();
  if (access.kind !== "member") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Pass It On</h1>
        <section className={styles.card}>
          <p>{access.kind === "unavailable" ? access.message : NOT_MEMBER_MESSAGE}</p>
          {access.kind === "not_member" && access.email && <p className={styles.muted}>You&apos;re signed in as {access.email}.</p>}
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
