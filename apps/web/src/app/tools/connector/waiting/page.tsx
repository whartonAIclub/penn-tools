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
import waiting from "./Waiting.module.css";

/** How many stars to link to, and who the student will meet, by how they'd like to meet. */
const ENDING: Record<MeetFormat, { stars: number; who: string }> = {
  "one-on-one": { stars: 1, who: "someone" },
  "small-group": { stars: 3, who: "a few people" },
  either: { stars: 2, who: "people" },
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
      <div className={waiting.hero}>
        <Envelope />
        <p className={waiting.eyebrow}>
          {status.returning
            ? `You're in for round ${status.nextRound}, ${status.signup.name.split(" ")[0]} ✨`
            : `You're in, ${status.signup.name.split(" ")[0]} ✨`}
        </p>
        <h1 className={styles.title}>
          {status.returning ? "Your new matches are being picked" : "Your matches are being picked"}
        </h1>
        <p className={waiting.promise}>
          {status.returning && "Never anyone you've met through Connector before. "}
          We&apos;ll email you at <span className={waiting.email}>{status.signup.email}</span> when they&apos;re ready.
          Until then, you&apos;re free to go!
        </p>
        {status.returning && (
          <Link href="/tools/connector/history" className={waiting.link}>
            See your past matches →
          </Link>
        )}
      </div>

      <ol className={waiting.steps}>
        <li>
          <span className={waiting.stepNumber}>1</span>
          <span>
            <strong>We look across every cohort</strong> for {ending.who} with your energy, your idea of a good time,
            and what you value in a friend.
          </span>
        </li>
        <li>
          <span className={waiting.stepNumber}>2</span>
          <span>
            <strong>You get an email</strong> the moment your matches are ready.
          </span>
        </li>
        <li>
          <span className={waiting.stepNumber}>3</span>
          <span>
            <strong>You say hi</strong> and pick a time to meet. We&apos;ll even suggest what to do.
          </span>
        </li>
      </ol>
    </div>
  );
}

/** A sealed gold envelope that floats gently: your matches, on their way. */
function Envelope() {
  return (
    <div className={waiting.envelope} aria-hidden="true">
      <span className={waiting.envelopeFlap} />
      <span className={waiting.envelopeSeal}>✦</span>
    </div>
  );
}
