// The first screen: what the tool does, the three steps, and "Get started".

import { ArrowIcon } from "./icons";
import styles from "./CourseManager.module.css";

const STEPS = [
  {
    title: "Find courses and check eligibility",
    text: "Search Path@Penn, paste your picks here and see which ones count toward your MBA.",
    circle: styles.circleBlue,
    bar: styles.barBlue,
  },
  {
    title: "Request permission",
    text: "Send a ready-made email to each department and track who says yes.",
    circle: styles.circleGold,
    bar: styles.barGold,
  },
  {
    title: "Register with the MBA Program",
    text: "Send your approved courses to the MBA Program Office in one email.",
    circle: styles.circleRed,
    bar: styles.barRed,
  },
];

export function Overview({ onStart }: { onStart: () => void }) {
  return (
    <main className={styles.overview}>
      <section className={styles.hero}>
        <span className={styles.goldPill}>NEW ON PENN TOOLS · BETA</span>
        <h1 className={styles.heroTitle}>
          <span className={styles.red}>Non-Wharton</span> Course Manager
        </h1>
        <p className={styles.heroText}>
          Interested in taking electives outside of Wharton but not sure how to go about it? This tool walks you
          through it in three steps.
        </p>
      </section>

      <div className={styles.overviewPanel}>
        <ol aria-label="How it works" className={styles.overviewSteps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={styles.overviewCard}>
              <span className={`${styles.numberCircle} ${s.circle}`}>{i + 1}</span>
              <h2 className={styles.overviewCardTitle}>{s.title}</h2>
              <p className={styles.overviewCardText}>{s.text}</p>
              <span className={styles.barTrack}>
                <span className={`${styles.bar} ${s.bar}`} />
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.startArea}>
        <button type="button" className={styles.startButton} onClick={onStart}>
          Get started
          <ArrowIcon />
        </button>
        <span className={styles.muted}>
          Takes about 5 minutes. The MBA Program Office has the final word on what counts.
        </span>
      </div>
    </main>
  );
}
