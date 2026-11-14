// The vertical stepper on the left of the flow. Locked steps are greyed out
// and can't be clicked.

import type { StepNumber, StepStatus } from "@penntools/tool-non-wharton-course-manager";
import styles from "./CourseManager.module.css";

interface Props {
  statuses: StepStatus[];
  current: StepNumber;
  onPick: (step: StepNumber) => void;
  onOverview: () => void;
}

export function Stepper({ statuses, current, onPick, onOverview }: Props) {
  return (
    <nav aria-label="Steps" className={styles.stepper}>
      <button type="button" className={styles.overviewLink} onClick={onOverview}>
        <span className={styles.overviewPill}>← OVERVIEW</span>
        <span className={styles.stepperTitle}>Non-Wharton Course Manager</span>
      </button>

      <ol className={styles.stepList}>
        {statuses.map((s, i) => {
          const isCurrent = s.step === current;
          const state = isCurrent ? "current" : s.done ? "done" : s.unlocked ? "open" : "locked";
          const isLast = i === statuses.length - 1;
          return (
            <li key={s.step} className={styles.stepItem} data-state={state}>
              <span className={styles.stepRail}>
                <span className={styles.stepDot}>{s.done && !isCurrent ? "✓" : s.step}</span>
                {!isLast && <span className={styles.stepLine} data-done={s.done} />}
              </span>
              <button
                type="button"
                className={styles.stepButton}
                disabled={!s.unlocked}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onPick(s.step)}
              >
                <span className={styles.stepName}>{s.title}</span>
                <span className={styles.stepPill}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
