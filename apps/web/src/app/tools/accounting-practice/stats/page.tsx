// The team's private stats page: aggregate product metrics, no per-student
// data. Access is checked here on the server before any metrics are read, so a
// visitor who isn't allowed gets no data, whatever link they follow.
// Live: TEAM_USER_IDS (tools/accounting-practice/src/team.ts) and PennTools site
// admins (isAdmin, @/lib/admin). Local preview: any signed-in user, since it's
// the team member's own database.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { TOPICS, canOpenStats, excludedFromMetrics, getMetrics } from "@penntools/tool-accounting-practice";
import type { AccuracyRow, Metrics } from "@penntools/tool-accounting-practice";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { MODE } from "../mode";
import styles from "./Stats.module.css";

export const metadata: Metadata = {
  title: "Accounting Practice stats",
  robots: { index: false, follow: false },
};

const TITLE = "Accounting Practice stats";
/** Fewer answers than this, and a percentage says little. */
const SMALL_SAMPLE = 10;

export default async function StatsPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return <SignInPrompt title={TITLE} message="Sign in with a team account to see the stats." />;
  if (!(await canOpenStats(user.id, MODE, () => isAdmin(user)))) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.muted}>This page is only for the Accounting Practice team.</p>
      </div>
    );
  }

  const metrics = await loadMetrics();

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.muted}>
          Totals only, never individual students.{" "}
          {MODE === "live"
            ? "The team's own signed-in rounds are left out."
            : "Local preview: this is your computer's test data, with nothing left out."}
        </p>
      </div>

      {metrics === null ? (
        <p className={styles.notice} role="status">
          The metrics couldn&apos;t be loaded: the tool&apos;s database isn&apos;t available. If it&apos;s newly set up,
          check that the Platform team has enabled it.
        </p>
      ) : (
        <Dashboard week={metrics.week} all={metrics.all} />
      )}
    </div>
  );
}

async function loadMetrics(): Promise<{ week: Metrics; all: Metrics } | null> {
  const sql = toolSql("accountingpractice");
  if (!sql) return null;
  const excludeUserIds = excludedFromMetrics(MODE);
  try {
    const [week, all] = await Promise.all([
      getMetrics(sql, { window: "7d", excludeUserIds, topicOf }),
      getMetrics(sql, { window: "all", excludeUserIds, topicOf }),
    ]);
    return { week, all };
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
    console.error(
      "[accounting-practice] couldn't load stats:",
      typeof code === "string" ? code : "",
      typeof message === "string" ? message : "unknown error",
    );
    return null;
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function decimal(value: number | null, unit = ""): string {
  return value === null ? "—" : `${value.toFixed(1)}${unit}`;
}

function ofTotal(part: number, total: number, rate: number | null): string {
  return total === 0 ? "—" : `${part} of ${total} (${percent(rate)})`;
}

const topicTitle = new Map<string, string>([...TOPICS.map((topic) => [topic.id, topic.title] as const), ["mix", "Random Mix"]]);
const topicOfQuestion = new Map(TOPICS.flatMap((topic) => topic.questions.map((q) => [q.id, topic.id] as const)));
const topicOf = (questionId: string) => topicOfQuestion.get(questionId);
const questionConcept = new Map(TOPICS.flatMap((topic) => topic.questions).map((q) => [q.id, q.concept]));

// ── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ week, all }: { week: Metrics; all: Metrics }) {
  const rows = (pick: (m: Metrics) => string): [string, string] => [pick(week), pick(all)];

  return (
    <>
      <section className={styles.primary}>
        <h2 className={styles.primaryLabel}>Primary metric: completed a round and came back on another day</h2>
        <div className={styles.primaryValues}>
          <div>
            <span className={styles.big}>{percent(week.signedIn.completersWhoReturnedRate)}</span>
            <span className={styles.muted}>
              Last 7 days · {week.signedIn.completersWhoReturned} of {week.signedIn.usersWhoCompleted}
            </span>
          </div>
          <div>
            <span className={styles.big}>{percent(all.signedIn.completersWhoReturnedRate)}</span>
            <span className={styles.muted}>
              All time · {all.signedIn.completersWhoReturned} of {all.signedIn.usersWhoCompleted}
            </span>
          </div>
        </div>
        <p className={styles.hint}>Signed-in students only: returning needs an account to recognize.</p>
      </section>

      <MetricTable
        title="Signed-in rounds"
        note="Rounds played while signed in. Signed-out activity is counted separately below."
        rows={[
          ["Rounds started", ...rows((m) => String(m.signedInRounds.started))],
          ["Rounds completed", ...rows((m) => String(m.signedInRounds.completed))],
          ["Completion rate", ...rows((m) => percent(m.signedInRounds.completionRate))],
          ["Questions answered", ...rows((m) => String(m.signedInRounds.questionsAnswered))],
          ["Questions per round", ...rows((m) => decimal(m.signedInRounds.questionsPerRound))],
          ["Median time per completed round", ...rows((m) => decimal(m.signedInRounds.medianMinutesPerCompletedRound, " min"))],
        ]}
      />

      <MetricTable
        title="Signed-in students"
        note="Students recognized by their PennTools account."
        rows={[
          ["Unique students", ...rows((m) => String(m.signedIn.uniqueUsers))],
          ["Rounds by signed-in students", ...rows((m) => String(m.signedIn.rounds))],
          ["Completed at least one round", ...rows((m) => String(m.signedIn.usersWhoCompleted))],
          [
            "Practiced on 2+ different days",
            ...rows((m) => ofTotal(m.signedIn.returningUsers, m.signedIn.uniqueUsers, m.signedIn.returningRate)),
          ],
        ]}
      />

      <MetricTable
        title="Signed-out activity (approximate)"
        note="Daily totals only: signed-out rounds aren't kept, abandoned ones expire after 2 hours, and rounds started while 5,000 signed-out rounds were already in progress aren't counted. The 7-day column covers today and the 6 days before (Philadelphia time)."
        rows={[
          ["Rounds started", ...rows((m) => String(m.signedOut.roundsStarted))],
          ["Rounds completed", ...rows((m) => String(m.signedOut.roundsCompleted))],
          ["Completion rate", ...rows((m) => percent(m.signedOut.completionRate))],
          ["Questions answered", ...rows((m) => String(m.signedOut.questionsAnswered))],
          ["Accuracy", ...rows((m) => percent(m.signedOut.accuracy))],
        ]}
      />

      <AccuracyTable
        title="Accuracy by topic"
        note="Signed-in answers only."
        week={week.accuracyByTopic}
        all={all.accuracyByTopic}
        label={(row) => topicTitle.get(row.topicId) ?? row.topicId}
      />

      <AccuracyTable
        title="Accuracy by question"
        note="Signed-in answers only. Hardest first: a question most students miss may be confusing, or wrong, and worth a second look."
        week={week.accuracyByQuestion}
        all={all.accuracyByQuestion}
        label={(row) => `${row.questionId} · ${questionConcept.get(row.questionId ?? "") ?? "(retired question)"}`}
      />
    </>
  );
}

function MetricTable({ title, note, rows }: { title: string; note: string; rows: [string, string, string][] }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.hint}>{note}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Last 7 days</th>
              <th scope="col">All time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, week, all]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{week}</td>
                <td>{all}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccuracyTable({
  title,
  note,
  week,
  all,
  label,
}: {
  title: string;
  note?: string;
  week: readonly AccuracyRow[];
  all: readonly AccuracyRow[];
  label: (row: AccuracyRow) => string;
}) {
  const key = (row: AccuracyRow) => `${row.topicId}/${row.questionId ?? ""}`;
  const weekByKey = new Map(week.map((row) => [key(row), row]));
  const cell = (row: AccuracyRow | undefined) =>
    row ? (
      <>
        {percent(row.accuracy)} <span className={styles.count}>({row.correct}/{row.answered})</span>
        {row.answered < SMALL_SAMPLE && <span className={styles.small}> few answers</span>}
      </>
    ) : (
      "—"
    );

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      {note && <p className={styles.hint}>{note}</p>}
      {all.length === 0 ? (
        <p className={styles.muted}>No answers yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{title.endsWith("topic") ? "Topic" : "Question"}</th>
                <th scope="col">Last 7 days</th>
                <th scope="col">All time</th>
              </tr>
            </thead>
            <tbody>
              {all.map((row) => (
                <tr key={key(row)}>
                  <th scope="row">{label(row)}</th>
                  <td>{cell(weekByKey.get(key(row)))}</td>
                  <td>{cell(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
