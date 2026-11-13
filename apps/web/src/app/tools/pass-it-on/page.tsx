// The Events tab: the master calendar, every Pub grouped by month, soonest first.

import Link from "next/link";
import { eventsWithoutLeader, groupByMonth, listPlannedEvents, splitByToday } from "@penntools/tool-pass-it-on";
import { db } from "./db";
import styles from "./PassItOn.module.css";
import { today } from "./today";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function PassItOnPage() {
  const [events, noLeader] = await Promise.all([listPlannedEvents(db()), eventsWithoutLeader(db(), today()).then((ids) => new Set(ids))]);

  const { upcoming, undated, past } = splitByToday(events, today());

  const renderGroup = (group: ReturnType<typeof groupByMonth>[number]) => (
    <div key={group.month}>
      <h3 className={styles.monthHeading}>{group.month}</h3>
      <ul className={styles.list}>
        {group.events.map((e) => (
          <li key={e.id} className={styles.item}>
            <Link href={`/tools/pass-it-on/events/${e.id}`} className={styles.itemTitle}>
              {e.title}
            </Link>
            {e.cancelled && <span className={styles.tag}>Cancelled</span>}
            {noLeader.has(e.id) && <span className={styles.flag}>No Pub Leader</span>}
            <span className={styles.muted}>
              {[e.eventDate, e.eventTime, e.theme, e.venue, e.pubLeader && `Leader: ${e.pubLeader}`, e.budget !== null && money.format(e.budget)].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className={styles.card}>
      <div className={styles.spread}>
        <h2 className={styles.heading}>Events</h2>
        <Link href="/tools/pass-it-on/events/new" className={styles.button}>
          New event
        </Link>
      </div>
      {events.length === 0 ? (
        <p className={styles.muted}>
          No events yet. Add the next Pub, or <Link href="/tools/pass-it-on/calendar" className={styles.link}>upload your calendar</Link> to add the whole year at once.
        </p>
      ) : (
        <>
          {groupByMonth([...upcoming, ...undated]).map(renderGroup)}
          {past.length > 0 && (
            <details className={styles.pastEvents}>
              <summary>Past events ({past.length})</summary>
              {groupByMonth(past, "desc").map(renderGroup)}
            </details>
          )}
        </>
      )}
    </section>
  );
}
