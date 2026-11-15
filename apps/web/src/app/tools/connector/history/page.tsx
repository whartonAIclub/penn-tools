// Connector's past matches: every pair or group the signed-in student has
// been matched in, newest round first, so they can find people again.

import type { Metadata } from "next";
import Link from "next/link";
import { toolSql } from "@penntools/platform/db";
import { COHORTS, listMatches, type Match } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import styles from "../groups/Groups.module.css";
import history from "./History.module.css";

export const metadata: Metadata = {
  title: "Your past Connector matches",
};

// Always show the student's latest matches, never a cached page.
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

function cohortLabel(cohort: string): string {
  const cluster = COHORTS.find((c) => c.id === cohort)?.cluster;
  return cluster === undefined ? `Cohort ${cohort}` : `Cohort ${cohort} · Cluster ${cluster}`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** The student's matches, or null if Connector's database can't be read. */
async function loadMatches(userId: string): Promise<Match[] | null> {
  const sql = toolSql("connector");
  if (!sql) return null;
  try {
    return await listMatches(sql, userId);
  } catch (error) {
    console.error("Connector: reading past matches failed", error);
    return null;
  }
}

export default async function ConnectorHistoryPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector" />;

  const matches = await loadMatches(user.id);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Your past matches</h1>

      {matches === null && (
        <p className={styles.notice}>Connector&apos;s matches couldn&apos;t be read right now. Try again in a moment.</p>
      )}

      {matches?.length === 0 && (
        <p className={styles.intro}>No matches yet. Once you&apos;re matched, every round shows up here.</p>
      )}

      {matches?.map((match) => {
        const others = match.members.filter((m) => m.id !== user.id);
        const isPair = match.members.length === 2;
        return (
          <section key={match.releaseId} className={styles.card}>
            <div className={history.header}>
              <h2 className={history.round}>
                Round {match.round} · {isPair ? "One-on-one" : `Group of ${match.members.length}`}
              </h2>
              <span className={history.meta}>
                {dateFormat.format(match.releasedAt)}
                {match.met === true && " · 👍 Met"}
                {match.met === false && " · Didn't meet"}
              </span>
            </div>
            <ul className={history.people}>
              {others.map((m) => (
                <li key={m.id} className={history.person}>
                  <span className={history.avatar} aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <span>
                    <span className={history.name}>{m.name}</span>
                    <span className={history.meta}>{cohortLabel(m.cohort)}</span>
                  </span>
                  <a href={`mailto:${m.email}`} className={history.email}>
                    Email
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div>
        <Link href="/tools/connector/groups" className={styles.link}>
          ← Back to your current match
        </Link>
      </div>
    </div>
  );
}
