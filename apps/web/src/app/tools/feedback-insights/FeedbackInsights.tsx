"use client";

// The page: holds the survey being worked on (kept in this browser), runs the
// analysis from tools/feedback-insights on every change, and shows it in tabs.

import { useEffect, useMemo, useRef, useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import {
  analyze,
  detectSetup,
  matchPreset,
  applyPreset,
  tidyExport,
  MAX_FILE_BYTES,
  MAX_ROWS,
  mergeSetup,
  parseCsv,
  sampleWorkspace,
  stripIdentityColumns,
  workspaceFromJson,
  workspaceToJson,
  type Workspace,
} from "@penntools/tool-feedback-insights";
import { CrashGuard } from "./CrashGuard";
import { Feedback, type Focus } from "./Feedback";
import { HowItWorks, Ratings, Summary, Themes } from "./Overview";
import { ReadBack } from "./ReadBack";
import { Review } from "./Review";
import { Setup } from "./Setup";
import { Badge, type AIAccess } from "./shared";
import { download, loadWorkspace, saveWorkspace, slug } from "./storage";
import styles from "./FeedbackInsights.module.css";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "ratings", label: "Ratings & answers" },
  { id: "themes", label: "Themes" },
  { id: "feedback", label: "All feedback" },
  { id: "review", label: "Needs review" },
  { id: "setup", label: "Setup" },
  { id: "how", label: "How it works" },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface Notice {
  tone: "info" | "bad";
  text: string;
}

/** A survey from an uploaded or pasted table, or a note on why it can't be used. */
function workspaceFromTable(text: string, name: string, previous: Workspace | null): { ws: Workspace; note: string | null; removed: string[] } | string {
  // Names, emails and the like are dropped here, before anything is kept or shown.
  const { table, removed } = stripIdentityColumns(tidyExport(parseCsv(text)));
  if (table.columns.length === 0) return removed.length ? "That file only has columns that identify people, and no questions." : "That file is empty.";
  if (table.columns.length === 1 && table.rows.length > 0) {
    return "That file has only one column, so it doesn't look like a survey export. In Google Forms, open Responses, then the menu, then Download responses (.csv).";
  }
  let note: string | null = null;
  if (table.rows.length > MAX_ROWS) {
    note = `The file has ${table.rows.length} responses; only the first ${MAX_ROWS} were loaded.`;
    table.rows = table.rows.slice(0, MAX_ROWS);
  }
  if (previous) {
    const kept = previous.setup.questions.filter((q) => table.columns.includes(q.column)).length;
    if (kept === 0 && previous.setup.questions.length > 0) {
      return "None of the questions in that file match this survey. To work on a different survey, use Start over first.";
    }
    return { ws: { ...previous, table, setup: mergeSetup(previous.setup, table) }, note, removed };
  }
  const guess = detectSetup(table);
  const preset = matchPreset(table);
  if (preset) note = `${note ? `${note} ` : ""}This looks like the ${preset.name}, so its themes were added. You can change them on the Setup tab.`;
  return { ws: { name, table, setup: preset ? applyPreset(guess, preset) : guess, tags: [], decisions: [], skipped: [] }, note, removed };
}

const CHECK_TAB: Record<string, TabId> = {
  untagged: "feedback",
  orphan_tags: "feedback",
  duplicate_tags: "feedback",
  blank_tag: "feedback",
  tag_question: "feedback",
  stale_tags: "feedback",
  tag_privacy: "feedback",
  unknown_types: "feedback",
  unknown_themes: "setup",
  missing_questions: "setup",
  needs_review: "review",
  excluded: "review",
  review_unmatched: "review",
};

interface Props {
  signedIn: boolean;
  /** Providers the user can call (ai.providers()); empty when signed out. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
}

export function FeedbackInsights(props: Props) {
  return (
    <CrashGuard>
      <Tool {...props} />
    </CrashGuard>
  );
}

function Tool({ signedIn, providers, labels }: Props) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabId>("summary");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // A saved copy chosen while a survey is open, waiting for the user to confirm it replaces that survey.
  const [replacing, setReplacing] = useState<Workspace | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [provider, setProvider] = useState<AIProvider | null>(providers[0] ?? null);
  // Set after a file is read, until the user confirms how it was read.
  const [readBack, setReadBack] = useState<{ removed: string[] } | null>(null);
  // Which comments the All feedback tab opens on, when arriving from a count elsewhere.
  const [focus, setFocus] = useState<Focus | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const goTo = (id: TabId, show: Focus | null = null) => {
    setFocus(show);
    setTab(id);
  };

  // The saved survey is read after the first render: the server can't see this browser's storage.
  useEffect(() => {
    setWs(loadWorkspace());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setUnsaved(!saveWorkspace(ws)), 400);
    return () => clearTimeout(timer);
  }, [ws, ready]);

  const analysis = useMemo(() => (ws ? analyze(ws) : null), [ws]);
  const update = (change: (ws: Workspace) => Workspace) => setWs((current) => (current ? change(current) : current));
  const ai: AIAccess = { signedIn, providers, labels, provider, setProvider };

  function open(text: string, filename: string) {
    setNotice(null);
    if (/\.json$/i.test(filename)) {
      const loaded = workspaceFromJson(text);
      if (!loaded)
        return setNotice({ tone: "bad", text: "That isn't a workspace saved from this tool. To start from survey responses, choose the .csv file instead." });
      // A saved copy replaces everything, so ask first when there is work to lose.
      if (ws) return setReplacing(loaded);
      setWs(loaded);
      setTab("summary");
      return;
    }
    const name =
      filename
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim() || "My survey";
    const result = workspaceFromTable(text, name, ws);
    if (typeof result === "string") return setNotice({ tone: "bad", text: result });
    setWs(result.ws);
    setPasting(false);
    setPasted("");
    if (!ws) setTab("summary");
    setReadBack({ removed: result.removed });
    if (result.note) setNotice({ tone: "info", text: result.note });
    else if (ws) setNotice({ tone: "info", text: "Newer responses loaded. Your tags, decisions and setup were kept." });
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    if (/\.(xlsx?|numbers|pdf|docx?)$/i.test(file.name)) {
      return setNotice({ tone: "bad", text: "That's not a CSV file. In Google Sheets or Excel, use File, then Download or Save as, and choose CSV." });
    }
    if (file.size > MAX_FILE_BYTES) return setNotice({ tone: "bad", text: "That file is over 5 MB, which is more than this tool can open." });
    try {
      open(await file.text(), file.name);
    } catch {
      setNotice({ tone: "bad", text: "That file couldn't be read. Try downloading it again." });
    }
  }

  const fileButton = (label: string, primary: boolean) => (
    <button type="button" className={primary ? styles.buttonPrimary : styles.button} onClick={() => fileInput.current?.click()}>
      {label}
    </button>
  );
  const hiddenInput = (
    <input
      ref={fileInput}
      type="file"
      accept=".csv,.tsv,.txt,.json,text/csv"
      className={styles.hidden}
      onChange={(e) => {
        void openFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const noticeLine = notice && (
    <p className={notice.tone === "bad" ? styles.noticeBad : styles.notice} role="status">
      {notice.text}{" "}
      <button type="button" className={styles.linkButton} onClick={() => setNotice(null)}>
        Dismiss
      </button>
    </p>
  );

  if (!ready) return <div className={styles.shell} />;

  if (!ws || !analysis) {
    return (
      <div className={styles.shell}>
        <div className={styles.page}>
          <h1 className={styles.title}>Feedback Insights</h1>
          <p className={styles.intro}>
            Upload the responses to a survey and see what to fix first: ratings ranked, written answers grouped into themes, odd responses flagged for you to
            keep or exclude, and a short list of recommended changes.
          </p>
          {noticeLine}
          <section
            className={styles.drop}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void openFile(e.dataTransfer.files[0]);
            }}
          >
            <p className={styles.dropTitle}>Drop your responses file here</p>
            <p className={styles.muted}>
              The .csv file your survey tool gives you when you download the responses. Have an Excel file? Save it as CSV first, or paste the cells.
            </p>
            <details className={styles.help}>
              <summary>How do I get this file?</summary>
              <dl className={styles.answers}>
                <div>
                  <dt>Google Forms</dt>
                  <dd>Open the form, go to Responses, open the three-dot menu and choose Download responses (.csv).</dd>
                </div>
                <div>
                  <dt>Google Sheets or Excel</dt>
                  <dd>
                    File, then Download (Sheets) or Save As (Excel), and choose Comma-separated values (.csv). Or select the cells, copy, and use Paste from a
                    spreadsheet.
                  </dd>
                </div>
                <div>
                  <dt>Microsoft Forms</dt>
                  <dd>Responses, then Open results in Excel, then save that file as CSV.</dd>
                </div>
                <div>
                  <dt>Qualtrics</dt>
                  <dd>Data &amp; Analysis, then Export &amp; Import, then Export Data, and choose CSV.</dd>
                </div>
                <div>
                  <dt>Typeform</dt>
                  <dd>Results, then Responses, then Download, and choose CSV.</dd>
                </div>
                <div>
                  <dt>What it should look like</dt>
                  <dd>One row per response, with the questions in the first row.</dd>
                </div>
              </dl>
            </details>
            <div className={styles.actions}>
              {fileButton("Choose a file", true)}
              <button type="button" className={styles.button} onClick={() => setPasting((v) => !v)}>
                Paste from a spreadsheet
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setWs(sampleWorkspace());
                  setNotice({
                    tone: "info",
                    text: "This is made-up sample data, with mistakes planted on purpose so you can see the flags. Use Start over when you're ready for your own.",
                  });
                }}
              >
                Try sample data
              </button>
            </div>
            {hiddenInput}
            {pasting && (
              <div className={styles.form}>
                <label className={styles.field}>
                  Copy the cells in your spreadsheet, header row included, and paste them here
                  <textarea className={styles.textarea} rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
                </label>
                <div className={styles.actions}>
                  <button type="button" className={styles.buttonPrimary} disabled={!pasted.trim()} onClick={() => open(pasted, "Pasted survey")}>
                    Use these responses
                  </button>
                </div>
              </div>
            )}
          </section>
          <p className={styles.muted}>
            Your file stays in this browser; it isn&apos;t uploaded or stored on PennTools. Columns that identify people, such as names and email addresses, are
            removed as the file is read. If you choose to sort written answers with AI, those answers are sent to the AI provider with emails, phone numbers,
            @handles and most names masked. The survey stays saved in this browser until you use Start over, even after you sign out, so use Start over on a
            shared computer.
          </p>
        </div>
      </div>
    );
  }

  const reviewCount = analysis.needsReview;
  return (
    <div className={styles.shell}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Feedback Insights</h1>
            <p className={styles.surveyName}>{ws.name}</p>
          </div>
          <div className={styles.actions}>
            {fileButton("Load newer responses", false)}
            <button
              type="button"
              className={styles.button}
              onClick={() => download(`${slug(ws.name)}-workspace.json`, workspaceToJson(ws), "application/json")}
            >
              Save a copy
            </button>
            {confirmReset ? (
              <>
                <button
                  type="button"
                  className={styles.buttonDanger}
                  onClick={() => {
                    setWs(null);
                    setReadBack(null);
                    setConfirmReset(false);
                    setNotice(null);
                    setTab("summary");
                  }}
                >
                  Yes, remove everything
                </button>
                <button type="button" className={styles.button} onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className={styles.button} onClick={() => setConfirmReset(true)}>
                Start over
              </button>
            )}
            {hiddenInput}
          </div>
        </header>

        {confirmReset && (
          <p className={styles.noticeBad}>
            Start over removes this survey, its tags and its decisions from this browser. Use Save a copy first if you want them back later.
          </p>
        )}
        {replacing && (
          <div className={styles.noticeBad} role="alert">
            <p>
              Open “{replacing.name}”? It replaces “{ws.name}” and all its tags and decisions in this browser. Use Save a copy first if you want to keep them.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.buttonDanger}
                onClick={() => {
                  setWs(replacing);
                  setReplacing(null);
                  setReadBack(null);
                  setTab("summary");
                }}
              >
                Replace this survey
              </button>
              <button type="button" className={styles.button} onClick={() => setReplacing(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {unsaved && (
          <p className={styles.noticeBad}>
            This survey is too big for the browser to keep, or storage is blocked. Your work will be lost when you close the tab: use Save a copy.
          </p>
        )}
        {noticeLine}
        {readBack && <ReadBack ws={ws} analysis={analysis} removed={readBack.removed} ai={ai} update={update} onNotice={(text, tone = "info") => setNotice({ tone, text })} onDone={() => setReadBack(null)} onFix={() => (setReadBack(null), goTo("setup"))} />}

        {analysis.checks.length > 0 && (
          <ul className={styles.checks} aria-label="Things to check">
            {analysis.checks.map((check) => (
              <li key={check.id} className={styles.check}>
                <Badge tone={check.level}>{check.level === "bad" ? "Fix" : check.level === "warn" ? "Check" : "Note"}</Badge>
                <span>
                  {check.count} {check.text}{" "}
                  {CHECK_TAB[check.id] && CHECK_TAB[check.id] !== tab && (
                    <button type="button" className={styles.linkButton} onClick={() => goTo(CHECK_TAB[check.id] ?? "summary")}>
                      Go there
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.layout}>
          <div className={styles.tabs} role="tablist" aria-label="Sections" aria-orientation="vertical">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`fi-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="fi-panel"
                className={tab === t.id ? styles.tabActive : styles.tab}
                onClick={() => goTo(t.id)}
              >
                {t.label}
                {t.id === "review" && reviewCount > 0 ? ` (${reviewCount})` : ""}
                {t.id === "feedback" && analysis.untagged.length > 0 ? ` (${analysis.untagged.length} to tag)` : ""}
              </button>
            ))}
          </div>

          <div id="fi-panel" role="tabpanel" aria-labelledby={`fi-tab-${tab}`} className={styles.panel}>
            {tab === "summary" && <Summary ws={ws} analysis={analysis} update={update} goTo={goTo} />}
            {tab === "ratings" && <Ratings ws={ws} analysis={analysis} update={update} />}
            {tab === "themes" && <Themes ws={ws} analysis={analysis} update={update} goTo={goTo} />}
            {tab === "feedback" && (
              <Feedback key={focus ? `${focus.theme}|${focus.type}` : "all"} ws={ws} analysis={analysis} update={update} ai={ai} focus={focus} />
            )}
            {tab === "review" && <Review ws={ws} analysis={analysis} update={update} />}
            {tab === "setup" && <Setup ws={ws} analysis={analysis} update={update} ai={ai} onNotice={(text, tone = "info") => setNotice({ tone, text })} />}
            {tab === "how" && <HowItWorks ws={ws} analysis={analysis} update={update} />}
          </div>
        </div>
      </div>
    </div>
  );
}
