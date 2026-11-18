// Uploading the resume, and optionally other files for context.

import { useRef, useState } from "react";
import { FILE_TAGS, type FileTag } from "@penntools/tool-resume-customizer/resume";
import { useFileDrop } from "./hooks";
import { HERO_BULLETS } from "./LandingScreen";
import { ACCEPT, type UploadedFile } from "./parseFile";
import { IconFile, IconUpload, cx } from "./shared";
import shared from "./shared.module.css";
import styles from "./OnboardingScreen.module.css";

function FileRow({ file, onTag, onDelete }: { file: UploadedFile; onTag: (tag: FileTag) => void; onDelete: () => void }) {
  return (
    <div className={cx(styles.fileRow, file.error && styles.fileRowError)}>
      <div className={styles.fileLine}>
        <span className={styles.fileIcon}>
          <IconFile />
        </span>
        <span className={styles.fileName}>{file.name}</span>
        <select
          value={file.tag}
          onChange={(e) => onTag(e.target.value as FileTag)}
          aria-label={`What ${file.name} is`}
          className={cx(styles.tag, file.tag === "Resume" && styles.tagResume)}
        >
          {FILE_TAGS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button onClick={onDelete} aria-label={`Remove ${file.name}`} className={styles.remove}>
          ×
        </button>
      </div>
      {file.error && <div className={styles.fileError}>{file.error}</div>}
    </div>
  );
}

export function OnboardingScreen({ files, onAdd, onTag, onDelete, onNext }: {
  files: UploadedFile[];
  onAdd: (list: FileList, tag: FileTag) => Promise<void>;
  onTag: (id: string, tag: FileTag) => void;
  onDelete: (id: string) => void;
  onNext: () => void;
}) {
  // How many uploads are being read: a count, so a second drop finishing first
  // doesn't re-enable the buttons while the first is still being read.
  const [reading, setReading] = useState(0);
  const parsing = reading > 0;
  const [contextExpanded, setContextExpanded] = useState(false);
  const [contextTag, setContextTag] = useState<FileTag>("Cover Letter");
  const resumeRef = useRef<HTMLInputElement>(null);
  const contextRef = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | null, tag: FileTag) => {
    if (!list?.length) return;
    setReading((n) => n + 1);
    try {
      await onAdd(list, tag);
    } finally {
      setReading((n) => n - 1);
    }
  };

  // With "Add more context" open, dropped files are context of the type chosen there.
  const { isDragging, handlers } = useFileDrop((list) => void add(list, contextExpanded ? contextTag : "Resume"));
  const resumes = files.filter((f) => f.tag === "Resume" && !f.error);
  const canContinue = resumes.length > 0 && !parsing;
  const contextCount = files.filter((f) => f.tag !== "Resume").length;

  return (
    <div className={styles.screen} {...handlers}>
      <div className={styles.intro}>
        <h2 className={styles.introTitle}>
          Create a Strong,
          <br />
          Tailored Resume
        </h2>
        <div className={styles.examples}>
          {[
            { label: "Original", lines: HERO_BULLETS.map((b) => b.original), muted: true },
            { label: "Tailored", lines: HERO_BULLETS.map((b) => b.tailored), muted: false },
          ].map(({ label, lines, muted }) => (
            <div key={label} className={cx(styles.example, muted && styles.exampleMuted)}>
              <div className={styles.exampleLabel}>{label}</div>
              {lines.map((l) => (
                <div key={l} className={styles.exampleLine}>
                  {l}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.form}>
        <h3 className={styles.formTitle}>Upload your resume</h3>
        <button
          onClick={() => resumeRef.current?.click()}
          disabled={parsing}
          className={cx(styles.drop, resumes.length > 0 && styles.dropFilled, isDragging && styles.dropActive)}
        >
          <div className={styles.dropText}>
            {parsing
              ? "Reading files…"
              : resumes.length
                ? `${resumes.length} resume${resumes.length > 1 ? "s" : ""} uploaded. Click to add more`
                : "Drop your resume here, or click to browse"}
          </div>
          <div className={styles.dropHint}>PDF, Word (.docx), PowerPoint (.pptx) or text</div>
        </button>
        <input ref={resumeRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { void add(e.target.files, "Resume"); e.target.value = ""; }} />

        {files.length > 0 && (
          <div className={styles.files}>
            {files.map((f) => (
              <FileRow key={f.id} file={f} onTag={(tag) => onTag(f.id, tag)} onDelete={() => onDelete(f.id)} />
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div>
            <button onClick={() => setContextExpanded((v) => !v)} aria-expanded={contextExpanded} className={styles.more}>
              <span className={styles.moreSign}>{contextExpanded ? "−" : "+"}</span> Add more context
            </button>
            {contextExpanded && (
              <div className={styles.context}>
                <p className={styles.contextText}>More context means better tailoring. Add cover letters, writing samples or project documents.</p>
                <div className={styles.contextRow}>
                  <select value={contextTag} onChange={(e) => setContextTag(e.target.value as FileTag)} aria-label="What the files are" className={styles.contextSelect}>
                    {FILE_TAGS.filter((t) => t !== "Resume").map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <button onClick={() => contextRef.current?.click()} disabled={parsing} className={cx(shared.btn, shared.primary, shared.small)}>
                    <IconUpload />
                    {parsing ? "Reading…" : "Add file"}
                  </button>
                  <input ref={contextRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { void add(e.target.files, contextTag); e.target.value = ""; }} />
                </div>
                {contextCount > 0 && (
                  <div className={styles.contextCount}>
                    {contextCount} context file{contextCount > 1 ? "s" : ""} added.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button onClick={onNext} disabled={!canContinue} className={cx(shared.btn, shared.primary, shared.block, styles.continue)}>
          Continue to Workspace →
        </button>
        {!canContinue && !parsing && (
          <p className={cx(shared.note, styles.hint)}>
            {files.length ? "Tag at least one readable file as Resume to continue" : "Upload your resume to continue"}
          </p>
        )}
      </div>
    </div>
  );
}
