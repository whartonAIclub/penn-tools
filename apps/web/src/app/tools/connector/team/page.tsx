// Connector's team page: how many students are waiting, the groups a release
// would make right now, and the button to release them. Only the team can see
// it (./access.ts).

import type { Metadata } from "next";
import { toolSql } from "@penntools/platform/db";
import {
  cohortClashes,
  matchQuality,
  previewRelease,
  SCORED_QUESTIONS,
  WEAK_MATCH_QUALITY,
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
  const rows = groups.map((group, i) => ({
    number: i + 1,
    isPair: group.members.length === 2,
    members: group.members,
    quality: matchQuality(group.members),
    clashes: cohortClashes(group.members),
  }));
  const waiting = groups.reduce((n, g) => n + g.members.length, 0) + waitlist.length;
  const pairCount = rows.filter((r) => r.isPair).length;
  const groupCount = rows.length - pairCount;
  const clashed = rows.filter((r) => r.clashes > 0);
  const weak = rows.filter((r) => r.quality < WEAK_MATCH_QUALITY);
  const average = rows.length === 0 ? 0 : rows.reduce((total, r) => total + r.quality, 0) / rows.length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
            : `${average.toFixed(1)} of ${SCORED_QUESTIONS} answers in common on average; ${
                weak.length === 0
                  ? "no weak matches."
                  : `${plural(weak.length, "weak match")} (${weak.map((r) => `#${r.number}`).join(", ")}) with fewer than ${WEAK_MATCH_QUALITY} in common.`
              }`}
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
                  <td className={r.quality < WEAK_MATCH_QUALITY ? team.flag : undefined}>
                    {r.quality.toFixed(1)} / {SCORED_QUESTIONS}
                    {r.quality < WEAK_MATCH_QUALITY && " · weak"}
                  </td>
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
