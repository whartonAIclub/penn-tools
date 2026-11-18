// Editing the tailored resume: a formatting toolbar, the resume as an
// editable page, and the AI chat beside it.

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  FONT_NAMES,
  FONT_SIZES,
  MARGINS_IN,
  RESUME_FONTS,
  carryFormatting,
  docToHtml,
  type ExportSettings,
  type ResumeDoc,
  type ResumeFont,
} from "@penntools/tool-resume-customizer/resume";
import { AiChatPanel, type Chat } from "./AiChatPanel";
import { editorToDoc, tidyHeader } from "./editor";
import { usePageCount, useResizable } from "./hooks";
import { DragHandle, PAGE_HEIGHT, PageCard, PageCountNote, ScaledPage, cx, docStyle, resumeClass, type ProviderChoice } from "./shared";
import shared from "./shared.module.css";
import styles from "./EditScreen.module.css";

function exec(command: string, value?: string) {
  // execCommand is deprecated but still the only way to format a contentEditable selection.
  const legacyExecCommand = Document.prototype.execCommand as (commandId: string, showUI?: boolean, value?: string) => boolean;
  legacyExecCommand.call(document, command, false, value);
}

function Tool({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault() /* keep the editor's selection */}
      onClick={onClick}
      className={styles.tool}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className={styles.divider} />;
}

export function EditScreen({ doc, setDoc, settings, setSettings, chat, setChat, jobDescription, providerChoice, onCompare }: {
  doc: ResumeDoc;
  setDoc: (doc: ResumeDoc) => void;
  settings: ExportSettings;
  setSettings: (settings: ExportSettings) => void;
  chat: Chat;
  setChat: React.Dispatch<React.SetStateAction<Chat>>;
  jobDescription: string;
  providerChoice: ProviderChoice;
  onCompare: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoom, setZoom] = useState(0.9);
  const chatCol = useResizable(320, 240, 520, true);
  const pages = usePageCount(doc, settings);

  // Fill the editor once; after that the user owns its contents, and they're
  // saved to `doc` as they change.
  const initialDoc = useRef(doc);
  useLayoutEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = docToHtml(initialDoc.current);
  }, []);

  const save = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const el = editorRef.current;
    if (!el) return null;
    const current = editorToDoc(el);
    setDoc(current);
    return current;
  }, [setDoc]);
  const saveSoon = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 300);
  };
  // Save edits not yet saved when leaving, while the editor is still on the page.
  useLayoutEffect(
    () => () => {
      if (saveTimer.current) save();
    },
    [save],
  );

  const replaceWith = (next: ResumeDoc) => {
    if (editorRef.current) editorRef.current.innerHTML = docToHtml(next);
    setDoc(next);
  };

  const margin = settings.marginIn * 96;

  return (
    <div className={styles.screen}>
      {/* Only what the PDF and Word exports reproduce. */}
      <div role="toolbar" aria-label="Formatting" className={styles.toolbar}>
        <Tool title="Undo" onClick={() => exec("undo")}>↩</Tool>
        <Tool title="Redo" onClick={() => exec("redo")}>↪</Tool>
        <Divider />
        <Tool title="Bold" onClick={() => exec("bold")}>
          <strong>B</strong>
        </Tool>
        <Tool title="Italic" onClick={() => exec("italic")}>
          <em>I</em>
        </Tool>
        <Tool title="Underline" onClick={() => exec("underline")}>
          <span className={styles.underlined}>U</span>
        </Tool>
        <Tool title="Bullet list" onClick={() => exec("insertUnorderedList")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <circle cx="1.5" cy="2.5" r="1.5" />
            <rect x="4" y="1.5" width="10" height="2" />
            <circle cx="1.5" cy="7" r="1.5" />
            <rect x="4" y="6" width="10" height="2" />
            <circle cx="1.5" cy="11.5" r="1.5" />
            <rect x="4" y="10.5" width="10" height="2" />
          </svg>
        </Tool>
        <Divider />
        <select value={settings.font} onChange={(e) => setSettings({ ...settings, font: e.target.value as ResumeFont })} aria-label="Font" className={styles.select}>
          {RESUME_FONTS.map((f) => (
            <option key={f} value={f}>
              {FONT_NAMES[f]}
            </option>
          ))}
        </select>
        <select value={settings.sizePt} onChange={(e) => setSettings({ ...settings, sizePt: Number(e.target.value) })} aria-label="Font size" className={styles.select}>
          {FONT_SIZES.map((pt) => (
            <option key={pt} value={pt}>
              {pt} pt
            </option>
          ))}
        </select>
        <label className={styles.label}>
          Margins
          <select value={settings.marginIn} onChange={(e) => setSettings({ ...settings, marginIn: Number(e.target.value) })} className={styles.select}>
            {MARGINS_IN.map((m) => (
              <option key={m} value={m}>
                {m}&quot;
              </option>
            ))}
          </select>
        </label>
        <Divider />
        <Tool title="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}>−</Tool>
        <span className={styles.zoom}>{Math.round(zoom * 100)}%</span>
        <Tool title="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}>+</Tool>
        <div className={styles.spacer} />
        <PageCountNote pages={pages} />
      </div>

      <div className={styles.body}>
        <main className={styles.main}>
          <ScaledPage fixedScale={zoom}>
            <PageCard padding={margin} marker>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Your tailored resume"
                onInput={() => {
                  if (editorRef.current) tidyHeader(editorRef.current);
                  saveSoon();
                }}
                onPaste={(e) => {
                  // Paste plain text, line by line: another page's formatting
                  // and markup don't belong in the resume, and the exports
                  // couldn't show them.
                  e.preventDefault();
                  const lines = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").split("\n");
                  lines.forEach((line, i) => {
                    if (i > 0) exec("insertParagraph");
                    if (line) exec("insertText", line);
                  });
                }}
                onKeyDown={(e) => {
                  // Shift+Enter would put a line break inside a line, which the
                  // exports can't show the same way; make it a new line instead.
                  if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    exec("insertParagraph");
                  }
                }}
                className={cx(styles.editor, resumeClass)}
                style={{ ...docStyle(settings), minHeight: PAGE_HEIGHT - margin * 2 }}
              />
            </PageCard>
          </ScaledPage>
        </main>
        <DragHandle onMouseDown={chatCol.onMouseDown} />
        <div className={styles.side} style={{ width: chatCol.width }}>
          <AiChatPanel
            chat={chat}
            setChat={setChat}
            providerChoice={providerChoice}
            jobDescription={jobDescription}
            currentDoc={() => save() ?? doc}
            onApply={(revision) => {
              const before = save() ?? doc;
              replaceWith(carryFormatting(before, revision));
              return before;
            }}
            onUndo={replaceWith}
          />
          <div className={styles.compare}>
            <button
              onClick={() => {
                save();
                onCompare();
              }}
              className={cx(shared.btn, shared.primary, shared.block, styles.compareButton)}
            >
              Compare →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
