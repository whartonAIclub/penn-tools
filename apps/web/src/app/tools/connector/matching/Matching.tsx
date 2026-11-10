"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Matching.module.css";

const STEPS = [
  "Looking beyond your cohort…",
  "Comparing Friday nights…",
  "Finding people you'd click with…",
];
const STEP_MS = 1100;

export function Matching() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  useEffect(() => {
    router.prefetch("/tools/connector/groups");
    const timer = setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (step >= STEPS.length) router.replace("/tools/connector/groups");
  }, [step, router]);

  return (
    <div className={styles.page} role="status" aria-live="polite">
      <div className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <h1 className={styles.title}>Matching you to your friend group</h1>
      <p className={styles.step}>{STEPS[Math.min(step, STEPS.length - 1)]}</p>
    </div>
  );
}
