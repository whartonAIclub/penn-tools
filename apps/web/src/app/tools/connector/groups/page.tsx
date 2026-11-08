// Connector's results: everyone's groups for this round, with what each group
// has in common. Runs on made-up sign-ups until the sign-up form saves real
// ones; then load those in place of SAMPLE_SIGNUPS.

import type { Metadata } from "next";
import { COHORTS, formGroups, SAMPLE_SIGNUPS, sharedAnswers } from "@penntools/tool-connector";
import type { Signup } from "@penntools/tool-connector";
import styles from "./Groups.module.css";

export const metadata: Metadata = {
  title: "Connector groups",
};

function cohortLabel(cohort: string): string {
  const cluster = COHORTS.find((c) => c.id === cohort)?.cluster;
  return cluster === undefined ? `Cohort ${cohort}` : `Cohort ${cohort} · Cluster ${cluster}`;
}

export default function ConnectorGroupsPage() {
  const signups: readonly Signup[] = SAMPLE_SIGNUPS;
  const { groups, waitlist } = formGroups(signups);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Your groups</h1>
      <p className={styles.notice}>
        Sample data: these groups are made from {signups.length} made-up sign-ups. Real sign-ups will appear here once
        the sign-up form saves them.
      </p>

      {groups.length === 0 && <p className={styles.intro}>Not enough sign-ups yet: a group needs at least 4 people.</p>}

      {groups.map((group, i) => {
        const shared = sharedAnswers(group.members);
        return (
          <section key={group.members[0]!.id} className={styles.card}>
            <h2 className={styles.cardTitle}>Group {i + 1}</h2>
            <ul className={styles.members}>
              {group.members.map((member) => (
                <li key={member.id} className={styles.member}>
                  <span className={styles.name}>{member.name}</span>
                  <span className={styles.cohort}>{cohortLabel(member.cohort)}</span>
                </li>
              ))}
            </ul>
            <div>
              <h3 className={styles.label}>What you have in common</h3>
              {shared.length === 0 ? (
                <p className={styles.intro}>Nothing yet. Time to find out!</p>
              ) : (
                <ul className={styles.shared}>
                  {shared.map((s) => (
                    <li key={`${s.question}-${s.answer}`}>
                      {s.question}: <strong>{s.answer}</strong>{" "}
                      <span className={styles.count}>
                        ({s.count} of {group.members.length})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {waitlist.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Waitlist</h2>
          <p className={styles.intro}>No group fit this round; they&apos;ll be first in line for the next one.</p>
          <ul className={styles.members}>
            {waitlist.map((person) => (
              <li key={person.id} className={styles.member}>
                <span className={styles.name}>{person.name}</span>
                <span className={styles.cohort}>{cohortLabel(person.cohort)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
