// The original resume's text beside the tailored resume, with what changed
// highlighted on each side.

import {
  classifyLine,
  docLines,
  docToHtml,
  isRemovedLine,
  textLines,
  type ExportSettings,
  type ResumeDoc,
} from "@penntools/tool-resume-customizer/resume";
import { usePageCount } from "./hooks";
import type { UploadedFile } from "./parseFile";
import { CHANGE_COLORS, ExtractedText, PageCard, PageCountNote, ScaledPage, cx, docStyle, jobDescriptionLabel, resumeClass } from "./shared";
import shared from "./shared.module.css";
import styles from "./ComparisonScreen.module.css";

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.legend}>
      <span className={styles.swatch} style={{ background: color }} />
      {label}
    </span>
  );
}

export function ComparisonScreen({ doc, settings, baseText, jobDescription, onBack, onExport }: {
  doc: ResumeDoc;
  settings: ExportSettings;
  baseText: string;
  jobDescription: string;
  onBack: () => void;
  onExport: () => void;
}) {
  const pages = usePageCount(doc, settings);
  const original = textLines(baseText);
  const tailored = docLines(doc);
  const tailoredHighlight = (text: string) => {
    const change = classifyLine(text, original);
    return change === "unchanged" ? undefined : CHANGE_COLORS[change];
  };
  const originalHighlight = (text: string) => (isRemovedLine(text, tailored) ? CHANGE_COLORS.removed : undefined);
  const baseFile: UploadedFile = { id: "base", name: "Original", tag: "Resume", text: baseText };

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.title}>Review your changes</div>
          <div className={styles.subtitle}>{jobDescriptionLabel(jobDescription)}</div>
        </div>
        <div className={styles.actions}>
          <PageCountNote pages={pages} />
          <button onClick={onBack} className={cx(shared.btn, shared.secondary)}>
            ← Back to Edit
          </button>
          <button onClick={onExport} className={cx(shared.btn, shared.primary)}>
            Export →
          </button>
        </div>
      </div>
      <div className={styles.columns}>
        <div className={styles.column}>
          <span className={styles.columnTitle}>Original Resume</span>
          <div className={styles.legends}>
            <Legend color={CHANGE_COLORS.removed} label="Removed" />
          </div>
        </div>
        <div className={styles.column}>
          <span className={styles.columnTitle}>Tailored Resume ✦</span>
          <div className={styles.legends}>
            <Legend color={CHANGE_COLORS.modified} label="Reworded" />
            <Legend color={CHANGE_COLORS.added} label="New" />
          </div>
        </div>
      </div>
      <div className={styles.panes}>
        <ScaledPage>
          <PageCard padding={72}>
            <ExtractedText file={baseFile} highlight={originalHighlight} />
          </PageCard>
        </ScaledPage>
        <div className={styles.divider} />
        <ScaledPage>
          <PageCard padding={settings.marginIn * 96}>
            {/* docToHtml escapes all text, so this is safe. */}
            <div className={resumeClass} style={docStyle(settings)} dangerouslySetInnerHTML={{ __html: docToHtml(doc, tailoredHighlight) }} />
          </PageCard>
        </ScaledPage>
      </div>
    </div>
  );
}
