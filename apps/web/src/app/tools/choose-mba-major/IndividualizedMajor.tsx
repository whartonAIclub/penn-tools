"use client";

// The individualized major builder, shown when a student says they're
// considering one. Wharton asks for a theme, a course plan and a title, and
// for how the courses align with the theme; this step collects each, checks
// them, and downloads the proposal as a Word document.
//
// Claude suggests themes (actions.ts). Choosing one fills in the theme, a
// Claude-suggested title, the theme's courses and a Claude-drafted alignment
// statement for each course, all editable. Ticking another course drafts a
// statement for it too. A statement the student has edited is never
// replaced. The draft and the suggestions are saved in this browser only,
// like the ratings.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DOCX_MIME_TYPE,
  EMPTY_DRAFT,
  INDIVIDUALIZED_MAX_CREDITS,
  MAX_ALIGNMENT_LENGTH,
  MAX_THEME_LENGTH,
  MAX_TITLE_LENGTH,
  OVERLAP_WARNING_SHARE,
  THEME_MIN_COURSES,
  THEME_MIN_RATING,
  candidateCourses,
  isThemeSource,
  checkDraft,
  creditsOf,
  isReady,
  majorOverlaps,
  planCourses,
  proposalDocx,
  proposalFileName,
  sanitizeDraft,
  toggleCourse,
  totalCredits,
  type Catalog,
  type IndividualizedDraft,
  type Rating,
  type Ratings,
  type Taken,
  type ThemeSuggestion,
} from "@penntools/tool-choose-mba-major";
import { suggestAlignmentsAction, suggestThemesAction, type SuggestionError } from "./actions";
import styles from "./CourseRanker.module.css";

/** Whether Claude's suggestions can run: they need sign-in and the student's Anthropic key. */
export type SuggestionAccess = "ready" | "signed_out" | "no_key";

const STORAGE_KEY = "choose-mba-major:individualized";
const KEY_ERRORS = new Set(["missing_key", "invalid_key", "no_credit"]);

interface Saved {
  draft: IndividualizedDraft;
  themes: ThemeSuggestion[];
  alignmentSuggestions: Record<string, string>;
}

function sanitizeThemes(value: unknown): ThemeSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t): ThemeSuggestion[] => {
    if (typeof t !== "object" || t === null) return [];
    const { name, title, summary, courseCodes } = t as Record<string, unknown>;
    if (typeof name !== "string" || typeof summary !== "string" || !Array.isArray(courseCodes)) return [];
    return [
      {
        name,
        // Themes saved before titles were suggested use their name.
        title: typeof title === "string" && title.trim() ? title : name,
        summary,
        courseCodes: courseCodes.filter((c): c is string => typeof c === "string"),
      },
    ];
  });
}

function sanitizeStatements(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return {
      draft: sanitizeDraft(value.draft),
      themes: sanitizeThemes(value.themes),
      alignmentSuggestions: sanitizeStatements(value.alignmentSuggestions),
    };
  } catch {
    return { draft: EMPTY_DRAFT, themes: [], alignmentSuggestions: {} };
  }
}

function save(saved: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage is blocked or full; the page still works for this visit.
  }
}

function cu(credits: number): string {
  return `${credits} CU`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function ErrorNote({ error }: { error: SuggestionError }) {
  return (
    <p className={styles.error} role="alert">
      {error.message}
      {error.kind && KEY_ERRORS.has(error.kind) && (
        <>
          {" "}
          <Link href="/settings" className={styles.link}>
            Open Settings
          </Link>
        </>
      )}
    </p>
  );
}

function AccessNote({ access }: { access: SuggestionAccess }) {
  if (access === "ready") return null;
  return (
    <p className={styles.claudeNote}>
      {access === "signed_out" ? (
        <>To get Claude&apos;s suggestions, sign in with the button at the top right and add an Anthropic API key in Settings.</>
      ) : (
        <>
          To get Claude&apos;s suggestions, add an Anthropic API key in{" "}
          <Link href="/settings" className={styles.link}>
            Settings
          </Link>
          .
        </>
      )}{" "}
      You can still write everything yourself.
    </p>
  );
}

export function IndividualizedMajor({
  catalog,
  ratings,
  taken,
  ratingLabels,
  step,
  suggestionAccess,
  hideHcmOnly,
}: {
  catalog: Catalog;
  ratings: Ratings;
  taken: Taken;
  ratingLabels: Readonly<Record<Rating, string>>;
  step: number;
  suggestionAccess: SuggestionAccess;
  /** The student isn't an HCM major, so Claude shouldn't suggest HCM-majors-only courses. */
  hideHcmOnly: boolean;
}) {
  const { courses } = catalog;
  const [draft, setDraft] = useState<IndividualizedDraft>(EMPTY_DRAFT);
  const [themes, setThemes] = useState<ThemeSuggestion[]>([]);
  const [alignmentSuggestions, setAlignmentSuggestions] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"themes" | null>(null);
  /** Courses Claude is drafting a statement for right now. */
  const [drafting, setDrafting] = useState<ReadonlySet<string>>(() => new Set());
  const [themeError, setThemeError] = useState<SuggestionError | null>(null);
  const [alignmentError, setAlignmentError] = useState<SuggestionError | null>(null);
  const themeInput = useRef<HTMLTextAreaElement>(null);
  // The latest draft and suggestions, for code that runs after an await.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const suggestionsRef = useRef(alignmentSuggestions);
  suggestionsRef.current = alignmentSuggestions;
  /** The plan's courses as last seen, to spot newly ticked ones; null until the saved draft loads. */
  const knownCourses = useRef<readonly string[] | null>(null);
  const newlyTicked = useRef(new Set<string>());
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = load();
    setDraft(saved.draft);
    setThemes(saved.themes);
    setAlignmentSuggestions(saved.alignmentSuggestions);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) save({ draft, themes, alignmentSuggestions });
  }, [restored, draft, themes, alignmentSuggestions]);

  const candidates = useMemo(() => candidateCourses(courses, ratings, taken), [courses, ratings, taken]);
  const plan = useMemo(() => planCourses(draft, courses), [draft, courses]);
  const credits = totalCredits(plan);
  const overlaps = useMemo(() => majorOverlaps(plan), [plan]);
  const requirements = useMemo(() => checkDraft(draft, courses), [draft, courses]);
  const ready = isReady(requirements);
  const courseByCode = useMemo(() => new Map(courses.map((c) => [c.code, c])), [courses]);
  const themeSourceCount = candidates.filter(isThemeSource).length;
  const canDraft = suggestionAccess === "ready";
  const canSuggest = canDraft && busy === null;
  const topOverlap = overlaps[0];

  function update(change: Partial<IndividualizedDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  async function askForThemes() {
    setBusy("themes");
    setThemeError(null);
    try {
      const result = await suggestThemesAction(ratings, [...taken], hideHcmOnly);
      if (!result.ok) setThemeError(result.error);
      else if (result.data.length === 0) setThemeError({ message: "Claude didn't find a theme in these courses. Try rating more." });
      else setThemes(result.data);
    } catch {
      setThemeError({ message: "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  }

  /** Whether a statement box is empty or still holds Claude's draft, so a new draft may replace it. */
  function isUntouched(
    code: string,
    current: IndividualizedDraft = draftRef.current,
    suggestions: Record<string, string> = suggestionsRef.current,
  ): boolean {
    const text = (current.alignments[code] ?? "").trim();
    return !text || text === (suggestions[code] ?? "").trim();
  }

  /**
   * Asks Claude to draft statements for `only` (courses in `planCodes`), then
   * fills them into the boxes the student hasn't edited.
   */
  async function draftStatements(theme: string, planCodes: readonly string[], only: readonly string[]) {
    if (!canDraft || !theme.trim() || only.length === 0) return;
    setDrafting((current) => new Set([...current, ...only]));
    setAlignmentError(null);
    try {
      const result = await suggestAlignmentsAction(theme, [...planCodes], [...only]);
      if (!result.ok) {
        setAlignmentError(result.error);
        return;
      }
      const before = suggestionsRef.current;
      setDraft((current) => {
        const alignments = { ...current.alignments };
        for (const [code, text] of Object.entries(result.data)) {
          if (current.courses.includes(code) && isUntouched(code, current, before)) alignments[code] = text;
        }
        return { ...current, alignments };
      });
      setAlignmentSuggestions((current) => ({ ...current, ...result.data }));
    } catch {
      setAlignmentError({ message: "Something went wrong. Try again." });
    } finally {
      setDrafting((current) => new Set([...current].filter((code) => !only.includes(code))));
    }
  }

  // When the student ticks courses, draft statements for them, together once
  // they pause for a moment.
  useEffect(() => {
    if (!restored) return;
    const before = knownCourses.current;
    knownCourses.current = draft.courses;
    if (before === null) return;
    // Only empty boxes: a course ticked again keeps the statement it had.
    const added = draft.courses.filter((code) => !before.includes(code) && !(draft.alignments[code] ?? "").trim());
    if (added.length === 0 || !canDraft || !draft.theme.trim()) return;
    for (const code of added) newlyTicked.current.add(code);
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => {
      const current = draftRef.current;
      const only = [...newlyTicked.current].filter((code) => current.courses.includes(code));
      newlyTicked.current.clear();
      void draftStatements(current.theme, current.courses, only);
    }, 700);
    // Runs on changes to the plan's courses only; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, draft.courses]);

  useEffect(() => () => {
    if (tickTimer.current) clearTimeout(tickTimer.current);
  }, []);

  /** Redrafts every statement the student hasn't edited. */
  function redraftAll() {
    const codes = plan.map((c) => c.code);
    void draftStatements(draft.theme, codes, codes.filter((code) => isUntouched(code)));
  }

  /**
   * Fills in the theme, Claude's title and the theme's courses, then drafts a
   * statement for each course. Statements the student wrote themselves stay.
   */
  function applyTheme(theme: ThemeSuggestion) {
    const courses = theme.courseCodes.filter((code) => courseByCode.has(code));
    const kept = Object.fromEntries(
      Object.entries(draft.alignments).filter(([code]) => courses.includes(code) && !isUntouched(code)),
    );
    // The theme's courses are drafted below, so the tick watcher skips them.
    knownCourses.current = courses;
    setDraft((current) => ({ ...current, theme: theme.summary, title: theme.title, courses, alignments: kept }));
    void draftStatements(
      theme.summary,
      courses,
      courses.filter((code) => !(code in kept)),
    );
  }

  function writeOwnTheme() {
    update({ theme: "" });
    themeInput.current?.focus();
  }

  function download() {
    const preparedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const bytes = proposalDocx(draft, catalog, preparedOn);
    const url = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME_TYPE }));
    const link = document.createElement("a");
    link.href = url;
    link.download = proposalFileName(draft.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className={styles.card} id="individualized">
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <span className={styles.step}>{step}</span> Your individualized major
        </h2>
      </div>
      <p className={styles.note}>
        Wharton asks for a theme, a course plan of up to {cu(INDIVIDUALIZED_MAX_CREDITS)} and a title, and for how each
        course aligns with the theme. Build each part here, then download your proposal as a Word document. Your draft
        is saved in this browser only.
      </p>
      <AccessNote access={suggestionAccess} />

      {/* ── Theme ─────────────────────────────────────────────────────────── */}
      <div className={styles.part}>
        <h3 className={styles.partTitle}>Theme</h3>
        <div className={styles.claudeBox}>
          <div className={styles.claudeHead}>
            <span className={styles.claudeLabel}>Claude&apos;s suggestions</span>
            <button
              type="button"
              className={styles.secondary}
              disabled={!canSuggest || themeSourceCount < THEME_MIN_COURSES}
              onClick={askForThemes}
            >
              {busy === "themes" ? "Thinking…" : themes.length > 0 ? "Suggest new themes" : "Suggest themes"}
            </button>
          </div>
          {themeSourceCount < THEME_MIN_COURSES && (
            <p className={styles.note}>
              Rate at least {THEME_MIN_COURSES} courses {THEME_MIN_RATING} or higher, or mark them as taking or taken, to
              get theme ideas ({themeSourceCount} so far).
            </p>
          )}
          {themeError && <ErrorNote error={themeError} />}
          {themes.length > 0 && (
            <ul className={styles.themeList}>
              {themes.map((theme) => {
                const chosen = draft.theme === theme.summary;
                return (
                  <li key={theme.name} className={`${styles.theme} ${chosen ? styles.themeChosen : ""}`}>
                    <div className={styles.themeName}>{theme.name}</div>
                    <div className={styles.meta}>Suggested title: {theme.title}</div>
                    <p className={styles.themeSummary}>{theme.summary}</p>
                    <div className={styles.meta}>{theme.courseCodes.join(" · ")}</div>
                    <button type="button" className={styles.secondary} onClick={() => applyTheme(theme)} aria-pressed={chosen}>
                      {chosen ? "Using this theme" : "Use this theme"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {themes.length > 0 && (
            <p className={styles.note}>
              Using a theme fills in your theme, Claude&apos;s suggested title, the theme&apos;s courses and a drafted
              statement for each course. Everything stays editable, and ticking another course drafts a statement for
              it too.
            </p>
          )}
        </div>
        <div className={styles.fieldHead}>
          <label htmlFor="im-theme" className={styles.label}>
            Your theme
          </label>
          <button type="button" className={styles.textButton} onClick={writeOwnTheme}>
            Write my own theme
          </button>
        </div>
        <textarea
          id="im-theme"
          ref={themeInput}
          className={styles.textarea}
          rows={4}
          maxLength={MAX_THEME_LENGTH}
          placeholder="What your major is about, and why these courses belong together."
          value={draft.theme}
          onChange={(e) => update({ theme: e.target.value })}
        />
      </div>

      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div className={styles.part}>
        <h3 className={styles.partTitle}>
          <label htmlFor="im-title">Title</label>
        </h3>
        <input
          id="im-title"
          className={styles.input}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="e.g. Health Care Operations and Analytics"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
      </div>

      {/* ── Course plan ───────────────────────────────────────────────────── */}
      <div className={styles.part}>
        <div className={styles.cardHeader}>
          <h3 className={styles.partTitle}>Course plan</h3>
          <span className={credits > INDIVIDUALIZED_MAX_CREDITS ? styles.over : styles.progressText}>
            {cu(credits)} of up to {cu(INDIVIDUALIZED_MAX_CREDITS)}
          </span>
        </div>
        <div className={styles.progress} aria-hidden>
          <div
            className={credits > INDIVIDUALIZED_MAX_CREDITS ? styles.progressOver : styles.progressBar}
            style={{ width: `${Math.min(credits / INDIVIDUALIZED_MAX_CREDITS, 1) * 100}%` }}
          />
        </div>
        {topOverlap && topOverlap.share >= OVERLAP_WARNING_SHARE && (
          <p className={styles.warning}>
            {percent(topOverlap.share)} of this plan also counts toward the {topOverlap.major.name} major. An
            individualized major should cover ground a standard major doesn&apos;t, so be ready to explain the
            difference, or consider declaring {topOverlap.major.name}.
          </p>
        )}
        {topOverlap && topOverlap.share < OVERLAP_WARNING_SHARE && (
          <p className={styles.note}>
            The standard major closest to this plan is {topOverlap.major.name}, which covers {percent(topOverlap.share)}{" "}
            of it.
          </p>
        )}
        {candidates.length === 0 ? (
          <p className={styles.note}>
            Rate courses above 0, or mark them as taking or taken, to choose from them here.
          </p>
        ) : (
          <>
            <p className={styles.note}>
              Your rated and taken courses, favorites first. Courses at 0 aren&apos;t listed unless you&apos;re taking
              or have taken them, and core courses aren&apos;t listed, since they can&apos;t count toward a major.
            </p>
            <ul className={styles.planPicker}>
              {candidates.map(({ course, rating, taken: isTaken }) => {
                const id = `im-course-${course.code.replace(" ", "-")}`;
                return (
                  <li key={course.code}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={draft.courses.includes(course.code)}
                      onChange={() => setDraft((current) => toggleCourse(current, course.code))}
                    />
                    <label htmlFor={id} className={styles.pickLabel}>
                      <span className={rating > 0 ? styles.rankRating : styles.unrated} title={ratingLabels[rating]}>
                        {rating}
                      </span>
                      <span className={styles.code}>{course.code}</span>
                      <span className={styles.planTitle}>{course.title}</span>
                      <span className={styles.planMeta}>
                        {isTaken && "Taking / taken · "}
                        {cu(creditsOf(course))}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ── Alignment ─────────────────────────────────────────────────────── */}
      <div className={styles.part}>
        <div className={styles.cardHeader}>
          <h3 className={styles.partTitle}>How each course aligns with your theme</h3>
          <button
            type="button"
            className={styles.secondary}
            disabled={!canDraft || drafting.size > 0 || plan.length === 0 || !draft.theme.trim()}
            onClick={redraftAll}
            title="Redrafts every statement you haven't edited"
          >
            {drafting.size > 0 ? "Drafting…" : "Redraft with Claude"}
          </button>
        </div>
        {plan.length > 0 && !draft.theme.trim() && canDraft && (
          <p className={styles.note}>Choose or write a theme, and Claude will draft each course&apos;s statement.</p>
        )}
        {plan.length > 0 && draft.theme.trim() && canDraft && (
          <p className={styles.note}>
            Claude drafts a statement for each course, including any you tick. Edit them to make them your own:
            Claude never replaces a statement you&apos;ve edited.
          </p>
        )}
        {alignmentError && <ErrorNote error={alignmentError} />}
        {plan.length === 0 ? (
          <p className={styles.note}>Add courses to your plan to write how each one fits.</p>
        ) : (
          <ul className={styles.alignmentList}>
            {draft.courses.map((code) => {
              const course = courseByCode.get(code);
              if (!course) return null;
              const text = draft.alignments[code] ?? "";
              const byClaude = text.trim() !== "" && text.trim() === (alignmentSuggestions[code] ?? "").trim();
              const id = `im-align-${code.replace(" ", "-")}`;
              return (
                <li key={code} className={styles.alignment}>
                  <div className={styles.courseHead}>
                    <span className={styles.code}>{code}</span>
                    <span className={styles.courseTitle}>{course.title}</span>
                  </div>
                  <div className={styles.fieldHead}>
                    <label htmlFor={id} className={styles.label}>
                      How it aligns with your theme
                    </label>
                    {drafting.has(code) ? (
                      <span className={styles.claudeLabel}>Claude is drafting…</span>
                    ) : byClaude ? (
                      <span className={styles.claudeLabel}>Drafted by Claude · edit to make it yours</span>
                    ) : null}
                  </div>
                  <textarea
                    id={id}
                    className={styles.textarea}
                    rows={3}
                    maxLength={MAX_ALIGNMENT_LENGTH}
                    value={text}
                    onChange={(e) =>
                      setDraft((current) => ({ ...current, alignments: { ...current.alignments, [code]: e.target.value } }))
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Checklist and download ────────────────────────────────────────── */}
      <div className={styles.part}>
        <h3 className={styles.partTitle}>Ready to submit?</h3>
        <ul className={styles.checklist}>
          {requirements.map((r) => (
            <li key={r.id} className={r.met ? styles.met : styles.unmet}>
              <span aria-hidden>{r.met ? "✓" : "○"}</span> {r.label}
              {r.detail && <span className={styles.checkDetail}> · {r.detail}</span>}
            </li>
          ))}
        </ul>
        <div>
          <button type="button" className={styles.primary} disabled={!ready} onClick={download}>
            Download as Word document
          </button>
        </div>
        <p className={styles.note}>
          The document has exactly what&apos;s in your boxes: your title, theme, course plan and statements, including
          any of Claude&apos;s drafts you haven&apos;t edited. Make sure it says what you mean, and review it with your
          academic advisor before you submit it.
        </p>
      </div>
    </section>
  );
}
