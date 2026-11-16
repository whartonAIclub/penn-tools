"use client";

// "Fill it in with AI": the user pastes notes and/or adds up to three
// screenshots (paste, drag in, or attach), and one AI call fills in the form
// below. No questions, no chat: the user reviews the form, fills in what the
// AI couldn't find (highlighted there), and saves. Text files dropped or
// attached go into the notes box, read in the browser at no AI cost.

import { useRef, useState } from "react";
import type { AIProvider } from "@penntools/core/ai";
import {
  MAX_SCREENSHOTS,
  MAX_STORY_LENGTH,
  type ContactDraft,
  type IntakeScreenshot,
  type ReviewField,
} from "@penntools/tool-penn-pals";
import type { IntakeResult } from "./actions";
import { SettingsLink } from "../SettingsLink";
import { Collapsible } from "./Collapsible";
import { ACCEPT, isNotesFile, readNotesFile, readScreenshot, uniqueName } from "./screenshots";
import styles from "./Tracker.module.css";

export interface AiAccess {
  signedIn: boolean;
  /** Providers the user can use: on free credit or with a saved key; empty when none. */
  providers: AIProvider[];
  labels: Record<AIProvider, string>;
}

type Status =
  | { state: "idle" }
  | { state: "reading" }
  | { state: "done"; tokens: number; review: boolean }
  | { state: "error"; message: string; keyProblem: boolean };

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);

const TITLE = "✨ Fill it in with AI";
const SUBTITLE = "Paste your notes or drop in screenshots (a LinkedIn profile, a calendar invite, an email). AI fills in the form; you check it and save.";

const PLACEHOLDER =
  "Paste or type your notes, e.g. Coffee with Maria Chen yesterday, PM at Stripe, Wharton alum. Best advice: lead every story with one metric. Offered to intro me to her manager.";

export function AiIntake({
  ai,
  base,
  onFilled,
  onTyping,
}: {
  ai: AiAccess;
  /** For another chat with someone saved: the form with their details. */
  base?: ContactDraft | undefined;
  /** Called with the form's fields, what the AI couldn't find, and what to check, once it's done. */
  onFilled: (draft: ContactDraft, missing: ReviewField[], toCheck: ReviewField[]) => void;
  /** Whether there are notes or screenshots the user would lose by leaving. */
  onTyping: (hasContent: boolean) => void;
}) {
  const [provider, setProvider] = useState<AIProvider | undefined>(ai.providers[0]);
  const [story, setStory] = useState("");
  const [shots, setShots] = useState<IntakeScreenshot[]>([]);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Closed at first, showing only the title and subtitle.
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  if (!ai.signedIn || !provider) {
    return (
      <section className={styles.ai} aria-labelledby="ai-chat-title">
        <Collapsible id="ai-chat" title={TITLE} titleClassName={styles.aiTitle} subtitle={SUBTITLE} open={open} onToggle={setOpen}>
          <p className={styles.aiNote}>
            {!ai.signedIn ? (
              <>Sign in (top right) to try it.</>
            ) : (
              <>
                Add an AI key in <SettingsLink>Settings</SettingsLink>, then reload this page to try it.
              </>
            )}
          </p>
        </Collapsible>
      </section>
    );
  }

  const busy = status.state === "reading" || adding;
  const canSend = !busy && (story.trim().length > 0 || shots.length > 0);

  function changed(nextStory: string, nextShots: IntakeScreenshot[]) {
    onTyping(Boolean(nextStory.trim()) || nextShots.length > 0);
  }

  function updateStory(value: string) {
    setStory(value);
    changed(value, shots);
  }

  /** Adds pasted, dropped or picked files: images as screenshots, text files into the notes. */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setAdding(true);
    setFileNote(null);
    const problems: string[] = [];
    let nextStory = story;
    const nextShots = [...shots];
    for (const file of files) {
      const name = file.name || "Pasted screenshot.png";
      try {
        if (isNotesFile(file)) {
          const text = (await readNotesFile(file)).trim();
          const joined = nextStory.trim() ? `${nextStory.trimEnd()}\n\n${text}` : text;
          if (joined.length > MAX_STORY_LENGTH) problems.push(`${name} was cut to fit the ${MAX_STORY_LENGTH.toLocaleString()}-character limit.`);
          nextStory = joined.slice(0, MAX_STORY_LENGTH);
        } else if (nextShots.length >= MAX_SCREENSHOTS) {
          problems.push(`Up to ${MAX_SCREENSHOTS} screenshots; ${name} wasn't added.`);
        } else {
          nextShots.push(await readScreenshot(file, uniqueName(name, nextShots.map((s) => s.name))));
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : `${name} couldn't be added.`);
      }
    }
    setStory(nextStory);
    setShots(nextShots);
    changed(nextStory, nextShots);
    setFileNote(problems.join(" ") || null);
    setAdding(false);
  }

  function removeShot(name: string) {
    const next = shots.filter((s) => s.name !== name);
    setShots(next);
    changed(story, next);
  }

  async function read() {
    setStatus({ state: "reading" });
    try {
      const response = await fetch("/tools/penn-pals/tracker/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, story, screenshots: shots, base }),
      });
      if (response.status === 401) {
        return setStatus({ state: "error", message: "Sign in with the button at the top right to use the AI.", keyProblem: false });
      }
      const result = (await response.json()) as IntakeResult;
      if (!result.ok) {
        return setStatus({ state: "error", message: result.error.message, keyProblem: KEY_PROBLEMS.has(result.error.kind ?? "") });
      }
      onFilled(result.draft, result.missing, result.toCheck);
      onTyping(false); // it's in the form now, which asks before leaving
      setStatus({ state: "done", tokens: result.tokens, review: result.missing.length + result.toCheck.length > 0 });
    } catch {
      setStatus({ state: "error", message: "Something went wrong. Try again.", keyProblem: false });
    }
  }

  function startOver() {
    setStory("");
    setShots([]);
    setFileNote(null);
    onTyping(false);
    setStatus({ state: "idle" });
  }

  const step = status.state === "done" ? 3 : status.state === "reading" ? 2 : 1;

  return (
    <section
      className={`${styles.ai} ${dragging ? styles.aiDragging : ""}`}
      aria-labelledby="ai-chat-title"
      onDragOver={(e) => {
        if (status.state === "done" || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (status.state === "done") return;
        e.preventDefault();
        setDragging(false);
        setOpen(true);
        void addFiles([...e.dataTransfer.files]);
      }}
    >
      <Collapsible id="ai-chat" title={TITLE} titleClassName={styles.aiTitle} subtitle={SUBTITLE} open={open} onToggle={setOpen}>
        <ol className={styles.aiSteps} aria-label="How it works">
          <li className={step === 1 ? styles.aiStepNow : ""}>Paste notes or add screenshots</li>
          <li className={step === 2 ? styles.aiStepNow : ""}>AI fills in the form</li>
          <li className={step === 3 ? styles.aiStepNow : ""}>Check it, fill any gaps, and save</li>
        </ol>

        {status.state === "done" ? (
          <p className={styles.aiDone}>
            ✓ The form below is filled in.{" "}
            {status.review ? "Check the highlighted fields, then save." : "Give it a quick look, then save."}{" "}
            <button type="button" className={styles.link} onClick={startOver}>
              Start over
            </button>
            <span className={styles.aiMeta}> · {status.tokens.toLocaleString()} AI tokens used</span>
          </p>
        ) : (
          <>
            <textarea
              aria-label="Your notes about the chat"
              rows={6}
              className={styles.aiStory}
              value={story}
              maxLength={MAX_STORY_LENGTH}
              placeholder={PLACEHOLDER}
              disabled={busy}
              onChange={(e) => updateStory(e.target.value)}
              onPaste={(e) => {
                // A pasted screenshot becomes a screenshot; pasted text goes in as usual.
                const files = [...e.clipboardData.files];
                if (files.length === 0) return;
                e.preventDefault();
                void addFiles(files);
              }}
            />

            {/* The upload area: a big, obvious target to click, drop onto or paste into. */}
            <div className={styles.aiDrop}>
              <button
                type="button"
                className={styles.aiDropButton}
                disabled={busy || shots.length >= MAX_SCREENSHOTS}
                onClick={() => picker.current?.click()}
              >
                <span className={styles.aiDropIcon} aria-hidden="true">
                  📷
                </span>
                <span className={styles.aiDropText}>
                  <strong>
                    {shots.length >= MAX_SCREENSHOTS
                      ? `${MAX_SCREENSHOTS} of ${MAX_SCREENSHOTS} screenshots added`
                      : shots.length > 0
                        ? "Add another screenshot"
                        : "Add screenshots"}
                  </strong>
                  <span>
                    {dragging ? "Drop to add" : "Click to browse, drag them here, or paste with ⌘V"} · LinkedIn profile, calendar invite,
                    email
                  </span>
                </span>
              </button>

              {shots.length > 0 && (
                <ul className={styles.aiShots} aria-label="Screenshots">
                  {shots.map((shot) => (
                    <li key={shot.name} className={styles.aiShot}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local data: URL, nothing for next/image to optimize */}
                      <img src={`data:${shot.mediaType};base64,${shot.data}`} alt={shot.name} />
                      <button
                        type="button"
                        className={styles.aiShotRemove}
                        aria-label={`Remove ${shot.name}`}
                        disabled={busy}
                        onClick={() => removeShot(shot.name)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className={styles.aiHint}>
              Up to {MAX_SCREENSHOTS} screenshots; .txt and .md files go into your notes. For their LinkedIn link, include the address bar
              in your screenshot or paste the link into your notes. Screenshots are only used to fill the form and aren&apos;t saved.
            </p>
            <input
              ref={picker}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = ""; // so picking the same file again still counts
              }}
            />

            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={!canSend} onClick={() => void read()}>
                {status.state === "reading" ? "Filling in…" : adding ? "Adding…" : "Fill in the form"}
              </button>
              {ai.providers.length > 1 && (
                <select aria-label="AI provider" value={provider} disabled={busy} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                  {ai.providers.map((p) => (
                    <option key={p} value={p}>
                      {ai.labels[p]}
                    </option>
                  ))}
                </select>
              )}
              <span className={styles.aiMeta}>
                {story.length.toLocaleString()} / {MAX_STORY_LENGTH.toLocaleString()}
                {shots.length > 0 && ` · ${shots.length}/${MAX_SCREENSHOTS} screenshots`}
              </span>
            </div>

            {fileNote && <p className={styles.aiError}>{fileNote}</p>}
            {status.state === "error" && (
              <p className={styles.aiError}>
                {status.message}
                {status.keyProblem && (
                  <>
                    {" "}
                    <SettingsLink>Open Settings</SettingsLink>, then reload this page. Your notes stay here.
                  </>
                )}
              </p>
            )}
          </>
        )}
      </Collapsible>
    </section>
  );
}
