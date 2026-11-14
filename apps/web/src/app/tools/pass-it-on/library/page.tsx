// The Library tab: upload files and see what's been uploaded.

import { listPlannedEvents, listSources } from "@penntools/tool-pass-it-on";
import { db } from "../db";
import styles from "../PassItOn.module.css";
import { DeleteFileButton } from "./DeleteFileButton";
import { Upload } from "./Upload";

export default async function LibraryPage() {
  const [sources, events] = await Promise.all([listSources(db()), listPlannedEvents(db())]);

  return (
    <>
      <Upload events={events.map((e) => ({ id: e.id, title: e.title }))} />
      <section className={styles.card}>
        <h2 className={styles.heading}>Files</h2>
        {sources.length === 0 ? (
          <p className={styles.muted}>Nothing uploaded yet.</p>
        ) : (
          <ul className={styles.list}>
            {sources.map((s) => (
              <li key={s.id} className={styles.item}>
                <span className={styles.spread}>
                  <span className={styles.itemTitle}>{s.filename}</span>
                  <DeleteFileButton id={s.id} filename={s.filename} />
                </span>
                <span className={styles.muted}>
                  {s.excerpts} passage{s.excerpts === 1 ? "" : "s"} · added {s.importedAt.slice(0, 10)}
                </span>
                {s.tags.length > 0 && (
                  <span className={styles.row}>
                    {s.tags.map((t) => (
                      <span key={t} className={styles.tag}>
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
