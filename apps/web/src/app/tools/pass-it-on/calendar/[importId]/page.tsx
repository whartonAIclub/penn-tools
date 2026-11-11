// The approval screen for one calendar import: every proposed event as a card
// to approve, edit or skip. Approved events join the master calendar.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCalendarImport } from "@penntools/tool-pass-it-on";
import { db } from "../../db";
import styles from "../../PassItOn.module.css";
import { ImportActions } from "../ImportActions";
import { ProposalCard } from "../ProposalCard";

export default async function ImportPage({ params }: { params: { importId: string } }) {
  const found = await getCalendarImport(db(), params.importId);
  if (!found) notFound();
  const pending = found.proposals.filter((p) => p.status === "pending");
  const approved = found.proposals.filter((p) => p.status === "approved");
  const skipped = found.proposals.filter((p) => p.status === "skipped");

  return (
    <section className={styles.card}>
      <div className={styles.spread}>
        <h2 className={styles.heading}>{found.filename}</h2>
        <Link href="/tools/pass-it-on/calendar" className={styles.secondary}>
          Back
        </Link>
      </div>
      <p className={styles.muted}>
        {pending.length} waiting for approval · {approved.length} approved · {skipped.length} skipped
      </p>
      <ImportActions importId={found.id} pending={pending.length} />
      <div className={styles.cardGroup}>
        {pending.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
      {approved.length > 0 && (
        <details>
          <summary>Approved ({approved.length})</summary>
          <div className={styles.cardGroup}>
            {approved.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </details>
      )}
      {skipped.length > 0 && (
        <details>
          <summary>Skipped ({skipped.length})</summary>
          <div className={styles.cardGroup}>
            {skipped.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
