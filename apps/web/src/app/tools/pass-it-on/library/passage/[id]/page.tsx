// One source passage in full: where an answer's citation links to.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getExcerpt, type StoredExcerpt } from "@penntools/tool-pass-it-on";
import { db } from "../../../db";
import styles from "../../../PassItOn.module.css";

function where(meta: StoredExcerpt["meta"]): string {
  return [meta.file, meta.sheet && `sheet ${meta.sheet}`, meta.page && `page ${meta.page}`, meta.date].filter(Boolean).join(" · ");
}

export default async function PassagePage({ params, searchParams }: { params: { id: string }; searchParams: { quote?: string } }) {
  const passage = await getExcerpt(db(), Number(params.id));
  if (!passage) notFound();
  const quote = typeof searchParams.quote === "string" ? searchParams.quote : "";

  // Highlight the cited words when they're in the passage exactly as the model quoted them.
  const at = quote ? passage.text.toLowerCase().indexOf(quote.toLowerCase()) : -1;

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>{passage.filename}</h2>
      {where(passage.meta) && <p className={styles.muted}>{where(passage.meta)}</p>}
      <p className={styles.passageText}>
        {at === -1 ? (
          passage.text
        ) : (
          <>
            {passage.text.slice(0, at)}
            <mark>{passage.text.slice(at, at + quote.length)}</mark>
            {passage.text.slice(at + quote.length)}
          </>
        )}
      </p>
      <Link href="/tools/pass-it-on/ask" className={styles.link}>
        Back to Ask
      </Link>
    </section>
  );
}
