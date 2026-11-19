// Shown instead of Handoff when its shared data can't be used (C-DESIGN §6.3). page.tsx renders it when the server has no
// DATABASE_URL ("no-database"), and for setupErrorKind's "not-set-up" (the handoff role, schema or tables are missing) and
// "down". It says what is missing. There is nothing behind it: no sample market, no preview data, no offline mode.

import type { SetupErrorKind } from "@penntools/tool-handoff";
import type { ReactNode } from "react";
import styles from "./HandoffUnavailable.module.css";

const MESSAGES: Readonly<Record<SetupErrorKind, ReactNode>> = {
  "no-database": (
    <>
      Handoff can&apos;t reach its database. This server has no <code>DATABASE_URL</code> set.
    </>
  ),
  "not-set-up": (
    <>
      Handoff&apos;s shared data isn&apos;t set up on this server yet. It needs the <code>handoff</code> database role and schema.
      The platform&apos;s <code>db:deploy</code> step creates them once the Platform team registers Handoff in <code>TOOLS</code>{" "}
      (<code>packages/platform/scripts/setup-tools.mjs</code>). Locally, follow &lsquo;Database setup&rsquo; in{" "}
      <code>tools/handoff/README.md</code>.
    </>
  ),
  down: <>Handoff&apos;s database isn&apos;t responding. Try again in a minute.</>,
};

export function HandoffUnavailable({ reason }: { reason: SetupErrorKind }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Handoff</h1>
      <section className={styles.card} data-unavailable={reason}>
        <p className={styles.message}>{MESSAGES[reason]}</p>
        {/* A plain link, so trying again loads the page afresh rather than a cached copy. */}
        {reason === "down" ? (
          <a className={styles.link} href="/tools/handoff">
            Try again
          </a>
        ) : null}
      </section>
    </div>
  );
}
