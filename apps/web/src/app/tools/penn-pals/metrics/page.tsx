// Penn Pals usage numbers, for the team only: signed-out visitors are asked to
// sign in, and signed-in people who aren't on the list (metrics/access.ts) see
// "Sorry, you don't have access" and none of the numbers.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { canViewMetrics, getMetrics, THANK_YOU_ON_TIME_DAYS, type PennPalsMetrics } from "@penntools/tool-penn-pals";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { METRICS_VIEWERS } from "./access";
import styles from "./Metrics.module.css";

export const metadata: Metadata = {
  title: "Penn Pals: metrics",
};

// Always the current numbers, never a copy made at build time.
export const dynamic = "force-dynamic";

const oneDecimal = (n: number | null) => (n === null ? "-" : n.toFixed(1));
const percent = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);

export default async function PennPalsMetricsPage({ searchParams }: { searchParams?: { as?: string } }) {
  const user = await getCurrentUser();
  if (!user) return <SignInPrompt title="Penn Pals metrics" />;
  // TEST MODE (development only): ?as=someone@example.com checks access as that email, with the production rules.
  const isProduction = process.env.NODE_ENV === "production";
  const pretendEmail = !isProduction ? searchParams?.as : undefined;
  if (!canViewMetrics(pretendEmail ?? user.email, METRICS_VIEWERS, pretendEmail ? true : isProduction)) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Sorry, you don&apos;t have access</h1>
        <p className={styles.intro}>The Penn Pals metrics are only for the team. Ask the team if you think you should have access.</p>
      </div>
    );
  }

  let metrics: PennPalsMetrics | null = null;
  try {
    const sql = toolSql("pennpals");
    if (!sql) throw new Error("Penn Pals' database is not configured (check DATABASE_URL).");
    metrics = await getMetrics(sql);
  } catch (error) {
    console.error("[penn-pals] couldn't read the metrics", error);
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Penn Pals metrics</h1>
      <p className={styles.intro}>Usage across everyone who has saved a chat while signed in. Counts only: no names, notes or contacts.</p>

      {!metrics ? (
        <p className={styles.problem}>
          The numbers aren&apos;t available yet. The tool&apos;s database (<code>pennpals</code>) has to be registered by the Platform team and the
          app redeployed.
        </p>
      ) : (
        <>
          <div className={styles.grid}>
            <Stat label="Users using the tool" value={String(metrics.users)} note="Signed in, with at least one saved chat" />
            <Stat label="Total chat submissions" value={String(metrics.chats)} note="Every chat saved, including repeat chats with the same person" />
            <Stat label="Average chats per user" value={oneDecimal(metrics.chatsPerUser)} note="Total chats ÷ users" />
            <Stat label="Total people talked to" value={String(metrics.people)} note="Different people, counted per user and added up" />
            <Stat label="Average people per user" value={oneDecimal(metrics.peoplePerUser)} note="Total people ÷ users" />
          </div>

          <h2 className={styles.subtitle}>Follow-through</h2>
          <div className={styles.grid}>
            <Stat
              label={`Thank-yous sent within ${THANK_YOU_ON_TIME_DAYS} days`}
              value={percent(metrics.followThrough.onTimeRate)}
              note={`${metrics.followThrough.thankYousOnTime} of ${metrics.followThrough.thankYousSent} thank-yous marked done`}
            />
            <Stat label="Thank-yous sent" value={String(metrics.followThrough.thankYousSent)} note="Marked done in the tool" />
            <Stat label="Check-ins completed" value={String(metrics.followThrough.checkInsDone)} note="Marked done in the tool" />
          </div>

          <h2 className={styles.subtitle}>Retention</h2>
          <div className={styles.grid}>
            <Stat label="Active in the last 7 days" value={String(metrics.retention.activeThisWeek)} note="Saved a chat or finished a follow-up" />
            <Stat label="Came back" value={String(metrics.retention.returningUsers)} note="Active in 2 or more different weeks" />
            <Stat label="Return rate" value={percent(metrics.retention.returningRate)} note="Came back ÷ users" />
          </div>

          <h2 className={styles.subtitle}>How it&apos;s counted</h2>
          <ul className={styles.notes}>
            <li>Only signed-in users are counted. Using Penn Pals signed out isn&apos;t recorded.</li>
            <li>A chat is counted once when it&apos;s saved. Editing a contact doesn&apos;t add one, and deleting a contact doesn&apos;t remove it.</li>
            <li>
              A person counts once per user however many chats there are with them. If someone clears their browser data and logs the same person
              again, that person counts again.
            </li>
            <li>
              A follow-up is counted once, when it&apos;s first marked done; un-doing it later doesn&apos;t remove it. Only follow-ups finished from now on are
              counted, and only by signed-in users.
            </li>
            <li>
              &quot;Within {THANK_YOU_ON_TIME_DAYS} days&quot; counts from the chat&apos;s date to the day the thank-you was marked done, among the thank-yous
              marked done (not the ones still open).
            </li>
            <li>Weeks run Monday to Sunday, in UTC. Activity is a saved chat or a follow-up marked done.</li>
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.value}>{value}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.note}>{note}</span>
    </div>
  );
}
