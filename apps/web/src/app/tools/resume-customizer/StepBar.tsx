// The steps along the top: Back, and the step names, each a link to its step
// once it's reachable.

import { cx } from "./shared";
import styles from "./StepBar.module.css";

export type Screen = "landing" | "onboarding" | "workspace" | "generating" | "edit" | "comparison" | "export";

const STEPS: Screen[] = ["onboarding", "workspace", "edit", "comparison", "export"];
const STEP_LABELS: Partial<Record<Screen, string>> = { onboarding: "Upload", workspace: "Workspace", edit: "Edit", comparison: "Compare", export: "Export" };
/** Where Back goes from each screen. */
const PREVIOUS: Partial<Record<Screen, Screen>> = { onboarding: "landing", workspace: "onboarding", edit: "workspace", comparison: "edit", export: "comparison" };
/** The steps that need a tailored resume. */
const RESUME_STEPS = new Set<Screen>(["edit", "comparison", "export"]);

export function StepBar({ screen, setScreen, hasResume }: { screen: Screen; setScreen: (s: Screen) => void; hasResume: boolean }) {
  if (screen === "landing") return null;
  const generating = screen === "generating";
  const current = generating ? "workspace" : screen;
  const stepIdx = STEPS.indexOf(current);
  const previous = PREVIOUS[screen];
  return (
    <nav aria-label="Steps" className={styles.bar}>
      <div className={styles.side}>
        {previous && !generating && (
          <button onClick={() => setScreen(previous)} className={styles.back}>
            ← Back
          </button>
        )}
      </div>
      <ol className={styles.steps}>
        {STEPS.map((s, i) => {
          const isCurrent = s === current;
          const done = i < stepIdx;
          // Earlier steps, and the resume's steps once there is one: going
          // back to the Workspace mustn't mean generating again to return.
          const canGo = !isCurrent && !generating && (done || (hasResume && RESUME_STEPS.has(s)));
          return (
            <li key={s} className={styles.step}>
              {i > 0 && <div className={cx(styles.connector, (done || isCurrent) && styles.connectorDone)} />}
              <button
                disabled={!canGo}
                onClick={() => setScreen(s)}
                aria-current={isCurrent ? "step" : undefined}
                className={cx(styles.stepButton, isCurrent && styles.stepCurrent, !done && styles.stepAhead)}
              >
                {STEP_LABELS[s]}
              </button>
            </li>
          );
        })}
      </ol>
      <div className={styles.side} />
    </nav>
  );
}
