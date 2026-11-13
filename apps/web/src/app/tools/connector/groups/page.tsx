// Connector's results: the signed-in student's group, as a tile per person,
// and what the group has in common. Groups are the ones saved when the team
// released matches (team/), so they never reshuffle. Students not matched yet
// wait (../waiting), or are told they're first in line if the last release
// had no room for them.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toolSql } from "@penntools/platform/db";
import { COHORTS, getStatus, sharedAnswers, type Status } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import styles from "./Groups.module.css";

export const metadata: Metadata = {
  title: "Your Connector group",
};

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

// Always show the student's current status, never a cached page.
export const dynamic = "force-dynamic";

export default async function ConnectorGroupsPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector" />;

  const status = await loadStatus(user.id);
  if (status?.kind === "waiting") redirect("/tools/connector/waiting");

  if (!status) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Your group</h1>
        <p className={styles.notice}>Connector&apos;s sign-ups couldn&apos;t be read right now. Try again in a moment.</p>
      </div>
    );
  }

  if (status.kind === "not-signed-up") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Your group</h1>
        <p className={styles.intro}>You haven&apos;t signed up yet. Answer a few quick questions to be matched.</p>
        <div>
          <Link href="/tools/connector" className={styles.button}>
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  if (status.kind !== "matched") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>You&apos;re on the waitlist</h1>
        <p className={styles.intro}>
          We couldn&apos;t find you a good match this round, so you&apos;ll be first in line for the next one. Check back
          here after the next release.
        </p>
      </div>
    );
  }

  const group = status.match;
  // A one-on-one match is a group of 2.
  const isPair = group.members.length === 2;

  // You first, then everyone else.
  const members = [...group.members].sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const shared = sharedAnswers(group.members);
  const others = members.filter((m) => m.id !== user.id);
  const email =
    `mailto:${others.map((m) => m.email).join(",")}` +
    `?subject=${encodeURIComponent(isPair ? "Hello from your Connector match!" : "Hello from your Connector group!")}` +
    `&body=${encodeURIComponent(
      isPair
        ? `Hi ${others[0]!.name.split(" ")[0]}! Connector matched us. Want to grab lunch or coffee this week? When are you free?\n\n`
        : "Hi all! Connector matched us into a group. Want to grab lunch or coffee this week? When are you free?\n\n",
    )}`;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{isPair ? "Meet your match" : "Meet your group"}</h1>
      <p className={styles.intro}>
        {isPair
          ? "Someone from another cohort, matched on how you like to spend your time."
          : `${members.length} people from ${members.length} different cohorts, matched on how you like to spend your time.`}
      </p>

      <ul className={styles.tiles}>
        {members.map((member) => {
          const isYou = member.id === user.id;
          return (
            <li key={member.id} className={isYou ? `${styles.tile} ${styles.you}` : styles.tile}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(member.name)}
              </span>
              <span className={styles.name}>{isYou ? "You" : member.name}</span>
              <span className={styles.cohort}>{cohortLabel(member.cohort)}</span>
            </li>
          );
        })}
      </ul>

      <section className={styles.card}>
        <h2 className={styles.label}>What you have in common</h2>
        {shared.length === 0 ? (
          <p className={styles.intro}>Nothing yet. Time to find out!</p>
        ) : (
          <ul className={styles.shared}>
            {shared.map((s) => (
              <li key={`${s.question}-${s.answer}`}>
                {s.question}: <strong>{s.answer}</strong>{" "}
                <span className={styles.count}>
                  ({s.count} of {members.length})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.reachOut}>
        <div>
          <h2 className={styles.reachOutTitle}>Make the first move</h2>
          <p className={styles.intro}>
            {isPair ? "Say hello and pick a time to meet." : "Send your group a hello and pick a time to meet."}
          </p>
        </div>
        <a href={email} className={styles.button}>
          {isPair ? `Email ${others[0]!.name.split(" ")[0]}` : "Email your group"}
        </a>
      </section>
    </div>
  );
}
