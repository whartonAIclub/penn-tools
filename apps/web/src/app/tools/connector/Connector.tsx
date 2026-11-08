"use client";

// Connector's screens, in order: the profile form, the questions, then a
// summary of the answers. Everything is kept in the page; nothing is saved.

import { useState } from "react";
import { ProfileForm, type Profile } from "./ProfileForm";
import { Questions } from "./Questions";
import { QUESTIONS, type Answers } from "./questionList";
import styles from "./Connector.module.css";

type Step = "profile" | "questions" | "summary";

const EMPTY_PROFILE: Profile = { firstName: "", lastName: "", email: "", cohort: "" };

export function Connector() {
  const [step, setStep] = useState<Step>("profile");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [answers, setAnswers] = useState<Answers>({});

  if (step === "profile") {
    return (
      <ProfileForm
        initial={profile}
        onContinue={(p) => {
          setProfile(p);
          setStep("questions");
        }}
      />
    );
  }

  if (step === "questions") {
    return (
      <Questions
        onBack={() => setStep("profile")}
        onDone={(a) => {
          setAnswers(a);
          setStep("summary");
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Thanks, {profile.firstName}!</h1>
      <p className={styles.intro}>Here&apos;s what you told us.</p>
      <dl className={styles.card}>
        <div className={styles.answer}>
          <dt>Cohort</dt>
          <dd>{profile.cohort}</dd>
        </div>
        {QUESTIONS.map((q) => (
          <div key={q.id} className={styles.answer}>
            <dt>{q.prompt}</dt>
            <dd>{answers[q.id]}</dd>
          </div>
        ))}
      </dl>
      <div>
        <button type="button" className={styles.back} onClick={() => setStep("questions")}>
          ← Change answers
        </button>
      </div>
    </div>
  );
}
