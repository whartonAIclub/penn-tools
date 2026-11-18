// The finished resume: what tailoring changed, and the PDF, Word and copy
// buttons.

import { useState } from "react";
import { computeStats, docToText, type ExportSettings, type ResumeDoc } from "@penntools/tool-resume-customizer/resume";
import { downloadDocx, downloadPdf } from "./exportResume";
import { usePageCount } from "./hooks";
import { cx, jobDescriptionLabel } from "./shared";
import shared from "./shared.module.css";
import styles from "./ExportScreen.module.css";

export function ExportScreen({ doc, settings, baseText, jobDescription, onRestart }: {
  doc: ResumeDoc;
  settings: ExportSettings;
  baseText: string;
  jobDescription: string;
  onRestart: () => void;
}) {
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const pages = usePageCount(doc, settings);
  const stats = computeStats(baseText, doc, jobDescription);

  const download = async (kind: "pdf" | "docx") => {
    setBusy(kind);
    setError("");
    try {
      await (kind === "pdf" ? downloadPdf(doc, settings) : downloadDocx(doc, settings));
    } catch (err) {
      console.error(err);
      setError("Couldn't create the file. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(docToText(doc));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser didn't allow copying. Download a file instead.");
    }
  };

  return (
    <div className={styles.screen}>
      <h2 className={styles.title}>Your resume is ready!</h2>
      <p className={styles.label}>{jobDescriptionLabel(jobDescription)}</p>

      <div className={styles.stats}>
        {[
          { n: stats.bulletsRewritten, label: "bullets reworded" },
          { n: stats.bulletsAdded, label: "bullets added" },
          { n: stats.keywordsMatched, label: "job keywords used" },
        ].map(({ n, label }) => (
          <div key={label} className={styles.stat}>
            <span className={styles.statValue}>{n}</span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>
      {pages !== null && pages > 1 && (
        <div className={styles.warning}>This resume runs to {pages} pages. Most recruiters expect one: go back to Edit to trim it.</div>
      )}

      <div className={styles.buttons}>
        <button disabled={busy !== null} onClick={() => void download("pdf")} className={cx(shared.btn, shared.primary, shared.large)}>
          ↓ {busy === "pdf" ? "Creating PDF…" : "Download PDF"}
        </button>
        <button disabled={busy !== null} onClick={() => void download("docx")} className={cx(shared.btn, shared.secondary, shared.large)}>
          ↓ {busy === "docx" ? "Creating Word document…" : "Download Word (.docx)"}
        </button>
        <button onClick={() => void copy()} className={cx(shared.btn, shared.secondary, shared.large, copied && styles.copied)}>
          {copied ? "✓ Copied!" : "Copy text"}
        </button>
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
      </div>

      <button onClick={onRestart} className={cx(shared.linkButton, styles.again)}>
        Tailor for another job →
      </button>
    </div>
  );
}
