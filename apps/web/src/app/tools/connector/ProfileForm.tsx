"use client";

// The profile form: first and last name, Penn email and cohort (grouped by
// cluster). Submitting only shows a confirmation; nothing is saved yet.

import { useState, type FormEvent } from "react";
import styles from "./Connector.module.css";

const CLUSTERS = [
  { cluster: 1, cohorts: ["A", "B", "C"] },
  { cluster: 2, cohorts: ["D", "E", "F"] },
  { cluster: 3, cohorts: ["G", "H", "I"] },
  { cluster: 4, cohorts: ["J", "K", "L"] },
];

export function ProfileForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [cohort, setCohort] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Join Connector</h1>
      <p className={styles.intro}>
        Your future closest friends are just outside your circle. Tell us a little about yourself to get started.
      </p>

      <form className={styles.card} onSubmit={onSubmit}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>First name</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
          </label>
          <label className={styles.field}>
            <span>Last name</span>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
          </label>
        </div>

        <label className={styles.field}>
          <span>Penn email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@wharton.upenn.edu"
            pattern=".+@(.+\.)?upenn\.edu"
            title="Use your Penn email (ending in upenn.edu)."
            autoComplete="email"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Cohort</span>
          <select value={cohort} onChange={(e) => setCohort(e.target.value)} required>
            <option value="" disabled>
              Choose your cohort
            </option>
            {CLUSTERS.map(({ cluster, cohorts }) => (
              <optgroup key={cluster} label={`Cluster ${cluster}`}>
                {cohorts.map((c) => (
                  <option key={c} value={c}>
                    Cohort {c}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {submitted && (
          <p className={styles.success}>
            Thanks, {firstName}! You&apos;re in Cohort {cohort}.
          </p>
        )}

        <div>
          <button type="submit" className={styles.button}>
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
