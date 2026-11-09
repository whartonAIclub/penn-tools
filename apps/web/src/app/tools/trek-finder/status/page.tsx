// Trek Finder's import status: what each Google Sheet import loaded and which
// rows it skipped, so the people editing the Sheet can fix them.

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import { listImportRuns } from "@penntools/tool-trek-finder";
import type { ImportProblem, ImportRunStatus } from "@penntools/tool-trek-finder";
import styles from "./status.module.css";

export const metadata: Metadata = {
  title: "Trek Finder import status",
};

// A new import can land at any time, so never serve a built copy of this page.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<ImportRunStatus, string> = {
  ok: "Loaded",
  partial: "Loaded, some rows skipped",
  aborted: "Stopped, catalog unchanged",
  failed: "Failed",
};

const startedAt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

function whereItHappened(problem: ImportProblem): string {
  return [
    problem.tab,
    problem.row === null ? null : `Row ${problem.row}`,
    problem.tripId,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function TrekFinderStatusPage() {
  const sql = toolSql("trekfinder");
  if (!sql) throw new Error("Trek Finder's database is not configured (check DATABASE_URL).");

  const runs = await listImportRuns(sql);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Import status</h1>
        <p className={styles.intro}>Recent imports from the Trek Finder Google Sheet. Times are Eastern.</p>
      </header>

      {runs.length === 0 ? (
        <p className={styles.empty}>No imports have run yet.</p>
      ) : (
        <ol className={styles.runs}>
          {runs.map((run) => (
            <li key={run.id} className={styles.run}>
              <div className={styles.summary}>
                <span className={styles.status}>{STATUS_LABELS[run.status] ?? run.status}</span>
                <time className={styles.time} dateTime={run.startedAt}>
                  {startedAt.format(new Date(run.startedAt))}
                </time>
              </div>
              <p className={styles.counts}>
                {run.tripsLoaded} {run.tripsLoaded === 1 ? "trip" : "trips"} loaded
                {run.problems.length > 0 &&
                  `, ${run.problems.length} ${run.problems.length === 1 ? "problem" : "problems"}`}
              </p>
              {run.problems.length > 0 && (
                <ul className={styles.problems}>
                  {run.problems.map((problem, index) => (
                    <li key={index}>
                      {whereItHappened(problem) && <span className={styles.where}>{whereItHappened(problem)}: </span>}
                      {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
