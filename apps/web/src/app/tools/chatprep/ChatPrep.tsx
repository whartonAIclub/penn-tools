"use client";

// ChatPrep's page: the student's profile (kept in this browser), the chat's
// details, and the brief. The resume and the person's profile can be pasted,
// uploaded as files, or both. Generating posts to brief/route.ts.

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Brief, FileLimits, UploadedFile } from "@penntools/tool-chatprep";
import { ACCEPT, readFile, uniqueName } from "./readFile";
import styles from "./ChatPrep.module.css";

type Upload = "resume" | "profile" | "news";

interface BriefError {
  /** The AIError kind, when the AI API failed. */
  kind?: string;
  message: string;
}

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "done"; brief: Brief; text: string; company: string }
  | { state: "error"; error: BriefError };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit"]);

// The profile is saved only in this browser, so it's there for the next chat.
const PROFILE_KEY = "chatprep:profile";

interface Limits {
  resume: number;
  targetRoles: number;
  weighing: number;
  profile: number;
  company: number;
  news: number;
}

export function ChatPrep({
  providers,
  labels,
  closingLine,
  tips,
  limits,
  fileLimits,
}: {
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  closingLine: string;
  tips: string[];
  limits: Limits;
  fileLimits: FileLimits;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [resume, setResume] = useState("");
  const [resumeFile, setResumeFile] = useState<UploadedFile | null>(null);
  const [profileFiles, setProfileFiles] = useState<UploadedFile[]>([]);
  const [newsFiles, setNewsFiles] = useState<UploadedFile[]>([]);
  const [reading, setReading] = useState<Upload | null>(null);
  const [fileError, setFileError] = useState<{ which: Upload; message: string } | null>(null);
  const [targetRoles, setTargetRoles] = useState("");
  const [weighing, setWeighing] = useState("");
  const [profile, setProfile] = useState("");
  const [company, setCompany] = useState("");
  const [news, setNews] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [copied, setCopied] = useState(false);

  // Read the saved profile after the first render, since the server has no localStorage.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as Record<string, unknown> | null;
      if (typeof saved?.resume === "string") setResume(saved.resume);
      if (typeof saved?.targetRoles === "string") setTargetRoles(saved.targetRoles);
      if (typeof saved?.weighing === "string") setWeighing(saved.weighing);
      const file = saved?.resumeFile as UploadedFile | null | undefined;
      if (file && typeof file.name === "string" && typeof file.mediaType === "string" && typeof file.data === "string") setResumeFile(file);
    } catch {
      // A corrupt or blocked entry just means starting with a blank profile.
    }
  }, []);

  function saveProfile() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ resume, targetRoles, weighing, resumeFile }));
    } catch {
      // Storage can be full or blocked (a large resume file may not fit); the brief still works without saving.
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ resume, targetRoles, weighing }));
      } catch {
        // nothing more to do
      }
    }
  }

  /** Reads dropped, chosen or pasted files. A resume file replaces the current one; profile and news files are added. */
  async function addFiles(which: Upload, files: File[]) {
    if (!files.length) return;
    setFileError(null);
    const max = { resume: fileLimits.resumeFiles, profile: fileLimits.profileFiles, news: fileLimits.newsFiles }[which];
    const current = { resume: [], profile: profileFiles, news: newsFiles }[which];
    if (current.length + files.length > max) {
      const what = { resume: "your resume", profile: "their profile", news: "the news" }[which];
      setFileError({ which, message: max === 1 ? `Upload one file for ${what}.` : `Upload at most ${max} files for ${what}.` });
      return;
    }
    setReading(which);
    try {
      const added: UploadedFile[] = [];
      for (const file of files) {
        const read = await readFile(file, fileLimits);
        added.push({ ...read, name: uniqueName(read.name, [...current, ...added].map((f) => f.name)) });
      }
      if (which === "resume") setResumeFile(added[0]!);
      else if (which === "profile") setProfileFiles([...current, ...added]);
      else setNewsFiles([...current, ...added]);
    } catch (error) {
      setFileError({ which, message: error instanceof Error ? error.message : "That file couldn't be read." });
    } finally {
      setReading(null);
    }
  }

  const ready = (resume.trim() || resumeFile) && targetRoles.trim() && (profile.trim() || profileFiles.length) && company.trim() && !reading;

  async function generate() {
    saveProfile();
    setStatus({ state: "loading" });
    setCopied(false);
    try {
      const response = await fetch("/tools/chatprep/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          student: { resume, targetRoles, weighing: weighing || null, resumeFile },
          chat: { profile, company, news: news || null, profileFiles, newsFiles },
        }),
      });
      const result = (await response.json()) as { brief: Brief; text: string } | { error: BriefError };
      setStatus("error" in result ? { state: "error", error: result.error } : { state: "done", ...result, company });
    } catch {
      setStatus({ state: "error", error: { message: "Something went wrong. Try again." } });
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => {},
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>ChatPrep</h1>
      <p className={styles.intro}>
        A one-page brief for your next coffee chat: the company, where your paths overlap, a short intro and questions
        they can&apos;t answer with a search.
      </p>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>You</h2>
        <p className={styles.hint}>Saved in this browser, so you only enter it once.</p>
        <div className={styles.field}>
          Your resume
          <FileDrop
            label="Drop your resume PDF here"
            files={resumeFile ? [resumeFile] : []}
            multiple={false}
            reading={reading === "resume"}
            error={fileError?.which === "resume" ? fileError.message : null}
            onAdd={(files) => void addFiles("resume", files)}
            onRemove={() => setResumeFile(null)}
          />
          <textarea
            aria-label="Your resume, as text"
            className={styles.textarea}
            rows={resumeFile ? 2 : 6}
            placeholder={resumeFile ? "Optional: anything the file leaves out" : "Or paste it as text"}
            value={resume}
            maxLength={limits.resume}
            onChange={(e) => setResume(e.target.value)}
          />
        </div>
        <label className={styles.field}>
          Roles you&apos;re recruiting for
          <input
            className={styles.input}
            placeholder="e.g. MBB consulting, healthcare strategy"
            value={targetRoles}
            maxLength={limits.targetRoles}
            onChange={(e) => setTargetRoles(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          A choice you&apos;re weighing (optional)
          <input
            className={styles.input}
            placeholder="e.g. a big firm vs. a boutique"
            value={weighing}
            maxLength={limits.weighing}
            onChange={(e) => setWeighing(e.target.value)}
          />
        </label>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>This chat</h2>
        <label className={styles.field}>
          Company
          <input className={styles.input} value={company} maxLength={limits.company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <div className={styles.field}>
          Their LinkedIn profile or bio
          <FileDrop
            label="Drop screenshots of their profile, or its PDF, here"
            hint={`On LinkedIn: More → Save to PDF, or take screenshots. Up to ${fileLimits.profileFiles} files.`}
            files={profileFiles}
            multiple
            reading={reading === "profile"}
            error={fileError?.which === "profile" ? fileError.message : null}
            onAdd={(files) => void addFiles("profile", files)}
            onRemove={(i) => setProfileFiles(profileFiles.filter((_, j) => j !== i))}
          />
          <textarea
            aria-label="Their profile or bio, as text"
            className={styles.textarea}
            rows={profileFiles.length ? 2 : 6}
            placeholder={profileFiles.length ? "Optional: anything the files leave out" : "Or paste their profile or bio as text (you can paste screenshots here too)"}
            value={profile}
            maxLength={limits.profile}
            onChange={(e) => setProfile(e.target.value)}
            onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void addFiles("profile", files);
              }
            }}
          />
        </div>
        <div className={styles.field}>
          Recent news about the company (optional)
          <FileDrop
            label="Drop articles here, as PDFs or screenshots"
            hint={`To save an article as a PDF: File → Print → Save as PDF. Up to ${fileLimits.newsFiles} files.`}
            files={newsFiles}
            multiple
            reading={reading === "news"}
            error={fileError?.which === "news" ? fileError.message : null}
            onAdd={(files) => void addFiles("news", files)}
            onRemove={(i) => setNewsFiles(newsFiles.filter((_, j) => j !== i))}
          />
          <textarea
            aria-label="Recent news, as text"
            className={styles.textarea}
            rows={3}
            placeholder="Or paste an article or two (you can paste screenshots here too). ChatPrep can't search the web, so without news the brief only covers general background."
            value={news}
            maxLength={limits.news}
            onChange={(e) => setNews(e.target.value)}
            onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void addFiles("news", files);
              }
            }}
          />
        </div>

        <div className={styles.row}>
          {providers.length > 1 && (
            <select aria-label="Provider" className={styles.select} value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {labels[p]}
                </option>
              ))}
            </select>
          )}
          <button className={styles.button} onClick={() => void generate()} disabled={status.state === "loading" || !ready}>
            {status.state === "loading" ? "Writing your brief…" : "Make my brief"}
          </button>
        </div>
      </section>

      {status.state === "error" && (
        <p className={styles.error}>
          {status.error.message}
          {status.error.kind && KEY_PROBLEMS.has(status.error.kind) && (
            <>
              {" "}
              <Link href="/settings" className={styles.link}>
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      {status.state === "done" && (
        <BriefView
          brief={status.brief}
          company={status.company}
          closingLine={closingLine}
          tips={tips}
          copied={copied}
          onCopy={() => copy(status.text)}
        />
      )}
    </div>
  );
}

/** A drop zone with a file picker, and the files already added. */
function FileDrop({
  label,
  hint,
  files,
  multiple,
  reading,
  error,
  onAdd,
  onRemove,
}: {
  label: string;
  hint?: string;
  files: UploadedFile[];
  multiple: boolean;
  reading: boolean;
  error: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    onAdd(Array.from(e.dataTransfer.files));
  }

  return (
    <>
      <div
        className={`${styles.drop} ${over ? styles.dropOver : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <span>{reading ? "Reading…" : label}</span>
        <button type="button" className={styles.copy} onClick={() => input.current?.click()} disabled={reading}>
          Choose {multiple ? "files" : "a file"}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept={ACCEPT}
          multiple={multiple}
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = ""; // so choosing the same file again still fires
          }}
        />
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
      {files.length > 0 && (
        <ul className={styles.files}>
          {files.map((file, i) => (
            <li key={file.name}>
              {file.name}
              <button type="button" className={styles.remove} aria-label={`Remove ${file.name}`} onClick={() => onRemove(i)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <span className={styles.fileError}>{error}</span>}
    </>
  );
}

function BriefView({
  brief,
  company,
  closingLine,
  tips,
  copied,
  onCopy,
}: {
  brief: Brief;
  company: string;
  closingLine: string;
  tips: string[];
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <article className={styles.brief}>
      <div className={styles.briefHeader}>
        <h2 className={styles.cardTitle}>Your brief: {company}</h2>
        <button className={styles.copy} onClick={onCopy}>
          {copied ? "Copied" : "Copy as text"}
        </button>
      </div>

      <h3 className={styles.heading}>The company</h3>
      <p>{brief.company.summary}</p>
      {brief.company.recentChanges.length > 0 ? (
        <ul className={styles.list}>
          {brief.company.recentChanges.map((change, i) => (
            <li key={i}>{change}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>General background only. Add news for recent changes.</p>
      )}

      <h3 className={styles.heading}>Where your paths overlap</h3>
      <ul className={styles.list}>
        {brief.overlaps.map((o, i) => (
          <li key={i}>
            {o.point}
            <div className={styles.say}>Say: &ldquo;{o.howToUse}&rdquo;</div>
          </li>
        ))}
      </ul>

      <h3 className={styles.heading}>Your intro</h3>
      <p>{brief.intro}</p>

      <h3 className={styles.heading}>Questions</h3>
      <ol className={styles.list}>
        {brief.questions.map((q, i) => (
          <li key={i}>
            {q.question}
            <div className={styles.hint}>Follow-up: {q.followUp}</div>
            <div className={styles.why}>
              {q.coreQuestionId ? `From core question ${q.coreQuestionId}. ` : "New question. "}
              {q.whyThisPerson}
            </div>
          </li>
        ))}
      </ol>
      <p>
        <strong>Close:</strong> {closingLine}
      </p>

      <h3 className={styles.heading}>During and after the chat</h3>
      <ul className={styles.list}>
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </article>
  );
}
