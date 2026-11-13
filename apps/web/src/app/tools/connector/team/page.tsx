// Connector's team page: how many students are waiting, the groups a release
// would make right now, and the button to release them. Only the team can see
// it (./access.ts).

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { previewRelease, type GroupingResult } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { canRelease } from "./access";
import { ReleaseButton } from "./ReleaseButton";
import styles from "../Connector.module.css";

export const metadata: Metadata = {
  title: "Connector team",
};

// Always show the current sign-ups, never a cached page.
export const dynamic = "force-dynamic";

async function loadPreview(): Promise<GroupingResult | null> {
  const sql = toolSql("connector");
  if (!sql) return null;
  try {
    return await previewRelease(sql);
  } catch (error) {
    console.error("Connector: previewing a release failed", error);
    return null;
  }
}

export default async function ConnectorTeamPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector team" />;
  if (!canRelease(user)) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Connector team</h1>
        <p className={styles.intro}>This page is for the Connector team.</p>
      </div>
    );
  }

  const preview = await loadPreview();
  if (!preview) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Connector team</h1>
        <p className={styles.error}>Connector&apos;s sign-ups couldn&apos;t be read right now. Try again in a moment.</p>
      </div>
    );
  }

  const { groups, waitlist } = preview;
  const waiting = groups.reduce((n, g) => n + g.members.length, 0) + waitlist.length;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Connector team</h1>
      <p className={styles.intro}>
        <strong>{waiting}</strong> student{waiting === 1 ? "" : "s"} waiting to be matched. Releasing now would make
        these pairs and groups. Nothing is saved until you release, and anyone who signs up in the meantime is
        included.
      </p>

      {groups.map((group, i) => (
        <section key={i} className={styles.card}>
          <strong>
            {group.members.length === 2 ? "One-on-one" : "Group"} {i + 1} · {group.score} shared answer
            {group.score === 1 ? "" : "s"}
          </strong>
          <ul>
            {group.members.map((m) => (
              <li key={m.id}>
                {m.name} · Cohort {m.cohort}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {waitlist.length > 0 && (
        <section className={styles.card}>
          <strong>Waitlist (next release)</strong>
          <ul>
            {waitlist.map((m) => (
              <li key={m.id}>
                {m.name} · Cohort {m.cohort}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReleaseButton disabled={groups.length === 0} />
    </div>
  );
}
