"use client";

// The whole tool: the overview screen, then the three-step flow with the
// stepper on the left and the current step on the right.

import { useState } from "react";
import { EMPTY_PROGRESS, STEP_TITLES, stepStatuses } from "@penntools/tool-non-wharton-course-manager";
import type { Progress, StepNumber } from "@penntools/tool-non-wharton-course-manager";
import { mono, sans, serif } from "./fonts";
import { Overview } from "./Overview";
import { Stepper } from "./Stepper";
import { LockIcon } from "./icons";
import styles from "./CourseManager.module.css";

/** One line under each step's title in its header card. */
const STEP_INTROS: Record<StepNumber, string> = {
  1: "Browse Path@Penn, bring your picks here and we'll tell you which ones count toward your MBA.",
  2: "Email each department to ask if you can enroll, then update each course when you hear back.",
  3: "Send your approved courses and section numbers to the MBA Program Office. They handle the registration.",
};

export function CourseManager() {
  const [view, setView] = useState<"overview" | "flow">("overview");
  const [step, setStep] = useState<StepNumber>(1);
  // Filled in by the later build steps (paste and check courses, permissions,
  // registration), and saved in the browser in build step 4.
  const [progress] = useState<Progress>(EMPTY_PROGRESS);

  const statuses = stepStatuses(progress);

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
              <span className={styles.goldPill}>STEP {step} OF 3</span>
              <h2 className={styles.stepTitle}>{STEP_TITLES[step]}</h2>
              <p className={styles.stepIntro}>{STEP_INTROS[step]}</p>
            </section>
            {/* Each step's content arrives in its own build step. */}
            <section className={styles.card}>
              <p className={styles.muted}>This step is coming soon.</p>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
