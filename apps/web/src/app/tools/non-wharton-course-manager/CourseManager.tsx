"use client";

// The whole tool: the overview screen, then the three-step flow with the
// stepper on the left and the current step on the right.

import { useState } from "react";
import {
  EMPTY_PROGRESS,
  STEP_TITLES,
  pickedCourses,
  stepStatuses,
  upcomingTerms,
} from "@penntools/tool-non-wharton-course-manager";
import type { Course, Progress, StepNumber } from "@penntools/tool-non-wharton-course-manager";
import { mono, sans, serif } from "./fonts";
import { Overview } from "./Overview";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import { Stepper } from "./Stepper";
import { LockIcon } from "./icons";
import styles from "./CourseManager.module.css";

/** One line under each step's title in its header card. */
const STEP_INTROS: Record<StepNumber, string> = {
  1: "Look up a course on Path@Penn, bring its details here and we'll tell you if it counts toward your MBA.",
  2: "Email each department to ask if you can enroll, then update each course when you hear back.",
  3: "Send your approved courses and section numbers to the MBA Program Office. They handle the registration.",
};

export function CourseManager() {
  const [view, setView] = useState<"overview" | "flow">("overview");
  const [step, setStep] = useState<StepNumber>(1);
  const [terms] = useState(() => upcomingTerms(new Date()));
  // Saved in the browser in build step 4.
  const [progress, setProgress] = useState<Progress>(() => ({ ...EMPTY_PROGRESS, term: terms[0] ?? "" }));

  const statuses = stepStatuses(progress);

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
          <span className={styles.savedPill}>
            <LockIcon />
            Saved only in this browser
          </span>
        </div>
      </header>

      {view === "overview" ? (
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
                term={progress.term}
                terms={terms}
                onTermChange={(term) => setProgress((p) => ({ ...p, term }))}
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
                onYearChange={(year) => setProgress((p) => ({ ...p, year }))}
                onUpdate={updateCourse}
                canContinue={statuses[2]?.unlocked ?? false}
                onBack={() => setStep(1)}
                onContinue={() => setStep(3)}
              />
            ) : (
              // Step 3 arrives in its own build step.
              <section className={styles.card}>
                <p className={styles.muted}>This step is coming soon.</p>
              </section>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
