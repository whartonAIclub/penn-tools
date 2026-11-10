"use client";

// The profile form: first and last name and cohort (grouped by cluster). The
// student's email comes from their Penn sign-in, so the form doesn't ask.
// Continue hands the profile to the next screen.

import { useState, type FormEvent } from "react";
import type { Cohort } from "@penntools/tool-connector";
import styles from "./Connector.module.css";

export interface Profile {
  firstName: string;
  lastName: string;
  cohort: string;
}

interface Props {
  cohorts: readonly Cohort[];
  initial: Profile;
  onContinue: (profile: Profile) => void;
}

export function ProfileForm({ cohorts, initial, onContinue }: Props) {
  const clusters = [...new Set(cohorts.map((c) => c.cluster))];
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [cohort, setCohort] = useState(initial.cohort);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onContinue({ firstName: firstName.trim(), lastName: lastName.trim(), cohort });
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
          <span>Cohort</span>
          <select value={cohort} onChange={(e) => setCohort(e.target.value)} required>
            <option value="" disabled>
              Choose your cohort
            </option>
            {clusters.map((cluster) => (
              <optgroup key={cluster} label={`Cluster ${cluster}`}>
                {cohorts
                  .filter((c) => c.cluster === cluster)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      Cohort {c.id}
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
