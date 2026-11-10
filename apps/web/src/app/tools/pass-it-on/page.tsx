// The Events tab: every Pub, soonest first.

import Link from "next/link";
import { listPlannedEvents } from "@penntools/tool-pass-it-on";
import { db } from "./db";
import styles from "./PassItOn.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function PassItOnPage() {
  const events = await listPlannedEvents(db());

  return (
    <section className={styles.card}>
      <div className={styles.spread}>
        <h2 className={styles.heading}>Events</h2>
        <Link href="/tools/pass-it-on/events/new" className={styles.button}>
          New event
        </Link>
      </div>
      {events.length === 0 ? (
        <p className={styles.muted}>No events yet. Add the next Pub to start planning.</p>
      ) : (
        <ul className={styles.list}>
          {events.map((e) => (
            <li key={e.id} className={styles.item}>
              <Link href={`/tools/pass-it-on/events/${e.id}`} className={styles.itemTitle}>
                {e.title}
              </Link>
              <span className={styles.muted}>
                {[e.eventDate ?? "Date to be decided", e.eventTime, e.theme, e.venue, e.pubLeader && `Leader: ${e.pubLeader}`, e.budget !== null && money.format(e.budget)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
