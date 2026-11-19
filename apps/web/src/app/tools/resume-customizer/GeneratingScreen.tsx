// While the resume is tailored: progress, Cancel, and on failure the error
// with Back and Try again.

import { useEffect, useState } from "react";
import type { ActionError } from "./actions";
import { ErrorText, ProviderPicker, cx, type ProviderChoice } from "./shared";
import shared from "./shared.module.css";
import styles from "./GeneratingScreen.module.css";

// Paced to the usual wait; the server reports no real progress.
const STEPS = ["Reading job description", "Matching skills & keywords", "Rewriting bullets for impact", "Fitting it to one page"];

export function GeneratingScreen({ error, onCancel, onRetry, providerChoice }: {
  error: ActionError | null;
  onCancel: () => void;
  onRetry: () => void;
  providerChoice: ProviderChoice;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)), 2800);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className={styles.screen}>
        <div role="alert" className={styles.error}>
          <div className={styles.errorTitle}>Generation failed</div>
          <div className={styles.errorText}>
            <ErrorText error={error} />
          </div>
          {/* A key problem with one provider can be fixed by switching to the other. */}
          {providerChoice.providers.length > 1 && <ProviderPicker choice={providerChoice} />}
          <div className={styles.actions}>
            <button onClick={onCancel} className={cx(shared.btn, shared.secondary)}>
              ← Back
            </button>
            <button onClick={onRetry} className={cx(shared.btn, shared.primary)}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.spinner} />
      <div className={styles.heading} role="status">
        <div className={styles.title}>Generating tailored resume…</div>
        <div className={styles.subtitle}>This usually takes 5 to 30 seconds.</div>
      </div>
      <div className={styles.steps} aria-hidden="true">
        {STEPS.map((label, i) => (
          <div key={label} className={cx(styles.step, i < stepIdx && styles.stepDone, i === stepIdx && styles.stepActive, i > stepIdx && styles.stepPending)}>
            <div className={styles.stepDot}>{i < stepIdx && "✓"}</div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <button onClick={onCancel} className={cx(shared.btn, shared.secondary, shared.compact)}>
        Cancel
      </button>
    </div>
  );
}
