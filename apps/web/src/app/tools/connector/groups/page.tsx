// Connector's results: the signed-in student's group, as cards to flip over
// one by one (RevealCards), each with the person's email, so they can reach out.
// Below the match, the student says whether they met, then can join the next
// round (NextRound). Earlier rounds are in ../history. Groups are the ones saved when the team
// released matches (team/), so they never reshuffle. Students not matched yet
// wait (../waiting), or are told they're first in line if the last release
// had no room for them. For a matched student, the sky links their star to
// one star per person they were matched with. Under the tiles: what the whole
// match has in common (a ready-made first plan), and a nudge for students who
// said they'd make the plan.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toolSql } from "@penntools/platform/db";
import { COHORTS, commonThreads, getStatus, planning, type Signup, type Status } from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { SkyScene } from "../sky/SkyContext";
import { NextRound } from "./NextRound";
import { RevealCards, type Card } from "./RevealCards";
import styles from "./Groups.module.css";

export const metadata: Metadata = {
  title: "Your Connector group",
};

function cohortLabel(cohort: string): string {
  const cluster = COHORTS.find((c) => c.id === cohort)?.cluster;
  return cluster === undefined ? `Cohort ${cohort}` : `Cohort ${cohort} · Cluster ${cluster}`;
}

function toCard(person: Signup): Card {
  return {
    id: person.id,
    name: person.name,
    initials: initials(person.name),
    cohort: cohortLabel(person.cohort),
    email: person.email,
  };
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
          We couldn&apos;t find you a good match this round, so you&apos;re first in line for round {status.nextRound}.
          We&apos;ll email you when it&apos;s released.
        </p>
        <PastMatchesLink />
      </div>
    );
  }

  const group = status.match;
  // A one-on-one match is a group of 2.
  const isPair = group.members.length === 2;

  // You first, then everyone else.
  const members = [...group.members].sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const thread = commonThreads(members)[0];
  const you = members.find((m) => m.id === user.id);
  const isPlanner = you !== undefined && planning(you) > 0;
  const others = members.filter((m) => m.id !== user.id);
  const greeting = isPair ? `Hi ${others[0]!.name.split(" ")[0]}!` : "Hi all!";
  const idea = thread?.questionId === "free-day" ? ` We both picked "${thread.answer}", so maybe that?` : "";
  const email =
    `mailto:${others.map((m) => encodeURIComponent(m.email)).join(",")}` +
    `?subject=${encodeURIComponent(isPair ? "Hello from your Connector match 👋" : "Hello from your Connector group 👋")}` +
    `&body=${encodeURIComponent(
      `${greeting} Connector matched us. Want to meet up this week?${idea} When are you free?\n\n${you?.name.split(" ")[0] ?? ""}`,
    )}`;

  return (
    <div className={styles.page}>
      <SkyScene progress={1} matches={members.length - 1} />
      <p className={styles.round}>Round {group.round}</p>
      <h1 className={styles.title}>{isPair ? "Meet your match" : "Meet your group"}</h1>
      <p className={styles.intro}>
        {isPair ? "Someone we think you should meet." : "A few people we think you should meet."}
      </p>

      <RevealCards
        matchKey={String(group.releaseId)}
        you={toCard(you ?? members[0]!)}
        others={others.map(toCard)}
      />

      {thread && (
        <section className={styles.thread}>
          <h2 className={styles.label}>{isPair ? "Your thing" : "Your group's thing"}</h2>
          <p className={styles.threadAnswer}>{thread.answer}</p>
          <p className={styles.intro}>
            {isPair ? "You both" : `All ${members.length} of you`}{" "}
            {thread.questionId === "free-day" ? "picked it. Start there?" : "said so. A good place to start."}
          </p>
        </section>
      )}

      <section className={styles.reachOut}>
        <div>
          <h2 className={styles.reachOutTitle}>{isPlanner ? "You're a natural planner 🗓️" : "Make the first move"}</h2>
          <p className={styles.intro}>
            {isPlanner
              ? `Want to kick things off? Email ${isPair ? "your match" : "your group"} a time and place.`
              : isPair
                ? "Send a quick email to say hello and pick a time to meet."
                : "Send your group a quick email to say hello and pick a time to meet."}
          </p>
        </div>
        <a href={email} className={styles.button}>
          {isPair ? `Email ${others[0]!.name.split(" ")[0]}` : "Email your group"}
        </a>
      </section>

      <NextRound met={group.met} nextRound={status.nextRound} isPair={isPair} />

      {group.round > 1 && <PastMatchesLink />}
    </div>
  );
}

function PastMatchesLink() {
  return (
    <div>
      <Link href="/tools/connector/history" className={styles.link}>
        See your past matches →
      </Link>
    </div>
  );
}
