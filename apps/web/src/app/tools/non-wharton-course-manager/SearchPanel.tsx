"use client";

// "Find an email": Google results in a panel that slides in from the right,
// so the student can copy an email and paste it back without leaving the tool.

import { useEffect, useRef, useState } from "react";
import { loadSearch, showSearch } from "./googleSearch";
import { CloseIcon } from "./icons";
import { openBeside } from "./openSearch";
import styles from "./CourseManager.module.css";

interface Props {
  query: string;
  /** The same search on google.com, for when the panel can't show results. */
  href: string;
  onClose: () => void;
}

export function SearchPanel({ query, href, onClose }: Props) {
  const results = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);

  // Load Google's search, then show the results for this query.
  useEffect(() => {
    let active = true;
    loadSearch()
      .then(() => {
        if (!active || !results.current) return;
        if (showSearch(results.current, query)) setShown(true);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [query]);

  // Focus the close button, close on Escape, and put focus back where it was.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div className={styles.panelBackdrop} onClick={onClose} aria-hidden="true" />
      <aside className={styles.searchPanel} role="dialog" aria-modal="true" aria-labelledby="nwcm-search-title">
        <div className={styles.searchPanelHead}>
          <h3 id="nwcm-search-title" className={styles.searchPanelTitle}>
            Find an email
          </h3>
          <button ref={closeButton} type="button" className={styles.removeButton} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <p className={styles.reason}>Copy the email from the results and paste it into &ldquo;Who to email&rdquo;.</p>
        {failed ? (
          <div className={styles.note} role="alert">
            <p className={styles.panelText}>The search couldn&apos;t load here.</p>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={styles.findButton}
              onClick={(e) => {
                if (openBeside(href)) e.preventDefault();
              }}
            >
              Open the search in a new window
            </a>
          </div>
        ) : (
          <>
            {!shown && (
              <span className={styles.checking} role="status">
                <span className={styles.spinner} />
                Loading the search…
              </span>
            )}
            {/* Google draws into this box; React never puts anything inside it. */}
            <div ref={results} className={styles.searchResults} />
          </>
        )}
      </aside>
    </>
  );
}
