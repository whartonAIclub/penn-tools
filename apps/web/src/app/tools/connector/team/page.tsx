// Connector's team page: how many students are waiting, the groups a release
// would make right now, and the button to release them. Only the team can see
// it (./access.ts).

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import {
  cohortClashes,
  commonThreads,
  hasPlanner,
  matchQuality,
  previewRelease,
  qualityLabel,
  type GroupingResult,
} from "@penntools/tool-connector";
import { getCurrentUser } from "@/lib/auth";
import { SignInPrompt } from "@/components/layout/SignInPrompt";
import { canRelease } from "./access";
import { ReleaseButton } from "./ReleaseButton";
import styles from "../Connector.module.css";
import team from "./Team.module.css";

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
  const rows = groups.map((group, i) => {
    const quality = matchQuality(group.members);
    return {
      number: i + 1,
      isPair: group.members.length === 2,
      members: group.members,
      quality,
      label: qualityLabel(quality),
      clashes: cohortClashes(group.members),
      planner: hasPlanner(group.members),
      thread: commonThreads(group.members)[0]?.answer ?? null,
    };
  });
  const waiting = groups.reduce((n, g) => n + g.members.length, 0) + waitlist.length;
  const pairCount = rows.filter((r) => r.isPair).length;
  const groupCount = rows.length - pairCount;
  const clashed = rows.filter((r) => r.clashes > 0);
  const byLabel = (label: string) => rows.filter((r) => r.label === label);
  const noPlanner = rows.filter((r) => !r.planner);
  const noThread = rows.filter((r) => !r.isPair && r.thread === null);
  const average = rows.length === 0 ? 0 : rows.reduce((total, r) => total + r.quality, 0) / rows.length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const numbers = (list: typeof rows) => list.map((r) => `#${r.number}`).join(", ");

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Connector team</h1>
      <p className={styles.intro}>
        What releasing now would make. Nothing is saved until you release, and anyone who signs up in the meantime is
        included.
      </p>

      <ul className={team.summary}>
        <li>
          <strong>Matches:</strong> {plural(waiting, "student")} waiting, making {plural(pairCount, "one-on-one pair")}{" "}
          and {plural(groupCount, "group")}, with {waitlist.length} on the waitlist.
        </li>
        <li>
          <strong>Cohort clashes:</strong>{" "}
          {clashed.length === 0
            ? "none. Nobody is matched with someone from their own cohort."
            : `${plural(clashed.length, "group")} (${clashed.map((r) => `#${r.number}`).join(", ")}) ${
                clashed.length === 1 ? "has" : "have"
              } two people from the same cohort, so that everyone could be matched.`}
        </li>
        <li>
          <strong>Match quality:</strong>{" "}
          {rows.length === 0
            ? "no matches yet."
            : `${Math.round(average)}/100 on average: ${byLabel("Strong").length} strong, ${byLabel("Good").length} good and ${
                byLabel("Weak").length
              } weak${byLabel("Weak").length > 0 ? ` (${numbers(byLabel("Weak"))})` : ""}.`}
        </li>
        <li>
          <strong>Planners:</strong>{" "}
          {noPlanner.length === 0
            ? "every match has someone who'll make the plan."
            : `${plural(noPlanner.length, "match")} (${numbers(noPlanner)}) ${
                noPlanner.length === 1 ? "has" : "have"
              } nobody who'll make the plan; there weren't enough planners to go round.`}
        </li>
        <li>
          <strong>Common thread:</strong>{" "}
          {noThread.length === 0
            ? "every group shares something as a whole."
            : `${plural(noThread.length, "group")} (${numbers(noThread)}) ${
                noThread.length === 1 ? "shares" : "share"
              } nothing as a whole group.`}
        </li>
      </ul>

      {rows.length > 0 && (
        <div className={team.tableWrap}>
          <table className={team.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Members</th>
                <th>Match quality</th>
                <th>Common thread</th>
                <th>Planner</th>
                <th>Cohort clash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.number}>
                  <td>{r.number}</td>
                  <td>{r.isPair ? "One-on-one" : "Group"}</td>
                  <td>
                    {r.members.map((m) => (
                      <div key={m.id}>
                        {m.name} <span className={team.muted}>· {m.cohort}</span>
                      </div>
                    ))}
                  </td>
                  <td className={r.label === "Weak" ? team.flag : undefined}>
                    {Math.round(r.quality)}/100 · {r.label}
                  </td>
                  <td className={r.thread === null && !r.isPair ? team.flag : team.thread}>
                    {r.thread ?? (r.isPair ? "—" : "⚠ None")}
                  </td>
                  <td className={r.planner ? undefined : team.flag}>{r.planner ? "Yes" : "⚠ None"}</td>
                  <td className={r.clashes > 0 ? team.flag : undefined}>{r.clashes > 0 ? "⚠ Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
