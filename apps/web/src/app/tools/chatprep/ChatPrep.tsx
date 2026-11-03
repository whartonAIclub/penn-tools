"use client";

// ChatPrep's page: the student's profile (kept in this browser), the chat's
// details, and the brief. Generating calls makeBrief in actions.ts.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AIProvider } from "@penntools/core/ai";
import type { Brief } from "@penntools/tool-chatprep";
import { makeBrief, type BriefError } from "./actions";
import styles from "./ChatPrep.module.css";

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
}: {
  /** Providers the user has saved keys for; never empty. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
  closingLine: string;
  tips: string[];
  limits: Limits;
}) {
  const [provider, setProvider] = useState(providers[0]!);
  const [resume, setResume] = useState("");
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
    } catch {
      // A corrupt or blocked entry just means starting with a blank profile.
    }
  }, []);

  function saveProfile() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ resume, targetRoles, weighing }));
    } catch {
      // Storage can be full or blocked; the brief still works without saving.
    }
  }

  const ready = resume.trim() && targetRoles.trim() && profile.trim() && company.trim();

  async function generate() {
    saveProfile();
    setStatus({ state: "loading" });
    setCopied(false);
    try {
      const result = await makeBrief(provider, { resume, targetRoles, weighing: weighing || null }, { profile, company, news: news || null });
      setStatus(result.ok ? { state: "done", ...result.data, company } : { state: "error", error: result.error });
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
        <label className={styles.field}>
          Your resume, as text
          <textarea className={styles.textarea} rows={6} value={resume} maxLength={limits.resume} onChange={(e) => setResume(e.target.value)} />
        </label>
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
        <label className={styles.field}>
          Their LinkedIn profile or bio, pasted
          <textarea className={styles.textarea} rows={6} value={profile} maxLength={limits.profile} onChange={(e) => setProfile(e.target.value)} />
        </label>
        <label className={styles.field}>
          Recent news about the company (optional)
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="Paste an article or two. ChatPrep can't search the web, so without this the brief only covers general background."
            value={news}
            maxLength={limits.news}
            onChange={(e) => setNews(e.target.value)}
          />
        </label>

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
        <p className={styles.hint}>General background only. Paste news for recent changes.</p>
      )}

      <h3 className={styles.heading}>Where your paths overlap</h3>
      <ul className={styles.list}>
        {brief.overlaps.map((o, i) => (
          <li key={i}>
            {o.point} <span className={styles.hint}>{o.howToUse}</span>
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
