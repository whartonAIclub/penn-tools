// Pieces the Resume Customizer's screens share: errors, the provider picker,
// the page on screen, icons and small helpers.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import { isSettingsError } from "@penntools/core/ai/errors";
import { DEFAULT_SETTINGS, FONT_CSS, LAYOUT, stripBullet, type ExportSettings } from "@penntools/tool-resume-customizer/resume";
import type { ActionError } from "./actions";
import type { UploadedFile } from "./parseFile";
import styles from "./shared.module.css";

/** A US Letter page on screen: 8.5 × 11 inches at 96 px an inch (.page in shared.module.css). */
export const PAGE_WIDTH = 816;
export const PAGE_HEIGHT = 1056;

/** Backgrounds for lines the tailoring changed. */
export const CHANGE_COLORS = { modified: "#fff3c4", added: "#dcf3e0", removed: "#fde2e1" } as const;

/** When a server action itself fails: offline, or an unexpected server error. */
export const UNREACHABLE: ActionError = { message: "Something went wrong reaching the server. Check your connection and try again." };

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function ErrorText({ error }: { error: ActionError }) {
  return (
    <>
      {error.message}
      {isSettingsError(error.kind) && (
        <>
          {" "}
          <Link href="/settings" className={styles.settingsLink}>
            Open Settings
          </Link>
        </>
      )}
    </>
  );
}

/** The providers the user can call, and the one in use. */
export interface ProviderChoice {
  /** Never empty (ai.providers()). */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  provider: AIProvider;
  setProvider: (provider: AIProvider) => void;
}

/** A menu of providers, or the only one with where to add another. */
export function ProviderPicker({ choice }: { choice: ProviderChoice }) {
  const { providers, labels, provider, setProvider } = choice;
  if (providers.length < 2) {
    return (
      <div className={styles.provider}>
        <span>
          AI: {labels[provider]} (add another key in <Link href="/settings">Settings</Link> to switch)
        </span>
      </div>
    );
  }
  return (
    <label className={styles.provider}>
      AI provider
      <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)} className={styles.providerSelect}>
        {providers.map((p) => (
          <option key={p} value={p}>
            {labels[p]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DragHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return <div onMouseDown={onMouseDown} className={styles.dragHandle} aria-hidden="true" />;
}

/** A US Letter page, with a line where page 1 ends when `marker` is set. */
export function PageCard({ children, padding, marker }: { children: React.ReactNode; padding: number; marker?: boolean }) {
  return (
    <div className={styles.page} style={{ padding }}>
      {children}
      {marker && (
        // Where page 1's text ends, as in the PDF: the page's height less its bottom margin.
        <div className={styles.pageEnd} style={{ top: PAGE_HEIGHT - padding }} aria-hidden="true">
          <span className={styles.pageEndLabel}>End of page 1</span>
        </div>
      )}
    </div>
  );
}

/** A page, scaled to fit its pane's width, or at a fixed zoom. */
export function ScaledPage({ children, fixedScale }: { children: React.ReactNode; fixedScale?: number }) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);
  useEffect(() => {
    if (fixedScale !== undefined) return;
    const el = paneRef.current;
    if (!el) return;
    const update = () => setAutoScale(Math.min(1, (el.clientWidth - 40) / PAGE_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedScale]);
  return (
    <div ref={paneRef} className={styles.pane}>
      <div className={styles.paneScroll}>
        <div className={styles.paneZoom} style={{ zoom: fixedScale ?? autoScale }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The class for an element holding docToHtml's resume: a flex column, so the
 * spaces between lines add up as they do in the exports (block margins would
 * collapse into the larger of each pair).
 */
export const resumeClass = styles.resume;

/** The resume's text style, from the export settings, so the screen matches the files. */
export function docStyle(settings: ExportSettings): React.CSSProperties {
  return { fontFamily: FONT_CSS[settings.font], fontSize: `${settings.sizePt}pt`, lineHeight: LAYOUT.lineHeight, color: "#111" };
}

/** An uploaded file's extracted text: exactly what the AI receives. */
export function ExtractedText({ file, highlight }: { file: UploadedFile | undefined; highlight?: (line: string) => string | undefined }) {
  if (!file) return <div className={styles.extractedEmpty}>No file selected.</div>;
  if (file.error) return <div className={styles.extractedError}>{file.error}</div>;
  return (
    <div className={styles.extracted} style={docStyle(DEFAULT_SETTINGS)}>
      {file.text.split("\n").map((line, i) => {
        const t = stripBullet(line).trim();
        if (!t) return <div key={i} className={styles.extractedGap} />;
        const background = highlight?.(t);
        return (
          <div key={i} className={styles.extractedLine} style={background ? { background } : undefined}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

/** Whether the PDF fits on one page; nothing before the first count (usePageCount). */
export function PageCountNote({ pages }: { pages: number | null }) {
  if (pages === null) return null;
  const over = pages > 1;
  return (
    <span className={cx(styles.pageCount, over && styles.pageCountOver)}>
      {over ? `${pages} pages: trim it to fit one` : "Fits on one page"}
    </span>
  );
}

/** "Tailored for: Acme — Analyst" from the job description's first lines, or its first line. */
export function jobDescriptionLabel(jd: string): string {
  const lines = jd.split("\n").map((l) => l.trim()).filter(Boolean);
  let company = "";
  let role = "";
  for (const line of lines.slice(0, 12)) {
    if (!company) company = line.match(/^company[:\s]+(.+)/i)?.[1]?.split(",")[0]?.trim() ?? "";
    if (!role) role = line.match(/^(?:position|role|job title|title)[:\s]+(.+)/i)?.[1]?.split(",")[0]?.trim() ?? "";
  }
  const label = [company, role].filter(Boolean).join(" — ") || lines[0] || "";
  if (!label) return "Tailored resume";
  return `Tailored for: ${label.length > 80 ? `${label.slice(0, 79)}…` : label}`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...icon}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
export const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...icon}>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);
export const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...icon}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
export const IconChat = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...icon}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
