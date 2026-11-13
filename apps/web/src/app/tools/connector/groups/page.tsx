// Connector's results: the signed-in student's group, as a tile per person,
// and what the group has in common. Groups are made from every sign-up saved
// in Connector's database.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toolSql } from "@penntools/platform/db";
import { COHORTS, formGroups, listSignups, sharedAnswers } from "@penntools/tool-connector";
import type { Signup } from "@penntools/tool-connector";
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

/**
 * Whether the team has released matches. Until then students wait, since
 * groups worked out live would reshuffle with every new sign-up. Always false
 * for now: releasing (and saving the groups) comes next, and this will then
 * check for a release in the database.
 */
async function matchesReleased(): Promise<boolean> {
  return false;
}

/** Everyone's saved sign-ups, or null if Connector's database can't be read. */
async function loadSignups(): Promise<Signup[] | null> {
  const sql = toolSql("connector");
  if (!sql) return null;
  try {
    return await listSignups(sql);
  } catch (error) {
    console.error("Connector: reading sign-ups failed", error);
    return null;
  }
}

export default async function ConnectorGroupsPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Connector" />;

  if (!(await matchesReleased())) redirect("/tools/connector/waiting");

  const signups = await loadSignups();
  if (!signups) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Your group</h1>
        <p className={styles.notice}>Connector&apos;s sign-ups couldn&apos;t be read right now. Try again in a moment.</p>
      </div>
    );
  }

  if (!signups.some((s) => s.id === user.id)) {
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

  const { groups } = formGroups(signups);
  const group = groups.find((g) => g.members.some((m) => m.id === user.id));

  if (!group) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>You&apos;re on the waitlist</h1>
        <p className={styles.intro}>
          No group had room for you this round, so you&apos;ll be first in line for the next one. We&apos;ll let you
          know as soon as you&apos;re matched.
        </p>
      </div>
    );
  }

  // You first, then everyone else.
  const members = [...group.members].sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const shared = sharedAnswers(group.members);
  const others = members.filter((m) => m.id !== user.id);
  const email =
    `mailto:${others.map((m) => m.email).join(",")}` +
    `?subject=${encodeURIComponent("Hello from your Connector group!")}` +
    `&body=${encodeURIComponent(
      "Hi all! Connector matched us into a group. Want to grab lunch or coffee this week? When are you free?\n\n",
    )}`;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Meet your group</h1>
      <p className={styles.intro}>
        {members.length} people from {members.length} different cohorts, matched on how you like to spend your time.
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
          <p className={styles.intro}>Send your group a hello and pick a time to meet.</p>
        </div>
        <a href={email} className={styles.button}>
          Email your group
        </a>
      </section>
    </div>
  );
}
