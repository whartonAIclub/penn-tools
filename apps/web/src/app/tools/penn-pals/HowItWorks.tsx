"use client";

// What Penn Pals is for and how to use it, in three short steps, at the top of
// the dashboard. Always shown while the network is empty (with a button to
// start); after that the user can hide it, remembered in this browser, and
// bring it back from a small link.

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFAULT_FOLLOW_UP_DAYS, THANK_YOU_DAYS } from "@penntools/tool-penn-pals";
import styles from "./HowItWorks.module.css";

const HIDDEN_KEY = "penn-pals:how-it-works-hidden";

/** "a day", "3 days", "2 weeks". */
const span = (days: number) => (days === 1 ? "a day" : days % 7 === 0 ? `${days / 7} week${days === 7 ? "" : "s"}` : `${days} days`);

const STEPS = [
  { icon: "📝", title: "Log a chat", text: "Paste your notes or a screenshot. AI fills in the details." },
  {
    icon: "⏰",
    title: "Get reminders",
    text: `A nudge to say thanks within ${span(THANK_YOU_DAYS)}, then to check in after ${span(DEFAULT_FOLLOW_UP_DAYS)}.`,
  },
  { icon: "🤝", title: "Stay in touch", text: "Mark follow-ups done here. Your whole network in one place." },
];

export function HowItWorks({ empty }: { empty: boolean }) {
  // Shown until the browser says it was hidden, so it never flashes away for new users.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      // Storage blocked: just show it.
    }
  }, []);

  function hide(value: boolean) {
    setHidden(value);
    try {
      if (value) localStorage.setItem(HIDDEN_KEY, "1");
      else localStorage.removeItem(HIDDEN_KEY);
    } catch {
      // Storage blocked: hidden for this visit only.
    }
  }

  if (hidden && !empty) {
    return (
      <button type="button" className={styles.show} onClick={() => hide(false)}>
        How Penn Pals works
      </button>
    );
  }

  return (
    <section className={styles.how} aria-labelledby="how-title">
      <h2 id="how-title" className={styles.title}>
        How it works
      </h2>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.icon} aria-hidden="true">
              {step.icon}
            </span>
            <span>
              <strong>
                {i + 1}. {step.title}
              </strong>
              <span className={styles.text}>{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      {empty ? (
        <Link href="/tools/penn-pals/tracker" className={styles.start}>
          Log your first chat →
        </Link>
      ) : (
        <button type="button" className={styles.hide} onClick={() => hide(true)}>
          Got it, hide this
        </button>
      )}
    </section>
  );
}
