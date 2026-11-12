// The first screen: what the tool does, the three steps, and "Get started".

import { ArrowIcon } from "./icons";
import { delay } from "./motion";
import styles from "./CourseManager.module.css";

const STEPS = [
  {
    title: "Find courses and check eligibility",
    text: "Search Path@Penn, paste your picks here and see which ones count toward your MBA.",
    circle: styles.circleBlue,
    bar: styles.barBlue,
    // When this bar starts filling: each starts as the one before finishes.
    fillAt: 0.5,
  },
  {
    title: "Request permission",
    text: "Send a ready-made email to each department and track who says yes.",
    circle: styles.circleGold,
    bar: styles.barGold,
    fillAt: 1.3,
  },
  {
    title: "Register with the MBA Program",
    text: "Send your approved courses to the MBA Program Office in one email.",
    circle: styles.circleRed,
    bar: styles.barRed,
    fillAt: 2.1,
  },
];

export function Overview({ onStart }: { onStart: () => void }) {
  return (
    <main className={styles.overview}>
      <section className={`${styles.hero} ${styles.rise}`}>
        <span className={styles.goldPill}>NEW ON PENN TOOLS · BETA</span>
        <h1 className={styles.heroTitle}>
          <span className={styles.red}>Non-Wharton</span> Course Manager
        </h1>
        <p className={styles.heroText}>
          Interested in taking electives outside of Wharton but not sure how to go about it? This tool walks you
          through it in three steps.
        </p>
      </section>

      <div className={`${styles.overviewPanel} ${styles.rise}`} style={delay(0.1)}>
        <ol aria-label="How it works" className={styles.overviewSteps}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={`${styles.overviewCard} ${styles.rise}`} style={delay(0.2 + i * 0.2)}>
              <span className={`${styles.numberCircle} ${s.circle}`}>{i + 1}</span>
              <h2 className={styles.overviewCardTitle}>{s.title}</h2>
              <p className={styles.overviewCardText}>{s.text}</p>
              <span className={styles.barTrack}>
                <span className={`${styles.bar} ${s.bar} ${styles.fill}`} style={delay(s.fillAt)} />
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={`${styles.startArea} ${styles.rise}`} style={delay(2.6)}>
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
