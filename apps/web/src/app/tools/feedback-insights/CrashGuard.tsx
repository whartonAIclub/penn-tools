"use client";

// A safety net around the whole tool. The survey is reloaded from this
// browser on every visit, so data that crashes the page once would crash it
// every time. This catches the crash and offers a way out that keeps the data.

import { Component, type ReactNode } from "react";
import { download, savedText, saveWorkspace } from "./storage";
import styles from "./FeedbackInsights.module.css";

export class CrashGuard extends Component<{ children: ReactNode }, { crashed: boolean; attempt: number }> {
  override state = { crashed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  override render() {
    if (!this.state.crashed) return <div key={this.state.attempt}>{this.props.children}</div>;
    const saved = savedText();
    return (
      <div className={styles.shell}>
        <div className={styles.page}>
          <h1 className={styles.title}>Feedback Insights</h1>
          <section className={styles.callout} role="alert">
            <h2 className={styles.h2}>Something in this survey stopped the page from loading</h2>
            <p className={styles.muted}>
              Your survey, tags and decisions are still saved in this browser. Download them first, then start over. If you send the downloaded file to the
              tool&apos;s contributors (listed under the info button at the top), they can find what went wrong.
            </p>
            <div className={styles.actions}>
              {saved && (
                <button type="button" className={styles.buttonPrimary} onClick={() => download("feedback-insights-rescue.json", saved, "application/json")}>
                  Download my data
                </button>
              )}
              <button type="button" className={styles.button} onClick={() => this.setState((s) => ({ crashed: false, attempt: s.attempt + 1 }))}>
                Try again
              </button>
              <button
                type="button"
                className={styles.buttonDanger}
                onClick={() => {
                  saveWorkspace(null);
                  this.setState((s) => ({ crashed: false, attempt: s.attempt + 1 }));
                }}
              >
                Start over
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }
}
