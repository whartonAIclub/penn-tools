// The first screen: what the tool does, with an animation of bullets being
// tailored.

import { useEffect, useState } from "react";
import { cx } from "./shared";
import shared from "./shared.module.css";
import styles from "./LandingScreen.module.css";

// The examples only reword what the original says: the tool never invents facts.
export const HERO_BULLETS = [
  { original: "Worked on the DCF model for a $2.4B healthcare acquisition", tailored: "Built the DCF model for a $2.4B healthcare acquisition", tag: "Stronger verb" },
  { original: "Did research on comparable companies for pitch books, using Bloomberg", tailored: "Analyzed comparable companies in Bloomberg for pitch books", tag: "Tightened" },
  { original: "Helped manage a deal team of 12 people across three workstreams", tailored: "Coordinated a 12-person deal team across three workstreams", tag: "Matched the role" },
];
const HERO_STATUS = ["Analyzing job description…", "Rewriting bullet 1…", "Rewriting bullet 2…", "Rewriting bullet 3…", "Tailored for this role ✦"];

type BulletState = "original" | "shimmer" | "tailored";

function HeroAnimation() {
  const [bulletStates, setBulletStates] = useState<BulletState[]>(["original", "original", "original"]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [statusIdx, setStatusIdx] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reset = () => {
      setBulletStates(["original", "original", "original"]);
      setActiveIdx(-1);
      setStatusIdx(0);
      t = setTimeout(() => setCycle((c) => c + 1), 500);
    };
    const step = (i: number) => {
      if (i >= HERO_BULLETS.length) {
        setStatusIdx(HERO_STATUS.length - 1);
        setActiveIdx(-1);
        t = setTimeout(reset, 2200);
        return;
      }
      setActiveIdx(i);
      setStatusIdx(i + 1);
      setBulletStates((prev) => prev.map((s, j) => (j === i ? "shimmer" : s)));
      t = setTimeout(() => {
        setBulletStates((prev) => prev.map((s, j) => (j === i ? "tailored" : s)));
        t = setTimeout(() => step(i + 1), 1100);
      }, 950);
    };
    t = setTimeout(() => step(0), 500);
    return () => clearTimeout(t);
    // Deliberately restarts only when cycle changes; the timers drive the rest.
  }, [cycle]);

  return (
    <div className={styles.hero} aria-hidden="true">
      <div className={styles.card}>
        {HERO_BULLETS.map((b, i) => {
          const state = bulletStates[i]!;
          return (
            <div key={i} className={cx(styles.bullet, i === activeIdx && styles.bulletActive)}>
              <span className={styles.dot}>•</span>
              <div className={styles.body}>
                {state === "shimmer" && <div className={styles.shimmer} />}
                <div className={cx(styles.text, state === "tailored" && styles.textTailored)}>
                  {state === "tailored" ? b.tailored : b.original}
                </div>
                {state === "tailored" && <span className={styles.tag}>{b.tag}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.progress}>
        {bulletStates.map((state, i) => (
          <div
            key={i}
            className={cx(styles.progressDot, state === "shimmer" && styles.progressDotActive, state === "tailored" && styles.progressDotDone)}
          />
        ))}
      </div>
      <div className={styles.status}>{HERO_STATUS[statusIdx] ?? ""}</div>
    </div>
  );
}

export function LandingScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Generate Tailored Resumes in Seconds</h1>
      <p className={styles.lead}>
        Upload your resume, paste a job description, and get a version tailored to the role, built only from your own experience.
      </p>
      <HeroAnimation />
      <button onClick={onNext} className={cx(shared.btn, shared.primary, styles.start)}>
        Get Started →
      </button>
    </div>
  );
}
