"use client";

// The individualized major builder, shown when a student says they're
// considering one. Wharton asks for a theme, a course plan and a title, and
// for how the courses align with the theme; this step collects each, checks
// them, and downloads the proposal as a Word document.
//
// Claude can suggest themes and alignment statements (actions.ts), but they're
// always shown apart from the student's own text, and only the student's text
// goes into the proposal. The draft and the suggestions are saved in this
// browser only, like the ratings.

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
    const { name, summary, courseCodes } = t as Record<string, unknown>;
    if (typeof name !== "string" || typeof summary !== "string" || !Array.isArray(courseCodes)) return [];
    return [{ name, summary, courseCodes: courseCodes.filter((c): c is string => typeof c === "string") }];
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
  ratingLabels,
  step,
  suggestionAccess,
}: {
  catalog: Catalog;
  ratings: Ratings;
  ratingLabels: Readonly<Record<Rating, string>>;
  step: number;
  suggestionAccess: SuggestionAccess;
}) {
  const { courses } = catalog;
  const [draft, setDraft] = useState<IndividualizedDraft>(EMPTY_DRAFT);
  const [themes, setThemes] = useState<ThemeSuggestion[]>([]);
  const [alignmentSuggestions, setAlignmentSuggestions] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"themes" | "alignments" | null>(null);
  const [themeError, setThemeError] = useState<SuggestionError | null>(null);
  const [alignmentError, setAlignmentError] = useState<SuggestionError | null>(null);
  const themeInput = useRef<HTMLTextAreaElement>(null);

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

  const candidates = useMemo(() => candidateCourses(courses, ratings), [courses, ratings]);
  const plan = useMemo(() => planCourses(draft, courses), [draft, courses]);
  const credits = totalCredits(plan);
  const overlaps = useMemo(() => majorOverlaps(plan), [plan]);
  const requirements = useMemo(() => checkDraft(draft, courses), [draft, courses]);
  const ready = isReady(requirements);
  const courseByCode = useMemo(() => new Map(courses.map((c) => [c.code, c])), [courses]);
  const themeSourceCount = candidates.filter((r) => r.rating >= THEME_MIN_RATING).length;
  const canSuggest = suggestionAccess === "ready" && busy === null;
  const topOverlap = overlaps[0];

  function update(change: Partial<IndividualizedDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  async function askForThemes() {
    setBusy("themes");
    setThemeError(null);
    try {
      const result = await suggestThemesAction(ratings);
      if (!result.ok) setThemeError(result.error);
      else if (result.data.length === 0) setThemeError({ message: "Claude didn't find a theme in these courses. Try rating more." });
      else setThemes(result.data);
    } catch {
      setThemeError({ message: "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function askForAlignments() {
    setBusy("alignments");
    setAlignmentError(null);
    try {
      const result = await suggestAlignmentsAction(draft.theme, draft.courses);
      if (!result.ok) setAlignmentError(result.error);
      else setAlignmentSuggestions((current) => ({ ...current, ...result.data }));
    } catch {
      setAlignmentError({ message: "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  }

  function applyTheme(theme: ThemeSuggestion) {
    setDraft((current) => ({
      ...current,
      theme: theme.summary,
      title: current.title.trim() ? current.title : theme.name,
      courses: [...current.courses, ...theme.courseCodes.filter((code) => !current.courses.includes(code))],
    }));
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
              Rate at least {THEME_MIN_COURSES} courses {THEME_MIN_RATING} or higher to get theme ideas ({themeSourceCount}{" "}
              so far).
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
              Using a theme fills in your theme below, adds its courses to your plan and, if you haven&apos;t written one
              yet, uses its name as your title. Edit any of them freely.
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
          <p className={styles.note}>Rate courses above to choose from them here. Courses you rated 1 aren&apos;t listed.</p>
        ) : (
          <>
            <p className={styles.note}>Your rated courses, favorites first. Courses you rated 1 aren&apos;t listed.</p>
            <ul className={styles.planPicker}>
              {candidates.map(({ course, rating }) => {
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
                      <span className={styles.rankRating} title={ratingLabels[rating]}>
                        {rating}
                      </span>
                      <span className={styles.code}>{course.code}</span>
                      <span className={styles.planTitle}>{course.title}</span>
                      <span className={styles.planMeta}>{cu(creditsOf(course))}</span>
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
            disabled={!canSuggest || plan.length === 0 || !draft.theme.trim()}
            onClick={askForAlignments}
          >
            {busy === "alignments" ? "Thinking…" : "Get Claude's suggestions"}
          </button>
        </div>
        {plan.length > 0 && !draft.theme.trim() && suggestionAccess === "ready" && (
          <p className={styles.note}>Choose or write a theme to get Claude&apos;s suggestions.</p>
        )}
        {alignmentError && <ErrorNote error={alignmentError} />}
        {plan.length === 0 ? (
          <p className={styles.note}>Add courses to your plan to write how each one fits.</p>
        ) : (
          <ul className={styles.alignmentList}>
            {draft.courses.map((code) => {
              const course = courseByCode.get(code);
              if (!course) return null;
              const suggestion = alignmentSuggestions[code];
              const id = `im-align-${code.replace(" ", "-")}`;
              return (
                <li key={code} className={styles.alignment}>
                  <div className={styles.courseHead}>
                    <span className={styles.code}>{code}</span>
                    <span className={styles.courseTitle}>{course.title}</span>
                  </div>
                  {suggestion && (
                    <div className={styles.claudeBox}>
                      <span className={styles.claudeLabel}>Claude&apos;s suggestion</span>
                      <p className={styles.claudeText}>{suggestion}</p>
                    </div>
                  )}
                  <label htmlFor={id} className={styles.label}>
                    Your statement, in your own words
                  </label>
                  <textarea
                    id={id}
                    className={styles.textarea}
                    rows={3}
                    maxLength={MAX_ALIGNMENT_LENGTH}
                    value={draft.alignments[code] ?? ""}
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
          The document has your title, theme, course plan and statements, in your words; Claude&apos;s suggestions
          aren&apos;t included. Review it with your academic advisor before you submit it.
        </p>
      </div>
    </section>
  );
}
