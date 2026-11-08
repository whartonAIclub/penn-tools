"use client";

// The profile form: first and last name, Penn email and cohort (grouped by
// cluster). Continue hands the profile to the next screen; nothing is saved.

import { useState, type FormEvent } from "react";
import styles from "./Connector.module.css";

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  cohort: string;
}

const CLUSTERS = [
  { cluster: 1, cohorts: ["A", "B", "C"] },
  { cluster: 2, cohorts: ["D", "E", "F"] },
  { cluster: 3, cohorts: ["G", "H", "I"] },
  { cluster: 4, cohorts: ["J", "K", "L"] },
];

interface Props {
  initial: Profile;
  onContinue: (profile: Profile) => void;
}

export function ProfileForm({ initial, onContinue }: Props) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [cohort, setCohort] = useState(initial.cohort);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onContinue({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), cohort });
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
          <span>Wharton email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@wharton.upenn.edu"
            pattern=".+@wharton\.upenn\.edu"
            title="Use your Wharton email (ending in @wharton.upenn.edu)."
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

        <div>
          <button type="submit" className={styles.button}>
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
