// The Workspace: the uploaded files and their text on the left and middle,
// and the job description and Generate on the right.

import { useRef, useState } from "react";
import { FILE_TAGS, LIMITS, chars, type FileTag } from "@penntools/tool-resume-customizer/resume";
import { useFileDrop, useResizable } from "./hooks";
import { ACCEPT, contextFiles, type UploadedFile } from "./parseFile";
import {
  DragHandle,
  ExtractedText,
  IconFile,
  IconSend,
  IconUpload,
  PageCard,
  ProviderPicker,
  ScaledPage,
  cx,
  type ProviderChoice,
} from "./shared";
import shared from "./shared.module.css";
import styles from "./WorkspaceScreen.module.css";

export function WorkspaceScreen({ files, baseFile, onSetBase, onAdd, onTag, onDelete, jobDescription, setJobDescription, providerChoice, onGenerate, hasResume }: {
  files: UploadedFile[];
  baseFile: UploadedFile | undefined;
  onSetBase: (id: string) => void;
  onAdd: (list: FileList, tag: FileTag) => Promise<void>;
  onTag: (id: string, tag: FileTag) => void;
  onDelete: (id: string) => void;
  jobDescription: string;
  setJobDescription: (jd: string) => void;
  providerChoice: ProviderChoice;
  onGenerate: () => void;
  /** Whether there's a tailored resume already, which generating replaces. */
  hasResume: boolean;
}) {
  const [uploadTag, setUploadTag] = useState<FileTag>("Resume");
  const [parsing, setParsing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewId, setPreviewId] = useState(baseFile?.id ?? files[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const leftCol = useResizable(240, 180, 380);
  const rightCol = useResizable(300, 240, 480, true);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setParsing(true);
    try {
      await onAdd(list, uploadTag);
    } finally {
      setParsing(false);
    }
  };

  const { isDragging, handlers } = useFileDrop((list) => void add(list));
  const previewFile = files.find((f) => f.id === previewId) ?? baseFile ?? files[0];
  const context = contextFiles(files, baseFile?.id);
  const jdTooLong = jobDescription.length > LIMITS.jobDescription;
  const blocker = !baseFile
    ? "Tag a file as Resume to tailor it."
    : baseFile.text.length > LIMITS.resume
      ? `Your resume is over ${chars(LIMITS.resume)} characters. Choose a shorter one.`
      : !jobDescription.trim()
        ? "Paste a job description to generate."
        : jdTooLong
          ? `Shorten the job description to ${chars(LIMITS.jobDescription)} characters.`
          : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(previewFile?.text ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The browser refused; nothing to show. */
    }
  };

  return (
    <div className={styles.screen} {...handlers}>
      <aside className={styles.files} style={{ width: leftCol.width }}>
        <div className={styles.filesHead}>
          <div className={styles.filesTitle}>My Files</div>
          <select value={uploadTag} onChange={(e) => setUploadTag(e.target.value as FileTag)} aria-label="What the files you upload are" className={styles.uploadTag}>
            {FILE_TAGS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button onClick={() => fileRef.current?.click()} disabled={parsing} className={cx(shared.btn, shared.primary, shared.small, shared.block)}>
            <IconUpload />
            {parsing ? "Reading…" : "Upload more"}
          </button>
          <input ref={fileRef} type="file" hidden multiple accept={ACCEPT} onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </div>
        <div className={styles.list}>
          {files.length === 0 ? (
            <div className={styles.empty}>No files uploaded yet.</div>
          ) : (
            files.map((file) => {
              const isBase = file.id === baseFile?.id;
              return (
                <div key={file.id} className={cx(styles.file, file.id === previewFile?.id && styles.fileActive)}>
                  <div className={styles.fileTop}>
                    <IconFile />
                    <button onClick={() => setPreviewId(file.id)} title="Preview" className={cx(styles.fileName, file.error && styles.fileNameError)}>
                      {file.name}
                    </button>
                    <button onClick={() => onDelete(file.id)} aria-label={`Remove ${file.name}`} className={styles.remove}>
                      ×
                    </button>
                  </div>
                  <div className={styles.fileBottom}>
                    <select
                      value={file.tag}
                      onChange={(e) => onTag(file.id, e.target.value as FileTag)}
                      aria-label={`What ${file.name} is`}
                      className={cx(styles.tag, isBase && styles.tagBase)}
                    >
                      {FILE_TAGS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    {file.tag === "Resume" && !file.error && (
                      <button onClick={() => onSetBase(file.id)} aria-pressed={isBase} className={cx(styles.base, isBase && styles.baseOn)}>
                        {isBase ? "BASE ✓" : "Set Base"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className={styles.filesFoot}>Click a file to preview the text the AI will read · Set Base for the resume to tailor</div>
      </aside>

      <DragHandle onMouseDown={leftCol.onMouseDown} />

      <main className={styles.preview}>
        <div className={styles.previewHead}>
          <span className={styles.previewLabel}>Text of</span>
          <span className={styles.previewName}>{previewFile?.name ?? "—"}</span>
          <button onClick={() => void copy()} disabled={!previewFile?.text} className={cx(shared.btn, shared.primary, shared.small, copied && styles.copied)}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <ScaledPage>
          <PageCard padding={72}>
            <ExtractedText file={previewFile} />
          </PageCard>
        </ScaledPage>
      </main>

      <DragHandle onMouseDown={rightCol.onMouseDown} />

      <aside className={cx(shared.panel, styles.generate)} style={{ width: rightCol.width }}>
        <div className={shared.panelHead}>
          <IconSend />
          Generate Tailored Resume
        </div>
        <div className={styles.generateBody}>
          <div className={styles.using}>
            <div className={styles.usingTitle}>Using:</div>
            <div>
              {baseFile?.name ?? "No resume"} <span className={styles.usingMuted}>(base)</span>
            </div>
            {context.files.length > 0 && (
              <div className={styles.usingMuted}>
                + {context.files.length} context file{context.files.length > 1 ? "s" : ""}
              </div>
            )}
            {context.trimmed && (
              <div className={styles.usingWarn}>
                Your other files are over the limit ({chars(LIMITS.context)} characters, {LIMITS.files} files), so only the first part of them is used.
              </div>
            )}
          </div>
          <label htmlFor="rc-jd" className={styles.jdLabel}>
            Job description
          </label>
          <textarea
            id="rc-jd"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here…"
            className={cx(styles.jd, jdTooLong && styles.jdOver)}
          />
          <div className={cx(styles.count, jdTooLong && styles.countOver)}>
            {chars(jobDescription.length)} / {chars(LIMITS.jobDescription)}
          </div>
        </div>
        <div className={shared.panelFoot}>
          <ProviderPicker choice={providerChoice} />
          <button onClick={onGenerate} disabled={!!blocker} className={cx(shared.btn, shared.primary, shared.block, styles.generateButton)}>
            <IconSend /> {hasResume ? "Generate Again" : "Generate Tailored Resume"}
          </button>
          {(blocker || hasResume) && (
            <div className={shared.note}>{blocker ?? "This replaces your tailored resume and your edits to it. Use Edit above to go back to it."}</div>
          )}
        </div>
      </aside>

      {isDragging && <div className={styles.dropOverlay}>Drop files to add them as {uploadTag}</div>}
    </div>
  );
}
