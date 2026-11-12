"use client";

// The whole tool: the overview screen, then the three-step flow with the
// stepper on the left and the current step on the right.

import { useEffect, useState } from "react";
import {
  EMPTY_PROGRESS,
  SAVE_KEY,
  STEP_TITLES,
  approvedCourses,
  pickedCourses,
  readSaved,
  saveText,
  stepStatuses,
  upcomingTerms,
} from "@penntools/tool-non-wharton-course-manager";
import type { Course, Progress, StepNumber } from "@penntools/tool-non-wharton-course-manager";
import { mono, sans, serif } from "./fonts";
import { Overview } from "./Overview";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import { Step3 } from "./Step3";
import { Stepper } from "./Stepper";
import { LockIcon } from "./icons";
import styles from "./CourseManager.module.css";

/** One line under each step's title in its header card. */
const STEP_INTROS: Record<StepNumber, string> = {
  1: "Look up a course on Path@Penn, bring its details here and we'll tell you if it counts toward your MBA.",
  2: "Email each department to ask if you can enroll, then update each course when you hear back.",
  3: "Send your approved courses and section numbers to the MBA Program Office. They handle the registration.",
};

/** Browser storage can be blocked (private windows, strict settings): the tool still works, it just won't remember. */
function loadSaved(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function writeSaved(text: string | null) {
  try {
    if (text === null) window.localStorage.removeItem(SAVE_KEY);
    else window.localStorage.setItem(SAVE_KEY, text);
  } catch {
    // Not saved; nothing else to do.
  }
}

export function CourseManager() {
  const [view, setView] = useState<"overview" | "flow">("overview");
  const [step, setStep] = useState<StepNumber>(1);
  const [terms] = useState(() => upcomingTerms(new Date()));
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  /** False until saved progress is read, so the page doesn't flash the overview first. */
  const [loaded, setLoaded] = useState(false);

  const statuses = stepStatuses(progress);

  // Bring back saved progress once the page is in the browser.
  useEffect(() => {
    const saved = readSaved(loadSaved());
    if (saved) {
      // A term that has already started isn't offered any more; the student picks again.
      const term = terms.includes(saved.progress.term) ? saved.progress.term : "";
      const restored = { ...saved.progress, term };
      const unlocked = stepStatuses(restored).filter((s) => s.unlocked).map((s) => s.step);
      setProgress(restored);
      setView(saved.view);
      setStep(unlocked.includes(saved.step) ? saved.step : (unlocked.at(-1) ?? 1));
    }
    setLoaded(true);
  }, [terms]);

  // Save after every change.
  useEffect(() => {
    if (loaded) writeSaved(saveText({ progress, view, step }));
  }, [loaded, progress, view, step]);

  function startOver() {
    if (!window.confirm("Start over? This clears your courses, statuses and name from this browser.")) return;
    writeSaved(null);
    setProgress(EMPTY_PROGRESS);
    setStep(1);
    setView("overview");
  }

  function setCourses(update: (courses: Course[]) => Course[]) {
    setProgress((p) => ({ ...p, courses: update(p.courses) }));
  }

  function updateCourse(course: Course) {
    setCourses((cs) => cs.map((c) => (c.id === course.id ? course : c)));
  }

  function finishStep1() {
    setProgress((p) => ({ ...p, step1Done: true }));
    setStep(2);
  }

  return (
    <div className={`${styles.root} ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <span className={styles.label}>
            PENN TOOLS <span className={styles.slash}>/</span> ACADEMICS
          </span>
          <span className={styles.topBarRight}>
            <span className={styles.savedPill}>
              <LockIcon />
              Saved only in this browser
            </span>
            <button type="button" className={styles.startOver} onClick={startOver}>
              Start over
            </button>
          </span>
        </div>
      </header>

      {!loaded ? null : view === "overview" ? (
        <Overview
          onStart={() => {
            setStep(1);
            setView("flow");
          }}
        />
      ) : (
        <main className={styles.flow}>
          <Stepper
            statuses={statuses}
            current={step}
            onPick={setStep}
            onOverview={() => setView("overview")}
          />
          <div className={styles.stepArea}>
            <section className={styles.stepHeader}>
              <span className={styles.goldPill}>{`STEP ${step} OF 3`}</span>
              <h2 className={styles.stepTitle}>{STEP_TITLES[step]}</h2>
              <p className={styles.stepIntro}>{STEP_INTROS[step]}</p>
            </section>
            {step === 1 ? (
              <Step1
                courses={progress.courses}
                onAdd={(course) => setCourses((cs) => [...cs, course])}
                onUpdate={updateCourse}
                onRemove={(id) => setCourses((cs) => cs.filter((c) => c.id !== id))}
                onContinue={finishStep1}
              />
            ) : step === 2 ? (
              <Step2
                courses={pickedCourses(progress.courses)}
                sender={{ name: progress.name, year: progress.year, term: progress.term }}
                onNameChange={(name) => setProgress((p) => ({ ...p, name }))}
                terms={terms}
                onYearChange={(year) => setProgress((p) => ({ ...p, year }))}
                onTermChange={(term) => setProgress((p) => ({ ...p, term }))}
                onUpdate={updateCourse}
                canContinue={statuses[2]?.unlocked ?? false}
                onBack={() => setStep(1)}
                onContinue={() => setStep(3)}
              />
            ) : (
              <Step3
                courses={approvedCourses(progress.courses)}
                sender={{ name: progress.name, year: progress.year, term: progress.term }}
                sent={progress.registrationSent}
                onSent={() => setProgress((p) => ({ ...p, registrationSent: true }))}
                onBack={() => setStep(2)}
              />
            )}
          </div>
        </main>
      )}
    </div>
  );
}
