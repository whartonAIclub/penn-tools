"use client";

// The All feedback tab: every tagged comment, the written answers still to
// tag, tagging with AI (through the server action in actions.ts) or by hand,
// and feedback added from outside the survey.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MAX_ANSWERS_PER_BATCH,
  MAX_TOPICS,
  needsPrivacyLook,
  nextTagId,
  TAG_TYPES,
  type Tag,
  type UntaggedAnswer,
  type Workspace,
} from "@penntools/tool-feedback-insights";
import { tagBatch, type ActionError } from "./actions";
import { Badge, plural, Short, typeTone, type AIAccess, type TabProps } from "./shared";
import styles from "./FeedbackInsights.module.css";

const KEY_PROBLEMS = new Set(["missing_key", "invalid_key", "no_credit", "credit_used"]);
const PAGE = 100;
const DROPPED: Record<string, string> = {
  orphan: "Not counted: its response isn't in the file",
  excluded: "Not counted: its response is excluded",
  repeat_id: "Not counted: repeats another tag's ID",
  same_content: "Not counted: repeats another tag",
};

/** Which comments to open on: set when the user arrives by clicking a count on another tab. */
export interface Focus {
  theme: string;
  type: string;
}

interface Draft {
  /** Index in ws.tags when editing; null for a new tag. */
  index: number | null;
  responseId: string;
  source: string;
  question: string;
  text: string;
  theme: string;
  topic: string;
  type: string;
  /** New feedback from outside the survey: source and label are typed in. */
  outside: boolean;
}

function TagForm({
  draft,
  themes,
  topics,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  themes: string[];
  topics: string[];
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const themeChoices = themes.includes(draft.theme) || !draft.theme ? themes : [...themes, draft.theme];
  const typeChoices: string[] = (TAG_TYPES as readonly string[]).includes(draft.type) ? [...TAG_TYPES] : [...TAG_TYPES, draft.type];
  const ready = draft.text.trim() !== "" && draft.theme !== "" && (!draft.outside || (draft.source.trim() !== "" && draft.responseId.trim() !== ""));
  return (
    <div className={styles.form}>
      {draft.outside && (
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            Where it came from
            <input
              className={styles.input}
              value={draft.source}
              placeholder="Interview, Slack, email…"
              onChange={(e) => onChange({ ...draft, source: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            A label for who said it (not their name)
            <input
              className={styles.input}
              value={draft.responseId}
              placeholder="Interview 3"
              onChange={(e) => onChange({ ...draft, responseId: e.target.value })}
            />
          </label>
        </div>
      )}
      <label className={styles.field}>
        What was said (replace any name with a role, like [mentor])
        <textarea className={styles.textarea} rows={3} value={draft.text} onChange={(e) => onChange({ ...draft, text: e.target.value })} />
      </label>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Theme
          <select className={styles.select} value={draft.theme} onChange={(e) => onChange({ ...draft, theme: e.target.value })}>
            <option value="">Choose…</option>
            {themeChoices.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Topic (2-4 words)
          <input
            className={styles.input}
            list="fi-topics"
            value={draft.topic}
            maxLength={60}
            placeholder="Slow PR review"
            onChange={(e) => onChange({ ...draft, topic: e.target.value })}
          />
          <datalist id="fi-topics">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className={styles.field}>
          Type
          <select className={styles.select} value={draft.type} onChange={(e) => onChange({ ...draft, type: e.target.value })}>
            {typeChoices.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.buttonPrimary} disabled={!ready} onClick={onSave}>
          Save tag
        </button>
        <button type="button" className={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Feedback({ ws, analysis, update, ai, focus }: TabProps & { ai: AIAccess; focus: Focus | null }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [theme, setTheme] = useState(focus?.theme ?? "");
  const [type, setType] = useState(focus?.type ?? "");
  const [search, setSearch] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [showAllUntagged, setShowAllUntagged] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const stop = useRef(false);

  const topics = useMemo(() => [...new Set(analysis.comments.map((c) => c.topic).filter(Boolean))].sort(), [analysis.comments]);
  const themes = ws.setup.themes;
  const untagged = analysis.untagged;
  const labelOf = useMemo(() => new Map(ws.setup.questions.map((q) => [q.column, q.label])), [ws.setup.questions]);

  const newDraft = (answer: UntaggedAnswer | null): Draft => ({
    index: null,
    responseId: answer?.responseId ?? "",
    source: answer ? ws.setup.surveySource : "",
    question: answer?.question ?? "",
    text: answer?.text ?? "",
    theme: "",
    topic: "",
    type: "Pain point",
    outside: !answer,
  });

  function saveDraft() {
    if (!draft) return;
    const fields = {
      responseId: draft.responseId.trim(),
      source: draft.source.trim(),
      question: draft.question,
      text: draft.text.trim(),
      theme: draft.theme,
      topic: draft.topic.trim().replace(/\s+/g, " "),
      type: draft.type,
    };
    update((w) => {
      if (draft.index != null) return { ...w, tags: w.tags.map((t, i) => (i === draft.index ? { ...t, ...fields } : t)) };
      return { ...w, tags: [...w.tags, { id: nextTagId(w.tags), ...fields }] };
    });
    setDraft(null);
  }

  const skip = (answer: UntaggedAnswer) => update((w) => ({ ...w, skipped: [...w.skipped, { responseId: answer.responseId, question: answer.question }] }));

  async function tagWithAI() {
    const provider = ai.provider;
    if (!provider || progress) return;
    const todo = untagged;
    stop.current = false;
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: todo.length });
    let added = 0;
    let nothing = 0;
    let privacy = 0;
    let knownTopics = topics;
    const made = new Set<string>();
    try {
      for (let start = 0; start < todo.length && !stop.current; start += MAX_ANSWERS_PER_BATCH) {
        const batch = todo.slice(start, start + MAX_ANSWERS_PER_BATCH);
        const reply = await tagBatch(
          provider,
          themes,
          knownTopics.slice(0, MAX_TOPICS),
          batch.map((a, i) => ({ ref: start + i, question: labelOf.get(a.question) ?? a.question, text: a.text })),
        );
        if (!reply.ok) {
          setError(reply.error);
          break;
        }
        const proposed = reply.data.tags;
        // Only answers the AI said have nothing to tag are set aside; one it left out stays to tag, for the next run.
        const none = new Set(reply.data.nothingToTag);
        const empty = batch.filter((_, i) => none.has(start + i));
        knownTopics = [...new Set([...knownTopics, ...proposed.map((p) => p.topic).filter(Boolean)])];
        privacy += proposed.filter(needsPrivacyLook).length;
        added += proposed.length;
        nothing += empty.length;
        update((w): Workspace => {
          const tags: Tag[] = [...w.tags];
          for (const p of proposed) {
            const answer = todo[p.ref];
            if (!answer) continue;
            const id = nextTagId(tags);
            made.add(id);
            tags.push({
              id,
              responseId: answer.responseId,
              source: w.setup.surveySource,
              question: answer.question,
              text: p.text,
              theme: p.theme,
              topic: p.topic,
              type: p.type,
            });
          }
          return { ...w, tags, skipped: [...w.skipped, ...empty.map((a) => ({ responseId: a.responseId, question: a.question }))] };
        });
        setProgress({ done: Math.min(start + batch.length, todo.length), total: todo.length });
      }
    } catch {
      setError({ message: "Something went wrong while tagging. The tags made so far were kept; try again for the rest." });
    }
    setFresh(made);
    setProgress(null);
    if (added + nothing > 0) {
      setOnlyNew(added > 0);
      setResult(
        `AI added ${added} ${plural(added, "tag", "tags")}` +
          (nothing ? ` and found nothing to tag in ${nothing} ${plural(nothing, "answer", "answers")}` : "") +
          ". Read through them below and edit or delete any that are wrong." +
          (privacy ? ` ${privacy} may still show a name: see the warning at the top of the page.` : ""),
      );
    }
  }

  const needle = search.trim().toLowerCase();
  const rows = analysis.tags
    .map((tag, index) => ({ tag, index }))
    .filter(
      ({ tag }) =>
        (!theme || tag.theme === theme) &&
        (!type || tag.type === type) &&
        (!onlyNew || fresh.has(tag.id)) &&
        (!needle || `${tag.text} ${tag.topic}`.toLowerCase().includes(needle)),
    );
  const usedThemes = [...new Set([...themes, ...analysis.tags.map((t) => t.theme)])].filter(Boolean);
  const visibleUntagged = showAllUntagged ? untagged : untagged.slice(0, 5);

  return (
    <>
      {untagged.length > 0 && (
        <section className={styles.callout}>
          <h2 className={styles.h2}>
            {untagged.length} written {plural(untagged.length, "answer", "answers")} to sort
          </h2>
          <p className={styles.muted}>
            Written answers can&apos;t be counted until each one is tagged with a theme (the area it&apos;s about), a topic (the specific issue) and a type
            (pain point, working or idea). For example, “Our PR sat waiting for 4 days” becomes The PennTools platform · Slow PR review · Pain point. Tagged
            answers are what the Themes tab and the Summary&apos;s ranking are built from.
          </p>
          {!ai.signedIn ? (
            <p className={styles.muted}>Sign in with the button at the top right to have AI sort these for you, or tag them by hand below.</p>
          ) : ai.providers.length === 0 || !ai.provider ? (
            <p className={styles.muted}>
              You&apos;ve used your free AI credit. Add an API key in{" "}
              <Link href="/settings" className={styles.link}>
                Settings
              </Link>{" "}
              to tag with AI, or tag by hand below.
            </p>
          ) : themes.length === 0 ? (
            <p className={styles.muted}>Add at least one theme on the Setup tab before tagging.</p>
          ) : (
            <>
              <div className={styles.actions}>
                <button type="button" className={styles.buttonPrimary} disabled={progress != null} onClick={() => void tagWithAI()}>
                  {progress
                    ? `Sorting… ${progress.done} of ${progress.total}`
                    : `Sort ${untagged.length} ${plural(untagged.length, "answer", "answers")} into themes with AI`}
                </button>
                {progress && (
                  <button type="button" className={styles.button} onClick={() => (stop.current = true)}>
                    Stop after this batch
                  </button>
                )}
                {ai.providers.length > 1 && !progress && (
                  <label className={styles.inlineField}>
                    using
                    <select className={styles.select} value={ai.provider} onChange={(e) => ai.setProvider(e.target.value as (typeof ai.providers)[number])}>
                      {ai.providers.map((p) => (
                        <option key={p} value={p}>
                          {ai.labels[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <p className={styles.muted}>
                Sends these answers to {ai.labels[ai.provider]} in about {Math.ceil(untagged.length / MAX_ANSWERS_PER_BATCH)}{" "}
                {plural(Math.ceil(untagged.length / MAX_ANSWERS_PER_BATCH), "request", "requests")}, using your PennTools AI credit. Emails, phone numbers,
                @handles and names after words like “thanks” or “mentor” are masked first. Other names are sent as written, so you review every tag afterwards.
              </p>
            </>
          )}
          {error && (
            <p className={styles.noticeBad} role="alert">
              {error.message}
              {error.kind && KEY_PROBLEMS.has(error.kind) && (
                <>
                  {" "}
                  <Link href="/settings" className={styles.link}>
                    Open Settings
                  </Link>
                </>
              )}
            </p>
          )}
          <ul className={styles.answerList}>
            {visibleUntagged.map((a) => (
              <li key={`${a.responseId}|${a.question}`} className={styles.answer}>
                <p className={styles.answerMeta}>
                  Response {a.responseNumber} · <Short text={labelOf.get(a.question) ?? a.question} max={70} />
                </p>
                <p className={styles.answerText}>{a.text}</p>
                {draft && draft.index == null && !draft.outside && draft.responseId === a.responseId && draft.question === a.question ? (
                  <TagForm draft={draft} themes={themes} topics={topics} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
                ) : (
                  <div className={styles.actions}>
                    <button type="button" className={styles.buttonSmall} disabled={progress != null} onClick={() => setDraft(newDraft(a))}>
                      Tag by hand
                    </button>
                    <button type="button" className={styles.buttonSmall} disabled={progress != null} onClick={() => skip(a)}>
                      Nothing to tag
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {untagged.length > 5 && (
            <button type="button" className={styles.linkButton} onClick={() => setShowAllUntagged((v) => !v)}>
              {showAllUntagged ? "Show fewer" : `Show all ${untagged.length}`}
            </button>
          )}
        </section>
      )}

      {result && (
        <p className={styles.notice} role="status">
          {result}
        </p>
      )}

      <section className={styles.section}>
        {focus && (theme === focus.theme || type === focus.type) && (
          <p className={styles.notice} role="status">
            Showing {[type, theme].filter(Boolean).join(" comments in ") || "all comments"}.{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setTheme("");
                setType("");
              }}
            >
              Show all comments
            </button>
          </p>
        )}
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Tagged comments ({analysis.comments.length})</h2>
          <button type="button" className={styles.button} onClick={() => setDraft(newDraft(null))}>
            Add feedback from elsewhere
          </button>
        </div>
        {draft && draft.index == null && draft.outside && (
          <TagForm draft={draft} themes={themes} topics={topics} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
        )}

        {analysis.tags.length === 0 ? (
          <p className={styles.empty}>No tags yet. A tag is one point from a written answer, with a theme, a short topic and a type.</p>
        ) : (
          <>
            <div className={styles.filters}>
              <label className={styles.inlineField}>
                Theme
                <select className={styles.select} value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="">All</option>
                  {usedThemes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inlineField}>
                Type
                <select className={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">All</option>
                  {TAG_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.inlineField}>
                Search
                <input className={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              {fresh.size > 0 && (
                <label className={styles.checkField}>
                  <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> Only the {fresh.size} AI just added
                </label>
              )}
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Comment</th>
                    <th>Theme</th>
                    <th>Topic</th>
                    <th>Type</th>
                    <th>
                      <span className={styles.srOnly}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map(({ tag, index }) =>
                    draft && draft.index === index ? (
                      <tr key={index}>
                        <td colSpan={6}>
                          <TagForm draft={draft} themes={themes} topics={topics} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={index} className={tag.dropped ? styles.rowMuted : undefined}>
                        <td data-label="From">
                          {tag.other ? `${tag.source} · ${tag.responseId}` : tag.responseNumber != null ? `Response ${tag.responseNumber}` : "Unknown response"}
                          {tag.dropped && <span className={styles.quote}>{DROPPED[tag.dropped]}</span>}
                        </td>
                        <td data-label="Comment">
                          {tag.text || <span className={styles.muted}>(no text)</span>}
                          {tag.question && (
                            <span className={styles.quote}>
                              <Short text={labelOf.get(tag.question) ?? tag.question} max={60} />
                            </span>
                          )}
                        </td>
                        <td data-label="Theme">{tag.theme || <span className={styles.muted}>(none)</span>}</td>
                        <td data-label="Topic">{tag.topic || <span className={styles.muted}>(none)</span>}</td>
                        <td data-label="Type">
                          <Badge tone={typeTone(tag.type)}>{tag.type || "(none)"}</Badge>
                        </td>
                        <td className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.buttonSmall}
                            onClick={() => {
                              const original = ws.tags[index];
                              if (original) setDraft({ index, ...original, theme: tag.theme, type: tag.type, outside: false });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.buttonSmall}
                            onClick={() => update((w) => ({ ...w, tags: w.tags.filter((_, i) => i !== index) }))}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className={styles.empty}>No comments match these filters.</p>}
            {rows.length > shown && (
              <button type="button" className={styles.button} onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, rows.length - shown)} more
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
