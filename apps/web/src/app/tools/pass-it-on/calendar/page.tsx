// The Calendar tab: upload a club's annual calendar to have its events
// proposed for approval, and reopen earlier imports.

import Link from "next/link";
import { PROVIDER_LABELS } from "@penntools/core/ai";
import { listCalendarImports } from "@penntools/tool-pass-it-on";
import { ApiKeyPrompt } from "@/components/layout/ApiKeyPrompt";
import { getAI } from "@/lib/ai";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { CalendarUpload } from "./CalendarUpload";

export default async function CalendarPage() {
  const ai = await getAI();
  const providers = ai ? await ai.providers() : [];
  if (providers.length === 0) return <ApiKeyPrompt title="Calendar" />;
  const imports = await listCalendarImports(db());

  return (
    <>
      <CalendarUpload providers={providers} labels={PROVIDER_LABELS} />
      {imports.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.heading}>Earlier uploads</h2>
          <ul className={styles.list}>
            {imports.map((i) => (
              <li key={i.id} className={styles.item}>
                <Link href={`/tools/pass-it-on/calendar/${i.id}`} className={styles.itemTitle}>
                  {i.filename}
                </Link>
                <span className={styles.muted}>
                  {new Date(i.importedAt).toLocaleDateString("en-US")} · {i.pending} of {i.total} waiting for approval
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
